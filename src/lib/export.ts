import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format as fmtLocal } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { t } from './i18n';
/** Doctor files (PDF / Excel) stay in English — PDF fonts can't shape Tamil script. */
const format = (d: Date | number, f: string) => fmtLocal(d, f, { locale: enUS });
import type { Meal, Medicine, MedicineLog, Patient, Vital, WaterLog } from './types';
import { adherence, age, bmi, classify, CONDITIONS, ctxLabel, dayKey, eA1c, FOOD_REL, fmtVital, STATUS_STYLE, stats, timeInRange, to12h, VITALS } from './health';

export interface ExportData { vitals: Vital[]; meals: Meal[]; water: WaterLog[]; meds: Medicine[]; medLogs: MedicineLog[] }

export function filterRange(d: ExportData, from: Date, to: Date): ExportData {
  const inR = (s: string) => { const t = +new Date(s); return t >= +from && t <= +to; };
  return {
    vitals: d.vitals.filter(v => inR(v.measured_at)).sort((a, b) => a.measured_at.localeCompare(b.measured_at)),
    meals: d.meals.filter(m => inR(m.eaten_at)).sort((a, b) => a.eaten_at.localeCompare(b.eaten_at)),
    water: d.water.filter(w => inR(w.logged_at)),
    meds: d.meds,
    medLogs: d.medLogs.filter(l => inR(l.scheduled_date + 'T12:00:00')),
  };
}

/** What a share/export contains. Vital kinds plus 'meds' | 'food' | 'water'. */
export type IncludeKey = 'glucose' | 'bp' | 'heart_rate' | 'weight' | 'spo2' | 'hba1c' | 'temperature' | 'meds' | 'food' | 'water';
export const INCLUDE_OPTIONS: { id: IncludeKey; label: string }[] = [
  { id: 'glucose', label: 'Blood sugar' }, { id: 'bp', label: 'BP' }, { id: 'heart_rate', label: 'Heart rate' },
  { id: 'weight', label: 'Weight' }, { id: 'spo2', label: 'SpO₂' }, { id: 'hba1c', label: 'HbA1c' },
  { id: 'temperature', label: 'Temperature' }, { id: 'meds', label: 'Medicines' }, { id: 'food', label: 'Food' }, { id: 'water', label: 'Water' },
];
export function applyInclude(d: ExportData, inc: Set<IncludeKey>): ExportData {
  return {
    vitals: d.vitals.filter(v => inc.has(v.kind as IncludeKey)),
    meals: inc.has('food') ? d.meals : [],
    water: inc.has('water') ? d.water : [],
    meds: inc.has('meds') ? d.meds : [],
    medLogs: inc.has('meds') ? d.medLogs : [],
  };
}

export function summarize(p: Patient, d: ExportData, days: number) {
  const g = d.vitals.filter(v => v.kind === 'glucose');
  const gs = stats(g.map(v => Number(v.value1)));
  const fast = stats(g.filter(v => v.context === 'fasting').map(v => Number(v.value1)));
  const pp = stats(g.filter(v => v.context === 'after_meal').map(v => Number(v.value1)));
  const bp = d.vitals.filter(v => v.kind === 'bp');
  const sys = stats(bp.map(v => Number(v.value1))), dia = stats(bp.map(v => Number(v.value2)));
  const hr = stats(d.vitals.filter(v => v.kind === 'heart_rate').map(v => Number(v.value1)));
  const wts = d.vitals.filter(v => v.kind === 'weight');
  const spo2 = stats(d.vitals.filter(v => v.kind === 'spo2').map(v => Number(v.value1)));
  const a1c = [...d.vitals].reverse().find(v => v.kind === 'hba1c');
  const dayCount = new Set(d.meals.map(m => dayKey(new Date(m.eaten_at)))).size || 1;
  const kcal = d.meals.reduce((a, b) => a + Number(b.total_kcal), 0) / dayCount;
  const waterDays = new Set(d.water.map(w => dayKey(new Date(w.logged_at)))).size || 1;
  const water = d.water.reduce((a, b) => a + b.ml, 0) / waterDays;
  return {
    g, gs, fast, pp, tir: timeInRange(g), eA1c: gs.n >= 10 ? eA1c(gs.avg) : null,
    bp, sys, dia, hr, weight: wts.length ? Number(wts[wts.length - 1].value1) : null, weightChange: wts.length > 1 ? Number(wts[wts.length - 1].value1) - Number(wts[0].value1) : null,
    spo2, a1c, kcal: d.meals.length ? kcal : null, water: d.water.length ? water : null,
    adh: adherence(d.meds, d.medLogs, Math.min(days, 90)),
    hypos: g.filter(v => v.value1 < 70).length,
  };
}

