/* Offline demo backend: same API as the cloud, data stays in this browser only. */
import type { Api } from './api';
import type { CustomFood, Family, Medicine, Patient, PatientTable, Person, Report, Vital } from './types';
import { defaultReminders, defaultTargets, dayKey, medsForDate } from './health';

interface DB {
  user: { id: string; username: string; display_name: string } | null;
  families: Family[];
  members: { family_id: string; user_id: string; role: 'admin' | 'caregiver' | 'viewer' }[];
  patients: Patient[];
  tables: Record<PatientTable, any[]>;
  custom_foods: CustomFood[];
  files: Record<string, string>; // path → dataURL
}
const KEY = 'vn_demo_db';
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
const listeners = new Set<() => void>();
let mem: DB | null = null;

function load(): DB {
  if (mem) return mem;
  try { const raw = localStorage.getItem(KEY); if (raw) { mem = JSON.parse(raw); return mem!; } } catch { /* ignore */ }
  mem = seed();
  save();
  return mem;
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch { /* storage full or blocked: keep in memory */ }
}
const tick = () => new Promise(r => setTimeout(r, 60));

function rnd(seed: number) { let s = seed; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; }

function seed(): DB {
  const userId = 'demo-user';
  const fam: Family = { id: 'demo-family', name: 'Sharma Family', invite_code: 'DEMO42', created_by: userId };
  const mk = (p: Partial<Patient>): Patient => ({
    id: uid(), family_id: fam.id, condition: 'type2', target_fasting_min: 80, target_fasting_max: 130, target_pp_max: 180,
    target_sys_max: 130, target_dia_max: 80, target_hr_min: 60, target_hr_max: 100, daily_kcal_goal: 1800, daily_water_goal_ml: 2500,
    color: '#0f766e', ...defaultTargets(p.condition ?? 'type2'), ...p,
  } as Patient);
  const dad = mk({ full_name: 'Rajesh Sharma', relation: 'Father', dob: '1962-03-14', gender: 'Male', blood_group: 'B+', height_cm: 170, weight_kg: 78, condition: 'type2_cardiac', diagnosed_year: 2009, heart_conditions: 'Coronary artery disease, stent (2021)', other_conditions: 'Hypertension', doctor_name: 'Dr. Meera Iyer', doctor_phone: '+91 98450 00000', color: '#0f766e', daily_kcal_goal: 1700, linked_user_id: userId });
  const mom = mk({ full_name: 'Lakshmi Sharma', relation: 'Mother', dob: '1966-08-02', gender: 'Female', blood_group: 'O+', height_cm: 156, weight_kg: 64, condition: 'type2', diagnosed_year: 2015, other_conditions: 'Hypothyroid', color: '#7c3aed', daily_kcal_goal: 1500 });
  const son = mk({ full_name: 'Arjun Sharma', relation: 'Son', dob: '1999-11-20', gender: 'Male', blood_group: 'B+', height_cm: 178, weight_kg: 70, condition: 'type1', diagnosed_year: 2011, insulin_regimen: 'Basal-bolus (Glargine + Aspart)', color: '#e11d48', daily_kcal_goal: 2300, daily_water_goal_ml: 3000 });
  const patients = [dad, mom, son];

  const vitals: Vital[] = [], meals: any[] = [], water: any[] = [], meds: Medicine[] = [], medLogs: any[] = [], reminders: any[] = [];
  const r = rnd(7);
  const now = new Date();
  const at = (daysAgo: number, h: number, m = 0) => { const d = new Date(now); d.setDate(d.getDate() - daysAgo); d.setHours(h, m + Math.floor(r() * 15), 0, 0); return d; };
  for (const p of patients) {
    const base = p.condition === 'type1' ? 150 : p.condition === 'type2_cardiac' ? 135 : 120;
    const spread = p.condition === 'type1' ? 70 : 35;
    for (let d = 60; d >= 0; d--) {
      const improve = (60 - d) * 0.25;
      const push = (kind: Vital['kind'], dt: Date, v1: number, extra: Partial<Vital> = {}) => {
        if (dt > now) return;
        vitals.push({ id: uid(), patient_id: p.id, kind, value1: v1, measured_at: dt.toISOString(), ...extra });
      };
      push('glucose', at(d, 7), Math.round(base - 15 - improve + (r() - .5) * spread), { context: 'fasting' });
      push('glucose', at(d, 15), Math.round(base + 35 - improve + (r() - .5) * spread * 1.4), { context: 'after_meal' });
      if (p.condition === 'type1') {
        push('glucose', at(d, 13), Math.round(base - improve + (r() - .5) * spread * 1.6), { context: 'before_meal' });
        push('glucose', at(d, 22, 30), Math.round(base + 10 - improve + (r() - .5) * spread * 1.8), { context: 'bedtime' });
      }
      if (p.condition === 'type2_cardiac' || d % 3 === 0) {
        const sys = Math.round(136 - improve * .3 + (r() - .5) * 16), dia = Math.round(86 - improve * .15 + (r() - .5) * 10);
        const hr = Math.round(76 + (r() - .5) * 14);
        push('bp', at(d, 8), sys, { value2: dia, value3: hr });
        push('heart_rate', at(d, 8, 1), hr);
        if (p.condition === 'type2_cardiac') {
          push('bp', at(d, 20), sys - 4 + Math.round((r() - .5) * 8), { value2: dia - 2, value3: hr - 3 });
          push('weight', at(d, 7, 15), +(p.weight_kg! + 1.5 - (60 - d) * 0.03 + (r() - .5) * .6).toFixed(1));
          if (d % 2 === 0) push('spo2', at(d, 8, 2), Math.round(96 + r() * 3));
        }
      }
      if (d % 7 === 0 && p.condition !== 'type2_cardiac') push('weight', at(d, 7, 15), +(p.weight_kg! + (r() - .5)).toFixed(1));
      // water
      const glasses = 5 + Math.floor(r() * 5);
      for (let g = 0; g < glasses; g++) { const dt = at(d, 8 + g * 1.5); if (dt <= now) water.push({ id: uid(), patient_id: p.id, ml: 250, logged_at: dt.toISOString() }); }
      // meals
      const day = [
        ['breakfast', 8, [{ name: 'Idli', qty: 3, unit: 'pc', kcal: 174, carbs: 36, protein: 6 }, { name: 'Sambar', qty: 1, unit: 'bowl', kcal: 130, carbs: 18, protein: 6 }]],
        ['lunch', 13, [{ name: 'Chapati', qty: 2, unit: 'pc', kcal: 240, carbs: 46, protein: 8 }, { name: 'Dal (cooked)', qty: 1, unit: 'bowl', kcal: 180, carbs: 24, protein: 10 }, { name: 'Mixed vegetable sabzi', qty: 1, unit: 'bowl', kcal: 140, carbs: 14, protein: 4 }]],
        ['snack', 17, [{ name: 'Tea with milk (no sugar)', qty: 1, unit: 'cup', kcal: 45, carbs: 4, protein: 2 }, { name: 'Roasted chana', qty: 1, unit: 'handful', kcal: 110, carbs: 18, protein: 6 }]],
        ['dinner', 20, [{ name: 'Brown rice', qty: 1, unit: 'cup', kcal: 215, carbs: 45, protein: 5 }, { name: 'Curd (plain)', qty: 1, unit: 'bowl', kcal: 100, carbs: 7, protein: 6 }]],
      ] as const;
      if (d <= 14) for (const [mt, h, items] of day) {
        const dt = at(d, h); if (dt > now) continue;
        const its = items.map(i => ({ ...i }));
        meals.push({ id: uid(), patient_id: p.id, meal_type: mt, items: its, total_kcal: its.reduce((a, b) => a + b.kcal, 0), total_carbs: its.reduce((a, b) => a + b.carbs, 0), total_protein: its.reduce((a, b) => a + b.protein, 0), eaten_at: dt.toISOString() });
      }
    }
    vitals.push({ id: uid(), patient_id: p.id, kind: 'hba1c', value1: p.condition === 'type1' ? 7.6 : 7.1, measured_at: at(45, 10).toISOString() });
    vitals.push({ id: uid(), patient_id: p.id, kind: 'hba1c', value1: p.condition === 'type1' ? 7.1 : 6.8, measured_at: at(3, 10).toISOString() });
    for (const rem of defaultReminders(p.condition)) reminders.push({ id: uid(), patient_id: p.id, ...rem });
  }
  const med = (p: Patient, m: Partial<Medicine>) => meds.push({ id: uid(), patient_id: p.id, form: 'tablet', days: [0, 1, 2, 3, 4, 5, 6], active: true, times: [], food_relation: 'after_food', start_date: dayKey(at(70, 0)), ...m } as Medicine);
  med(dad, { name: 'Metformin', strength: '500 mg', dose: '1 tablet', times: ['08:30', '20:30'], purpose: 'Diabetes', stock: 42 });
  med(dad, { name: 'Aspirin (Ecosprin)', strength: '75 mg', dose: '1 tablet', times: ['14:00'], purpose: 'Heart / blood thinner', stock: 20 });
  med(dad, { name: 'Atorvastatin', strength: '20 mg', dose: '1 tablet', times: ['21:30'], purpose: 'Cholesterol', stock: 25 });
  med(dad, { name: 'Telmisartan', strength: '40 mg', dose: '1 tablet', times: ['08:30'], food_relation: 'any', purpose: 'Blood pressure', stock: 8 });
  med(mom, { name: 'Glimepiride + Metformin', strength: '1/500 mg', dose: '1 tablet', times: ['08:00'], food_relation: 'before_food', purpose: 'Diabetes' });
  med(mom, { name: 'Thyroxine', strength: '50 mcg', dose: '1 tablet', times: ['06:30'], food_relation: 'empty_stomach', purpose: 'Thyroid' });
  med(son, { name: 'Insulin Glargine', strength: '100 U/mL', form: 'insulin', dose: '18 units', times: ['22:00'], food_relation: 'any', purpose: 'Basal insulin' });
  med(son, { name: 'Insulin Aspart', strength: '100 U/mL', form: 'insulin', dose: 'As per carbs (≈6 units)', times: ['08:00', '13:00', '20:00'], food_relation: 'before_food', purpose: 'Meal insulin' });
  for (let d = 30; d >= 0; d--) {
    const dt = at(d, 0);
    for (const s of medsForDate(meds, dt)) {
      const [h, m] = s.time.split(':').map(Number);
      const when = new Date(dt); when.setHours(h, m);
      if (when > now) continue;
      if (r() < 0.9) medLogs.push({ id: uid(), medicine_id: s.med.id, patient_id: s.med.patient_id, scheduled_date: dayKey(dt), scheduled_time: s.time, status: 'taken', logged_at: when.toISOString() });
    }
  }
  return {
    user: null,
    families: [fam],
    members: [{ family_id: fam.id, user_id: userId, role: 'admin' }],
    patients,
    tables: { vitals, meals, water_logs: water, medicines: meds, medicine_logs: medLogs, reminders, reports: [] },
    custom_foods: [],
    files: {},
  };
}

