import { useState } from 'react';
import { BellPlus, AlertTriangle, CalendarClock, CheckCircle2, ClipboardList, Eye, FlaskConical, HeartPulse, Pill, RefreshCw, Share2, ShieldAlert, Sparkles, Stethoscope, Utensils } from 'lucide-react';
import { formatDistanceToNowStrict } from 'date-fns';
import type { Report, ReportSummary } from '../lib/types';
import { findFollowUps, savedSummary, summariseReport, summaryToText } from '../lib/reportSummary';
import type { Appointment, NextVisit } from '../lib/types';
import { format, parseISO } from 'date-fns';
import { to12h } from '../lib/health';
import { shareText } from '../lib/share';
import { api } from '../lib/api';
import { t } from '../lib/i18n';
import { useApp } from '../lib/store';
import { Button, cx } from './ui';

const DOC: Record<ReportSummary['doc_type'], string> = {
  discharge_summary: 'Discharge summary', lab_report: 'Lab test', prescription: 'Prescription', scan_report: 'Scan / ECG / Echo', consultation: 'Doctor visit', other: 'Report',
};
const LAB_FLAG: Record<string, string> = {
  low: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300', high: 'bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300',
  critical: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300', normal: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300', unknown: 'bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-300',
};
const FLAG_LABEL: Record<string, string> = { low: 'Low', high: 'High', critical: 'Critical', normal: 'Normal', unknown: '—' };

function Block({ icon, title, children, tone }: { icon: React.ReactNode; title: string; children: React.ReactNode; tone?: 'red' }) {
  return (
    <section className={cx('rounded-2xl p-3.5 ring-1', tone === 'red' ? 'bg-red-50 ring-red-100 dark:bg-red-500/10 dark:ring-red-500/20' : 'bg-white ring-slate-100 dark:bg-night-3 dark:ring-white/5')}>
      <div className={cx('mb-2 flex items-center gap-2 text-[0.875rem] font-bold', tone === 'red' && 'text-red-700 dark:text-red-300')}>{icon}{title}</div>
      {children}
    </section>
  );
}
const Bullets = ({ items }: { items: string[] }) => (
  <ul className="space-y-1.5 text-[0.8438rem]">{items.map((x, i) => <li key={i} className="flex gap-2"><span className="mt-[0.5rem] h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" /><span className="min-w-0 break-words">{x}</span></li>)}</ul>
);

