import { Capacitor } from '@capacitor/core';
import { t as tr, tDose } from './i18n';
import { LocalNotifications } from '@capacitor/local-notifications';
import { api } from './api';
import type { Appointment, Medicine, Patient, Reminder } from './types';
import { dayKey, doseFor, FOOD_REL, hhmm, to12h, VITALS } from './health';

export const isNative = () => Capacitor.isNativePlatform();

const K_PATIENTS = 'vn_notify_patients';
const K_ENABLED = 'vn_notify_on';
const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

export function notifyEnabled() { return get(K_ENABLED) !== '0'; }
export function setNotifyEnabled(on: boolean) { set(K_ENABLED, on ? '1' : '0'); }

/** Which patients' reminders ring on THIS device. Default: everyone in the family. */
export function notifyPatientIds(patients: Patient[]): string[] {
  const raw = get(K_PATIENTS);
  if (raw) { try { const ids = JSON.parse(raw) as string[]; return ids.filter(id => patients.some(p => p.id === id)); } catch { /* ignore */ } }
  return patients.map(p => p.id);
}
export function setNotifyPatientIds(ids: string[]) { set(K_PATIENTS, JSON.stringify(ids)); }

interface Slot { key: string; title: string; body: string; time: string; days: number[]; extra: Record<string, string> }
let webSlots: Slot[] = [];

function buildSlots(patients: Patient[], meds: Medicine[], rems: Reminder[]): Slot[] {
  const name = (pid: string) => patients.find(p => p.id === pid)?.full_name.split(' ')[0] ?? '';
  const multi = new Set([...meds.map(m => m.patient_id), ...rems.map(r => r.patient_id)]).size > 1;
  const who = (pid: string) => (multi ? `${name(pid)} · ` : '');
  const out: Slot[] = [];
  const today = dayKey(new Date());
  for (const m of meds) {
    if (!m.active || (m.end_date && m.end_date < today)) continue;
    for (const t of m.times) {
      out.push({
        key: `med:${m.id}:${t}`, time: t, days: m.days?.length ? m.days : [0, 1, 2, 3, 4, 5, 6],
        title: `💊 ${who(m.patient_id)}${tr('Time for {name}', { name: m.name })}`,
        body: [tDose(doseFor(m, t)), m.strength, m.food_relation ? tr(FOOD_REL[m.food_relation] ?? '') : ''].filter(Boolean).join(' · '),
        extra: { type: 'med', medicine_id: m.id, patient_id: m.patient_id, time: t },
      });
    }
  }
  for (const r of rems) {
    if (!r.enabled) continue;
    const icon = r.kind === 'water' ? '💧' : r.kind === 'bp' ? '🩺' : r.kind === 'weight' ? '⚖️' : r.kind === 'heart_rate' ? '❤️' : '🩸';
    const vl = VITALS[r.kind as keyof typeof VITALS]?.label;
    const body = r.kind === 'water' ? tr('Have a glass of water and log it.') :
      tr('Measure {what} and log it in VitalNest.', { what: vl ? tr(vl).toLowerCase() : tr('your vitals') });
    out.push({
      key: `rem:${r.id}`, time: r.time, days: r.days?.length ? r.days : [0, 1, 2, 3, 4, 5, 6],
      title: `${icon} ${who(r.patient_id)}${tr(r.label)}`, body,
      extra: { type: 'vital', kind: r.kind, patient_id: r.patient_id },
    });
  }
  return out;
}

