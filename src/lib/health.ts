import type { Condition, Medicine, MedicineLog, Patient, Reminder, Vital, VitalKind } from './types';

export const CONDITIONS: Record<Condition, { label: string; short: string; desc: string }> = {
  type1: { label: 'Type 1 Diabetes', short: 'T1D', desc: 'Insulin-dependent · frequent glucose checks' },
  type2: { label: 'Type 2 Diabetes', short: 'T2D', desc: 'Glucose + lifestyle tracking' },
  type2_cardiac: { label: 'Type 2 Diabetes + Heart', short: 'T2D + Heart', desc: 'Glucose, BP, pulse & weight' },
  prediabetes: { label: 'Prediabetes', short: 'Pre-D', desc: 'Prevention focused' },
  none: { label: 'General wellness', short: 'Wellness', desc: 'General vitals' },
};

export const VITALS: Record<VitalKind, { label: string; unit: string; color: string; icon: string; min: number; max: number; step: number }> = {
  glucose:     { label: 'Blood Sugar',  unit: 'mg/dL', color: '#e11d48', icon: 'droplet',     min: 20,  max: 600, step: 1 },
  bp:          { label: 'Blood Pressure', unit: 'mmHg', color: '#7c3aed', icon: 'gauge',      min: 50,  max: 260, step: 1 },
  heart_rate:  { label: 'Heart Rate',   unit: 'bpm',   color: '#f97316', icon: 'heart-pulse', min: 25,  max: 230, step: 1 },
  weight:      { label: 'Weight',       unit: 'kg',    color: '#0891b2', icon: 'scale',       min: 2,   max: 300, step: 0.1 },
  spo2:        { label: 'SpO₂',         unit: '%',     color: '#2563eb', icon: 'wind',        min: 50,  max: 100, step: 1 },
  temperature: { label: 'Temperature',  unit: '°F',    color: '#d97706', icon: 'thermometer', min: 90,  max: 110, step: 0.1 },
  hba1c:       { label: 'HbA1c',        unit: '%',     color: '#be185d', icon: 'flask',       min: 3,   max: 20,  step: 0.1 },
};

export const GLUCOSE_CONTEXTS = [
  { id: 'fasting', label: 'Fasting' },
  { id: 'before_meal', label: 'Before meal' },
  { id: 'after_meal', label: '2 h after meal' },
  { id: 'bedtime', label: 'Bedtime' },
  { id: 'night', label: 'Night (3 AM)' },
  { id: 'random', label: 'Random' },
];
export const ctxLabel = (c?: string | null) => GLUCOSE_CONTEXTS.find(x => x.id === c)?.label ?? (c ? c : '');

export function vitalsFor(c: Condition): VitalKind[] {
  if (c === 'type2_cardiac') return ['glucose', 'bp', 'heart_rate', 'weight', 'spo2', 'hba1c', 'temperature'];
  if (c === 'type1') return ['glucose', 'hba1c', 'bp', 'heart_rate', 'weight', 'temperature', 'spo2'];
  return ['glucose', 'bp', 'heart_rate', 'weight', 'hba1c', 'spo2', 'temperature'];
}

