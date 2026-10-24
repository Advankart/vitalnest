import { useState } from 'react';
import { Link } from 'react-router-dom';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { CalendarClock, Check, ChevronRight, FlaskConical, Plus, Stethoscope, Trash2 } from 'lucide-react';
import { useApp } from '../lib/store';
import { api } from '../lib/api';
import { dayKey, to12h } from '../lib/health';
import { t } from '../lib/i18n';
import type { Appointment } from '../lib/types';
import { Button, Empty, Field, PageHeader, Segmented, Sheet, ViewOnlyNote, cx } from '../components/ui';

/** "Today", "Tomorrow", "In 5 days", "3 days ago" */
export function whenLabel(date: string) {
  const n = differenceInCalendarDays(parseISO(date), new Date());
  if (n === 0) return t('Today');
  if (n === 1) return t('Tomorrow');
  if (n > 1) return t('In {n} days', { n });
  if (n === -1) return t('Yesterday');
  return t('{n} days ago', { n: -n });
}

export function AppointmentForm({ appt, onDone }: { appt: Partial<Appointment> | null; onDone: () => void }) {
  const { patient, refreshData, toast } = useApp();
  const [a, setA] = useState<Partial<Appointment>>(appt ?? { kind: 'visit', appt_date: dayKey(new Date(Date.now() + 7 * 864e5)) });
  const [busy, setBusy] = useState(false);
  const up = (k: keyof Appointment, v: unknown) => setA(s => ({ ...s, [k]: v === '' ? null : v }));

  async function save() {
    if (!a.title?.trim()) { toast(t('Enter what the visit is for'), 'err'); return; }
    if (!a.appt_date) { toast(t('Choose a date'), 'err'); return; }
    setBusy(true);
    try {
      const row = { ...a, title: a.title.trim(), patient_id: patient!.id, kind: a.kind ?? 'visit', done: a.done ?? false };
      if (a.id) { const { id, created_at, ...rest } = row as Appointment; await api().update<Appointment>('appointments', id, rest); }
      else await api().insert<Appointment>('appointments', { ...row, source: row.source ?? 'manual' });
      await refreshData(); toast(t('Saved · reminder set')); onDone();
    } catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); }
  }
  async function del() {
    if (!a.id || !confirm(t('Delete this visit?'))) return;
    try { await api().remove('appointments', a.id); await refreshData(); onDone(); } catch (e) { toast((e as Error).message, 'err'); }
  }

  return (
    <div className="space-y-4">
      <Segmented value={a.kind ?? 'visit'} onChange={v => up('kind', v)} options={[{ id: 'visit', label: t('Doctor visit') }, { id: 'test', label: t('Test / scan') }]} />
      <Field label={a.kind === 'test' ? 'Which test' : 'Visit for'}><input className="field" value={a.title ?? ''} onChange={e => up('title', e.target.value)} placeholder={a.kind === 'test' ? 'e.g. HbA1c, Echo, lipid profile' : 'e.g. Diabetes review, Cardiology follow-up'} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date"><input type="date" className="field" value={a.appt_date ?? ''} onChange={e => up('appt_date', e.target.value)} /></Field>
        <Field label="Time (optional)"><input type="time" className="field" value={a.appt_time ?? ''} onChange={e => up('appt_time', e.target.value)} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Doctor"><input className="field" value={a.doctor ?? ''} onChange={e => up('doctor', e.target.value)} placeholder="Dr. …" /></Field>
        <Field label="Hospital / clinic"><input className="field" value={a.hospital ?? ''} onChange={e => up('hospital', e.target.value)} /></Field>
      </div>
      <Field label="Notes"><input className="field" value={a.notes ?? ''} onChange={e => up('notes', e.target.value)} placeholder="e.g. go fasting, take old reports" /></Field>
      <p className="px-1 text-[0.75rem] text-slate-500">Reminders: the evening before at 7 PM and on the day (2 hours before, or 7 AM).</p>
      <Button block size="lg" loading={busy} onClick={save}>Save</Button>
      {a.id && <Button block variant="danger" onClick={del}><Trash2 className="h-4 w-4" />Delete</Button>}
    </div>
  );
}

