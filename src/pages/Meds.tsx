import { useState } from 'react';
import { addDays, format, isToday } from 'date-fns';
import { AlarmClock, Check, ChevronLeft, ChevronRight, Pencil, Pill, Plus, Syringe, Trash2, X } from 'lucide-react';
import { useApp } from '../lib/store';
import { api } from '../lib/api';
import { toggleDose } from '../lib/actions';
import { DAY_SHORT, FOOD_REL, MED_FORMS, dayKey, hhmm, medsForDate, to12h } from '../lib/health';
import type { Medicine } from '../lib/types';
import { Button, Empty, Field, Section, Segmented, Sheet, ViewOnlyNote, cx } from '../components/ui';

const PRESET_TIMES = [['Morning', '08:00'], ['Afternoon', '14:00'], ['Evening', '18:00'], ['Night', '21:00']];

function MedForm({ med, onClose }: { med: Partial<Medicine> | null; onClose: () => void }) {
  const { patient, refreshData, toast } = useApp();
  const [m, setM] = useState<Partial<Medicine>>(med ?? {});
  const [newTime, setNewTime] = useState('08:00');
  const [busy, setBusy] = useState(false);
  const up = (k: keyof Medicine, v: unknown) => setM(s => ({ ...s, [k]: v }));
  const times = m.times ?? [], days = m.days ?? [0, 1, 2, 3, 4, 5, 6];

  async function save() {
    if (!m.name?.trim()) { toast('Enter the medicine name', 'err'); return; }
    if (!times.length) { toast('Add at least one time', 'err'); return; }
    setBusy(true);
    try {
      const row = { ...m, name: m.name.trim(), times: [...times].sort(), days, patient_id: patient!.id, active: m.active ?? true, form: m.form ?? 'tablet', stock: m.stock === undefined || (m.stock as unknown) === '' ? null : Number(m.stock) };
      if (m.id) { const { id, ...rest } = row; await api().update<Medicine>('medicines', id!, rest); }
      else await api().insert<Medicine>('medicines', row);
      await refreshData(); toast('Medicine saved · reminders updated'); onClose();
    } catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); }
  }
  async function del() {
    if (!m.id || !confirm(`Delete ${m.name}?`)) return;
    try { await api().remove('medicines', m.id); await refreshData(); onClose(); } catch (e) { toast((e as Error).message, 'err'); }
  }

  return (
    <div className="space-y-4">
      <Field label="Medicine name"><input className="field" value={m.name ?? ''} onChange={e => up('name', e.target.value)} placeholder="e.g. Metformin" autoFocus /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Strength"><input className="field" value={m.strength ?? ''} onChange={e => up('strength', e.target.value)} placeholder="500 mg / 100 U/mL" /></Field>
        <Field label="Dose"><input className="field" value={m.dose ?? ''} onChange={e => up('dose', e.target.value)} placeholder="1 tablet / 8 units" /></Field>
        <Field label="Type"><select className="field capitalize" value={m.form ?? 'tablet'} onChange={e => up('form', e.target.value)}>{MED_FORMS.map(f => <option key={f} value={f}>{f}</option>)}</select></Field>
        <Field label="Take"><select className="field" value={m.food_relation ?? 'after_food'} onChange={e => up('food_relation', e.target.value)}>{Object.entries(FOOD_REL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
      </div>
      <Field label="Times">
        <div className="flex flex-wrap gap-2">
          {times.sort().map(t => (
            <span key={t} className="chip bg-brand-600 py-2 pl-3 pr-2 text-[0.8125rem] text-white">{to12h(t)}<button onClick={() => up('times', times.filter(x => x !== t))} aria-label="Remove time"><X className="h-3.5 w-3.5" /></button></span>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <input type="time" className="field flex-1" value={newTime} onChange={e => setNewTime(e.target.value)} />
          <Button variant="soft" type="button" onClick={() => newTime && !times.includes(newTime) && up('times', [...times, newTime])}><Plus className="h-4 w-4" />Add</Button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {PRESET_TIMES.map(([l, t]) => <button key={t} type="button" onClick={() => !times.includes(t) && up('times', [...times, t])} className="chip bg-slate-100 py-1.5 text-slate-600 dark:bg-white/5 dark:text-slate-300">+ {l} {to12h(t)}</button>)}
        </div>
      </Field>
      <Field label="Days">
        <div className="flex gap-1.5">
          {DAY_SHORT.map((d, i) => (
            <button key={i} type="button" onClick={() => up('days', days.includes(i) ? days.filter(x => x !== i) : [...days, i].sort())}
              className={cx('h-10 flex-1 rounded-xl text-sm font-bold transition', days.includes(i) ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-400 dark:bg-white/5')}>{d}</button>
          ))}
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start date"><input type="date" className="field" value={m.start_date ?? ''} onChange={e => up('start_date', e.target.value || null)} /></Field>
        <Field label="End date (optional)"><input type="date" className="field" value={m.end_date ?? ''} onChange={e => up('end_date', e.target.value || null)} /></Field>
        <Field label="Stock left" hint="Counts down when marked taken"><input type="number" inputMode="numeric" className="field" value={m.stock ?? ''} onChange={e => up('stock', e.target.value === '' ? null : Number(e.target.value))} /></Field>
        <Field label="For"><input className="field" value={m.purpose ?? ''} onChange={e => up('purpose', e.target.value)} placeholder="Diabetes, BP…" /></Field>
      </div>
      <Field label="Notes"><input className="field" value={m.notes ?? ''} onChange={e => up('notes', e.target.value)} placeholder="Prescribed by…, special instructions" /></Field>
      {m.id && <label className="flex items-center gap-3 text-sm"><input type="checkbox" className="h-5 w-5 accent-brand-600" checked={m.active ?? true} onChange={e => up('active', e.target.checked)} />Currently taking (uncheck to pause reminders)</label>}
      <Button block size="lg" loading={busy} onClick={save}>Save medicine</Button>
      {m.id && <Button block variant="danger" onClick={del}><Trash2 className="h-4 w-4" />Delete</Button>}
    </div>
  );
}

export default function Meds() {
  const { patient, data, canEdit, refreshData, toast } = useApp();
  const [tab, setTab] = useState<'schedule' | 'all'>('schedule');
  const [day, setDay] = useState(new Date());
  const [edit, setEdit] = useState<Partial<Medicine> | null | false>(false);
  if (!patient) return null;

  const dk = dayKey(day);
  const slots = medsForDate(data.meds, day);
  const groups = slots.reduce<Record<string, typeof slots>>((a, s) => { (a[s.time] ??= []).push(s); return a; }, {});
  const logFor = (mid: string, t: string) => data.medLogs.find(l => l.medicine_id === mid && l.scheduled_date === dk && l.scheduled_time === t);
  const nowT = hhmm(new Date());
  const lowStock = data.meds.filter(m => m.active && m.stock != null && m.stock <= Math.max(5, m.times.length * 5));

  async function toggle(med: Medicine, t: string) {
    if (!canEdit) { toast('View-only access', 'err'); return; }
    try { await toggleDose(med, dk, t, logFor(med.id, t)?.status === 'taken'); await refreshData(); } catch (e) { toast((e as Error).message, 'err'); }
  }

  return (
    <div className="rise">
      <div className="mb-4 flex items-center justify-between pt-1">
        <div><h1 className="text-[1.5rem] font-extrabold">Medicines</h1><p className="text-[0.8125rem] text-slate-500">{patient.full_name}</p></div>
        {canEdit && <Button size="sm" onClick={() => setEdit(null)}><Plus className="h-4 w-4" />Add</Button>}
      </div>
      <ViewOnlyNote />
      <Segmented value={tab} onChange={setTab} options={[{ id: 'schedule', label: 'Schedule' }, { id: 'all', label: `All medicines (${data.meds.length})` }]} />

      {lowStock.length > 0 && (
        <div className="mt-4 rounded-3xl bg-amber-50 p-4 text-[0.8125rem] text-amber-900 ring-1 ring-amber-100 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/20">
          <b>Refill soon:</b> {lowStock.map(m => `${m.name} (${m.stock} left)`).join(', ')}
        </div>
      )}

      {tab === 'schedule' ? (
        <>
          <div className="mt-4 flex items-center justify-between">
            <button onClick={() => setDay(addDays(day, -1))} className="grid h-10 w-10 place-items-center rounded-full bg-white shadow-sm dark:bg-night-2" aria-label="Previous day"><ChevronLeft className="h-5 w-5" /></button>
            <div className="text-center"><div className="font-bold">{isToday(day) ? 'Today' : format(day, 'EEEE')}</div><div className="text-xs text-slate-400">{format(day, 'd MMMM yyyy')}</div></div>
            <button onClick={() => setDay(addDays(day, 1))} className="grid h-10 w-10 place-items-center rounded-full bg-white shadow-sm dark:bg-night-2" aria-label="Next day"><ChevronRight className="h-5 w-5" /></button>
          </div>
          {!slots.length && <div className="mt-4"><Empty icon={<Pill className="h-7 w-7" />} title="No medicines scheduled" text="Add medicines with their times — you'll get a reminder on your phone at each time." action={canEdit ? <Button onClick={() => setEdit(null)}><Plus className="h-4 w-4" />Add medicine</Button> : undefined} /></div>}
          <div className="relative mt-4 space-y-4">
            {Object.entries(groups).map(([t, items]) => {
              const past = isToday(day) && t < nowT;
              return (
                <div key={t}>
                  <div className={cx('mb-2 px-1 text-[0.875rem] font-bold', past ? 'text-slate-400' : 'text-ink dark:text-white')}>{to12h(t)}</div>
                  <div className="space-y-2">
                    {items.map(({ med }) => {
                      const done = logFor(med.id, t)?.status === 'taken';
                      const missed = !done && past;
                      return (
                        <div key={med.id} className={cx('card flex items-center gap-3 p-3.5', missed && 'ring-amber-200 dark:ring-amber-500/30')}>
                          <div className={cx('lg-hide grid h-11 w-11 shrink-0 place-items-center rounded-2xl', med.form === 'insulin' || med.form === 'injection' ? 'bg-rose-50 text-rose-600 dark:bg-rose-500/10' : 'bg-purple-50 text-purple-600 dark:bg-purple-500/10')}>
                            {med.form === 'insulin' || med.form === 'injection' ? <Syringe className="h-5 w-5" /> : <Pill className="h-5 w-5" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className={cx('break-words font-semibold', done && 'text-slate-400 line-through')}>{med.name} <span className="text-[0.8125rem] font-normal text-slate-400">{med.strength}</span></div>
                            <div className="text-xs text-slate-500">{[med.dose, FOOD_REL[med.food_relation ?? '']].filter(Boolean).join(' · ')}</div>
                            {missed && <div className="text-[0.6875rem] font-semibold text-amber-600">Not marked yet</div>}
                          </div>
                          <button onClick={() => toggle(med, t)} aria-label="Mark taken" className={cx('grid h-11 w-11 shrink-0 place-items-center rounded-full ring-2 transition active:scale-90', done ? 'bg-brand-600 text-white ring-brand-600' : 'text-slate-300 ring-slate-200 dark:ring-white/10')}>
                            <Check className="h-5 w-5" strokeWidth={3} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <Section title="" className="mt-4">
          {!data.meds.length && <Empty icon={<Pill className="h-7 w-7" />} title="No medicines yet" />}
          <div className="space-y-2">
            {data.meds.map(m => (
              <button key={m.id} onClick={() => canEdit && setEdit(m)} className={cx('card flex w-full items-center gap-3 p-4 text-left', !m.active && 'opacity-50')}>
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-purple-50 text-purple-600 dark:bg-purple-500/10">{m.form === 'insulin' ? <Syringe className="h-5 w-5" /> : <Pill className="h-5 w-5" />}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{m.name} <span className="text-[0.8125rem] font-normal text-slate-400">{m.strength}</span></div>
                  <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><AlarmClock className="h-3 w-3" />{m.times.map(to12h).join(', ')}</span>
                    {m.days.length < 7 && <span>{m.days.map(d => DAY_SHORT[d]).join(' ')}</span>}
                    {m.purpose && <span>· {m.purpose}</span>}
                    {m.stock != null && <span className={m.stock <= 5 ? 'font-semibold text-amber-600' : ''}>· {m.stock} left</span>}
                  </div>
                </div>
                {canEdit && <Pencil className="h-4 w-4 text-slate-300" />}
              </button>
            ))}
          </div>
        </Section>
      )}

      <Sheet open={edit !== false} onClose={() => setEdit(false)} title={edit && (edit as Medicine).id ? 'Edit medicine' : 'Add medicine'}>
        {edit !== false && <MedForm med={edit} onClose={() => setEdit(false)} />}
      </Sheet>
    </div>
  );
}
