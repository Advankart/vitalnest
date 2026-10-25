import { useEffect, useRef, useState } from 'react';
import { t } from '../lib/i18n';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { Sparkles, Camera, ChevronLeft, ChevronRight, ExternalLink, FileImage, FileText, FileVideo, Trash2, Upload, Video, X } from 'lucide-react';
import { toJpegBlob } from '../lib/scan';
import { ReportSummaryView } from '../components/ReportSummaryView';
import { savedSummary } from '../lib/reportSummary';
import { Browser } from '@capacitor/browser';
import { useApp } from '../lib/store';
import { api } from '../lib/api';
import { isNative } from '../lib/notify';
import type { Report, ReportFile } from '../lib/types';
import { photoUrl } from '../components/MedPhoto';
import { Button, ChipSelect, Empty, Field, PageHeader, Segmented, Sheet, Spinner, ViewOnlyNote } from '../components/ui';

const CATS = [{ id: 'lab', label: 'Lab test' }, { id: 'prescription', label: 'Prescription' }, { id: 'scan', label: 'Scan / ECG / Echo' }, { id: 'discharge', label: 'Discharge summary' }, { id: 'other', label: 'Other' }];

export default function Reports() {
  const { patient, canEdit, toast } = useApp();
  const [sp, setSp] = useSearchParams();
  const [list, setList] = useState<Report[] | null>(null);
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState(sp.get('upload') === '1');
  const [view, setView] = useState<{ r: Report; url: string | null } | null>(null);

  const load = () => patient && api().list<Report>('reports', [patient.id], undefined, 'created_at').then(setList).catch(e => toast(e.message, 'err'));
  useEffect(() => { load(); }, [patient?.id]); // eslint-disable-line
  if (!patient) return null;

  async function openReport(r: Report) {
    setView({ r, url: null });
    try { const url = await api().reportUrl(r); setView(v => (v && v.r.id === r.id ? { ...v, url } : v)); }
    catch (e) { toast((e as Error).message, 'err'); }
  }
  const openOriginal = (url: string | null) => { if (!url) return; if (isNative()) Browser.open({ url }); else window.open(url, '_blank', 'noopener'); };
  const savedR = (r: Report) => { setList(l => l?.map(x => (x.id === r.id ? r : x)) ?? l); setView(v => (v ? { ...v, r } : v)); };
  async function del(r: Report) {
    if (!confirm(t('Delete "{name}"?', { name: r.title }))) return;
    try { await api().deleteReport(r); setView(null); load(); } catch (e) { toast((e as Error).message, 'err'); }
  }

  const shown = (list ?? []).filter(r => filter === 'all' || r.category === filter);
  return (
    <div className="rise">
      <PageHeader title="Health reports" subtitle={patient.full_name} right={canEdit ? <Button size="sm" onClick={() => setOpen(true)}><Upload className="h-4 w-4" />Upload</Button> : undefined} />
      <ViewOnlyNote />
      <Segmented value={filter} onChange={setFilter} className="mb-4" options={[{ id: 'all', label: 'All' }, ...CATS.slice(0, 4).map(c => ({ id: c.id, label: ({ lab: 'Lab', prescription: 'Prescription', scan: 'Scan', discharge: 'Discharge' } as Record<string, string>)[c.id] ?? c.label }))]} />
      {list === null ? <Spinner /> : !shown.length ? (
        <Empty icon={<FileText className="h-7 w-7" />} title="No reports yet" text="Upload lab reports, prescriptions, ECGs and discharge summaries — photos or PDFs. The family can view them anytime." action={canEdit ? <Button onClick={() => setOpen(true)}><Upload className="h-4 w-4" />Upload report</Button> : undefined} />
      ) : (
        <div className="space-y-2">
          {shown.map(r => (
            <button key={r.id} onClick={() => openReport(r)} className="card flex w-full items-center gap-3 p-4 text-left">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-300">
                {r.attachments?.some(x => x.mime.startsWith('video/')) ? <FileVideo className="h-6 w-6 text-sky-600" /> : r.mime_type?.startsWith('image/') ? <FileImage className="h-6 w-6" /> : r.mime_type?.startsWith('video/') ? <FileVideo className="h-6 w-6 text-sky-600" /> : <FileText className="h-6 w-6" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{r.title}</div>
                <div className="truncate text-xs text-slate-500">{CATS.find(c => c.id === r.category)?.label} · {r.report_date ? format(new Date(r.report_date), 'd MMM yyyy') : ''}{r.size_bytes ? ` · ${(r.size_bytes / 1024 / 1024).toFixed(1)} MB` : ''}</div>
                {r.notes && <div className="truncate text-xs text-slate-400">{r.notes}</div>}
                {(r.attachments?.length ?? 0) > 1 && <div className="mt-0.5 mr-1 inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[0.6875rem] font-semibold text-sky-700 dark:bg-sky-500/10 dark:text-sky-300"><FileVideo className="h-3 w-3" />{t('{n} files', { n: r.attachments!.length })}</div>}
                {savedSummary(r) && <div className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[0.6875rem] font-semibold text-violet-700 dark:bg-violet-500/10 dark:text-violet-300"><Sparkles className="h-3 w-3" />AI summary ready</div>}
              </div>
              <ExternalLink className="h-4 w-4 text-slate-300" />
            </button>
          ))}
        </div>
      )}
      <Sheet open={open} onClose={() => { setOpen(false); if (sp.get('upload')) setSp({}); }} title="Upload report">
        <UploadForm onDone={() => { setOpen(false); setSp({}); load(); }} />
      </Sheet>
      <Sheet open={!!view} onClose={() => setView(null)} title={view?.r.title}>
        {view && <div className="space-y-4">
          <ReportSummaryView key={view.r.id} report={view.r} onSaved={savedR} />
          {(view.r.attachments?.length ?? 0) > 1 ? <Attachments files={view.r.attachments!} /> : <>
          {view.r.mime_type?.startsWith('image/') && view.url && <img src={view.url} alt={view.r.title} className="w-full rounded-2xl" />}
          {view.r.mime_type?.startsWith('video/') && view.url && <video src={view.url} controls playsInline preload="metadata" className="max-h-[60vh] w-full rounded-2xl bg-black" />}
          </>}
          <div className="flex gap-2">
            <Button variant="soft" className="flex-1" disabled={!view.url} onClick={() => openOriginal(view.url)}><ExternalLink className="h-4 w-4" />{view.r.mime_type?.startsWith('image/') ? 'Open full size' : 'Open original report'}</Button>
            {canEdit && <Button variant="danger" onClick={() => del(view.r)}><Trash2 className="h-4 w-4" /></Button>}
          </div>
        </div>}
      </Sheet>
    </div>
  );
}

/** All files of a grouped report: videos play inline, photos show, PDFs open. */
function Attachments({ files }: { files: ReportFile[] }) {
  return (
    <div className="space-y-3">
      {files.map((f, i) => <AttachmentItem key={f.path} f={f} n={i + 1} />)}
    </div>
  );
}
function AttachmentItem({ f, n }: { f: ReportFile; n: number }) {
  const { toast } = useApp();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { let live = true; photoUrl(f.path).then(u => live && setUrl(u)).catch(e => toast((e as Error).message, 'err')); return () => { live = false; }; }, [f.path]); // eslint-disable-line
  const isVid = f.mime.startsWith('video/'), isImg = f.mime.startsWith('image/');
  const open = () => { if (!url) return; if (isNative()) Browser.open({ url }); else window.open(url, '_blank', 'noopener'); };
  return (
    <div className="rounded-2xl bg-slate-50 p-2 dark:bg-white/[.03]">
      <div className="mb-1.5 flex items-center gap-2 px-1 text-[0.75rem] font-semibold text-slate-500">
        <span className="grid h-5 w-5 place-items-center rounded-full bg-slate-200 text-[0.6875rem] text-slate-700 dark:bg-white/10 dark:text-slate-200">{n}</span>
        <span className="min-w-0 flex-1 truncate">{isVid ? t('Video') : isImg ? t('Photo') : 'PDF'} · {(f.size / 1024 / 1024).toFixed(1)} MB</span>
        {!isVid && <button onClick={open} className="text-brand-600 dark:text-brand-300">{t('Open')}</button>}
      </div>
      {!url ? <div className="grid h-32 place-items-center"><Spinner /></div>
        : isVid ? <video src={url} controls playsInline preload="metadata" className="max-h-[55vh] w-full rounded-xl bg-black" />
        : isImg ? <img src={url} alt="" className="w-full rounded-xl" />
        : <button onClick={open} className="flex w-full items-center gap-3 rounded-xl bg-white p-3 text-left dark:bg-night-3"><FileText className="h-7 w-7 text-red-500" /><span className="min-w-0 flex-1 truncate text-sm font-semibold">{f.name}</span><ExternalLink className="h-4 w-4 text-slate-400" /></button>}
    </div>
  );
}

function UploadForm({ onDone }: { onDone: () => void }) {
  const { patient, toast } = useApp();
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [cat, setCat] = useState('lab');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState<string | false>(false);
  const fileRef = useRef<HTMLInputElement>(null), camRef = useRef<HTMLInputElement>(null), vidRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const urls = files.map(f => (f.type.startsWith('image/') || f.type.startsWith('video/') ? URL.createObjectURL(f) : ''));
    setPreviews(urls);
    return () => urls.forEach(u => u && URL.revokeObjectURL(u));
  }, [files]);

  const add = (list?: FileList | null) => {
    const picked = [...(list ?? [])].filter(f => {
      const isVideo = f.type.startsWith('video/');
      if (f.size > (isVideo ? 50 : 20) * 1024 * 1024) { toast(isVideo ? t('Video is larger than 50 MB — record a shorter clip or trim it first') : t('File is larger than 20 MB'), 'err'); return false; }
      return true;
    });
    if (!picked.length) return;
    setFiles(fs => [...fs, ...picked].slice(0, 20));
    if (!title) setTitle(picked[0].name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/^(IMG|PXL|image)\s?\d*.*/i, ''));
  };
  const removeAt = (i: number) => setFiles(fs => fs.filter((_, j) => j !== i));
  const move = (i: number, d: -1 | 1) => setFiles(fs => { const n = [...fs]; const j = i + d; if (j < 0 || j >= n.length) return fs; [n[i], n[j]] = [n[j], n[i]]; return n; });

  /** Several photos → one PDF report (one page per photo), so the family sees all pages together. */
  async function photosToPdf(imgs: File[]): Promise<File> {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 18;
    for (const [i, f] of imgs.entries()) {
      setBusy(t('Preparing page {n} of {m}…', { n: i + 1, m: imgs.length }));
      const blob = await toJpegBlob(f, 2000);
      const url = await new Promise<string>(res => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(blob); });
      const img = await new Promise<HTMLImageElement>((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; });
      const k = Math.min((W - 2 * M) / img.width, (H - 2 * M) / img.height);
      if (i > 0) doc.addPage();
      doc.addImage(url, 'JPEG', (W - img.width * k) / 2, (H - img.height * k) / 2, img.width * k, img.height * k);
    }
    const name = (title || 'Report').replace(/[^\w\s-]+/g, '').trim().replace(/\s+/g, '_') || 'Report';
    return new File([doc.output('blob')], `${name}.pdf`, { type: 'application/pdf' });
  }

  async function upload() {
    if (!files.length) return;
    setBusy(files.some(f => f.type.startsWith('video/')) ? t('Uploading video… this can take a minute') : t('Uploading…'));
    try {
      const meta = { title: title || files[0].name, category: cat, report_date: date, notes: notes || null };
      const imgs = files.filter(f => f.type.startsWith('image/')), others = files.filter(f => !f.type.startsWith('image/'));
      // photos → one PDF (or one picture); videos & PDFs stay as they are — all kept together in ONE report
      const parts: File[] = [];
      if (imgs.length > 1) parts.push(await photosToPdf(imgs));
      else if (imgs.length === 1) {
        const f = imgs[0];
        parts.push(f.size > 1.5 * 1024 * 1024 ? new File([await toJpegBlob(f, 2400)], f.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' }) : f);
      }
      parts.push(...others);
      const vids = others.filter(f => f.type.startsWith('video/')).length, pdfs = others.length - vids;
      const what = [imgs.length > 1 ? t('{n} pages', { n: imgs.length }) : imgs.length ? t('1 photo') : '', vids ? t(vids === 1 ? '1 video' : '{n} videos', { n: vids }) : '', pdfs ? t(pdfs === 1 ? '1 PDF' : '{n} PDFs', { n: pdfs }) : ''].filter(Boolean).join(' · ');
      if (parts.length === 1) {
        setBusy(vids ? t('Uploading video… this can take a minute') : t('Uploading…'));
        await api().uploadReport(patient!.id, parts[0], { ...meta, notes: [notes, imgs.length > 1 ? what : ''].filter(Boolean).join(' · ') || null });
      } else {
        await api().uploadReportGroup(patient!.id, parts, { ...meta, notes: [notes, what].filter(Boolean).join(' · ') }, i => setBusy(t('Uploading file {n} of {m}…', { n: i + 1, m: parts.length })));
      }
      toast('Report uploaded'); onDone();
    } catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); }
  }

  const tile = 'flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 px-2 py-4 text-center text-[0.8125rem] font-semibold text-slate-600 dark:border-white/10 dark:text-slate-300';
  return (
    <div className="space-y-4">
      <input ref={fileRef} type="file" accept="image/*,application/pdf,video/*" multiple className="hidden" onChange={e => { add(e.target.files); e.target.value = ''; }} />
      <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { add(e.target.files); e.target.value = ''; }} />
      <input ref={vidRef} type="file" accept="video/*" capture="environment" className="hidden" onChange={e => { add(e.target.files); e.target.value = ''; }} />
      <div className="grid grid-cols-3 gap-2">
        <button onClick={() => camRef.current?.click()} className={tile}><Camera className="h-7 w-7 text-brand-600" />{files.length ? 'Take another photo' : 'Take photo'}</button>
        <button onClick={() => vidRef.current?.click()} className={tile}><Video className="h-7 w-7 text-brand-600" />Record video</button>
        <button onClick={() => fileRef.current?.click()} className={tile}><Upload className="h-7 w-7 text-brand-600" />{files.length ? 'Add more files' : 'Choose files / PDF / video'}</button>
      </div>
      {files.length > 0 && (
        <div>
          <div className="mb-2 flex items-baseline justify-between px-1">
            <span className="text-sm font-bold">{files.every(f => f.type.startsWith('image/')) ? t(files.length === 1 ? '{n} page' : '{n} pages', { n: files.length }) : t(files.length === 1 ? '{n} file' : '{n} files', { n: files.length })}</span>
            {files.length > 1 && <span className="text-[0.75rem] text-slate-500">{files.some(f => !f.type.startsWith('image/')) ? t('All saved together as one report') : t('Photos are joined into one PDF')}</span>}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {files.map((f, i) => (
              <div key={i} className="relative overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-slate-900/5 dark:bg-white/5">
                {previews[i] && f.type.startsWith('video/') ? <div className="relative"><video src={previews[i]} muted playsInline preload="metadata" className="aspect-[3/4] w-full bg-black object-cover" /><Video className="absolute bottom-2 left-1/2 h-6 w-6 -translate-x-1/2 text-white drop-shadow" /></div> : previews[i] ? <img src={previews[i]} alt="" className="aspect-[3/4] w-full object-cover" /> : <div className="grid aspect-[3/4] place-items-center p-2 text-center text-[0.6875rem] text-slate-500"><FileText className="mx-auto h-7 w-7 text-red-500" />{f.name}</div>}
                <span className="absolute left-1.5 top-1.5 rounded-full bg-black/60 px-2 text-[0.6875rem] font-bold text-white">{i + 1}</span>
                <button onClick={() => removeAt(i)} aria-label="Remove" className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white"><X className="h-4 w-4" /></button>
                {files.length > 1 && (
                  <div className="absolute inset-x-1.5 bottom-1.5 flex justify-between">
                    <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move earlier" className="grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white disabled:opacity-0"><ChevronLeft className="h-4 w-4" /></button>
                    <button onClick={() => move(i, 1)} disabled={i === files.length - 1} aria-label="Move later" className="grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white disabled:opacity-0"><ChevronRight className="h-4 w-4" /></button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      <Field label="Title"><input className="field" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. HbA1c & lipid profile" /></Field>
      <Field label="Type"><ChipSelect value={cat} onChange={setCat} options={CATS} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Report date"><input type="date" className="field" value={date} onChange={e => setDate(e.target.value)} /></Field>
        <Field label="Notes"><input className="field" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Lab / doctor" /></Field>
      </div>
      <Button block size="lg" loading={!!busy} disabled={!files.length} onClick={upload}>{busy || 'Upload'}</Button>
    </div>
  );
}