/** Clean VitalNest view of a report's AI summary. Uses the saved summary; AI only runs when asked. */
export function ReportSummaryView({ report, onSaved }: { report: Report; onSaved: (r: Report) => void }) {
  const { patient, toast, data, canEdit, refreshData } = useApp();
  const [fuBusy, setFuBusy] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [s, setS] = useState<ReportSummary | null>(() => savedSummary(report));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const canSummarise = api().mode === 'cloud' && (report.mime_type === 'application/pdf' || /^image\//.test(report.mime_type ?? '') || /\.pdf$/i.test(report.file_path));

  async function run(refresh = false) {
    if (refresh && !confirm(t('Read the report again with AI? This uses a little AI credit.'))) return;
    setBusy(true); setErr('');
    try {
      const out = await summariseReport(report, refresh);
      setS(out);
      onSaved({ ...report, ai_summary: { ...(report.ai_summary ?? {}), [out.lang === 'ta' ? 'ta' : 'en']: out } });
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  const saveSummary = (out: ReportSummary) => { setS(out); onSaved({ ...report, ai_summary: { ...(report.ai_summary ?? {}), [out.lang === 'ta' ? 'ta' : 'en']: out } }); };
  async function findDates() {
    setFuBusy(true); setErr('');
    try { saveSummary(await findFollowUps(report)); } catch (e) { setErr((e as Error).message); } finally { setFuBusy(false); }
  }
  const added = (v: NextVisit) => data.appointments.some(a => a.report_id === report.id && a.appt_date === v.date && a.title === v.what);
  async function addVisit(v: NextVisit) {
    if (!v.date || !patient) return;
    setAdding(v.what + v.date);
    try {
      await api().insert<Appointment>('appointments', {
        patient_id: patient.id, title: v.what, kind: v.kind === 'test' ? 'test' : 'visit', doctor: v.doctor || s?.doctor || null, hospital: s?.hospital || null,
        appt_date: v.date, appt_time: v.time && /^\d{2}:\d{2}$/.test(v.time) ? v.time : null, notes: v.when_text || null, source: 'report', report_id: report.id, done: false,
      });
      await refreshData(); toast(t('Saved · reminder set'));
    } catch (e) { toast((e as Error).message, 'err'); } finally { setAdding(null); }
  }

  if (!s) {
    if (!canSummarise) return null;
    return (
      <div className="rounded-3xl bg-gradient-to-br from-violet-50 to-sky-50 p-4 text-center ring-1 ring-violet-100 dark:from-violet-500/10 dark:to-sky-500/5 dark:ring-violet-500/20">
        <Sparkles className="mx-auto h-7 w-7 text-violet-600" />
        <div className="mt-1 font-bold">AI summary</div>
        <p className="mx-auto mt-1 max-w-xs text-[0.8125rem] text-slate-500">VitalNest reads this report and shows the diagnosis, important values, medicines and follow-up in a clean, simple view. Done once and saved for the family.</p>
        <Button className="mt-3" loading={busy} onClick={() => run()}><Sparkles className="h-4 w-4" />{busy ? t('Reading report… (up to a minute)') : t('Create AI summary')}</Button>
        {err && <p className="mt-2 text-[0.8125rem] text-red-600">{err}</p>}
      </div>
    );
  }

  if (s.readable === false) {
    return <div className="rounded-2xl bg-amber-50 p-4 text-[0.8438rem] text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">{t("This doesn't look like a readable medical report. Try clearer photos.")} <button className="font-semibold underline" onClick={() => run(true)}>{t('Try again')}</button></div>;
  }

  const abnormal = s.lab_results.filter(l => l.flag !== 'normal' && l.flag !== 'unknown');
  const normal = s.lab_results.filter(l => l.flag === 'normal' || l.flag === 'unknown');
  return (
    <div className="space-y-3">
      <div className="hero-grad rounded-3xl p-4 text-white">
        <div className="flex items-center gap-1.5 text-[0.7188rem] font-semibold opacity-80"><Sparkles className="h-3.5 w-3.5" />{t('AI summary')} · {t(DOC[s.doc_type] ?? 'Report')}</div>
        <div className="mt-1 font-display text-[1.125rem] font-bold leading-snug">{s.title}</div>
        <div className="mt-0.5 text-[0.75rem] opacity-85">{[s.hospital, s.doctor, s.date].filter(Boolean).join(' · ')}</div>
        <p className="mt-3 text-[0.875rem] leading-relaxed">{s.summary}</p>
      </div>

      {s.diagnoses.length > 0 && <Block icon={<Stethoscope className="h-4 w-4 text-brand-600" />} title={t('Diagnosis')}><Bullets items={s.diagnoses} /></Block>}

      {s.key_findings.length > 0 && (
        <Block icon={<HeartPulse className="h-4 w-4 text-rose-500" />} title={t('Important findings')}>
          <div className="space-y-2">
            {s.key_findings.map((f, i) => {
              const Icon = f.flag === 'critical' ? AlertTriangle : f.flag === 'attention' ? Eye : CheckCircle2;
              return (
                <div key={i} className="flex gap-2">
                  <Icon className={cx('mt-0.5 h-4 w-4 shrink-0', f.flag === 'critical' ? 'text-red-600' : f.flag === 'attention' ? 'text-amber-600' : 'text-emerald-600')} />
                  <div className="min-w-0 text-[0.8438rem]"><span className="font-semibold">{f.label}: </span>{f.detail}</div>
                </div>
              );
            })}
          </div>
        </Block>
      )}

      {s.lab_results.length > 0 && (
        <Block icon={<FlaskConical className="h-4 w-4 text-violet-600" />} title={t('Lab values')}>
          <div className="divide-y divide-slate-100 dark:divide-white/5">
            {[...abnormal, ...normal].map((l, i) => (
              <div key={i} className="flex items-center gap-2 py-2 text-[0.8438rem]">
                <div className="min-w-0 flex-1"><div className="break-words font-medium">{l.test}</div>{l.range && <div className="text-[0.6875rem] text-slate-400">{t('Normal')}: {l.range}</div>}</div>
                <div className="shrink-0 text-right font-display font-bold">{l.value}<span className="text-[0.6875rem] font-medium text-slate-400"> {l.unit}</span></div>
                <span className={cx('w-16 shrink-0 rounded-full px-2 py-0.5 text-center text-[0.6875rem] font-bold', LAB_FLAG[l.flag] ?? LAB_FLAG.unknown)}>{t(FLAG_LABEL[l.flag] ?? '—')}</span>
              </div>
            ))}
          </div>
        </Block>
      )}

      {s.procedures.length > 0 && <Block icon={<ClipboardList className="h-4 w-4 text-sky-600" />} title={t('Procedures done')}><Bullets items={s.procedures} /></Block>}

      {s.medicines.length > 0 && (
        <Block icon={<Pill className="h-4 w-4 text-purple-600" />} title={t('Medicines')}>
          <div className="space-y-2">
            {s.medicines.map((m, i) => (
              <div key={i} className="rounded-xl bg-purple-50/60 px-3 py-2 dark:bg-purple-500/5">
                <div className="break-words text-[0.875rem] font-semibold">{m.name} {m.dose && <span className="font-normal text-slate-500">{m.dose}</span>}</div>
                <div className="text-[0.75rem] text-slate-500">{[m.timing, m.duration, m.purpose].filter(Boolean).join(' · ')}</div>
              </div>
            ))}
          </div>
        </Block>
      )}

      {s.follow_up.length > 0 && <Block icon={<CalendarClock className="h-4 w-4 text-brand-600" />} title={t('Follow-up')}>
        <Bullets items={s.follow_up} />
        {s.next_visits === undefined && canEdit && api().mode === 'cloud' && (
          <Button size="sm" variant="soft" className="mt-3 w-full" loading={fuBusy} onClick={findDates}><BellPlus className="h-4 w-4" />{t('Find dates & set reminders')}</Button>
        )}
        {(s.next_visits ?? []).filter(v => v.date).length > 0 && (
          <div className="mt-3 space-y-2">
            {(s.next_visits ?? []).filter(v => v.date && /^\d{4}-\d{2}-\d{2}$/.test(v.date)).map((v, i) => {
              const done = added(v);
              return (
                <div key={i} className="flex items-center gap-3 rounded-xl bg-sky-50 px-3 py-2 dark:bg-sky-500/10">
                  <div className="w-11 shrink-0 text-center"><div className="text-[1rem] font-extrabold leading-none">{format(parseISO(v.date!), 'd')}</div><div className="text-[0.625rem] font-semibold uppercase text-slate-500">{format(parseISO(v.date!), 'MMM')}</div></div>
                  <div className="min-w-0 flex-1"><div className="break-words text-[0.8438rem] font-semibold">{v.what}</div><div className="text-[0.6875rem] text-slate-500">{[format(parseISO(v.date!), 'EEE, d MMM yyyy'), v.time ? to12h(v.time) : '', v.when_text].filter(Boolean).join(' · ')}</div></div>
                  {canEdit && (done
                    ? <span className="shrink-0 text-[0.75rem] font-semibold text-brand-600 dark:text-brand-300">{t('Reminder set ✓')}</span>
                    : <Button size="sm" className="shrink-0" loading={adding === v.what + v.date} onClick={() => addVisit(v)}><BellPlus className="h-4 w-4" />{t('Remind')}</Button>)}
                </div>
              );
            })}
          </div>
        )}
      </Block>}
      {s.advice.length > 0 && <Block icon={<Utensils className="h-4 w-4 text-orange-500" />} title={t('Care & diet advice')}><Bullets items={s.advice} /></Block>}
      {s.warning_signs.length > 0 && <Block tone="red" icon={<ShieldAlert className="h-4 w-4" />} title={t('Go to hospital immediately if')}><Bullets items={s.warning_signs} /></Block>}

      <div className="flex flex-wrap gap-2">
        <Button variant="soft" size="sm" className="flex-1" onClick={() => shareText(summaryToText(s, patient?.full_name ?? '', t), true).catch(e => toast((e as Error).message, 'err'))}><Share2 className="h-4 w-4" />{t('Share summary')}</Button>
        <Button variant="ghost" size="sm" loading={busy} onClick={() => run(true)}><RefreshCw className="h-4 w-4" />{t('Update')}</Button>
      </div>
      {err && <p className="text-[0.8125rem] text-red-600">{err}</p>}
      <p className="text-[0.6875rem] text-slate-400">{t('AI summary')}{s.at ? ` · ${formatDistanceToNowStrict(new Date(s.at), { addSuffix: true })}` : ''}. {t('Always check the original report and follow your doctor.')}</p>
    </div>
  );
}
