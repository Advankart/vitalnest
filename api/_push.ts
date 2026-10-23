// Sends push notifications to family members' devices: Android (Firebase Cloud Messaging) and browsers (Web Push).
import { createSign } from 'node:crypto';
import webpush from 'web-push';
import { sb } from './_lib.js';

export const VAPID_PUBLIC = 'BJte5A8s8ynrnVOZ-eselE1YfdvC34JX1UGqniYW1Yj0AXG0M6AWWWNk9YueDQG0aMiEGLFscpD1dRvlGnEUHE0';

export interface PushMsg { title: string; body: string; path?: string; patient_id?: string; tag?: string }

interface TokenRow { token: string; platform: 'android' | 'web'; user_id: string; lang?: string }

/* ---------- Firebase (FCM HTTP v1) ---------- */
let fcmCache: { token: string; exp: number; project: string } | null = null;
async function fcmAccess() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  if (fcmCache && fcmCache.exp > Date.now() + 60_000) return fcmCache;
  const sa = JSON.parse(raw);
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: sa.token_uri || 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
  const sig = createSign('RSA-SHA256').update(unsigned).sign(sa.private_key, 'base64url');
  const r = await fetch(sa.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` }),
  });
  const j: any = await r.json();
  if (!j.access_token) throw new Error('FCM auth failed: ' + JSON.stringify(j).slice(0, 200));
  fcmCache = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000, project: sa.project_id };
  return fcmCache;
}

async function sendFcm(token: string, m: PushMsg): Promise<'ok' | 'gone' | 'error'> {
  const a = await fcmAccess();
  if (!a) return 'error';
  const r = await fetch(`https://fcm.googleapis.com/v1/projects/${a.project}/messages:send`, {
    method: 'POST', headers: { Authorization: `Bearer ${a.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        token,
        notification: { title: m.title, body: m.body },
        data: { path: m.path ?? '/', patient_id: m.patient_id ?? '', title: m.title, body: m.body },
        android: { priority: 'high', notification: { channel_id: 'family', sound: 'default', tag: m.tag } },
      },
    }),
  });
  if (r.ok) return 'ok';
  const t = await r.text();
  return /UNREGISTERED|NOT_FOUND|INVALID_ARGUMENT/.test(t) ? 'gone' : 'error';
}

/* ---------- Web Push ---------- */
let vapidReady = false;
async function sendWeb(token: string, m: PushMsg): Promise<'ok' | 'gone' | 'error'> {
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!priv) return 'error';
  if (!vapidReady) { webpush.setVapidDetails('mailto:advankartsolutions@gmail.com', VAPID_PUBLIC, priv); vapidReady = true; }
  try {
    await webpush.sendNotification(JSON.parse(token), JSON.stringify(m), { TTL: 6 * 3600, urgency: 'high' });
    return 'ok';
  } catch (e: any) {
    return e?.statusCode === 404 || e?.statusCode === 410 ? 'gone' : 'error';
  }
}

/** Send to every device of the given users that has the matching alert type switched on. */
export async function sendToUsers(userIds: string[], pref: 'alerts_vitals' | 'alerts_meds', msg: PushMsg | ((lang: string) => PushMsg)) {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (!ids.length) return { sent: 0 };
  const rows = await sb<TokenRow[]>(`/rest/v1/push_tokens?select=token,platform,user_id,lang&${pref}=eq.true&user_id=in.(${ids.join(',')})`);
  let sent = 0;
  const gone: string[] = [];
  await Promise.all(rows.map(async row => {
    const m = typeof msg === 'function' ? msg(row.lang || 'en') : msg;
    const r = row.platform === 'android' ? await sendFcm(row.token, m) : await sendWeb(row.token, m);
    if (r === 'ok') sent++;
    if (r === 'gone') gone.push(row.token);
  }));
  for (const t of gone) await sb(`/rest/v1/push_tokens?token=eq.${encodeURIComponent(t)}`, { method: 'DELETE' }).catch(() => { });
  return { sent, removed: gone.length };
}
