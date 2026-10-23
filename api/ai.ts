// POST /api/ai { patient_id, kind: 'motivation' | 'trends' | 'diet', refresh?: boolean }
// AI insights from the person's own readings. Results are cached per person per day and shared by the family.
import { asUser, cors, sb, userFromToken } from './_lib.js';
import { callClaude } from './_claude.js';

export const config = { maxDuration: 60 };

const TEXT_MODELS = [process.env.ANTHROPIC_TEXT_MODEL, 'claude-sonnet-4-5', 'claude-haiku-4-5'] as string[];
const TZ = 'Asia/Kolkata';
const localDay = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const localHour = () => Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }).format(new Date()));
const DAY = 864e5;

const CONDITION: Record<string, string> = {
  type1: 'Type 1 diabetes', type2: 'Type 2 diabetes', type2_cardiac: 'Type 2 diabetes with heart condition', prediabetes: 'Prediabetes', none: 'No diabetes',
};

/* ---------------- data summary (compact, so the AI call stays cheap) ---------------- */
const avg = (a: number[]) => (a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10 : null);
const age = (dob?: string) => (dob ? Math.floor((Date.now() - +new Date(dob)) / (365.25 * DAY)) : null);

function summarise(p: any, vitals: any[], meds: any[], logs: any[], meals: any[]) {
  const now = Date.now();
  const within = (v: any, from: number, to = 0) => { const t = now - +new Date(v.measured_at); return t >= to * DAY && t < from * DAY; };
  const g = vitals.filter(v => v.kind === 'glucose');
  const fasting = (v: any) => v.context === 'fasting' || v.context === 'before_meal';
  const post = (v: any) => v.context === 'after_meal';
  const gBlock = (from: number, to = 0) => {
    const s = g.filter(v => within(v, from, to)), vals = s.map(v => +v.value1);
    return {
      n: s.length, avg: avg(vals), fasting_avg: avg(s.filter(fasting).map(v => +v.value1)), after_meal_avg: avg(s.filter(post).map(v => +v.value1)),
      min: vals.length ? Math.min(...vals) : null, max: vals.length ? Math.max(...vals) : null,
      lows_below_70: vals.filter(x => x < 70).length, highs_above_250: vals.filter(x => x > 250).length,
      in_range_70_180_pct: vals.length ? Math.round(vals.filter(x => x >= 70 && x <= 180).length / vals.length * 100) : null,
    };
  };
  const bp = vitals.filter(v => v.kind === 'bp');
  const bpBlock = (from: number, to = 0) => {
    const s = bp.filter(v => within(v, from, to));
    return { n: s.length, sys_avg: avg(s.map(v => +v.value1)), dia_avg: avg(s.map(v => +v.value2)), above_140_90: s.filter(v => v.value1 >= 140 || v.value2 >= 90).length };
  };
  const one = (kind: string, from: number) => avg(vitals.filter(v => v.kind === kind && within(v, from)).map(v => +v.value1));
  const weights = vitals.filter(v => v.kind === 'weight').sort((a, b) => +new Date(a.measured_at) - +new Date(b.measured_at));
  const hba1c = vitals.find(v => v.kind === 'hba1c');

  // weekly trend for the last 8 weeks
  const weekly = Array.from({ length: 8 }, (_, i) => {
    const from = (i + 1) * 7, to = i * 7;
    const gs = g.filter(v => within(v, from, to)).map(v => +v.value1);
    const bs = bp.filter(v => within(v, from, to));
    return { weeks_ago: i, sugar_avg: avg(gs), sugar_n: gs.length, sys_avg: avg(bs.map(v => +v.value1)), dia_avg: avg(bs.map(v => +v.value2)) };
  }).filter(w => w.sugar_n || w.sys_avg);

  // medicine adherence, last 14 days
  let due = 0, taken = 0;
  for (let i = 0; i < 14; i++) {
    const day = localDay(new Date(now - i * DAY)), wd = new Date(day + 'T12:00:00').getDay();
    for (const m of meds) {
      if (!m.active || (m.start_date && day < m.start_date) || (m.end_date && day > m.end_date) || (m.days?.length && !m.days.includes(wd))) continue;
      for (const t of m.times ?? []) {
        if (i === 0) continue;
        due++;
        if (logs.some(l => l.medicine_id === m.id && l.scheduled_date === day && l.scheduled_time === t && l.status === 'taken')) taken++;
      }
    }
  }
  const mealDays = new Set(meals.map(m => localDay(new Date(m.eaten_at))));
  const kcal = meals.reduce((a, m) => a + Number(m.total_kcal || 0), 0);

  return {
    person: {
      first_name: String(p.full_name || '').split(' ')[0], age: age(p.dob), gender: p.gender, condition: CONDITION[p.condition] ?? p.condition,
      heart_conditions: p.heart_conditions, other_conditions: p.other_conditions, allergies: p.allergies, insulin_regimen: p.insulin_regimen,
      height_cm: p.height_cm, weight_kg: p.weight_kg, diet_pref: p.diet_pref || 'not set',
      targets: { fasting: `${p.target_fasting_min}-${p.target_fasting_max}`, after_meal_max: p.target_pp_max, bp_max: `${p.target_sys_max}/${p.target_dia_max}`, hr: `${p.target_hr_min}-${p.target_hr_max}` },
      daily_kcal_goal: p.daily_kcal_goal,
    },
    sugar: { last_7_days: gBlock(7), previous_7_days: gBlock(14, 7), last_30_days: gBlock(30), last_90_days: gBlock(90) },
    bp: { last_7_days: bpBlock(7), previous_7_days: bpBlock(14, 7), last_30_days: bpBlock(30) },
    heart_rate_avg_30d: one('heart_rate', 30), spo2_avg_30d: one('spo2', 30),
    weight: weights.length ? { first_90d: +weights[0].value1, latest: +weights[weights.length - 1].value1 } : null,
    lab_hba1c: hba1c ? { value: +hba1c.value1, date: String(hba1c.measured_at).slice(0, 10) } : null,
    weekly_trend: weekly,
    medicines: meds.filter(m => m.active).map(m => `${m.name}${m.strength ? ' ' + m.strength : ''} (${(m.times || []).length}x/day${m.purpose ? ', ' + m.purpose : ''})`),
    medicine_adherence_14d: due ? { due, taken, pct: Math.round(taken / due * 100) } : null,
    food_log_7d: mealDays.size ? { days_logged: mealDays.size, avg_kcal_per_logged_day: Math.round(kcal / mealDays.size) } : null,
    last_reading_at: vitals[0]?.measured_at ?? null,
  };
}