export function demoApi(): Api {
  return {
    mode: 'demo',
    async currentUser() { const db = load(); return db.user; },
    onAuthChange(cb) { listeners.add(cb); return () => { listeners.delete(cb); }; },
    async signIn(username) { const db = load(); db.user = { id: 'demo-user', username: username || 'demo', display_name: 'Demo User' }; save(); listeners.forEach(l => l()); },
    async signUp(username, _pw, displayName) { const db = load(); db.user = { id: 'demo-user', username, display_name: displayName }; save(); listeners.forEach(l => l()); },
    async signOut() { const db = load(); db.user = null; save(); listeners.forEach(l => l()); },
    async changePassword() { await tick(); },

    async myFamilies() { const db = load(); return db.members.filter(m => m.user_id === db.user?.id).map(m => ({ role: m.role, family: db.families.find(f => f.id === m.family_id)! })).filter(x => x.family); },
    async createFamily(name) { const db = load(); const f = { id: uid(), name, invite_code: Math.random().toString(36).slice(2, 8).toUpperCase() }; db.families.push(f); db.members.push({ family_id: f.id, user_id: db.user!.id, role: 'admin' }); save(); return f; },
    async joinFamily(code) { const db = load(); const f = db.families.find(x => x.invite_code === code.trim().toUpperCase()); if (!f) throw new Error('Invalid invite code'); if (!db.members.some(m => m.family_id === f.id && m.user_id === db.user!.id)) db.members.push({ family_id: f.id, user_id: db.user!.id, role: 'viewer' }); save(); return f; },
    async renameFamily(id, name) { const db = load(); const f = db.families.find(x => x.id === id); if (f) f.name = name; save(); },
    async familyPeople(fid) {
      const db = load();
      const ppl: Person[] = db.members.filter(m => m.family_id === fid).map(m => ({ user_id: m.user_id, username: m.user_id === db.user?.id ? db.user.username : m.user_id, display_name: m.user_id === db.user?.id ? db.user.display_name : null, role: m.role, joined_at: new Date().toISOString() }));
      if (fid === 'demo-family') ppl.push({ user_id: 'demo-2', username: 'priya', display_name: 'Priya (daughter, Pune)', role: 'viewer', joined_at: new Date().toISOString() }, { user_id: 'demo-3', username: 'lakshmi', display_name: 'Lakshmi', role: 'caregiver', joined_at: new Date().toISOString() });
      return ppl;
    },
    async setRole(fid, u, role) { const db = load(); const m = db.members.find(x => x.family_id === fid && x.user_id === u); if (m) m.role = role; save(); },
    async removeMember(fid, u) { const db = load(); db.members = db.members.filter(x => !(x.family_id === fid && x.user_id === u)); save(); },

    async patients(fid) { await tick(); return load().patients.filter(p => p.family_id === fid); },
    async savePatient(p) {
      const db = load();
      if (p.id) { const i = db.patients.findIndex(x => x.id === p.id); db.patients[i] = { ...db.patients[i], ...p } as Patient; save(); return db.patients[i]; }
      const np = { ...p, id: uid(), created_at: new Date().toISOString() } as Patient; db.patients.push(np); save(); return np;
    },
    async deletePatient(id) { const db = load(); db.patients = db.patients.filter(p => p.id !== id); for (const t of Object.keys(db.tables) as PatientTable[]) db.tables[t] = db.tables[t].filter(r => r.patient_id !== id); save(); },

    async list<T>(table: PatientTable, ids: string[], since?: string, timeCol?: string) {
      await tick();
      let rows = load().tables[table].filter(r => ids.includes(r.patient_id));
      if (since && timeCol) rows = rows.filter(r => r[timeCol] >= since);
      if (timeCol) rows = [...rows].sort((a, b) => (b[timeCol] > a[timeCol] ? 1 : -1));
      return JSON.parse(JSON.stringify(rows)) as T[];
    },
    async insert<T>(table: PatientTable, row: Partial<T>) {
      const db = load();
      const r: any = { id: uid(), ...row };
      if (table === 'vitals' && !r.measured_at) r.measured_at = new Date().toISOString();
      if (table === 'meals' && !r.eaten_at) r.eaten_at = new Date().toISOString();
      if (table === 'water_logs' && !r.logged_at) r.logged_at = new Date().toISOString();
      if (table === 'reports') r.created_at = new Date().toISOString();
      db.tables[table].push(r); save(); return r as T;
    },
    async update<T>(table: PatientTable, id: string, patch: Partial<T>) { const db = load(); const r = db.tables[table].find(x => x.id === id); Object.assign(r, patch); save(); return r as T; },
    async remove(table, id) { const db = load(); db.tables[table] = db.tables[table].filter(x => x.id !== id); save(); },
    async upsertMedLog(row) {
      const db = load(); const t = db.tables.medicine_logs;
      const ex = t.find(l => l.medicine_id === row.medicine_id && l.scheduled_date === row.scheduled_date && l.scheduled_time === row.scheduled_time);
      if (ex) Object.assign(ex, row, { logged_at: new Date().toISOString() }); else t.push({ id: uid(), ...row, logged_at: new Date().toISOString() });
      save();
    },
    async deleteMedLog(mid, date, time) { const db = load(); db.tables.medicine_logs = db.tables.medicine_logs.filter(l => !(l.medicine_id === mid && l.scheduled_date === date && l.scheduled_time === time)); save(); },

    async customFoods(fid) { return load().custom_foods.filter(f => f.family_id === fid); },
    async addCustomFood(f) { const db = load(); const n = { ...f, id: uid() }; db.custom_foods.push(n); save(); return n; },

    async uploadReport(pid, file, meta) {
      const db = load();
      const path = `${pid}/${Date.now()}-${file.name}`;
      if (file.size < 1.5e6) {
        db.files[path] = await new Promise<string>(res => { const fr = new FileReader(); fr.onload = () => res(fr.result as string); fr.readAsDataURL(file); });
      }
      const rep = { id: uid(), patient_id: pid, file_path: path, file_name: file.name, mime_type: file.type, size_bytes: file.size, created_at: new Date().toISOString(), ...meta } as Report;
      db.tables.reports.push(rep); save(); return rep;
    },
    async reportUrl(r) { const u = load().files[r.file_path]; if (!u) throw new Error('In demo mode only files under 1.5 MB are kept.'); return u; },
    async deleteReport(r) { const db = load(); delete db.files[r.file_path]; db.tables.reports = db.tables.reports.filter(x => x.id !== r.id); save(); },

    subscribe() { return () => { }; },
  };
}

export function resetDemo() { mem = null; try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
