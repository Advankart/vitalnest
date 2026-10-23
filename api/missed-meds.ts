// GET/POST /api/missed-meds — called every 10 minutes by a Supabase schedule (pg_cron).
// Finds doses that are 30+ minutes late and not marked taken, and alerts the rest of the family once per dose.
import { cors, sb } from './_lib.js';
import { sendToUsers } from './_push.js';

export const config = { maxDuration: 60 };

const to12h = (t: string) => { const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };

export default async function handler(req: any, res: any) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    const due = await sb<any[]>('/rest/v1/rpc/missed_doses_due', { method: 'POST', body: '{}' });
    let sent = 0;
    for (const d of due) {
      // claim this dose so it is only announced once
      const claimed = await sb<any[]>('/rest/v1/med_alerts_sent?on_conflict=medicine_id,scheduled_date,scheduled_time', {
        method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
        body: JSON.stringify({ medicine_id: d.medicine_id, scheduled_date: d.scheduled_date, scheduled_time: d.scheduled_time }),
      });
      if (!claimed?.length) continue;
      const members = await sb<any[]>(`/rest/v1/family_members?family_id=eq.${d.family_id}&select=user_id`);
      const others = members.map(m => m.user_id).filter((u: string) => u && u !== d.linked_user_id);
      const first = String(d.patient_name).split(' ')[0];
      const detail = `${[d.strength, d.dose].filter(Boolean).join(' · ')}${d.strength || d.dose ? ' · ' : ''}`;
      const tag = `med-${d.medicine_id}-${d.scheduled_date}-${d.scheduled_time}`;
      const r = await sendToUsers(others, 'alerts_meds', lang => lang === 'ta' ? {
        title: `💊 ${first} இன்னும் ${d.med_name} எடுக்கவில்லை`,
        body: `${detail}${to12h(d.scheduled_time)} மணிக்கு எடுக்க வேண்டியது — இன்னும் எடுத்ததாகக் குறிக்கப்படவில்லை`,
        path: '/meds', patient_id: d.patient_id, tag,
      } : {
        title: `💊 ${first} hasn't taken ${d.med_name}`,
        body: `${detail}due at ${to12h(d.scheduled_time)} — not marked as taken yet`,
        path: '/meds', patient_id: d.patient_id, tag,
      });
      sent += r.sent;
    }
    return res.status(200).json({ due: due.length, sent });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || String(e) });
  }
}