/* ---------------- prompts & schemas ---------------- */
const SYSTEM = `You are VitalNest's friendly health coach for Indian families managing diabetes, blood pressure and heart health.
Rules: use only the numbers given — never invent readings. Be warm, specific and encouraging, in simple English that an elderly parent understands.
You are not a doctor: never change, start or stop medicines or doses, never diagnose. When numbers are dangerous (sugar < 70 often, > 300, BP ≥ 180/110) or keep getting worse, kindly suggest talking to their doctor.`;

const TOOLS = {
  motivation: {
    description: 'A short motivating message for the home screen.',
    schema: {
      type: 'object',
      properties: {
        tone: { type: 'string', enum: ['great', 'good', 'keep_going', 'attention'] },
        emoji: { type: 'string', description: 'One fitting emoji' },
        headline: { type: 'string', description: 'Max 7 words, e.g. "You are progressing well!"' },
        message: { type: 'string', description: '1–2 short sentences mentioning one real number or habit, e.g. "Fasting sugar averaged 118 this week, down from 131. Keep the evening walks going!"' },
      },
      required: ['tone', 'emoji', 'headline', 'message'],
    },
    task: (s: any) => `Write a motivating home-screen message for ${s.person.first_name} from this data. If there is little data, encourage logging regularly. Focus on progress vs the previous week, streaks, medicine adherence or readings in range. If something needs attention, say it gently with one practical tip.\n\nDATA:\n${JSON.stringify(s)}`,
    maxTokens: 400,
  },
  trends: {
    description: 'A trend analysis of the readings.',
    schema: {
      type: 'object',
      properties: {
        overall: { type: 'string', enum: ['improving', 'stable', 'mixed', 'worsening', 'not_enough_data'] },
        summary: { type: 'string', description: '2–3 sentences in plain language' },
        highlights: {
          type: 'array', description: '3–6 findings, most important first',
          items: { type: 'object', properties: { area: { type: 'string', enum: ['sugar', 'bp', 'heart', 'weight', 'medicines', 'food', 'logging'] }, tone: { type: 'string', enum: ['good', 'watch', 'alert'] }, title: { type: 'string', description: 'Max 8 words' }, detail: { type: 'string', description: 'One sentence with the numbers' } }, required: ['area', 'tone', 'title', 'detail'] },
        },
        patterns: { type: 'array', items: { type: 'string' }, description: '0–3 patterns noticed, e.g. "After-meal sugar is highest; fasting is in range."' },
        suggestions: { type: 'array', items: { type: 'string' }, description: '3–5 practical lifestyle suggestions (food, walking, timing of checks, water, sleep) — no medicine changes' },
        doctor_note: { type: ['string', 'null'], description: 'Only if something should be discussed with the doctor; otherwise null' },
      },
      required: ['overall', 'summary', 'highlights', 'patterns', 'suggestions', 'doctor_note'],
    },
    task: (s: any) => `Analyse the health trends for ${s.person.first_name}. Compare last 7 days with the previous 7, look at the 8-week trend, 30/90-day averages vs their targets, lows/highs, BP, weight, HbA1c and medicine adherence.\n\nDATA:\n${JSON.stringify(s)}`,
    maxTokens: 1500,
  },
  diet: {
    description: 'A one-day heart-healthy Indian meal plan.',
    schema: {
      type: 'object',
      properties: {
        meals: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              slot: { type: 'string', enum: ['breakfast', 'mid_morning', 'lunch', 'evening_snack', 'dinner'] },
              title: { type: 'string', description: 'Short dish title, e.g. "Moong dal chilla with mint chutney"' },
              items: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, qty: { type: 'string', description: 'Household measure, e.g. "2 medium", "1 katori (150 g)"' }, kcal: { type: 'number' }, carbs_g: { type: 'number' } }, required: ['name', 'qty', 'kcal'] } },
              total_kcal: { type: 'number' },
              why: { type: 'string', description: 'One short line why it suits them' },
            },
            required: ['slot', 'title', 'items', 'total_kcal', 'why'],
          },
        },
        day_total_kcal: { type: 'number' },
        tips: { type: 'array', items: { type: 'string' }, description: '2–3 short tips for today' },
      },
      required: ['meals', 'day_total_kcal', 'tips'],
    },
    task: (s: any, extra: string) => `Create today's meal plan (breakfast, mid_morning, lunch, evening_snack, dinner) for ${s.person.first_name}.
Make it Indian home food that is heart-healthy (low salt, little oil, no deep-fried food, more fibre, nuts/seeds in moderation) and diabetes-friendly (low glycaemic index, millets/whole grains, dal/protein in every meal, controlled rice/roti portions, no sugar).
Respect diet preference "${s.person.diet_pref}" (if not set, keep it vegetarian with optional egg) and avoid any allergies. Total should be close to ${s.person.daily_kcal_goal} kcal. Give realistic calories per item (Indian food composition). If recent after-meal sugar is high, lower carbs further.
${extra}
DATA:\n${JSON.stringify(s)}`,
    maxTokens: 2200,
  },
} as const;

