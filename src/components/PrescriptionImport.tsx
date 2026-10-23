import { useState } from 'react';
import { addDays } from 'date-fns';
import { AlertTriangle, Check, Moon, Sun, Sunrise, Trash2 } from 'lucide-react';
import { useApp } from '../lib/store';
import { api } from '../lib/api';
import { dayKey, FOOD_REL, MED_FORMS } from '../lib/health';
import type { Medicine } from '../lib/types';
import type { RxMed, RxScan } from '../lib/scan';
import { ScanButton } from './ScanButton';
import { Button, Field, cx } from './ui';

type Slot = 'morning' | 'afternoon' | 'night';
export const SLOT_TIME: Record<Slot, string> = { morning: '08:00', afternoon: '14:00', night: '21:00' };
const SLOTS: { id: Slot; label: string; icon: typeof Sun }[] = [
  { id: 'morning', label: 'Morning', icon: Sunrise }, { id: 'afternoon', label: 'Afternoon', icon: Sun }, { id: 'night', label: 'Night', icon: Moon },
];
interface Row extends RxMed { keep: boolean }

/** Read a prescription photo and add all its medicines in one go. */
export function PrescriptionImport({ onDone }: { onDone: () => void }) {
  const { patient, refreshData, toast } = useApp();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [rx, setRx] = useState<{ doctor?: string | null; date?: string | null }>({});
  const [files, setFiles] = useState<File[]>([]);
  const [saveRx, setSaveRx] = useState(true);
  const [busy, setBusy] = useState(false);
  const up = (i: number, patch: Partial<Row>) => setRows(r => r!.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  async function save() {
    const pick = (rows ?? []).filter(r => r.keep && r.name.trim());
    if (!pick.length) { toast('Select at least one medicine', 'err'); return; }
    const noTime = pick.find(r => !r.slots.length);
    if (noTime) { toast(`Choose a time for ${noTime.name} (or untick it)`, 'err'); return; }
    setBusy(true);
    try {
      const today = new Date();
      const note = [rx.doctor && `Prescribed by ${rx.doctor}`, rx.date && `on ${rx.date}`].filter(Boolean).join(' ');
      for (const r of pick) {
        await api().insert<Medicine>('medicines', {
          patient_id: patient!.id, name: r.name.trim(), strength: r.strength || null, form: MED_FORMS.includes(r.form) ? r.form : 'tablet',
          dose: r.dose || null, food_relation: r.food_relation in FOOD_REL ? r.food_relation : 'after_food',
          times: r.slots.map(s => SLOT_TIME[s]).sort(), days: [0, 1, 2, 3, 4, 5, 6], active: true,
          start_date: dayKey(today), end_date: r.duration_days ? dayKey(addDays(today, r.duration_days - 1)) : null,
          notes: [r.notes, note].filter(Boolean).join(' · ') || null,
        });
      }
      if (saveRx && files.length) {
        for (const [i, f] of files.entries()) {
          await api().uploadReport(patient!.id, f, { title: `Prescription${rx.doctor ? ' – ' + rx.doctor : ''}${files.length > 1 ? ` (page ${i + 1})` : ''}`, category: 'prescription', report_date: dayKey(today) }).catch(() => { });
        }
      }
      await refreshData();
      toast(`${pick.length} medicine${pick.length > 1 ? 's' : ''} added · reminders set`);
      onDone();
    } catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <ScanButton<RxScan> kind="prescription" onFiles={setFiles} onResult={r => {
        setRx({ doctor: r.doctor, date: r.date });
        setRows(r.medicines.map(m => ({ ...m, slots: m.slots ?? [], keep: !m.as_needed })));
      }} />

      {!rows && <p className="px-1 text-[0.8125rem] text-slate-500">VitalNest reads every medicine, its strength and timing (like 1-0-1 or BD) so you can add them all at once. You can check and change everything before saving.</p>}

      {rows && (
        <>
          <div className="flex items-baseline justify-between px-1">
            <div className="font-bold">{rows.length} medicine{rows.length === 1 ? '' : 's'} found</div>
            {rx.doctor && <div className="truncate pl-2 text-xs text-slate-500">{rx.doctor}{rx.date ? ` · ${rx.date}` : ''}</div>}
          </div>
          <div className="space-y-3">
            {rows.map((r, i) => (
              <div key={i} className={cx('rounded-2xl p-3 ring-1 transition', r.keep ? 'bg-white ring-brand-200 dark:bg-night-3 dark:ring-brand-500/30' : 'bg-slate-50 opacity-60 ring-slate-200 dark:bg-white/[.02] dark:ring-white/5')}>
                <div className="flex items-start gap-2">
                  <button type="button" onClick={() => up(i, { keep: !r.keep })} aria-label={r.keep ? 'Untick' : 'Tick'}
                    className={cx('mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-md ring-2', r.keep ? 'bg-brand-600 text-white ring-brand-600' : 'text-transparent ring-slate-300')}><Check className="h-4 w-4" strokeWidth={3} /></button>
                  <div className="min-w-0 flex-1 space-y-2">
                    <input className="field py-2 font-semibold" value={r.name} onChange={e => up(i, { name: e.target.value })} />
                    <div className="grid grid-cols-2 gap-2">
                      <input className="field py-2 text-sm" value={r.strength ?? ''} placeholder="Strength" onChange={e => up(i, { strength: e.target.value })} />
                      <input className="field py-2 text-sm" value={r.dose ?? ''} placeholder="Dose (1 tablet)" onChange={e => up(i, { dose: e.target.value })} />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {SLOTS.map(({ id, label, icon: Icon }) => {
                        const on = r.slots.includes(id);
                        return (
                          <button key={id} type="button" onClick={() => up(i, { slots: on ? r.slots.filter(s => s !== id) : [...r.slots, id] })}
                            className={cx('chip py-1.5 text-[0.75rem]', on ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500 dark:bg-white/5')}><Icon className="h-3.5 w-3.5" />{label}</button>
                        );
                      })}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <select className="field py-2 text-sm" value={r.food_relation} onChange={e => up(i, { food_relation: e.target.value })}>{Object.entries(FOOD_REL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                      <div className="relative"><input type="number" inputMode="numeric" className="field py-2 pr-12 text-sm" value={r.duration_days ?? ''} placeholder="Days" onChange={e => up(i, { duration_days: e.target.value ? Number(e.target.value) : null })} /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">days</span></div>
                    </div>
                    {(r.notes || r.as_needed) && <div className="text-[0.75rem] text-slate-500">{r.as_needed ? 'Only when needed (SOS). ' : ''}{r.notes}</div>}
                    {r.confidence === 'low' && <div className="flex items-center gap-1 text-[0.75rem] font-semibold text-amber-600"><AlertTriangle className="h-3.5 w-3.5" />Hard to read — please check the name</div>}
                  </div>
                  <button type="button" onClick={() => setRows(rs => rs!.filter((_, j) => j !== i))} aria-label="Remove" className="mt-1 text-slate-300"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            ))}
          </div>
          <Field><label className="flex items-center gap-3 text-sm"><input type="checkbox" className="h-5 w-5 accent-brand-600" checked={saveRx} onChange={e => setSaveRx(e.target.checked)} />Also save the prescription photo in Reports</label></Field>
          <p className="px-1 text-[0.75rem] text-slate-500">Times: Morning 8 AM · Afternoon 2 PM · Night 9 PM — change any medicine later from Medicines.</p>
          <Button block size="lg" loading={busy} onClick={save}>Add {rows.filter(r => r.keep).length} medicine{rows.filter(r => r.keep).length === 1 ? '' : 's'}</Button>
        </>
      )}
    </div>
  );
}