export type Status = 'low' | 'normal' | 'high' | 'critical-low' | 'critical-high';
export const STATUS_STYLE: Record<Status, { label: string; cls: string; dot: string }> = {
  'critical-low':  { label: 'Very low',  cls: 'bg-red-600 text-white',     dot: '#dc2626' },
  low:             { label: 'Low',       cls: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300', dot: '#f59e0b' },
  normal:          { label: 'In range',  cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300', dot: '#10b981' },
  high:            { label: 'High',      cls: 'bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-300', dot: '#f97316' },
  'critical-high': { label: 'Very high', cls: 'bg-red-600 text-white',     dot: '#dc2626' },
};

export function classify(v: Pick<Vital, 'kind' | 'value1' | 'value2' | 'context'>, p: Patient): Status {
  const a = Number(v.value1), b = Number(v.value2 ?? 0);
  switch (v.kind) {
    case 'glucose': {
      if (a < 54) return 'critical-low';
      if (a < 70) return 'low';
      if (a > 300) return 'critical-high';
      const isFast = v.context === 'fasting' || v.context === 'before_meal';
      if (isFast) return a > p.target_fasting_max ? 'high' : a < p.target_fasting_min ? 'low' : 'normal';
      return a > p.target_pp_max ? 'high' : 'normal';
    }
    case 'bp':
      if (a >= 180 || b >= 120) return 'critical-high';
      if (a < 90 || b < 60) return 'low';
      if (a > p.target_sys_max || b > p.target_dia_max) return 'high';
      return 'normal';
    case 'heart_rate':
      if (a < 40) return 'critical-low';
      if (a > 130) return 'critical-high';
      if (a < p.target_hr_min) return 'low';
      if (a > p.target_hr_max) return 'high';
      return 'normal';
    case 'spo2':
      if (a < 90) return 'critical-low';
      if (a < 95) return 'low';
      return 'normal';
    case 'temperature':
      if (a >= 103) return 'critical-high';
      if (a >= 99.5) return 'high';
      if (a < 95) return 'low';
      return 'normal';
    case 'hba1c':
      if (a >= 9) return 'critical-high';
      if (a > 7) return 'high';
      return 'normal';
    default:
      return 'normal';
  }
}

/** Short, plain guidance shown with out-of-range readings. Not a substitute for medical advice. */
export function advice(v: Pick<Vital, 'kind' | 'value1' | 'value2'>, p: Patient): string | null {
  const a = Number(v.value1), b = Number(v.value2 ?? 0);
  if (v.kind === 'glucose') {
    if (a < 70) return 'Low sugar: take 15 g fast sugar (3 glucose tablets, ½ glass juice or 1 tbsp sugar), recheck in 15 min. Repeat if still below 70.';
    if (a > 250 && p.condition === 'type1') return 'High sugar: check ketones if you can, drink water, and follow your correction-dose plan. Contact your doctor if ketones are moderate or high.';
    if (a > 300) return 'Very high sugar: drink water and contact your doctor, especially if you feel unwell.';
  }
  if (v.kind === 'bp' && (a >= 180 || b >= 120)) return 'Very high BP: rest 5 minutes and re-measure. If it stays this high or you have chest pain, breathlessness or weakness, seek emergency care.';
  if (v.kind === 'heart_rate' && (a < 40 || a > 130)) return 'Unusual heart rate: sit and re-measure. If you feel dizzy, faint or have chest pain, seek medical help.';
  if (v.kind === 'spo2' && a < 90) return 'Low oxygen: re-measure with warm hands. If still below 90%, seek medical help.';
  return null;
}

export const fmtVital = (v: Pick<Vital, 'kind' | 'value1' | 'value2'>) =>
  v.kind === 'bp' ? `${Math.round(v.value1)}/${Math.round(Number(v.value2 ?? 0))}` :
  v.kind === 'weight' || v.kind === 'temperature' || v.kind === 'hba1c' ? Number(v.value1).toFixed(1) : `${Math.round(v.value1)}`;

/* ---------------- statistics ---------------- */
export function stats(nums: number[]) {
  if (!nums.length) return { avg: 0, min: 0, max: 0, n: 0, sd: 0 };
  const n = nums.length, avg = nums.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(nums.reduce((a, b) => a + (b - avg) ** 2, 0) / n);
  return { avg, min: Math.min(...nums), max: Math.max(...nums), n, sd };
}
/** ADAG formula: estimated HbA1c from average glucose */
export const eA1c = (avgMgdl: number) => (avgMgdl + 46.7) / 28.7;

export function timeInRange(gl: Vital[]) {
  const n = gl.length || 1;
  const veryLow = gl.filter(g => g.value1 < 54).length, low = gl.filter(g => g.value1 >= 54 && g.value1 < 70).length;
  const inR = gl.filter(g => g.value1 >= 70 && g.value1 <= 180).length;
  const high = gl.filter(g => g.value1 > 180 && g.value1 <= 250).length, veryHigh = gl.filter(g => g.value1 > 250).length;
  return { veryLow: veryLow / n * 100, low: low / n * 100, inRange: inR / n * 100, high: high / n * 100, veryHigh: veryHigh / n * 100, total: gl.length };
}

export function age(dob?: string | null) {
  if (!dob) return null;
  const d = new Date(dob), t = new Date();
  let a = t.getFullYear() - d.getFullYear();
  if (t.getMonth() < d.getMonth() || (t.getMonth() === d.getMonth() && t.getDate() < d.getDate())) a--;
  return a;
}
export function bmi(p: Patient) {
  if (!p.height_cm || !p.weight_kg) return null;
  return p.weight_kg / (p.height_cm / 100) ** 2;
}

/* ---------------- defaults ---------------- */
export function defaultTargets(c: Condition): Partial<Patient> {
  const base = { target_fasting_min: 80, target_fasting_max: 130, target_pp_max: 180, target_sys_max: 130, target_dia_max: 80, target_hr_min: 60, target_hr_max: 100 };
  if (c === 'type2_cardiac') return { ...base, target_sys_max: 130, target_dia_max: 80, target_hr_min: 55, target_hr_max: 90, daily_water_goal_ml: 2000 };
  if (c === 'prediabetes' || c === 'none') return { ...base, target_fasting_min: 70, target_fasting_max: 100, target_pp_max: 140 };
  return base;
}

/** Sensible starter measuring reminders per condition */
export function defaultReminders(c: Condition): Omit<Reminder, 'id' | 'patient_id'>[] {
  const all = [0, 1, 2, 3, 4, 5, 6];
  const r = (kind: string, label: string, time: string, days = all) => ({ kind, label, time, days, enabled: true });
  if (c === 'type1') return [
    r('glucose', 'Fasting sugar', '07:00'), r('glucose', 'Before lunch sugar', '13:00'),
    r('glucose', 'Before dinner sugar', '19:30'), r('glucose', 'Bedtime sugar', '22:30'), r('water', 'Drink water', '11:00'),
  ];
  if (c === 'type2_cardiac') return [
    r('glucose', 'Fasting sugar', '07:00'), r('weight', 'Morning weight (after toilet, before food)', '07:15'),
    r('bp', 'Morning BP & pulse', '08:00'), r('glucose', '2 h after lunch sugar', '15:00'),
    r('bp', 'Evening BP & pulse', '20:00'), r('water', 'Drink water', '11:00'),
  ];
  if (c === 'type2') return [
    r('glucose', 'Fasting sugar', '07:00'), r('glucose', '2 h after lunch sugar', '15:00'),
    r('bp', 'Weekly BP check', '08:30', [0]), r('weight', 'Weekly weight', '07:15', [0]), r('water', 'Drink water', '11:00'),
  ];
  return [r('glucose', 'Fasting sugar', '07:30', [1, 4]), r('bp', 'BP check', '08:30', [0])];
}

export const AVATAR_COLORS = ['#0f766e', '#7c3aed', '#e11d48', '#ea580c', '#2563eb', '#0891b2', '#65a30d', '#c026d3'];

/* ---------------- medicines ---------------- */
export const FOOD_REL: Record<string, string> = {
  before_food: 'Before food', after_food: 'After food', with_food: 'With food', empty_stomach: 'Empty stomach', any: 'Any time',
};
/** Dose for one scheduled time (falls back to the usual dose). */
export const doseFor = (m: Pick<Medicine, 'dose' | 'dose_by_time'>, time: string) => (m.dose_by_time?.[time] || m.dose || '').trim();
/** How many tablets/capsules a dose text means ("2 tablets" → 2, "½ tablet" → 0.5). Defaults to 1. */
export function doseQty(dose: string): number {
  const s = dose.trim().replace(/^half\b/i, '½').replace(/(^|\s)1\/2\b/, '$1½').replace(/(^|\s)1\/4\b/, '$1¼').replace(/(^|\s)3\/4\b/, '$1¾');
  const m = s.match(/^(\d+(?:\.\d+)?)?\s*(½|1\/2|¼|1\/4|¾|3\/4)?/);
  const whole = m?.[1] ? parseFloat(m[1]) : 0;
  const frac = m?.[2] ? ({ '½': .5, '1/2': .5, '¼': .25, '1/4': .25, '¾': .75, '3/4': .75 } as Record<string, number>)[m[2]] : 0;
  return whole + frac || 1;
}
/** "8:00 AM (1 tablet), 9:00 PM (2 tablets)" when doses differ, else "8:00 AM, 9:00 PM". */
export function timesWithDose(m: Pick<Medicine, 'times' | 'dose' | 'dose_by_time'>, tr: (s: string) => string = s => s) {
  const differs = m.times.some(t => m.dose_by_time?.[t] && m.dose_by_time[t] !== m.dose);
  return m.times.map(t => differs ? `${to12h(t)} (${tr(doseFor(m, t))})` : to12h(t)).join(', ');
}

export const MED_FORMS = ['tablet', 'capsule', 'insulin', 'injection', 'syrup', 'inhaler', 'drops', 'other'];

export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function medsForDate(meds: Medicine[], d: Date) {
  const k = dayKey(d), wd = d.getDay();
  const out: { med: Medicine; time: string }[] = [];
  for (const m of meds) {
    if (!m.active) continue;
    if (m.start_date && k < m.start_date) continue;
    if (m.end_date && k > m.end_date) continue;
    if (m.days?.length && !m.days.includes(wd)) continue;
    for (const t of m.times ?? []) out.push({ med: m, time: t });
  }
  return out.sort((a, b) => a.time.localeCompare(b.time));
}

export function adherence(meds: Medicine[], logs: MedicineLog[], days: number) {
  let due = 0, taken = 0;
  const today = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    const k = dayKey(d);
    for (const s of medsForDate(meds, d)) {
      if (i === 0 && s.time > hhmm(today)) continue;
      due++;
      if (logs.some(l => l.medicine_id === s.med.id && l.scheduled_date === k && l.scheduled_time === s.time && l.status === 'taken')) taken++;
    }
  }
  return { due, taken, pct: due ? taken / due * 100 : 100 };
}

export const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
export const to12h = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
export const DAY_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
