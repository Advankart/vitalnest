import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { CalendarClock, Minus, Plus, Trash2 } from 'lucide-react';
import { useApp } from '../lib/store';
import { api } from '../lib/api';
import { advice, classify, ctxLabel, fmtVital, GLUCOSE_CONTEXTS, STATUS_STYLE, VITALS } from '../lib/health';
import type { Vital, VitalKind } from '../lib/types';
import { Button, ChipSelect, Field, PageHeader, StatusPill, ViewOnlyNote, cx } from '../components/ui';
import { VitalIcon } from '../components/Layout';

function guessContext() {
  const h = new Date().getHours();
  if (h >= 4 && h < 10) return 'fasting';
  if (h >= 22 || h < 2) return 'bedtime';
  if (h >= 2 && h < 4) return 'night';
  return 'after_meal';
}
const toLocalInput = (d: Date) => format(d, "yyyy-MM-dd'T'HH:mm");

function BigNumber({ value, onChange, step, min, max, unit, label, autoFocus }: { value: string; onChange: (v: string) => void; step: number; min: number; max: number; unit?: string; label?: string; autoFocus?: boolean }) {
  const bump = (d: number) => {
    const n = (Number(value) || (min + max) / 4) + d;
    onChange(String(Math.max(min, Math.min(max, Math.round(n * 10) / 10))));
  };
  return (
    <div className="flex-1">
      {label && <div className="mb-1 text-center text-[12px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>}
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => bump(-step)} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600 active:scale-90 dark:bg-white/5 dark:text-slate-300" aria-label="Decrease"><Minus className="h-5 w-5" /></button>
        <input value={value} onChange={e => onChange(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" autoFocus={autoFocus}
          className="w-full min-w-0 bg-transparent text-center font-display text-[46px] font-extrabold leading-none outline-none placeholder:text-slate-200 dark:placeholder:text-slate-700" placeholder="0" />
        <button type="button" onClick={() => bump(step)} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600 active:scale-90 dark:bg-white/5 dark:text-slate-300" aria-label="Increase"><Plus className="h-5 w-5" /></button>
      </div>
      {unit && <div className="mt-1 text-center text-[13px] font-medium text-slate-400">{unit}</div>}
    </div>
  );
}

export default function AddVital() {
  const { kind = 'glucose' } = useParams();
  const k = (kind in VITALS ? kind : 'glucose') as VitalKind;
  const meta = VITALS[k];
  const nav = useNavigate();
  const { patient, data, canEdit, refreshData, toast } = useApp();
  const [v1, setV1] = useState('');
  const [v2, setV2] = useState('');
  const [v3, setV3] = useState('');
  const [ctx, setCtx] = useState(guessContext());
  const [notes, setNotes] = useState('');
  const [customTime, setCustomTime] = useState(false);
  const [when, setWhen] = useState(toLocalInput(new Date()));
  const [busy, setBusy] = useState(false);

  const recent = useMemo(() => data.vitals.filter(v => v.kind === k).slice(0, 6), [data.vitals, k]);
  if (!patient) return null;

  const preview: Pick<Vital, 'kind' | 'value1' | 'value2' | 'context'> | null = v1 && (k !== 'bp' || v2) ? { kind: k, value1: Number(v1), value2: v2 ? Number(v2) : null, context: k === 'glucose' ? ctx : null } : null;
  const st = preview ? classify(preview, patient) : null;
  const adv = preview ? advice(preview, patient) : null;

  async function save() {
    const a = Number(v1), b = Number(v2);
    if (!a || a < meta.min || a > meta.max) { toast(`Enter a value between ${meta.min} and ${meta.max}`, 'err'); return; }
    if (k === 'bp' && (!b || b < 30 || b > 160 || b >= a)) { toast('Check the diastolic (lower) value', 'err'); return; }
    setBusy(true);
    try {
      const measured_at = customTime ? new Date(when).toISOString() : new Date().toISOString();
      await api().insert<Vital>('vitals', {
        patient_id: patient!.id, kind: k, value1: a, value2: k === 'bp' ? b : null, value3: k === 'bp' && v3 ? Number(v3) : null,
        context: k === 'glucose' ? ctx : null, notes: notes || null, measured_at,
      });
      if (k === 'bp' && v3) await api().insert<Vital>('vitals', { patient_id: patient!.id, kind: 'heart_rate', value1: Number(v3), notes: 'From BP monitor', measured_at });
      await refreshData();
      toast(`${meta.label} saved · ${format(new Date(measured_at), 'h:mm a')}`);
      nav(-1);
    } catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); }
  }

  async function del(id: string) {
    if (!confirm('Delete this entry?')) return;
    try { await api().remove('vitals', id); await refreshData(); } catch (e) { toast((e as Error).message, 'err'); }
  }

  return (
    <div className="rise">
      <PageHeader title={`Log ${meta.label}`} subtitle={patient.full_name} />
      <ViewOnlyNote />
      <div className="card overflow-hidden">
        <div className="flex items-center gap-3 px-5 pt-5">
          <div className="grid h-11 w-11 place-items-center rounded-2xl text-white" style={{ background: `linear-gradient(140deg, ${meta.color}, ${meta.color}bb)` }}><VitalIcon kind={k} /></div>
          <div className="flex-1">
            <div className="font-bold">{meta.label}</div>
            <div className="text-xs text-slate-400">{customTime ? format(new Date(when), 'EEE d MMM, h:mm a') : 'Date & time recorded automatically'}</div>
          </div>
          {st && <StatusPill status={st} />}
        </div>
        <div className={cx('flex gap-3 px-4 py-6', k === 'bp' && 'flex-col')}>
          {k === 'bp' ? (
            <>
              <div className="flex gap-2">
                <BigNumber label="Systolic (upper)" value={v1} onChange={setV1} step={1} min={50} max={260} autoFocus />
              </div>
              <div className="flex gap-2">
                <BigNumber label="Diastolic (lower)" value={v2} onChange={setV2} step={1} min={30} max={160} />
              </div>
              <div className="mx-auto w-full max-w-[260px]">
                <BigNumber label="Pulse (optional)" value={v3} onChange={setV3} step={1} min={25} max={230} unit="bpm" />
              </div>
            </>
          ) : (
            <BigNumber value={v1} onChange={setV1} step={meta.step < 1 ? 0.1 : k === 'glucose' ? 5 : 1} min={meta.min} max={meta.max} unit={meta.unit} autoFocus />
          )}
        </div>
        {st && (
          <div className="mx-4 mb-4 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/5"><div className="h-full rounded-full transition-all" style={{ width: '100%', background: STATUS_STYLE[st].dot }} /></div>
        )}
      </div>

      {adv && <div className="mt-3 rounded-3xl bg-amber-50 p-4 text-[13.5px] leading-snug text-amber-900 ring-1 ring-amber-100 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/20">{adv}</div>}

      <div className="card mt-4 space-y-4 p-5">
        {k === 'glucose' && (
          <Field label="When was this measured?"><ChipSelect value={ctx} onChange={setCtx} options={GLUCOSE_CONTEXTS} /></Field>
        )}
        <div>
          <button type="button" onClick={() => setCustomTime(!customTime)} className="flex items-center gap-2 text-[13px] font-semibold text-brand-700 dark:text-brand-300">
            <CalendarClock className="h-4 w-4" />{customTime ? 'Use current time' : 'Measured earlier? Change time'}
          </button>
          {customTime && <input type="datetime-local" className="field mt-2" value={when} max={toLocalInput(new Date())} onChange={e => setWhen(e.target.value)} />}
        </div>
        <Field label="Notes (optional)"><input className="field" value={notes} onChange={e => setNotes(e.target.value)} placeholder={k === 'glucose' ? 'e.g. had sweets, missed walk, felt shaky' : 'e.g. after walk, felt dizzy'} /></Field>
      </div>

      <div className="sticky bottom-24 z-10 mt-4">
        <Button block size="lg" loading={busy} onClick={save} disabled={!canEdit || !v1}>Save reading</Button>
      </div>

      {recent.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 px-1 text-[15px] font-bold">Recent {meta.label.toLowerCase()}</h2>
          <div className="card divide-y divide-slate-100 dark:divide-white/5">
            {recent.map(v => {
              const s = classify(v, patient);
              return (
                <div key={v.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_STYLE[s].dot }} />
                  <div className="flex-1">
                    <div className="font-display font-bold">{fmtVital(v)} <span className="text-xs font-medium text-slate-400">{meta.unit}</span>{v.kind === 'bp' && v.value3 ? <span className="text-xs font-medium text-slate-400"> · {Math.round(v.value3)} bpm</span> : null}</div>
                    <div className="text-xs text-slate-400">{format(new Date(v.measured_at), 'd MMM, h:mm a')}{v.context ? ` · ${ctxLabel(v.context)}` : ''}{v.notes ? ` · ${v.notes}` : ''}</div>
                  </div>
                  {canEdit && <button onClick={() => del(v.id)} className="p-2 text-slate-300 hover:text-red-500" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