/** Doctor visit / test reminders: the evening before (7 PM) and on the day (2 h before, or 7 AM). */
function visitAlerts(patients: Patient[], appts: Appointment[]) {
  const name = (pid: string) => patients.find(p => p.id === pid)?.full_name.split(' ')[0] ?? '';
  const now = Date.now(), out: { at: Date; title: string; body: string; patient_id: string }[] = [];
  for (const a of appts) {
    if (a.done || !/^\d{4}-\d{2}-\d{2}$/.test(a.appt_date)) continue;
    const [y, m, d] = a.appt_date.split('-').map(Number);
    const [hh, mm] = (a.appt_time && /^\d{2}:\d{2}$/.test(a.appt_time) ? a.appt_time : '').split(':').map(Number);
    const icon = a.kind === 'test' ? '🧪' : '🩺';
    const what = [a.title, a.doctor && !a.title.includes(a.doctor) ? a.doctor : '', a.hospital].filter(Boolean).join(' · ');
    const timeTxt = a.appt_time ? ` ${tr('at {time}', { time: to12h(a.appt_time) })}` : '';
    const eve = new Date(y, m - 1, d - 1, 19, 0);
    const day = a.appt_time ? new Date(y, m - 1, d, (hh || 9) - 2, mm || 0) : new Date(y, m - 1, d, 7, 0);
    if (+eve > now) out.push({ at: eve, title: `${icon} ${name(a.patient_id)} · ${tr('Tomorrow')}${timeTxt}`, body: what, patient_id: a.patient_id });
    if (+day > now) out.push({ at: day, title: `${icon} ${name(a.patient_id)} · ${tr('Today')}${timeTxt}`, body: what, patient_id: a.patient_id });
  }
  return out.slice(0, 60);
}

let lastSig = '';
export async function rescheduleAll(patients: Patient[]) {
  const ids = notifyEnabled() ? notifyPatientIds(patients) : [];
  const [meds, rems, appts] = ids.length
    ? await Promise.all([api().list<Medicine>('medicines', ids), api().list<Reminder>('reminders', ids), api().list<Appointment>('appointments', ids).catch(() => [] as Appointment[])])
    : [[], [], []];
  const slots = buildSlots(patients, meds as Medicine[], rems as Reminder[]);
  const visits = visitAlerts(patients, appts as Appointment[]);
  webSlots = slots;
  if (!isNative()) return slots.length;

  const sig = JSON.stringify([slots.map(s => [s.key, s.time, s.days, s.title, s.body]), visits.map(v => [v.at.getTime(), v.title])]);
  if (sig === lastSig) return slots.length;
  lastSig = sig;

  const perm = await LocalNotifications.checkPermissions();
  if (perm.display !== 'granted') return 0;
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map(n => ({ id: n.id })) });

  let id = 1000;
  const notifications = [];
  for (const s of slots) {
    const [hour, minute] = s.time.split(':').map(Number);
    const base = {
      title: s.title, body: s.body, channelId: 'reminders', extra: s.extra,
      actionTypeId: s.extra.type === 'med' ? 'MED' : 'VITAL', autoCancel: true,
    };
    if (s.days.length === 7) {
      notifications.push({ ...base, id: id++, schedule: { on: { hour, minute }, allowWhileIdle: true } });
    } else {
      for (const d of s.days) notifications.push({ ...base, id: id++, schedule: { on: { weekday: d + 1, hour, minute }, allowWhileIdle: true } });
    }
  }
  for (const v of visits) notifications.push({ id: id++, title: v.title, body: v.body, channelId: 'reminders', extra: { type: 'visit', patient_id: v.patient_id }, autoCancel: true, schedule: { at: v.at, allowWhileIdle: true } });
  if (notifications.length) await LocalNotifications.schedule({ notifications: notifications.slice(0, 450) });
  return notifications.length;
}