function Row({ a, onOpen, onToggle }: { a: Appointment; onOpen: () => void; onToggle?: () => void }) {
  const d = parseISO(a.appt_date);
  const n = differenceInCalendarDays(d, new Date());
  const Icon = a.kind === 'test' ? FlaskConical : Stethoscope;
  return (
    <div className={cx('card flex items-center gap-3 p-3.5', a.done && 'opacity-60')}>
      <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <div className={cx('grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-center', n <= 1 && n >= 0 && !a.done ? 'bg-brand-600 text-white' : 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300')}>
          <div><div className="text-[1.0625rem] font-extrabold leading-none">{format(d, 'd')}</div><div className="text-[0.625rem] font-semibold uppercase">{format(d, 'MMM')}</div></div>
        </div>
        <div className="min-w-0 flex-1">
          <div className={cx('flex items-center gap-1.5 break-words font-semibold', a.done && 'line-through')}><Icon className="h-4 w-4 shrink-0 text-slate-400" />{a.title}</div>
          <div className="truncate text-xs text-slate-500">{[format(d, 'EEE'), a.appt_time ? to12h(a.appt_time) : '', a.doctor, a.hospital].filter(Boolean).join(' · ')}</div>
          {!a.done && <div className={cx('text-[0.6875rem] font-semibold', n < 0 ? 'text-amber-600' : 'text-brand-600 dark:text-brand-300')}>{whenLabel(a.appt_date)}</div>}
        </div>
      </button>
      {onToggle && (
        <button onClick={onToggle} aria-label={a.done ? 'Mark not done' : 'Mark done'} className={cx('grid h-10 w-10 shrink-0 place-items-center rounded-full ring-2', a.done ? 'bg-brand-600 text-white ring-brand-600' : 'text-slate-300 ring-slate-200 dark:ring-white/10')}><Check className="h-5 w-5" strokeWidth={3} /></button>
      )}
    </div>
  );
}

export default function Appointments() {
  const { patient, data, canEdit, refreshData, toast } = useApp();
  const [edit, setEdit] = useState<Partial<Appointment> | null | false>(false);
  if (!patient) return null;
  const today = dayKey(new Date());
  const upcoming = data.appointments.filter(a => !a.done && a.appt_date >= today).sort((x, y) => (x.appt_date + (x.appt_time ?? '')).localeCompare(y.appt_date + (y.appt_time ?? '')));
  const past = data.appointments.filter(a => a.done || a.appt_date < today).sort((x, y) => y.appt_date.localeCompare(x.appt_date));
  const toggle = async (a: Appointment) => { if (!canEdit) return; try { await api().update<Appointment>('appointments', a.id, { done: !a.done }); await refreshData(); } catch (e) { toast((e as Error).message, 'err'); } };

  return (
    <div className="rise">
      <PageHeader title="Doctor visits" subtitle={patient.full_name} right={canEdit ? <Button size="sm" onClick={() => setEdit(null)}><Plus className="h-4 w-4" />Add</Button> : undefined} />
      <ViewOnlyNote />
      <div className="mb-4 rounded-2xl bg-sky-50 px-4 py-3 text-[0.8125rem] text-sky-900 dark:bg-sky-500/10 dark:text-sky-200">
        {t('Follow-up dates are found automatically from reports (AI summary) and prescriptions — or add one yourself.')} <Link to="/reports" className="font-semibold underline">{t('Open reports')}</Link>
      </div>
      {!data.appointments.length ? (
        <Empty icon={<CalendarClock className="h-7 w-7" />} title="No visits planned" text="Add the next review date, or open a discharge summary / prescription in Reports to find it automatically." action={canEdit ? <Button onClick={() => setEdit(null)}><Plus className="h-4 w-4" />Add visit</Button> : undefined} />
      ) : (
        <>
          {upcoming.length > 0 && <h2 className="mb-2 px-1 text-[0.9375rem] font-bold">Coming up</h2>}
          <div className="space-y-2">{upcoming.map(a => <Row key={a.id} a={a} onOpen={() => canEdit && setEdit(a)} onToggle={canEdit ? () => toggle(a) : undefined} />)}</div>
          {past.length > 0 && <h2 className="mb-2 mt-6 px-1 text-[0.9375rem] font-bold text-slate-500">Past & done</h2>}
          <div className="space-y-2">{past.map(a => <Row key={a.id} a={a} onOpen={() => canEdit && setEdit(a)} onToggle={canEdit ? () => toggle(a) : undefined} />)}</div>
        </>
      )}
      <Sheet open={edit !== false} onClose={() => setEdit(false)} title={edit && (edit as Appointment).id ? 'Edit visit' : 'Add visit'}>
        {edit !== false && <AppointmentForm appt={edit} onDone={() => setEdit(false)} />}
      </Sheet>
    </div>
  );
}

/** Home screen: the next visit (or a gentle prompt to add one). */
export function NextVisitCard() {
  const { data, canEdit } = useApp();
  const today = dayKey(new Date());
  const next = data.appointments.filter(a => !a.done && a.appt_date >= today).sort((x, y) => (x.appt_date + (x.appt_time ?? '')).localeCompare(y.appt_date + (y.appt_time ?? '')))[0];
  if (!next && !canEdit) return null;
  if (!next) return null;
  const d = parseISO(next.appt_date);
  const n = differenceInCalendarDays(d, new Date());
  return (
    <Link to="/appointments" className={cx('mt-4 flex items-center gap-3 rounded-3xl p-4 ring-1', n <= 1 ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white ring-slate-900/5 dark:bg-night-2 dark:ring-white/5')}>
      <div className={cx('grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-center', n <= 1 ? 'bg-white/20' : 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300')}>
        <div><div className="text-[1.0625rem] font-extrabold leading-none">{format(d, 'd')}</div><div className="text-[0.625rem] font-semibold uppercase">{format(d, 'MMM')}</div></div>
      </div>
      <div className="min-w-0 flex-1">
        <div className={cx('text-[0.6875rem] font-semibold uppercase tracking-wide', n <= 1 ? 'text-white/80' : 'text-sky-700 dark:text-sky-300')}>{next.kind === 'test' ? t('Next test') : t('Next doctor visit')} · {whenLabel(next.appt_date)}</div>
        <div className="break-words font-semibold">{next.title}</div>
        <div className={cx('truncate text-xs', n <= 1 ? 'text-white/80' : 'text-slate-500')}>{[format(d, 'EEE'), next.appt_time ? to12h(next.appt_time) : '', next.doctor, next.hospital].filter(Boolean).join(' · ')}</div>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 opacity-60" />
    </Link>
  );
}
