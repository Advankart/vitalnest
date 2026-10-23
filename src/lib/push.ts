// Family alerts: registers this device for push notifications (Android via Firebase, browsers via Web Push).
import { PushNotifications } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import { api } from './api';
import { isNative } from './notify';

const VAPID_PUBLIC = 'BJte5A8s8ynrnVOZ-eselE1YfdvC34JX1UGqniYW1Yj0AXG0M6AWWWNk9YueDQG0aMiEGLFscpD1dRvlGnEUHE0';
const K_TOKEN = 'vn_push_token', K_V = 'vn_alert_vitals', K_M = 'vn_alert_meds';
const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k: string, v: string | null) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* ignore */ } };

export const alertPrefs = () => ({ vitals: get(K_V) !== '0', meds: get(K_M) !== '0' });
export async function setAlertPrefs(p: { vitals: boolean; meds: boolean }) {
  set(K_V, p.vitals ? '1' : '0'); set(K_M, p.meds ? '1' : '0');
  const t = get(K_TOKEN);
  if (t) await api().registerPush(t, isNative() ? 'android' : 'web', p.vitals, p.meds).catch(() => { });
}
export const pushToken = () => get(K_TOKEN);

async function save(token: string, platform: 'android' | 'web') {
  const p = alertPrefs();
  await api().registerPush(token, platform, p.vitals, p.meds);
  set(K_TOKEN, token);
}

let nativeInit = false;
/** Call after sign-in. Silently does nothing if push isn't available or allowed. */
export async function initPush(navigate: (path: string, patientId?: string) => void) {
  if (api().mode !== 'cloud') return;
  if (isNative()) {
    try {
      let perm = await PushNotifications.checkPermissions();
      if (perm.receive === 'prompt') perm = await PushNotifications.requestPermissions();
      if (perm.receive !== 'granted') return;
      if (!nativeInit) {
        nativeInit = true;
        await PushNotifications.createChannel({ id: 'family', name: 'Family alerts', description: 'New readings and missed medicines in your family', importance: 4, visibility: 1, vibration: true }).catch(() => { });
        await PushNotifications.addListener('registration', t => { save(t.value, 'android').catch(() => { }); });
        await PushNotifications.addListener('registrationError', () => { /* Firebase not configured in this build */ });
        // App open: FCM doesn't show the banner itself, so show it as a local notification
        await PushNotifications.addListener('pushNotificationReceived', n => {
          LocalNotifications.schedule({ notifications: [{ id: Math.floor(Math.random() * 1e6) + 2e6, title: n.title ?? n.data?.title ?? 'VitalNest', body: n.body ?? n.data?.body ?? '', channelId: 'family', extra: n.data }] }).catch(() => { });
        });
        await PushNotifications.addListener('pushNotificationActionPerformed', a => {
          const d = a.notification.data ?? {};
          navigate(d.path || '/', d.patient_id || undefined);
        });
      }
      await PushNotifications.register();
    } catch { /* push plugin unavailable */ }
    return;
  }
  // Browser
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64(VAPID_PUBLIC) });
    await save(JSON.stringify(sub.toJSON()), 'web');
  } catch { /* push not supported here */ }
}

/** Call before sign-out so the next person on this phone doesn't get your alerts. */
export async function stopPush() {
  const t = get(K_TOKEN);
  if (t) await api().unregisterPush(t).catch(() => { });
  set(K_TOKEN, null);
}

function urlB64(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}