export async function initNotifications(navigate: (path: string) => void) {
  if (isNative()) {
    try {
      await LocalNotifications.createChannel({ id: 'reminders', name: tr('Medicine & vitals reminders'), description: tr('Medicine times and measuring reminders'), importance: 5, visibility: 1, vibration: true, lights: true });
      await LocalNotifications.registerActionTypes({
        types: [
          { id: 'MED', actions: [{ id: 'taken', title: tr('✓ Mark taken') }, { id: 'snooze', title: tr('Snooze 10 min') }] },
          { id: 'VITAL', actions: [{ id: 'log', title: tr('Log now'), foreground: true }, { id: 'snooze', title: tr('Snooze 15 min') }] },
        ],
      });
      await LocalNotifications.addListener('localNotificationActionPerformed', async (ev) => {
        const n = ev.notification, x = (n.extra ?? {}) as Record<string, string>;
        if (ev.actionId === 'taken' && x.medicine_id) {
          await api().upsertMedLog({ medicine_id: x.medicine_id, patient_id: x.patient_id, scheduled_date: dayKey(new Date()), scheduled_time: x.time, status: 'taken' }).catch(() => { });
          return;
        }
        if (ev.actionId === 'snooze') {
          const mins = x.type === 'med' ? 10 : 15;
          await LocalNotifications.schedule({ notifications: [{ id: Math.floor(Math.random() * 1e6) + 1e6, title: n.title ?? tr('Reminder'), body: n.body ?? '', channelId: 'reminders', extra: x, actionTypeId: n.actionTypeId, schedule: { at: new Date(Date.now() + mins * 60000), allowWhileIdle: true } }] });
          return;
        }
        if (x.patient_id) { try { localStorage.setItem('vn_patient', x.patient_id); } catch { /* ignore */ } }
        navigate(x.type === 'visit' ? '/appointments' : x.type === 'med' ? '/meds' : x.kind && x.kind !== 'water' ? `/add/${x.kind}` : x.kind === 'water' ? '/water' : '/');
      });
    } catch { /* plugin missing */ }
  } else {
    startWebLoop();
  }
}

export async function requestNotifyPermission(): Promise<boolean> {
  if (isNative()) {
    const r = await LocalNotifications.requestPermissions();
    return r.display === 'granted';
  }
  if (!('Notification' in window)) return false;
  const r = await Notification.requestPermission();
  return r === 'granted';
}

export async function notifyPermission(): Promise<'granted' | 'denied' | 'prompt' | 'unsupported'> {
  if (isNative()) { const r = await LocalNotifications.checkPermissions(); return r.display === 'granted' ? 'granted' : r.display === 'denied' ? 'denied' : 'prompt'; }
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission === 'default' ? 'prompt' : Notification.permission;
}

export async function exactAlarmStatus(): Promise<string | null> {
  if (!isNative() || Capacitor.getPlatform() !== 'android') return null;
  try { const r = await LocalNotifications.checkExactNotificationSetting(); return r.exact_alarm; } catch { return null; }
}
export async function openExactAlarmSetting() {
  try { await LocalNotifications.changeExactNotificationSetting(); } catch { /* ignore */ }
}

export async function testNotification() {
  if (isNative()) {
    await LocalNotifications.schedule({ notifications: [{ id: 99, title: tr('✅ VitalNest reminders are working'), body: tr('You will be reminded like this for medicines and measurements.'), channelId: 'reminders', schedule: { at: new Date(Date.now() + 5000), allowWhileIdle: true } }] });
    return;
  }
  await showWeb(tr('✅ VitalNest reminders are working'), tr('Reminders appear while VitalNest is open in this browser.'));
}

/* ---------- Web: reminders while the app is open ---------- */
type DueListener = (s: { title: string; body: string; path: string }) => void;
const dueListeners = new Set<DueListener>();
export function onDue(l: DueListener) { dueListeners.add(l); return () => { dueListeners.delete(l); }; }

async function showWeb(title: string, body: string) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, { body, icon: '/icon-192.png', badge: '/icon-192.png', tag: title });
    else new Notification(title, { body, icon: '/icon-192.png' });
  } catch { /* ignore */ }
}

let loopStarted = false;
const fired = new Set<string>();
function startWebLoop() {
  if (loopStarted) return;
  loopStarted = true;
  const check = () => {
    const now = new Date(), t = hhmm(now), wd = now.getDay(), dk = dayKey(now);
    for (const s of webSlots) {
      if (s.time !== t || !s.days.includes(wd)) continue;
      const k = `${dk}|${s.key}`;
      if (fired.has(k)) continue;
      fired.add(k);
      showWeb(s.title, s.body);
      const path = s.extra.type === 'med' ? '/meds' : s.extra.kind === 'water' ? '/water' : `/add/${s.extra.kind}`;
      dueListeners.forEach(l => l({ title: s.title, body: s.body, path }));
    }
  };
  setInterval(check, 20000);
  check();
}
