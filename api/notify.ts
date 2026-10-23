// POST /api/notify { vital_id }  — called by a database trigger when a reading is added.
// Tells the other family members (admin, caregivers, viewers) what was added. Safe to call twice: each reading notifies once.
import { cors, sb } from './_lib.js';
import { sendToUsers } from './_push.js';

export const config = { maxDuration: 30 };

const LABEL: Record<string, [string, string, string]> = {
  glucose: ['Blood sugar', 'mg/dL', '🩸'], bp: ['BP', 'mmHg', '🩺'], heart_rate: ['Heart rate', 'bpm', '❤️'],
  weight: ['Weight', 'kg', '⚖️'], spo2: ['SpO₂', '%', '🫁'], temperature: ['Temperature', '°F', '🌡️'], hba1c: ['HbA1c', '%', '🧪'],
};
const CTX: Record<string, string> = { fasting: 'fasting', before_meal: 'before meal', after_meal: 'after meal', bedtime: 'bedtime', night: 'night', random: 'random' };

function status(v: any, p: any): string {
  const a = Number(v.value1), b = Number(v.value2 ?? 0);
  switch (v.kind) {
    case 'glucose': {
      if (a < 54) return '⚠️ Very low';
      if (a < 70) return '⚠️ Low';
      if (a > 300) return '⚠️ Very high';
      const fast = v.context === 'fasting' || v.context === 'before_meal';
      return (fast ? a > p.target_fasting_max : a > p.target_pp_max) ? 'High' : 'In range';
    }
    case 'bp': if (a >= 180 || b >= 120) return '⚠️ Very high'; if (a < 90 || b < 60) return 'Low'; return a > p.target_sys_max || b > p.target_dia_max ? 'High' : 'In range';
    case 'heart_rate': if (a < 40 || a > 130) return '⚠️ Unusual'; return a < p.target_hr_min ? 'Low' : a > p.target_hr_max ? 'High' : 'Normal';
    case 'spo2': return a < 90 ? '⚠️ Low' : a < 95 ? 'Slightly low' : 'Normal';
    default: return '';
  }
}

export default async function handler(req: any, res: any) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const id = String(body.vital_id || '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'vital_id required' });

    // Claim the reading: only the first call flips notified=false → true.
    const claimed = await sb<any[]>(`/rest/v1/vitals?id=eq.${id}&notified=eq.false`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ notified: true }),
    });
    const v = claimed?.[0];
    if (!v) return res.status(200).json({ skipped: 'already notified or not found' });
    if (Date.now() - new Date(v.created_at).getTime() > 15 * 60_000) return res.status(200).json({ skipped: 'old' });
    if (v.kind === 'heart_rate' && v.notes === 'From BP monitor') return res.status(200).json({ skipped: 'part of BP' });

    const [p] = await sb<any[]>(`/rest/v1/patients?id=eq.${v.patient_id}&select=*`);
    if (!p) return res.status(200).json({ skipped: 'no patient' });
    const members = await sb<any[]>(`/rest/v1/family_members?family_id=eq.${p.family_id}&select=user_id`);
    const recipients = members.map(m => m.user_id).filter((u: string) => u !== v.created_by);
    if (!recipients.length) return res.status(200).json({ sent: 0 });

    let by = '';
    if (v.created_by) {
      const [u] = await sb<any[]>(`/rest/v1/app_users?id=eq.${v.created_by}&select=display_name,username`);
      by = u ? (u.display_name || u.username) : '';
    }
    const [label, unit, icon] = LABEL[v.kind] ?? [v.kind, '', '📈'];
    const val = v.kind === 'bp' ? `${Math.round(v.value1)}/${Math.round(v.value2)}${v.value3 ? ` · pulse ${Math.round(v.value3)}` : ''}` : (['weight', 'temperature', 'hba1c'].includes(v.kind) ? Number(v.value1).toFixed(1) : Math.round(v.value1));
    const st = status(v, p);
    const first = String(p.full_name).split(' ')[0];
    const msg = {
      title: `${icon} ${first}: ${label} ${val} ${unit}`.trim(),
      body: [st, v.context ? CTX[v.context] : '', by ? `added by ${by}` : ''].filter(Boolean).join(' · '),
      path: '/history', patient_id: p.id, tag: `vital-${v.id}`,
    };
    const r = await sendToUsers(recipients, 'alerts_vitals', msg);
    return res.status(200).json(r);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || String(e) });
  }
}