type Kind = keyof typeof TOOLS;

export default async function handler(req: any, res: any) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const user = await userFromToken(req.headers.authorization);
    if (!user) return res.status(401).json({ error: 'Please sign in again.' });
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const kind = body.kind as Kind, pid = String(body.patient_id || '');
    if (!TOOLS[kind] || !/^[0-9a-f-]{36}$/i.test(pid)) return res.status(400).json({ error: 'Bad request' });

    // access check: the person must be visible to this user (row-level security)
    const [p] = await asUser<any[]>(req.headers.authorization, `/rest/v1/patients?id=eq.${pid}&select=*`);
    if (!p) return res.status(403).json({ error: 'No access to this person' });

    const since = new Date(Date.now() - 95 * DAY).toISOString();
    const [vitals, meds, logs, meals] = await Promise.all([
      sb<any[]>(`/rest/v1/vitals?patient_id=eq.${pid}&measured_at=gte.${since}&select=kind,value1,value2,value3,context,measured_at,id&order=measured_at.desc&limit=3000`),
      sb<any[]>(`/rest/v1/medicines?patient_id=eq.${pid}&select=id,name,strength,times,days,start_date,end_date,active,purpose`),
      sb<any[]>(`/rest/v1/medicine_logs?patient_id=eq.${pid}&scheduled_date=gte.${localDay(new Date(Date.now() - 15 * DAY))}&select=medicine_id,scheduled_date,scheduled_time,status`),
      sb<any[]>(`/rest/v1/meals?patient_id=eq.${pid}&eaten_at=gte.${new Date(Date.now() - 7 * DAY).toISOString()}&select=total_kcal,eaten_at`),
    ]);

    const day = localDay();
    const today = localDay();
    const takenToday = logs.filter(l => l.scheduled_date === today && l.status === 'taken').length;
    const sig = kind === 'motivation' ? `${vitals[0]?.id ?? ''}|${takenToday}` : kind === 'trends' ? `${vitals.length}|${vitals[0]?.id ?? ''}` : `${p.diet_pref ?? ''}|${p.daily_kcal_goal}`;

    const [cached] = await sb<any[]>(`/rest/v1/ai_cache?patient_id=eq.${pid}&kind=eq.${kind}&day=eq.${day}&select=content,sig,created_at`);
    const age = cached ? Date.now() - +new Date(cached.created_at) : Infinity;
    const fresh = cached && (
      kind === 'motivation' ? (cached.sig === sig || age < 10 * 60_000)
        : body.refresh ? age < 2 * 60_000
          : kind === 'diet' ? cached.sig === sig : true
    );
    if (fresh) return res.status(200).json({ ...cached.content, cached: true, generated_at: cached.created_at });

    const summary = summarise(p, vitals, meds, logs, meals);
    let extra = '';
    if (kind === 'diet') {
      const [y] = await sb<any[]>(`/rest/v1/ai_cache?patient_id=eq.${pid}&kind=eq.diet&day=lt.${day}&select=content&order=day.desc&limit=1`);
      const titles = (y?.content?.meals || []).map((m: any) => m.title).join('; ');
      extra = `Today is ${new Intl.DateTimeFormat('en-IN', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}.${titles ? ` Do not repeat these dishes from yesterday: ${titles}.` : ''}${body.refresh ? ' Give a different menu from before.' : ''}`;
    }
    const t = TOOLS[kind];
    const { model, out } = await callClaude({
      models: TEXT_MODELS, system: SYSTEM, tool: t, maxTokens: t.maxTokens, temperature: kind === 'trends' ? 0.2 : 0.7,
      content: [{ type: 'text', text: (t.task as any)(summary, extra) + (kind === 'motivation' ? `\nLocal hour now: ${localHour()}.` : '') }],
    });
    const content = { ...out, model };
    await sb('/rest/v1/ai_cache?on_conflict=patient_id,kind,day', {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ patient_id: pid, kind, day, sig, content, created_at: new Date().toISOString() }),
    });
    return res.status(200).json({ ...content, cached: false, generated_at: new Date().toISOString() });
  } catch (e: any) {
    return res.status(e?.status || 500).json({ error: e?.message || String(e) });
  }
}