const vitalRows = (p: Patient, vs: Vital[]) => vs.map(v => ({
  Date: format(new Date(v.measured_at), 'dd-MM-yyyy'),
  Time: format(new Date(v.measured_at), 'hh:mm a'),
  Type: VITALS[v.kind].label,
  Reading: fmtVital(v),
  Unit: VITALS[v.kind].unit,
  Pulse: v.kind === 'bp' && v.value3 ? Math.round(v.value3) : '',
  When: ctxLabel(v.context),
  Status: STATUS_STYLE[classify(v, p)].label,
  Notes: v.notes ?? '',
}));

export function toExcel(p: Patient, d: ExportData, from: Date, to: Date): Blob {
  const wb = XLSX.utils.book_new();
  const s = summarize(p, d, Math.round((+to - +from) / 864e5));
  const add = (name: string, rows: Record<string, unknown>[], widths?: number[]) => {
    if (name === 'Summary') rows = rows.filter(r => r.Value !== '' && r.Value !== 0 && r.Value != null);
    if (!rows.length && name !== 'Summary') return; // only include sheets that have data
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Info: 'No data in this period' }]);
    if (widths) ws['!cols'] = widths.map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  };
  add('Summary', [
    { Item: 'Name', Value: p.full_name }, { Item: 'Age', Value: age(p.dob) ?? '' }, { Item: 'Gender', Value: p.gender ?? '' },
    { Item: 'Condition', Value: CONDITIONS[p.condition].label }, { Item: 'Heart conditions', Value: p.heart_conditions ?? '' },
    { Item: 'Period', Value: `${format(from, 'dd MMM yyyy')} – ${format(to, 'dd MMM yyyy')}` },
    { Item: 'Sugar readings', Value: s.gs.n }, { Item: 'Average sugar (mg/dL)', Value: s.gs.n ? Math.round(s.gs.avg) : '' },
    { Item: 'Fasting average (mg/dL)', Value: s.fast.n ? Math.round(s.fast.avg) : '' }, { Item: 'After-meal average (mg/dL)', Value: s.pp.n ? Math.round(s.pp.avg) : '' },
    { Item: 'Time in range 70–180 (%)', Value: s.gs.n ? Math.round(s.tir.inRange) : '' }, { Item: 'Low readings (<70)', Value: s.hypos },
    { Item: 'Estimated HbA1c (%)', Value: s.eA1c ? +s.eA1c.toFixed(1) : '' }, { Item: 'Latest lab HbA1c (%)', Value: s.a1c ? Number(s.a1c.value1) : '' },
    { Item: 'Average BP (mmHg)', Value: s.sys.n ? `${Math.round(s.sys.avg)}/${Math.round(s.dia.avg)}` : '' },
    { Item: 'Average heart rate (bpm)', Value: s.hr.n ? Math.round(s.hr.avg) : '' }, { Item: 'Latest weight (kg)', Value: s.weight ?? '' },
    { Item: 'Medicine adherence (%)', Value: s.adh.due ? Math.round(s.adh.pct) : '' },
    { Item: 'Avg calories / day', Value: s.kcal ? Math.round(s.kcal) : '' }, { Item: 'Avg water / day (ml)', Value: s.water ? Math.round(s.water) : '' },
  ], [28, 40]);
  add('All vitals', vitalRows(p, d.vitals), [12, 10, 16, 10, 8, 7, 16, 11, 30]);
  add('Blood sugar', d.vitals.filter(v => v.kind === 'glucose').map(v => ({ Date: format(new Date(v.measured_at), 'dd-MM-yyyy'), Time: format(new Date(v.measured_at), 'hh:mm a'), 'mg/dL': Number(v.value1), When: ctxLabel(v.context), Status: STATUS_STYLE[classify(v, p)].label, Notes: v.notes ?? '' })), [12, 10, 8, 16, 11, 30]);
  add('Blood pressure', d.vitals.filter(v => v.kind === 'bp').map(v => ({ Date: format(new Date(v.measured_at), 'dd-MM-yyyy'), Time: format(new Date(v.measured_at), 'hh:mm a'), Systolic: Number(v.value1), Diastolic: Number(v.value2), Pulse: v.value3 ?? '', Status: STATUS_STYLE[classify(v, p)].label })), [12, 10, 9, 9, 7, 11]);
  add('Medicines', d.meds.map(m => ({ Medicine: m.name, Strength: m.strength ?? '', Composition: m.composition ?? '', Dose: m.dose ?? '', Times: m.times.map(to12h).join(', '), Take: FOOD_REL[m.food_relation ?? ''] ?? '', For: m.purpose ?? '', Active: m.active ? 'Yes' : 'No', 'Stock left': m.stock ?? '' })), [24, 12, 14, 24, 14, 16, 7, 9]);
  add('Medicine log', d.medLogs.map(l => ({ Date: l.scheduled_date, Time: to12h(l.scheduled_time), Medicine: d.meds.find(m => m.id === l.medicine_id)?.name ?? '', Status: l.status })), [12, 10, 24, 8]);
  add('Food', d.meals.flatMap(m => m.items.map(it => ({ Date: format(new Date(m.eaten_at), 'dd-MM-yyyy'), Time: format(new Date(m.eaten_at), 'hh:mm a'), Meal: m.meal_type, Food: it.name, Qty: it.qty, Unit: it.unit, Calories: Math.round(it.kcal), 'Carbs (g)': it.carbs, 'Protein (g)': it.protein }))), [12, 10, 10, 28, 5, 10, 9, 9, 10]);
  const waterByDay: Record<string, number> = {};
  for (const w of d.water) { const k = format(new Date(w.logged_at), 'dd-MM-yyyy'); waterByDay[k] = (waterByDay[k] ?? 0) + w.ml; }
  add('Water', Object.entries(waterByDay).map(([Date, ml]) => ({ Date, 'Total (ml)': ml })), [12, 12]);
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export function toCSV(p: Patient, d: ExportData): Blob {
  const ws = XLSX.utils.json_to_sheet(vitalRows(p, d.vitals));
  return new Blob(['﻿' + XLSX.utils.sheet_to_csv(ws)], { type: 'text/csv;charset=utf-8' });
}

