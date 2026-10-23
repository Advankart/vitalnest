import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { Camera, ExternalLink, FileImage, FileText, Trash2, Upload } from 'lucide-react';
import { Browser } from '@capacitor/browser';
import { useApp } from '../lib/store';
import { api } from '../lib/api';
import { isNative } from '../lib/notify';
import type { Report } from '../lib/types';
import { Button, ChipSelect, Empty, Field, PageHeader, Segmented, Sheet, Spinner, ViewOnlyNote } from '../components/ui';

const CATS = [{ id: 'lab', label: 'Lab test' }, { id: 'prescription', label: 'Prescription' }, { id: 'scan', label: 'Scan / ECG / Echo' }, { id: 'discharge', label: 'Discharge summary' }, { id: 'other', label: 'Other' }];

export default function Reports() {
  const { patient, canEdit, toast } = useApp();
  const [sp, setSp] = useSearchParams();
  const [list, setList] = useState<Report[] | null>(null);
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState(sp.get('upload') === '1');
  const [view, setView] = useState<{ r: Report; url: string } | null>(null);

  const load = () => patient && api().list<Report>('reports', [patient.id], undefined, 'created_at').then(setList).catch(e => toast(e.message, 'err'));
  useEffect(() => { load(); }, [patient?.id]); // eslint-disable-line
  if (!patient) return null;

  async function openReport(r: Report) {
    try {
      const url = await api().reportUrl(r);
      if (r.mime_type?.startsWith('image/')) setView({ r, url });
      else if (isNative()) await Browser.open({ url });
      else window.open(url, '_blank', 'noopener');
    } catch (e) { toast((e as Error).message, 'err'); }
  }
  async function del(r: Report) {
    if (!confirm(`Delete "${r.title}"?`)) return;
    try { await api().deleteReport(r); setView(null); load(); } catch (e) { toast((e as Error).message, 'err'); }
  }

  const shown = (list ?? []).filter(r => filter === 'all' || r.category === filter);
  return (
    <div className="rise">
      <PageHeader title="Health reports" subtitle={patient.full_name} right={canEdit ? <Button size="sm" onClick={() => setOpen(true)}><Upload className="h-4 w-4" />Upload</Button> : undefined} />
      <ViewOnlyNote />
      <Segmented value={filter} onChange={setFilter} className="mb-4" options={[{ id: 'all', label: 'All' }, ...CATS.slice(0, 4).map(c => ({ id: c.id, label: c.label.split(' ')[0] }))]} />
      {list === null ? <Spinner /> : !shown.length ? (
        <Empty icon={<FileText className="h-7 w-7" />} title="No reports yet" text="Upload lab reports, prescriptions, ECGs and discharge summaries — photos or PDFs. The family can view them anytime." action={canEdit ? <Button onClick={() => setOpen(true)}><Upload className="h-4 w-4" />Upload report</Button> : undefined} />
      ) : (
        <div className="space-y-2">
          {shown.map(r => (
            <button key={r.id} onClick={() => openReport(r)} className="card flex w-full items-center gap-3 p-4 text-left">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-300">
                {r.mime_type?.startsWith('image/') ? <FileImage className="h-6 w-6" /> : <FileText className="h-6 w-6" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{r.title}</div>
                <div className="truncate text-xs text-slate-500">{CATS.find(c => c.id === r.category)?.label} · {r.report_date ? format(new Date(r.report_date), 'd MMM yyyy') : ''}{r.size_bytes ? ` · ${(r.size_bytes / 1024 / 1024).toFixed(1)} MB` : ''}</div>
                {r.notes && <div className="truncate text-xs text-slate-400">{r.notes}</div>}
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
        {view && <>
          <img src={view.url} alt={view.r.title} className="w-full rounded-2xl" />
          <div className="mt-3 flex gap-2">
            <Button variant="soft" className="flex-1" onClick={() => isNative() ? Browser.open({ url: view.url }) : window.open(view.url, '_blank')}><ExternalLink className="h-4 w-4" />Open full size</Button>
            {canEdit && <Button variant="danger" onClick={() => del(view.r)}><Trash2 className="h-4 w-4" /></Button>}
          </div>
        </>}
      </Sheet>
    </div>
  );
}

function UploadForm({ onDone }: { onDone: () => void }) {
  const { patient, toast } = useApp();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [cat, setCat] = useState('lab');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null), camRef = useRef<HTMLInputElement>(null);

  const pick = (f?: File | null) => { if (!f) return; if (f.size > 20 * 1024 * 1024) { toast('File is larger than 20 MB', 'err'); return; } setFile(f); if (!title) setTitle(f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ')); };

  async function upload() {
    if (!file) return;
    setBusy(true);
    try { await api().uploadReport(patient!.id, file, { title: title || file.name, category: cat, report_date: date, notes: notes || null }); toast('Report uploaded'); onDone(); }
    catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={e => pick(e.target.files?.[0])} />
      <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => pick(e.target.files?.[0])} />
      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => camRef.current?.click()} className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 p-5 text-sm font-semibold text-slate-600 dark:border-white/10 dark:text-slate-300"><Camera className="h-7 w-7 text-brand-600" />Take photo</button>
        <button onClick={() => fileRef.current?.click()} className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 p-5 text-sm font-semibold text-slate-600 dark:border-white/10 dark:text-slate-300"><Upload className="h-7 w-7 text-brand-600" />Choose file / PDF</button>
      </div>
      {file && <div className="rounded-2xl bg-brand-50 px-4 py-3 text-sm text-brand-800 dark:bg-brand-500/10 dark:text-brand-200">{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</div>}
      <Field label="Title"><input className="field" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. HbA1c & lipid profile" /></Field>
      <Field label="Type"><ChipSelect value={cat} onChange={setCat} options={CATS} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Report date"><input type="date" className="field" value={date} onChange={e => setDate(e.target.value)} /></Field>
        <Field label="Notes"><input className="field" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Lab / doctor" /></Field>
      </div>
      <Button block size="lg" loading={busy} disabled={!file} onClick={upload}>Upload</Button>
    </div>
  );
}
