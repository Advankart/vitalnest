import { useEffect, useState } from 'react';
import { BellRing, BellOff, Plus, Smartphone, Trash2 } from 'lucide-react';
import { useApp } from '../lib/store';
import { api } from '../lib/api';
import { DAY_SHORT, to12h } from '../lib/health';
import type { Reminder } from '../lib/types';
import { exactAlarmStatus, isNative, notifyEnabled, notifyPatientIds, notifyPermission, openExactAlarmSetting, requestNotifyPermission, rescheduleAll, setNotifyEnabled, setNotifyPatientIds, testNotification } from '../lib/notify';
import { Avatar, Button, ChipSelect, Field, PageHeader, Section, Sheet, ViewOnlyNote, cx } from '../components/ui';
import { alertPrefs, initPush, setAlertPrefs } from '../lib/push';
import { api as apiFn } from '../lib/api';
import { useNavigate } from 'react-router-dom';
import { Users } from 'lucide-react';
import { VitalIcon } from '../components/Layout';

const KINDS = [{ id: 'glucose', label: 'Blood sugar' }, { id: 'bp', label: 'BP & pulse' }, { id: 'heart_rate', label: 'Heart rate' }, { id: 'weight', label: 'Weight' }, { id: 'water', label: 'Water' }, { id: 'custom', label: 'Other' }];

function FamilyAlerts() {
  const [p, setP] = useState(alertPrefs());
  const cloud = apiFn().mode === 'cloud';
  const upd = (k: 'vitals' | 'meds') => { const n = { ...p, [k]: !p[k] }; setP(n); setAlertPrefs(n); };
  const Row = ({ k, title, sub }: { k: 'vitals' | 'meds'; title: string; sub: string }) => (
    <label className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 dark:bg-white/[.03]">
      <div className="min-w-0 flex-1"><div className="text-[0.875rem] font-semibold">{title}</div><div className="text-[0.75rem] text-slate-500">{sub}</div></div>
      <input type="checkbox" className="h-5 w-5 shrink-0 accent-brand-600" checked={p[k]} onChange={() => upd(k)} />
    </label>
  );
  return (
    <div className="card mt-4 p-5">
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300"><Users className="h-5 w-5" /></div>
        <div className="flex-1">
          <div className="font-bold">Family alerts</div>
          <p className="text-[0.8125rem] text-slate-500">Get notified on this {isNative() ? 'phone' : 'browser'} when someone in the family logs a reading, or a medicine isn't marked taken 30 minutes after its time.</p>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <Row k="vitals" title="New readings by family" sub="Sugar, BP, pulse, weight… with the value and status" />
        <Row k="meds" title="Missed medicines" sub="If a dose isn't marked taken in time" />
      </div>
      {!cloud && <p className="mt-3 text-[0.75rem] text-slate-400">Not available in demo mode.</p>}
    </div>
  );
}

