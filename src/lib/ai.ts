import { api } from './api';
import { API_BASE } from './scan';
import { dayKey } from './health';
import { lang } from './i18n';

export type AIKind = 'motivation' | 'trends' | 'diet';
export interface Motivation { tone: 'great' | 'good' | 'keep_going' | 'attention'; emoji: string; headline: string; message: string }
export interface TrendAI {
  overall: 'improving' | 'stable' | 'mixed' | 'worsening' | 'not_enough_data'; summary: string;
  highlights: { area: string; tone: 'good' | 'watch' | 'alert'; title: string; detail: string }[];
  patterns: string[]; suggestions: string[]; doctor_note: string | null; generated_at?: string;
}
export type MealSlot = 'breakfast' | 'mid_morning' | 'lunch' | 'evening_snack' | 'dinner';
export interface DietPlan {
  meals: { slot: MealSlot; title: string; items: { name: string; qty: string; kcal: number; carbs_g?: number }[]; total_kcal: number; why: string }[];
  day_total_kcal: number; tips: string[];
}
export const SLOT_LABEL: Record<MealSlot, string> = { breakfast: 'Breakfast', mid_morning: 'Mid-morning', lunch: 'Lunch', evening_snack: 'Evening snack', dinner: 'Dinner' };
export function currentSlot(d = new Date()): MealSlot {
  const h = d.getHours() + d.getMinutes() / 60;
  return h < 10 ? 'breakfast' : h < 12 ? 'mid_morning' : h < 15.5 ? 'lunch' : h < 18.5 ? 'evening_snack' : 'dinner';
}

/** Only accept answers that have everything the screen needs (a cut-off AI answer once blanked the app). */
export function validAI(kind: AIKind, o: any): boolean {
  if (!o || typeof o !== 'object') return false;
  if (kind === 'motivation') return typeof o.headline === 'string' && typeof o.message === 'string';
  if (kind === 'trends') return typeof o.summary === 'string' && Array.isArray(o.highlights);
  return Array.isArray(o.meals) && o.meals.length > 0 && o.meals.every((m: any) => m && Array.isArray(m.items));
}

const mem = new Map<string, { at: number; v: unknown }>();
const TTL: Record<AIKind, number> = { motivation: 30 * 60_000, trends: 6 * 3600_000, diet: 12 * 3600_000 };
const keyOf = (kind: AIKind, pid: string, extra = '') => `vn_ai_${kind}_${lang}_${pid}_${dayKey(new Date())}${extra}`;

export function cachedAI<T>(kind: AIKind, pid: string, extra = ''): T | null {
  const k = keyOf(kind, pid, extra);
  const m = mem.get(k); if (m && validAI(kind, m.v)) return m.v as T;
  try { const raw = localStorage.getItem(k); if (raw) { const o = JSON.parse(raw); if (validAI(kind, o.v)) { mem.set(k, o); return o.v as T; } localStorage.removeItem(k); } } catch { /* ignore */ }
  return null;
}

/** Fetch an AI insight (server caches per day for the whole family; we also keep a local copy). */
export async function getAI<T>(kind: AIKind, pid: string, opts: { refresh?: boolean; extra?: string; body?: Record<string, unknown> } = {}): Promise<T> {
  const k = keyOf(kind, pid, opts.extra);
  if (!opts.refresh) {
    const m = mem.get(k) ?? (() => { try { const raw = localStorage.getItem(k); return raw ? JSON.parse(raw) : undefined; } catch { return undefined; } })();
    if (m && Date.now() - m.at < TTL[kind] && validAI(kind, m.v)) return m.v as T;
  }
  const token = await api().accessToken();
  if (!token) throw new Error('AI insights need you to be signed in (not available in demo mode).');
  const r = await fetch(`${API_BASE}/api/ai`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ kind, patient_id: pid, refresh: !!opts.refresh, lang, ...(opts.body ?? {}) }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'AI is not available right now');
  if (!validAI(kind, j)) throw new Error('AI answer was incomplete — please try again.');
  const o = { at: Date.now(), v: j };
  mem.set(k, o);
  try { localStorage.setItem(k, JSON.stringify(o)); } catch { /* ignore */ }
  return j as T;
}
