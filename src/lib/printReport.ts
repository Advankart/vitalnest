import { format } from 'date-fns';
import type { Patient } from './types';
import { type ExportData, summarize } from './export';
import { age, bmi, classify, CONDITIONS, ctxLabel, FOOD_REL, fmtVital, STATUS_STYLE, to12h, VITALS } from './health';
import { isTamil, lang, t } from './i18n';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** A clean A4 health report as HTML (prints well in English and Tamil). */
export function reportHtml(p: Patient, d: ExportData, from: Date, to: Date, charts: { title: string; img: string }[]): string {
  const s = summarize(p, d, Math.round((+to - +from) / 864e5));
  const b = bmi(p);
  const info: [string, string][] = [
    [t('Age / Gender'), [age(p.dob) !== null ? t('{n} yrs', { n: age(p.dob) }) : '', p.gender ? t(p.gender) : ''].filter(Boolean).join(' / ') || '—'],
    [t('Condition'), t(CONDITIONS[p.condition].label) + (p.diagnosed_year ? ` (${p.diagnosed_year})` : '')],
    [t('Height / Weight'), [p.height_cm ? `${p.height_cm} cm` : '', p.weight_kg ? `${p.weight_kg} kg` : '', b ? `BMI ${b.toFixed(1)}` : ''].filter(Boolean).join(' · ') || '—'],
    [t('Blood group'), p.blood_group || '—'],
    [t('Heart conditions'), p.heart_conditions || '—'], [t('Other conditions'), p.other_conditions || '—'],
    [t('Allergies'), p.allergies || '—'], [t('Doctor'), [p.doctor_name, p.doctor_phone].filter(Boolean).join(' · ') || '—'],
  ];
  const tiles: [string, string][] = ([
    [t('Avg sugar'), s.gs.n ? `${Math.round(s.gs.avg)} mg/dL` : ''], [t('Fasting avg'), s.fast.n ? `${Math.round(s.fast.avg)} mg/dL` : ''],
    [t('After-meal avg'), s.pp.n ? `${Math.round(s.pp.avg)} mg/dL` : ''], [t('Time in range'), s.gs.n ? `${Math.round(s.tir.inRange)}%` : ''],
    [t('Est. HbA1c'), s.eA1c ? `${s.eA1c.toFixed(1)}%` : ''], [t('Lab HbA1c'), s.a1c ? `${Number(s.a1c.value1).toFixed(1)}%` : ''],
    [t('Avg BP'), s.sys.n ? `${Math.round(s.sys.avg)}/${Math.round(s.dia.avg)} mmHg` : ''], [t('Avg pulse'), s.hr.n ? `${Math.round(s.hr.avg)} bpm` : ''],
    [t('Weight'), s.weight ? `${s.weight.toFixed(1)} kg` : ''], [t('Med adherence'), s.adh.due ? `${Math.round(s.adh.pct)}%` : ''],
  ] as [string, string][]).filter(([, v]) => v);

  const table = (title: string, head: string[], rows: (string | number)[][]) => !rows.length ? '' : `
    <h2>${esc(title)}</h2>
    <table><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;

  const st = (v: Parameters<typeof classify>[0]) => t(STATUS_STYLE[classify(v, p)].label);
  const dt = (iso: string) => format(new Date(iso), 'd MMM');
  const tm = (iso: string) => format(new Date(iso), 'h:mm a');

  const body = `
  <header>
    <div class="brand">♥ VitalNest</div>
    <h1>${esc(t('Health Report'))}</h1>
    <div class="sub">${esc(p.full_name)} · ${esc(format(from, 'd MMM yyyy'))} – ${esc(format(to, 'd MMM yyyy'))}</div>
  </header>
  <h2>${esc(t('Patient'))}</h2>
  <table class="info">${info.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table>
  ${tiles.length ? `<h2>${esc(t('Summary'))}</h2><div class="tiles">${tiles.map(([k, v]) => `<div class="tile"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div></div>`).join('')}</div>` : ''}
  ${s.hypos ? `<p class="warn">${esc(t(s.hypos > 1 ? '{n} low sugar readings (below 70) this period' : '{n} low sugar reading (below 70) this period', { n: s.hypos }))}</p>` : ''}
  ${charts.map(c => `<div class="chart"><h2>${esc(t(c.title))}</h2><img src="${c.img}" alt=""></div>`).join('')}
  ${table(t('Current medicines'), [t('Medicine'), t('Strength'), t('Dose'), t('Times'), t('Take'), t('For')],
    d.meds.filter(m => m.active).map(m => [m.name + (m.composition ? ` (${m.composition})` : ''), m.strength ?? '', m.dose ?? '', m.times.map(to12h).join(', '), t(FOOD_REL[m.food_relation ?? ''] ?? ''), m.purpose ?? '']))}
  ${table(t('Blood sugar readings'), [t('Date'), t('Time'), 'mg/dL', t('When'), t('Status'), t('Notes')],
    d.vitals.filter(v => v.kind === 'glucose').slice(-200).reverse().map(v => [dt(v.measured_at), tm(v.measured_at), Math.round(v.value1), t(ctxLabel(v.context)), st(v), v.notes ?? '']))}
  ${table(t('Blood pressure readings'), [t('Date'), t('Time'), 'BP (mmHg)', t('Pulse'), t('Status')],
    d.vitals.filter(v => v.kind === 'bp').slice(-150).reverse().map(v => [dt(v.measured_at), tm(v.measured_at), `${Math.round(v.value1)}/${Math.round(Number(v.value2))}`, v.value3 ? Math.round(v.value3) : '', st(v)]))}
  ${table(t('Other vitals'), [t('Date'), t('Time'), t('Type'), t('Reading'), t('Status')],
    d.vitals.filter(v => !['glucose', 'bp'].includes(v.kind)).slice(-150).reverse().map(v => [dt(v.measured_at), tm(v.measured_at), t(VITALS[v.kind].label), `${fmtVital(v)} ${VITALS[v.kind].unit}`, st(v)]))}
  <footer>${esc(t('Self-recorded readings. For discussion with your doctor; not a medical diagnosis.'))} · ${esc(t('Generated'))} ${esc(format(new Date(), 'd MMM yyyy, h:mm a'))} · VitalNest</footer>`;

  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(p.full_name)} – ${esc(t('Health Report'))}</title>
<style>
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: ${isTamil ? '"Noto Sans Tamil", "Nirmala UI", Latha, ' : ''}"Segoe UI", Roboto, Arial, sans-serif; color: #0f172a; font-size: 11pt; line-height: ${isTamil ? 1.55 : 1.4}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  header { background: #0f766e; color: #fff; border-radius: 12px; padding: 14px 18px; margin-bottom: 10px; }
  header .brand { font-weight: 700; font-size: 9pt; opacity: .85; }
  header h1 { margin: 2px 0 2px; font-size: 20pt; }
  header .sub { font-size: 10pt; opacity: .9; }
  h2 { font-size: 12.5pt; margin: 16px 0 6px; color: #0f766e; break-after: avoid; }
  table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
  thead { display: table-header-group; }
  th, td { text-align: left; padding: 5px 7px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  thead th { background: #0f766e; color: #fff; font-weight: 600; }
  tbody tr:nth-child(even) td { background: #f8fafc; }
  tr { break-inside: avoid; }
  table.info th { width: 34%; color: #64748b; font-weight: 500; background: none; }
  .tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .tile { background: #f1f5f9; border-radius: 10px; padding: 8px 10px; break-inside: avoid; }
  .tile .k { font-size: 8.5pt; color: #64748b; } .tile .v { font-size: 13pt; font-weight: 700; }
  .warn { color: #b91c1c; font-weight: 600; font-size: 10pt; }
  .chart { break-inside: avoid; } .chart img { width: 100%; height: auto; border: 1px solid #e2e8f0; border-radius: 8px; }
  footer { margin-top: 18px; font-size: 8pt; color: #94a3b8; }
</style></head><body>${body}</body></html>`;
}
