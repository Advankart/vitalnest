import { forwardRef, useMemo, useRef, useState } from 'react';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { toPng } from 'html-to-image';
import { FileSpreadsheet, FileText, Image as ImageIcon, MessageCircle, Sheet as SheetIcon, Download } from 'lucide-react';
import { useApp } from '../lib/store';
import { filterRange, summarize, summaryText, toCSV, toExcel, toPDF, type ExportData } from '../lib/export';
import { saveFile, shareFile, shareText } from '../lib/share';
import { CONDITIONS, age } from '../lib/health';
import type { Patient } from '../lib/types';
import { BPChart, GlucoseChart, SimpleLine } from '../components/Charts';
import { Button, Field, PageHeader, Segmented } from '../components/ui';

const ShareCard = forwardRef<HTMLDivElement, { p: Patient; d: ExportData; days: number }>(({ p, d, days }, ref) => {
  const s = summarize(p, d, days);
  const lastG = [...s.g].reverse()[0];
  const tile = (label: string, value: string, sub?: string, accent = '#0f172a') => (
    <div style={{ background: '#f8fafc', borderRadius: 18, padding: '12px 14px' }}>
      <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: accent, fontFamily: 'Plus Jakarta Sans Variable, sans-serif', marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 1 }}>{sub}</div>}
    </div>
  );
  const segs = [[s.tir.veryLow + s.tir.low, '#f59e0b'], [s.tir.inRange, '#10b981'], [s.tir.high, '#f97316'], [s.tir.veryHigh, '#dc2626']] as const;
  return (
    <div ref={ref} style={{ width: 360, background: '#ffffff', borderRadius: 28, overflow: 'hidden', fontFamily: 'Inter Variable, sans-serif', color: '#0f172a', boxShadow: '0 1px 0 rgba(0,0,0,.02)' }}>
      <div style={{ background: 'radial-gradient(120% 120% at 0% 0%, #14b8a6 0%, #0d9488 40%, #0f766e 75%, #134e4a 100%)', color: '#fff', padding: '22px 22px 20px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.12em', opacity: .8 }}>HEALTH UPDATE · LAST {days} DAYS</div>
        <div style={{ fontSize: 24, fontWeight: 800, fontFamily: 'Plus Jakarta Sans Variable, sans-serif', marginTop: 6 }}>{p.full_name}</div>
        <div style={{ fontSize: 12, opacity: .85, marginTop: 2 }}>{[age(p.dob) !== null ? `${age(p.dob)} yrs` : null, CONDITIONS[p.condition].label].filter(Boolean).join(' · ')}</div>
        {lastG && (
          <div style={{ marginTop: 16, display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 46, fontWeight: 800, lineHeight: 1, fontFamily: 'Plus Jakarta Sans Variable, sans-serif' }}>{Math.round(lastG.value1)}</span>
            <span style={{ fontSize: 13, opacity: .85 }}>mg/dL latest · {format(new Date(lastG.measured_at), 'd MMM, h:mm a')}</span>
          </div>
        )}
      </div>
      <div style={{ padding: 16 }}>
        {s.gs.n > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, marginBottom: 6 }}><span>Time in range</span><span style={{ color: '#059669' }}>{Math.round(s.tir.inRange)}%</span></div>
            <div style={{ display: 'flex', gap: 2, height: 10, borderRadius: 99, overflow: 'hidden' }}>
              {segs.filter(([v]) => v > 0).map(([v, c], i) => <div key={i} style={{ width: `${v}%`, background: c }} />)}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#94a3b8', marginTop: 4 }}><span>Low {Math.round(s.tir.veryLow + s.tir.low)}%</span><span>High {Math.round(s.tir.high + s.tir.veryHigh)}%</span></div>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {tile('Avg sugar', s.gs.n ? `${Math.round(s.gs.avg)}` : '—', 'mg/dL')}
          {tile('Est. HbA1c', s.eA1c ? `${s.eA1c.toFixed(1)}%` : '—', s.a1c ? `Lab ${Number(s.a1c.value1).toFixed(1)}%` : undefined)}
          {tile('Fasting avg', s.fast.n ? `${Math.round(s.fast.avg)}` : '—', 'mg/dL')}
          {tile('After meal avg', s.pp.n ? `${Math.round(s.pp.avg)}` : '—', 'mg/dL')}
          {s.sys.n > 0 && tile('Avg BP', `${Math.round(s.sys.avg)}/${Math.round(s.dia.avg)}`, 'mmHg', '#7c3aed')}
          {s.hr.n > 0 && tile('Avg pulse', `${Math.round(s.hr.avg)}`, 'bpm', '#ea580c')}
          {s.weight && tile('Weight', `${s.weight.toFixed(1)}`, s.weightChange ? `${s.weightChange > 0 ? '+' : ''}${s.weightChange.toFixed(1)} kg in period` : 'kg', '#0891b2')}
          {s.adh.due > 0 && tile('Medicines taken', `${Math.round(s.adh.pct)}%`, `${s.adh.taken}/${s.adh.due} doses`, s.adh.pct >= 90 ? '#059669' : '#d97706')}
        </div>
        {s.hypos > 0 && <div style={{ marginTop: 10, background: '#fef2f2', color: '#b91c1c', borderRadius: 14, padding: '8px 12px', fontSize: 11.5, fontWeight: 600 }}>{s.hypos} low sugar reading{s.hypos > 1 ? 's' : ''} (below 70) this period</div>}
        <div style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#94a3b8' }}>
          <span style={{ fontWeight: 700, color: '#0f766e' }}>♥ VitalNest</span><span>{format(new Date(), 'd MMM yyyy')}</span>
        </div>
      </div>
    </div>
  );
});