export function toPDF(p: Patient, d: ExportData, from: Date, to: Date, charts: { title: string; img: string; w: number; h: number }[]): Blob {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth(), M = 40;
  const s = summarize(p, d, Math.round((+to - +from) / 864e5));
  const teal: [number, number, number] = [13, 102, 97];

  // header band
  doc.setFillColor(...teal); doc.rect(0, 0, W, 96, 'F');
  doc.setFillColor(20, 184, 166); doc.circle(W - 30, 0, 90, 'F');
  doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.text('Health Report', M, 44);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5);
  doc.text(`${p.full_name}  ·  ${format(from, 'd MMM yyyy')} – ${format(to, 'd MMM yyyy')}`, M, 66);
  doc.text(`Generated ${format(new Date(), 'd MMM yyyy, h:mm a')} · VitalNest`, M, 82);

  // patient block
  let y = 122;
  doc.setTextColor(15, 23, 42); doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text('Patient', M, y);
  const b = bmi(p);
  const info: [string, string][] = [
    ['Age / Gender', [age(p.dob) !== null ? `${age(p.dob)} yrs` : '', p.gender].filter(Boolean).join(' / ') || '—'],
    ['Condition', CONDITIONS[p.condition].label + (p.diagnosed_year ? ` (since ${p.diagnosed_year})` : '')],
    ['Height / Weight', [p.height_cm ? `${p.height_cm} cm` : '', p.weight_kg ? `${p.weight_kg} kg` : '', b ? `BMI ${b.toFixed(1)}` : ''].filter(Boolean).join(' · ') || '—'],
    ['Blood group', p.blood_group || '—'],
    ['Heart conditions', p.heart_conditions || '—'], ['Other conditions', p.other_conditions || '—'],
    ['Allergies', p.allergies || '—'], ['Doctor', [p.doctor_name, p.doctor_phone].filter(Boolean).join(' · ') || '—'],
  ];
  autoTable(doc, { startY: y + 8, body: info, theme: 'plain', styles: { fontSize: 9.5, cellPadding: 3 }, columnStyles: { 0: { textColor: [100, 116, 139], cellWidth: 110 }, 1: { textColor: [15, 23, 42] } }, margin: { left: M, right: M } });
  y = (doc as any).lastAutoTable.finalY + 18;

  // summary tiles
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text('Summary', M, y); y += 10;
  const tiles: [string, string][] = [
    ['Avg sugar', s.gs.n ? `${Math.round(s.gs.avg)} mg/dL` : '—'], ['Fasting avg', s.fast.n ? `${Math.round(s.fast.avg)}` : '—'], ['After-meal avg', s.pp.n ? `${Math.round(s.pp.avg)}` : '—'],
    ['Time in range', s.gs.n ? `${Math.round(s.tir.inRange)}%` : '—'], ['Est. HbA1c', s.eA1c ? `${s.eA1c.toFixed(1)}%` : '—'], ['Lab HbA1c', s.a1c ? `${Number(s.a1c.value1).toFixed(1)}%` : '—'],
    ['Avg BP', s.sys.n ? `${Math.round(s.sys.avg)}/${Math.round(s.dia.avg)}` : '—'], ['Avg pulse', s.hr.n ? `${Math.round(s.hr.avg)} bpm` : '—'], ['Med adherence', s.adh.due ? `${Math.round(s.adh.pct)}%` : '—'],
  ];
  const shown = tiles.filter(([, v]) => v !== '—');
  const tw = (W - 2 * M - 16) / 3, th = 46;
  shown.forEach(([l, v], i) => {
    const cx = M + (i % 3) * (tw + 8), cy = y + Math.floor(i / 3) * (th + 8);
    doc.setFillColor(241, 245, 249); doc.roundedRect(cx, cy, tw, th, 8, 8, 'F');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(100, 116, 139); doc.text(l, cx + 10, cy + 16);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(15, 23, 42); doc.text(v, cx + 10, cy + 36);
  });
  y += Math.ceil(shown.length / 3) * (th + 8) + 6;
  if (s.hypos) { doc.setFontSize(9); doc.setTextColor(185, 28, 28); doc.text(`${s.hypos} low sugar reading(s) below 70 mg/dL in this period.`, M, y); y += 14; }

  // charts
  for (const c of charts) {
    const w = W - 2 * M, h = w * (c.h / c.w);
    if (y + h + 30 > doc.internal.pageSize.getHeight() - 40) { doc.addPage(); y = 50; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(15, 23, 42); doc.text(c.title, M, y + 4);
    doc.addImage(c.img, 'PNG', M, y + 12, w, h);
    y += h + 30;
  }

  // medicines
  const sectionTable = (title: string, head: string[], body: (string | number)[][]) => {
    if (!body.length) return;
    if (y > doc.internal.pageSize.getHeight() - 120) { doc.addPage(); y = 50; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(15, 23, 42); doc.text(title, M, y);
    autoTable(doc, { startY: y + 8, head: [head], body, theme: 'grid', headStyles: { fillColor: teal, fontSize: 9 }, styles: { fontSize: 8.5, cellPadding: 4 }, alternateRowStyles: { fillColor: [248, 250, 252] }, margin: { left: M, right: M } });
    y = (doc as any).lastAutoTable.finalY + 22;
  };
  sectionTable('Current medicines', ['Medicine', 'Strength', 'Composition', 'Dose', 'Times', 'Take', 'For'], d.meds.filter(m => m.active).map(m => [m.name, m.strength ?? '', m.composition ?? '', m.dose ?? '', m.times.map(to12h).join(', '), FOOD_REL[m.food_relation ?? ''] ?? '', m.purpose ?? '']));
  sectionTable('Blood sugar readings', ['Date', 'Time', 'mg/dL', 'When', 'Status', 'Notes'], d.vitals.filter(v => v.kind === 'glucose').slice(-150).reverse().map(v => [format(new Date(v.measured_at), 'dd MMM'), format(new Date(v.measured_at), 'h:mm a'), Math.round(v.value1), ctxLabel(v.context), STATUS_STYLE[classify(v, p)].label, v.notes ?? '']));
  sectionTable('Blood pressure readings', ['Date', 'Time', 'BP (mmHg)', 'Pulse', 'Status'], d.vitals.filter(v => v.kind === 'bp').slice(-120).reverse().map(v => [format(new Date(v.measured_at), 'dd MMM'), format(new Date(v.measured_at), 'h:mm a'), `${Math.round(v.value1)}/${Math.round(Number(v.value2))}`, v.value3 ? Math.round(v.value3) : '', STATUS_STYLE[classify(v, p)].label]));
  sectionTable('Other vitals', ['Date', 'Time', 'Type', 'Reading', 'Status'], d.vitals.filter(v => !['glucose', 'bp'].includes(v.kind)).slice(-120).reverse().map(v => [format(new Date(v.measured_at), 'dd MMM'), format(new Date(v.measured_at), 'h:mm a'), VITALS[v.kind].label, `${fmtVital(v)} ${VITALS[v.kind].unit}`, STATUS_STYLE[classify(v, p)].label]));
  const byDay: Record<string, { kcal: number; carbs: number; water: number }> = {};
  for (const m of d.meals) { const k = format(new Date(m.eaten_at), 'yyyy-MM-dd'); (byDay[k] ??= { kcal: 0, carbs: 0, water: 0 }); byDay[k].kcal += Number(m.total_kcal); byDay[k].carbs += Number(m.total_carbs); }
  for (const w of d.water) { const k = format(new Date(w.logged_at), 'yyyy-MM-dd'); (byDay[k] ??= { kcal: 0, carbs: 0, water: 0 }); byDay[k].water += w.ml; }
  sectionTable('Daily food & water', ['Date', 'Calories', 'Carbs (g)', 'Water (ml)'], Object.entries(byDay).sort().reverse().map(([k, v]) => [format(new Date(k), 'dd MMM yyyy'), Math.round(v.kcal) || '—', Math.round(v.carbs) || '—', v.water || '—']));

  // footer on each page
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    const H = doc.internal.pageSize.getHeight();
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(148, 163, 184);
    doc.text('Self-recorded readings. For discussion with your doctor; not a medical diagnosis.', M, H - 20);
    doc.text(`Page ${i} of ${n}`, W - M, H - 20, { align: 'right' });
  }
  return doc.output('blob');
}

