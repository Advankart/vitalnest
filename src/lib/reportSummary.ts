import { api } from './api';
import { API_BASE } from './scan';
import { lang } from './i18n';
import type { Report, ReportSummary } from './types';

/** Saved summary for the current language (no AI call). */
export const savedSummary = (r: Report): ReportSummary | null => {
  const s = r.ai_summary?.[lang];
  return s && typeof s.summary === 'string' && Array.isArray(s.diagnoses) ? s : null;
};

/** Ask the server to read the report with AI. It reuses the saved summary unless refresh=true. */
export async function summariseReport(r: Report, refresh = false): Promise<ReportSummary> {
  const token = await api().accessToken();
  if (!token) throw new Error('AI insights need you to be signed in (not available in demo mode).');
  const res = await fetch(`${API_BASE}/api/report-summary`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ report_id: r.id, lang, refresh }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || 'AI is not available right now');
  return j as ReportSummary;
}

/** Plain-text version for WhatsApp. */
export function summaryToText(s: ReportSummary, name: string, t: (k: string) => string): string {
  const L: string[] = [`📄 *${s.title}*`, [name, s.hospital, s.date].filter(Boolean).join(' · '), '', s.summary];
  const sec = (title: string, items: string[]) => { if (items.length) { L.push('', `*${title}*`); items.forEach(i => L.push(`• ${i}`)); } };
  sec(t('Diagnosis'), s.diagnoses);
  sec(t('Important findings'), s.key_findings.map(f => `${f.label}: ${f.detail}`));
  sec(t('Abnormal lab values'), s.lab_results.filter(l => l.flag !== 'normal' && l.flag !== 'unknown').map(l => `${l.test}: ${l.value}${l.unit ? ' ' + l.unit : ''}${l.range ? ` (${l.range})` : ''}`));
  sec(t('Medicines'), s.medicines.map(m => [m.name, m.dose, m.timing, m.duration].filter(Boolean).join(' · ')));
  sec(t('Follow-up'), s.follow_up);
  sec(t('Go to hospital immediately if'), s.warning_signs);
  L.push('', `_${t('AI summary · VitalNest — check with your doctor')}_`);
  return L.join('\n');
}

/** For summaries made before follow-up dates existed: work out the dates from the saved text (cheap, no re-reading). */
export async function findFollowUps(r: Report): Promise<ReportSummary> {
  const token = await api().accessToken();
  if (!token) throw new Error('AI insights need you to be signed in (not available in demo mode).');
  const res = await fetch(`${API_BASE}/api/report-summary`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ report_id: r.id, lang, followups: true }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || 'AI is not available right now');
  return j as ReportSummary;
}