export default function Export() {
  const { patient, data, toast } = useApp();
  const [range, setRange] = useState<'7' | '30' | '90' | 'custom'>('30');
  const [from, setFrom] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [to, setTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [busy, setBusy] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const gRef = useRef<HTMLDivElement>(null), bpRef = useRef<HTMLDivElement>(null), hrRef = useRef<HTMLDivElement>(null), wRef = useRef<HTMLDivElement>(null);

  const [f, t] = range === 'custom' ? [startOfDay(new Date(from)), endOfDay(new Date(to))] : [startOfDay(subDays(new Date(), Number(range) - 1)), new Date()];
  const days = Math.max(1, Math.round((+t - +f) / 864e5));
  const d = useMemo(() => filterRange(data, f, t), [data, +f, +t]); // eslint-disable-line
  if (!patient) return null;
  const base = `${patient.full_name.replace(/\s+/g, '_')}_${format(f, 'ddMMMyy')}-${format(t, 'ddMMMyy')}`;

  async function run(key: string, fn: () => Promise<string | void>) {
    setBusy(key);
    try { const msg = await fn(); if (msg) toast(msg); } catch (e) { toast((e as Error).message || 'Something went wrong', 'err'); } finally { setBusy(null); }
  }
  const snap = (el: HTMLElement | null) => el ? toPng(el, { pixelRatio: 3, backgroundColor: '#ffffff', cacheBust: true }) : Promise.reject(new Error('Not ready'));

  const excel = (share: boolean) => run('xlsx' + share, async () => { const b = toExcel(patient, d, f, t); if (share) { await shareFile(b, `${base}.xlsx`, 'Health data (Excel)'); } else return saveFile(b, `${base}.xlsx`); });
  const csv = () => run('csv', async () => saveFile(toCSV(patient, d), `${base}.csv`));
  const pdf = (share: boolean) => run('pdf' + share, async () => {
    const charts: { title: string; img: string; w: number; h: number }[] = [];
    const pairs: [string, HTMLDivElement | null, boolean][] = [['Blood sugar trend', gRef.current, d.vitals.some(v => v.kind === 'glucose')], ['Blood pressure trend', bpRef.current, d.vitals.some(v => v.kind === 'bp')], ['Heart rate trend', hrRef.current, d.vitals.some(v => v.kind === 'heart_rate')], ['Weight trend', wRef.current, d.vitals.some(v => v.kind === 'weight')]];
    for (const [title, el, has] of pairs) if (el && has) charts.push({ title, img: await toPng(el, { pixelRatio: 2, backgroundColor: '#ffffff' }), w: el.offsetWidth, h: el.offsetHeight });
    const b = toPDF(patient, d, f, t, charts);
    if (share) await shareFile(b, `${base}.pdf`, 'Health report (PDF)');
    else return saveFile(b, `${base}.pdf`);
  });
  const image = () => run('img', async () => {
    const png = await snap(cardRef.current);
    const blob = await (await fetch(png)).blob();
    const r = await shareFile(blob, `${base}.png`, `${patient.full_name} health update`, summaryText(patient, d, days));
    if (r === 'downloaded') return 'Image downloaded — attach it in WhatsApp';
  });
  const text = () => run('txt', async () => { await shareText(summaryText(patient, d, days), true); });

  const Act = ({ k, icon, label, sub, onClick, color }: { k: string; icon: React.ReactNode; label: string; sub: string; onClick: () => void; color: string }) => (
    <button onClick={onClick} disabled={!!busy} className="card flex items-center gap-3 p-4 text-left transition active:scale-[.98] disabled:opacity-60">
      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-white" style={{ background: color }}>{busy === k ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : icon}</div>
      <div className="min-w-0 flex-1"><div className="font-semibold">{label}</div><div className="text-xs text-slate-500">{sub}</div></div>
    </button>
  );

  return (
    <div className="rise">
      <PageHeader title="Share & export" subtitle={`${patient.full_name} · ${d.vitals.length} readings`} />
      <Segmented value={range} onChange={setRange} options={[{ id: '7', label: '7 days' }, { id: '30', label: '30 days' }, { id: '90', label: '90 days' }, { id: 'custom', label: 'Custom' }]} />
      {range === 'custom' && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field label="From"><input type="date" className="field" value={from} onChange={e => setFrom(e.target.value)} /></Field>
          <Field label="To"><input type="date" className="field" value={to} onChange={e => setTo(e.target.value)} /></Field>
        </div>
      )}

      <h2 className="mb-2 mt-6 px-1 text-[15px] font-bold">WhatsApp</h2>
      <div className="flex justify-center rounded-[32px] bg-gradient-to-b from-emerald-50 to-teal-50 p-5 dark:from-white/5 dark:to-white/[.02]">
        <ShareCard ref={cardRef} p={patient} d={d} days={days} />
      </div>
      <div className="mt-3 grid gap-2">
        <Act k="img" icon={<ImageIcon className="h-5 w-5" />} label="Share summary card" sub="Beautiful image + text — perfect for WhatsApp" onClick={image} color="#25D366" />
        <Act k="txt" icon={<MessageCircle className="h-5 w-5" />} label="Send as WhatsApp message" sub="Neatly formatted text summary" onClick={text} color="#128C7E" />
      </div>

      <h2 className="mb-2 mt-6 px-1 text-[15px] font-bold">Files</h2>
      <div className="grid gap-2">
        <Act k="pdftrue" icon={<FileText className="h-5 w-5" />} label="PDF report for doctor" sub="Profile, summary, charts, readings & medicines" onClick={() => pdf(true)} color="#dc2626" />
        <Act k="xlsxtrue" icon={<FileSpreadsheet className="h-5 w-5" />} label="Excel workbook" sub="Separate sheets: vitals, sugar, BP, medicines, food, water" onClick={() => excel(true)} color="#16a34a" />
        <div className="grid grid-cols-3 gap-2">
          <Button variant="soft" size="sm" onClick={() => pdf(false)} disabled={!!busy}><Download className="h-4 w-4" />PDF</Button>
          <Button variant="soft" size="sm" onClick={() => excel(false)} disabled={!!busy}><Download className="h-4 w-4" />Excel</Button>
          <Button variant="soft" size="sm" onClick={csv} disabled={!!busy}><SheetIcon className="h-4 w-4" />CSV</Button>
        </div>
      </div>

      {/* off-screen charts used for the PDF */}
      <div aria-hidden style={{ position: 'fixed', left: -10000, top: 0, background: '#fff', width: 720 }} className="light-capture">
        <div ref={gRef} style={{ width: 720, padding: 8, background: '#fff' }}><GlucoseChart vitals={d.vitals} patient={patient} days={days} width={704} height={260} /></div>
        <div ref={bpRef} style={{ width: 720, padding: 8, background: '#fff' }}><BPChart vitals={d.vitals} patient={patient} days={days} width={704} height={240} /></div>
        <div ref={hrRef} style={{ width: 720, padding: 8, background: '#fff' }}><SimpleLine vitals={d.vitals} kind="heart_rate" color="#f97316" unit="bpm" days={days} width={704} height={200} /></div>
        <div ref={wRef} style={{ width: 720, padding: 8, background: '#fff' }}><SimpleLine vitals={d.vitals} kind="weight" color="#0891b2" unit="kg" days={days} width={704} height={200} /></div>
      </div>
    </div>
  );
}