export function DeviceNotifications() {
  const { patients, toast } = useApp();
  const nav = useNavigate();
  const [perm, setPerm] = useState<string>('…');
  const [exact, setExact] = useState<string | null>(null);
  const [on, setOn] = useState(notifyEnabled());
  const [ids, setIds] = useState<string[]>(notifyPatientIds(patients));
  useEffect(() => { notifyPermission().then(setPerm); exactAlarmStatus().then(setExact); }, []);

  async function enable() {
    const ok = await requestNotifyPermission();
    setPerm(ok ? 'granted' : 'denied');
    if (ok) { setNotifyEnabled(true); setOn(true); const n = await rescheduleAll(patients); toast(`Reminders on · ${n} scheduled`); initPush(p => nav(p)); }
    else toast('Permission denied — enable notifications for VitalNest in phone settings', 'err');
  }
  async function toggleOn() { const v = !on; setOn(v); setNotifyEnabled(v); await rescheduleAll(patients); }
  async function togglePatient(id: string) {
    const next = ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id];
    setIds(next); setNotifyPatientIds(next); await rescheduleAll(patients);
  }

  return (
    <div className="card p-5">
      <div className="flex items-start gap-3">
        <div className={cx('grid h-11 w-11 shrink-0 place-items-center rounded-2xl', perm === 'granted' && on ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500 dark:bg-white/5')}>{perm === 'granted' && on ? <BellRing className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}</div>
        <div className="flex-1">
          <div className="font-bold">Reminders on this {isNative() ? 'phone' : 'browser'}</div>
          <p className="text-[0.7812rem] text-slate-500">{isNative() ? 'Alarms ring at the set time even when the app is closed.' : 'In the browser, reminders appear only while VitalNest is open. Install the Android app for alarms that always ring.'}</p>
        </div>
      </div>
      {perm !== 'granted' ? (
        <Button block className="mt-4" onClick={enable}><BellRing className="h-4 w-4" />Turn on reminders</Button>
      ) : (
        <>
          <label className="mt-4 flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 dark:bg-white/[.03]">
            <span className="text-sm font-semibold">Reminders enabled</span>
            <input type="checkbox" className="h-5 w-5 accent-brand-600" checked={on} onChange={toggleOn} />
          </label>
          {patients.length > 1 && on && (
            <div className="mt-3">
              <div className="label">Remind me for</div>
              <div className="flex flex-wrap gap-2">
                {patients.map(p => (
                  <button key={p.id} onClick={() => togglePatient(p.id)} className={cx('flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-[0.8125rem] font-semibold ring-1', ids.includes(p.id) ? 'bg-brand-50 text-brand-800 ring-brand-300 dark:bg-brand-500/10 dark:text-brand-200' : 'text-slate-400 ring-slate-200 dark:ring-white/10')}>
                    <Avatar name={p.full_name} color={ids.includes(p.id) ? p.color : '#94a3b8'} size={26} />{p.full_name.split(' ')[0]}
                  </button>
                ))}
              </div>
            </div>
          )}
          {exact && exact !== 'granted' && (
            <button onClick={openExactAlarmSetting} className="mt-3 w-full rounded-2xl bg-amber-50 px-4 py-3 text-left text-[0.7812rem] text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
              <b>Allow exact alarms</b> so reminders ring on time (Android may delay them otherwise). Tap to open settings.
            </button>
          )}
          <Button variant="soft" block className="mt-3" onClick={() => testNotification().then(() => toast(isNative() ? 'Test reminder in 5 seconds' : 'Test sent'))}><Smartphone className="h-4 w-4" />Send a test reminder</Button>
        </>
      )}
    </div>
  );
}

export default function Reminders() {
  const { patient, data, canEdit, refreshData, toast } = useApp();
  const [edit, setEdit] = useState<Partial<Reminder> | null>(null);
  if (!patient) return null;
  const list = [...data.reminders].sort((a, b) => a.time.localeCompare(b.time));

  async function toggle(r: Reminder) {
    try { await api().update<Reminder>('reminders', r.id, { enabled: !r.enabled }); await refreshData(); } catch (e) { toast((e as Error).message, 'err'); }
  }

  return (
    <div className="rise">
      <PageHeader title="Reminders" subtitle={patient.full_name} right={canEdit ? <Button size="sm" onClick={() => setEdit({ kind: 'glucose', label: '', time: '08:00', days: [0, 1, 2, 3, 4, 5, 6], enabled: true })}><Plus className="h-4 w-4" />Add</Button> : undefined} />
      <DeviceNotifications />
      <FamilyAlerts />
      <ViewOnlyNote />
      <Section title="Measuring reminders" action={<span className="text-xs text-slate-400">Medicine reminders come from Medicines</span>}>
        <div className="card divide-y divide-slate-100 dark:divide-white/5">
          {!list.length && <div className="p-6 text-center text-sm text-slate-400">No reminders yet</div>}
          {list.map(r => (
            <div key={r.id} className={cx('flex items-center gap-3 px-4 py-3', !r.enabled && 'opacity-50')}>
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-300"><VitalIcon kind={r.kind} className="h-[1.125rem] w-[1.125rem]" /></div>
              <button onClick={() => canEdit && setEdit(r)} className="min-w-0 flex-1 text-left">
                <div className="font-display text-[1.0625rem] font-bold">{to12h(r.time)}</div>
                <div className="truncate text-xs text-slate-500">{r.label} · {r.days.length === 7 ? 'Every day' : r.days.map(d => DAY_SHORT[d]).join(' ')}</div>
              </button>
              <label className="relative inline-flex cursor-pointer items-center">
                <input type="checkbox" className="peer sr-only" checked={r.enabled} onChange={() => canEdit && toggle(r)} />
                <div className="h-7 w-12 rounded-full bg-slate-200 transition peer-checked:bg-brand-600 dark:bg-white/10" />
                <div className="absolute left-1 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
              </label>
            </div>
          ))}
        </div>
      </Section>
      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit reminder' : 'New reminder'}>
        {edit && <ReminderForm r={edit} onDone={() => setEdit(null)} />}
      </Sheet>
    </div>
  );
}

function ReminderForm({ r: init, onDone }: { r: Partial<Reminder>; onDone: () => void }) {
  const { patient, refreshData, toast } = useApp();
  const [r, setR] = useState(init);
  const days = r.days ?? [];
  async function save() {
    try {
      const label = r.label?.trim() || KINDS.find(k => k.id === r.kind)?.label || 'Reminder';
      if (r.id) await api().update<Reminder>('reminders', r.id, { kind: r.kind, label, time: r.time, days, enabled: r.enabled });
      else await api().insert<Reminder>('reminders', { ...r, label, days, patient_id: patient!.id });
      await refreshData(); onDone();
    } catch (e) { toast((e as Error).message, 'err'); }
  }
  async function del() { if (!r.id) return; await api().remove('reminders', r.id); await refreshData(); onDone(); }
  return (
    <div className="space-y-4">
      <Field label="What to measure"><ChipSelect value={r.kind ?? 'glucose'} onChange={v => setR({ ...r, kind: v })} options={KINDS} /></Field>
      <Field label="Label"><input className="field" value={r.label ?? ''} onChange={e => setR({ ...r, label: e.target.value })} placeholder="e.g. Fasting sugar" /></Field>
      <Field label="Time"><input type="time" className="field" value={r.time} onChange={e => setR({ ...r, time: e.target.value })} /></Field>
      <Field label="Days">
        <div className="flex gap-1.5">{DAY_SHORT.map((d, i) => <button key={i} type="button" onClick={() => setR({ ...r, days: days.includes(i) ? days.filter(x => x !== i) : [...days, i].sort() })} className={cx('h-10 flex-1 rounded-xl text-sm font-bold', days.includes(i) ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-400 dark:bg-white/5')}>{d}</button>)}</div>
      </Field>
      <Button block size="lg" onClick={save} disabled={!days.length || !r.time}>Save</Button>
      {r.id && <Button block variant="danger" onClick={del}><Trash2 className="h-4 w-4" />Delete</Button>}
    </div>
  );
}