export function summaryText(p: Patient, d: ExportData, days: number): string {
  const s = summarize(p, d, days);
  const lastG = [...s.g].reverse()[0];
  const lastBP = [...s.bp].reverse()[0];
  const L: string[] = [];
  L.push(t('🩺 *{name} — Health update*', { name: p.full_name }));
  L.push(`_${t('{condition} · last {n} days', { condition: t(CONDITIONS[p.condition].label), n: days })}_`);
  L.push('');
  if (s.gs.n) {
    L.push(t('🩸 *Blood sugar*'));
    if (lastG) L.push(t('• Latest: *{v} mg/dL* ({when}, {date})', { v: Math.round(lastG.value1), when: t(ctxLabel(lastG.context) || 'Random'), date: fmtLocal(new Date(lastG.measured_at), 'd MMM h:mm a') }));
    L.push(t('• Average: {v} mg/dL', { v: Math.round(s.gs.avg) }) + (s.fast.n ? ' · ' + t('Fasting {v}', { v: Math.round(s.fast.avg) }) : '') + (s.pp.n ? ' · ' + t('After meal {v}', { v: Math.round(s.pp.avg) }) : ''));
    L.push(t('• In range (70–180): *{v}%*', { v: Math.round(s.tir.inRange) }) + (s.hypos ? ' · ⚠️ ' + t('{n} low', { n: s.hypos }) : ''));
    if (s.eA1c) L.push(t('• Est. HbA1c: {v}%', { v: s.eA1c.toFixed(1) }) + (s.a1c ? ' · ' + t('Lab: {v}%', { v: Number(s.a1c.value1).toFixed(1) }) : ''));
    L.push('');
  }
  if (s.sys.n) {
    L.push(t('❤️ *BP & heart*'));
    if (lastBP) L.push(t('• Latest BP: *{v}*', { v: `${Math.round(lastBP.value1)}/${Math.round(Number(lastBP.value2))}` }) + (lastBP.value3 ? ' · ' + t('Pulse {v}', { v: Math.round(lastBP.value3) }) : ''));
    L.push(t('• Average BP: {v} mmHg', { v: `${Math.round(s.sys.avg)}/${Math.round(s.dia.avg)}` }) + (s.hr.n ? ' · ' + t('Pulse {v} bpm', { v: Math.round(s.hr.avg) }) : ''));
    L.push('');
  }
  if (s.hr.n && !s.sys.n) L.push(t('❤️ Average pulse: {v} bpm', { v: Math.round(s.hr.avg) }));
  if (s.spo2.n) L.push(t('🫁 SpO₂: average {v}% (lowest {m}%)', { v: Math.round(s.spo2.avg), m: Math.round(s.spo2.min) }));
  if (s.a1c && !s.gs.n) L.push(t('🧪 Latest HbA1c: {v}% ({date})', { v: Number(s.a1c.value1).toFixed(1), date: fmtLocal(new Date(s.a1c.measured_at), 'd MMM yyyy') }));
  const temps = d.vitals.filter(v => v.kind === 'temperature');
  if (temps.length) L.push(t('🌡️ Latest temperature: {v} °F', { v: Number(temps[temps.length - 1].value1).toFixed(1) }));
  if (s.weight) L.push(t('⚖️ Weight: {v} kg', { v: s.weight.toFixed(1) }) + (s.weightChange ? ` (${s.weightChange > 0 ? '+' : ''}${s.weightChange.toFixed(1)} kg)` : ''));
  if (s.adh.due) L.push(t('💊 Medicines taken: {p}% ({a}/{b} doses)', { p: Math.round(s.adh.pct), a: s.adh.taken, b: s.adh.due }));
  const active = d.meds.filter(m => m.active);
  if (active.length) {
    L.push('');
    L.push(t('💊 *Current medicines*'));
    const DN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (const m of active) L.push(`• *${m.name}*${m.strength ? ` ${m.strength}` : ''}${m.dose ? ` — ${m.dose}` : ''} · ${m.times.map(to12h).join(', ')}${m.food_relation ? ` · ${t(FOOD_REL[m.food_relation] ?? '')}` : ''}${m.days?.length && m.days.length < 7 ? ` · ${m.days.map(x => t(DN[x])).join('/')}` : ''}`);
  }
  if (s.kcal) L.push(t('🍽️ Avg calories: {v} kcal/day', { v: Math.round(s.kcal) }));
  if (s.water) L.push(t('💧 Avg water: {v} L/day', { v: (s.water / 1000).toFixed(1) }));
  L.push('');
  L.push(t('_Shared from VitalNest_'));
  return L.join('\n');
}
