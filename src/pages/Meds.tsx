import { useEffect, useRef, useState } from 'react';
import { t as tr, tDose } from '../lib/i18n';
import { addDays, format, isToday } from 'date-fns';
import { AlarmClock, Camera, Check, ChevronLeft, ChevronRight, FileText, Pencil, Pill, Plus, Share2, Trash2, X } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../lib/store';
import { api } from '../lib/api';
import { toggleDose } from '../lib/actions';
import { DAY_SHORT, FOOD_REL, MED_FORMS, dayKey, doseFor, hhmm, medsForDate, timesWithDose, to12h } from '../lib/health';
import type { Medicine } from '../lib/types';
import { ScanButton } from '../components/ScanButton';
import { toJpegBlob, type MedScan } from '../lib/scan';
import { MedThumb, PhotoViewer } from '../components/MedPhoto';
import { PrescriptionImport } from '../components/PrescriptionImport';
import { Button, Empty, Field, Section, Segmented, Sheet, ViewOnlyNote, cx } from '../components/ui';

const PRESET_TIMES = [['Morning', '08:00'], ['Afternoon', '14:00'], ['Evening', '18:00'], ['Night', '21:00']];

function MedForm({ med, onClose }: { med: Partial<Medicine> | null; onClose: () => void }) {
  const { patient, refreshData, toast } = useApp();
  const [m, setM] = useState<Partial<Medicine>>(med ?? {});
  const [newTime, setNewTime] = useState('08:00');
  const [busy, setBusy] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);          // new photo waiting to be saved
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [viewer, setViewer] = useState(false);
  const photoIn = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!photo) { setPhotoUrl(null); return; } const u = URL.createObjectURL(photo); setPhotoUrl(u); return () => URL.revokeObjectURL(u); }, [photo]);
  const up = (k: keyof Medicine, v: unknown) => setM(s => ({ ...s, [k]: v }));
  const times = m.times ?? [], days = m.days ?? [0, 1, 2, 3, 4, 5, 6];

  async function save() {
    if (!m.name?.trim()) { toast('Enter the medicine name', 'err'); return; }
    if (!times.length) { toast('Add at least one time', 'err'); return; }
    setBusy(true);
    try {
      let photo_path = m.photo_path ?? null;
      if (photo) {
        const newPath = await api().uploadMedPhoto(patient!.id, await toJpegBlob(photo));
        photo_path = newPath;
      }
      const dbt = Object.fromEntries(Object.entries(m.dose_by_time ?? {}).filter(([k, v]) => times.includes(k) && v.trim() && v.trim() !== (m.dose ?? '').trim()).map(([k, v]) => [k, v.trim()]));
      const row = { ...m, photo_path, dose_by_time: Object.keys(dbt).length ? dbt : null, name: m.name.trim(), times: [...times].sort(), days, patient_id: patient!.id, active: m.active ?? true, form: m.form ?? 'tablet', stock: m.stock === undefined || (m.stock as unknown) === '' ? null : Number(m.stock) };
      if (med?.photo_path && med.photo_path !== photo_path) api().removePhoto(med.photo_path).catch(() => { });
      if (m.id) { const { id, ...rest } = row; await api().update<Medicine>('medicines', id!, rest); }
      else await api().insert<Medicine>('medicines', row);
      await refreshData(); toast('Medicine saved · reminders updated'); onClose();
    } catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); }
  }
  async function del() {
    if (!m.id || !confirm(tr('Delete {name}?', { name: m.name }))) return;
    try { await api().remove('medicines', m.id); await refreshData(); onClose(); } catch (e) { toast((e as Error).message, 'err'); }
  }

  return (
    <div className="space-y-4">
      {!m.id && (
        <ScanButton<MedScan> kind="medicine" onFiles={f => !photo && f[0] && setPhoto(f[0])} onResult={r => setM(s => ({
          ...s,
          name: r.name ?? s.name, strength: r.strength ?? s.strength,
          form: r.form && MED_FORMS.includes(r.form) ? r.form : s.form,
          composition: r.composition ?? s.composition, manufacturer: r.manufacturer ?? s.manufacturer,
          purpose: r.purpose ?? s.purpose,
        }))} />
      )}
      <Field label="Tablet photo" hint="Helps the family recognise the right tablet">
        <input ref={photoIn} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) setPhoto(f); e.target.value = ''; }} />
        <div className="flex items-center gap-3">
          {photoUrl ? (
            <button type="button" onClick={() => setViewer(true)} className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl ring-1 ring-slate-900/10"><img src={photoUrl} alt="" className="h-full w-full object-cover" /></button>
          ) : m.photo_path ? <MedThumb path={m.photo_path} form={m.form} name={m.name} className="!h-16 !w-16" /> : (
            <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl border-2 border-dashed border-slate-200 text-slate-300 dark:border-white/10"><Camera className="h-6 w-6" /></div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="soft" onClick={() => photoIn.current?.click()}><Camera className="h-4 w-4" />{photoUrl || m.photo_path ? 'Change' : 'Take photo'}</Button>
            {(photoUrl || m.photo_path) && <Button type="button" size="sm" variant="ghost" onClick={() => { setPhoto(null); up('photo_path', null); }}>Remove</Button>}
          </div>
        </div>
        {viewer && photoUrl && <PhotoViewer src={photoUrl} title={m.name} onClose={() => setViewer(false)} />}
      </Field>
      <Field label="Medicine name"><input className="field" value={m.name ?? ''} onChange={e => up('name', e.target.value)} placeholder="e.g. Metformin" /></Field>
      <Field label="Composition (active ingredients)"><input className="field" value={m.composition ?? ''} onChange={e => up('composition', e.target.value)} placeholder="e.g. Metformin Hydrochloride 500 mg" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Strength"><input className="field" value={m.strength ?? ''} onChange={e => up('strength', e.target.value)} placeholder="500 mg / 100 U/mL" /></Field>
        <Field label="Usual dose"><input className="field" value={m.dose ?? ''} onChange={e => up('dose', e.target.value)} placeholder="1 tablet / 8 units" /></Field>
        <Field label="Type"><select className="field capitalize" value={m.form ?? 'tablet'} onChange={e => up('form', e.target.value)}>{MED_FORMS.map(f => <option key={f} value={f}>{f}</option>)}</select></Field>
        <Field label="Take"><select className="field" value={m.food_relation ?? 'after_food'} onChange={e => up('food_relation', e.target.value)}>{Object.entries(FOOD_REL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
      </div>
      <Field label="Times">
        {times.length > 0 && (
          <div className="space-y-2">
            {[...times].sort().map(t => (
              <div key={t} className="flex items-center gap-2 rounded-2xl bg-brand-50 p-1.5 pl-3 dark:bg-brand-500/10">
                <span className="w-[4.75rem] shrink-0 text-[0.875rem] font-bold text-brand-800 dark:text-brand-200">{to12h(t)}</span>
                <input className="field min-w-0 flex-1 py-2 text-sm" value={m.dose_by_time?.[t] ?? ''} placeholder={m.dose || '1 tablet'}
                  aria-label={tr('Dose at {time}', { time: to12h(t) })}
                  onChange={e => setM(s => ({ ...s, dose_by_time: { ...(s.dose_by_time ?? {}), [t]: e.target.value } }))} />
                <button type="button" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-slate-400" onClick={() => setM(s => { const d = { ...(s.dose_by_time ?? {}) }; delete d[t]; return { ...s, times: times.filter(x => x !== t), dose_by_time: d }; })} aria-label="Remove time"><X className="h-4 w-4" /></button>
              </div>
            ))}
            <p className="px-1 text-[0.75rem] text-slate-500">Different amount at a time? Type it next to that time (e.g. 2 tablets at night). Leave empty to use the usual dose.</p>
          </div>
        )}
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
      <Field label="Manufacturer"><input className="field" value={m.manufacturer ?? ''} onChange={e => up('manufacturer', e.target.value)} placeholder="Company name (optional)" /></Field>
      <Field label="Notes"><input className="field" value={m.notes ?? ''} onChange={e => up('notes', e.target.value)} placeholder="Prescribed by…, special instructions" /></Field>
      {m.id && <label className="flex items-center gap-3 text-sm"><input type="checkbox" className="h-5 w-5 accent-brand-600" checked={m.active ?? true} onChange={e => up('active', e.target.checked)} />Currently taking (uncheck to pause reminders)</label>}
      <Button block size="lg" loading={busy} onClick={save}>Save medicine</Button>
      {m.id && <Button block variant="danger" onClick={del}><Trash2 className="h-4 w-4" />Delete</Button>}
    </div>
  );
}

export default function Meds() {
  const { patient, data, canEdit, refreshData, toast } = useApp();
  const nav = useNavigate();
  const [tab, setTab] = useState<'schedule' | 'all'>('schedule');
  const [day, setDay] = useState(new Date());
  const [edit, setEdit] = useState<Partial<Medicine> | null | false>(false);
  const [params, setParams] = useSearchParams();
  const rxOpen = params.get('rx') === '1';
  const setRx = (on: boolean) => setParams(p => { const n = new URLSearchParams(p); if (on) n.set('rx', '1'); else n.delete('rx'); return n; }, { replace: !on });
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
      <div className="mb-4 pt-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0"><h1 className="text-[1.5rem] font-extrabold leading-tight">Medicines</h1><p className="truncate text-[0.8125rem] text-slate-500">{patient.full_name}</p></div>
          {data.meds.length > 0 && <Button size="sm" variant="soft" className="shrink-0" onClick={() => nav('/export?only=meds')} aria-label="Share medicines"><Share2 className="h-4 w-4" /></Button>}
        </div>
        {canEdit && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button size="sm" variant="soft" className="min-w-0" onClick={() => setRx(true)}><FileText className="h-4 w-4 shrink-0" /><span className="truncate">Prescription</span></Button>
            <Button size="sm" className="min-w-0" onClick={() => setEdit(null)}><Plus className="h-4 w-4 shrink-0" /><span className="truncate">Add medicine</span></Button>
          </div>
        )}
      </div>
      <ViewOnlyNote />
      <Segmented value={tab} onChange={setTab} options={[{ id: 'schedule', label: 'Schedule' }, { id: 'all', label: tr('All medicines ({n})', { n: data.meds.length }) }]} />

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
          {!slots.length && <div className="mt-4"><Empty icon={<Pill className="h-7 w-7" />} title="No medicines scheduled" text="Add medicines with their times — you'll get a reminder on your phone at each time." action={canEdit ? <div className="flex flex-wrap justify-center gap-2"><Button onClick={() => setRx(true)}><FileText className="h-4 w-4" />From prescription</Button><Button variant="soft" onClick={() => setEdit(null)}><Plus className="h-4 w-4" />Add one</Button></div> : undefined} /></div>}
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
                          <MedThumb path={med.photo_path} form={med.form} name={med.name} />
                          <div className="min-w-0 flex-1">
                            <div className={cx('break-words font-semibold', done && 'text-slate-400 line-through')}>{med.name} <span className="text-[0.8125rem] font-normal text-slate-400">{med.strength}</span></div>
                            <div className="text-xs text-slate-500">{[tDose(doseFor(med, t)), tr(FOOD_REL[med.food_relation ?? ''] ?? '')].filter(Boolean).join(' · ')}</div>
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
              <div key={m.id} role="button" tabIndex={0} onClick={() => canEdit && setEdit(m)} className={cx('card flex w-full cursor-pointer items-center gap-3 p-4 text-left', !m.active && 'opacity-50')}>
                <MedThumb path={m.photo_path} form={m.form} name={m.name} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{m.name} <span className="text-[0.8125rem] font-normal text-slate-400">{m.strength}</span></div>
                  {m.composition && <div className="truncate text-[0.75rem] text-slate-400">{m.composition}</div>}
                  <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><AlarmClock className="h-3 w-3" />{timesWithDose(m, tDose)}</span>
                    {m.days.length < 7 && <span>{m.days.map(d => DAY_SHORT[d]).join(' ')}</span>}
                    {m.purpose && <span>· {m.purpose}</span>}
                    {m.stock != null && <span className={m.stock <= 5 ? 'font-semibold text-amber-600' : ''}>· {m.stock} left</span>}
                  </div>
                </div>
                {canEdit && <Pencil className="h-4 w-4 text-slate-300" />}
              </div>
            ))}
          </div>
        </Section>
      )}

      <Sheet open={rxOpen} onClose={() => setRx(false)} title="Add from prescription">
        {rxOpen && <PrescriptionImport onDone={() => { setRx(false); setTab('all'); }} />}
      </Sheet>
      <Sheet open={edit !== false} onClose={() => setEdit(false)} title={edit && (edit as Medicine).id ? 'Edit medicine' : 'Add medicine'}>
        {edit !== false && <MedForm med={edit} onClose={() => setEdit(false)} />}
      </Sheet>
    </div>
  );
}
