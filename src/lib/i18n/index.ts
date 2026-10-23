/**
 * Tiny i18n for VitalNest.
 *  - t('English text', { vars }) for strings built in code (toasts, notifications, share text…)
 *  - a DOM translator that swaps every static English text / placeholder / aria-label
 *    for its Tamil version as React renders, so every screen is covered.
 * English text is the key, so English mode needs no dictionary at all.
 */
import { setDefaultOptions } from 'date-fns';
import { ta as taLocale } from 'date-fns/locale';
import { TA } from './ta';

export type Lang = 'en' | 'ta';
export const LANGS: { id: Lang; label: string; native: string }[] = [
  { id: 'en', label: 'English', native: 'English' },
  { id: 'ta', label: 'Tamil', native: 'தமிழ்' },
];

function read(): Lang { try { return localStorage.getItem('vn_lang') === 'ta' ? 'ta' : 'en'; } catch { return 'en'; } }
export const lang: Lang = read();
export const isTamil = lang === 'ta';

/** Switch language — reloads so every screen, chart and date is redrawn in the new language. */
export function setLang(l: Lang) {
  try { localStorage.setItem('vn_lang', l); } catch { /* ignore */ }
  location.reload();
}

const fill = (s: string, vars?: Record<string, string | number | null | undefined>) =>
  vars ? s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? '') + '') : s;

/** Translate a string (English text is the key). Placeholders like {n} are filled from vars. */
export function t(s: string, vars?: Record<string, string | number | null | undefined>): string {
  return fill(isTamil ? (TA[s] ?? s) : s, vars);
}

/** Common dose words typed by people or read from prescriptions ("1 tablet", "10 units"). */
export function tDose(s?: string | null): string {
  if (!s || !isTamil) return s ?? '';
  return s.replace(/\b(tablets?|tabs?)\b/gi, 'மாத்திரை').replace(/\bcapsules?\b/gi, 'கேப்ஸ்யூல்').replace(/\bunits?\b/gi, 'யூனிட்')
    .replace(/\bdrops?\b/gi, 'சொட்டு').replace(/\bpuffs?\b/gi, 'பஃப்').replace(/\bmorning\b/gi, 'காலை').replace(/\bnight\b/gi, 'இரவு').replace(/\bafternoon\b/gi, 'மதியம்');
}

/* ---------------- patterns for text built from numbers ---------------- */
const PATTERNS: [RegExp, string][] = [
  [/^(\d+) days?$/, '$1 நாட்கள்'],
  [/^(\d+) min$/, '$1 நிமி'],
  [/^(\d+) yrs$/, '$1 வயது'],
  [/^(\d+) readings?$/, '$1 அளவீடுகள்'],
  [/^(\d+) left$/, '$1 மீதம்'],
  [/^(\d+) kcal$/, '$1 கலோரி'],
  [/^(\d+)\/(\d+) taken$/, '$1/$2 எடுத்தது'],
  [/^(\d+)\/(\d+) doses$/, '$1/$2 மருந்துகள்'],
  [/^lowest (\d+)%$/, 'குறைந்தபட்சம் $1%'],
  [/^([+-]?[\d.]+) kg in period$/, 'இக்காலத்தில் $1 கி.கி'],
  [/^Lab ([\d.]+)%$/, 'ஆய்வகம் $1%'],
];

function translateText(raw: string): string | null {
  const s = raw.trim();
  if (!s || !/[A-Za-z]/.test(s)) return null;
  let out = TA[s];
  if (out == null) {
    for (const [re, rep] of PATTERNS) if (re.test(s)) { out = s.replace(re, rep); break; }
  }
  if (out == null || out === s) return null;
  const lead = raw.match(/^\s*/)![0], trail = raw.match(/\s*$/)![0];
  return lead + out + trail;
}

const ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'CODE', 'PRE']);
const skipped = (el: Element | null) => !!el?.closest('[translate="no"], .notranslate, [contenteditable="true"]');

function walk(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) { doText(root as Text); return; }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const el = root as Element;
  if (SKIP.has(el.tagName) && el.tagName !== 'INPUT') return;
  if (skipped(el)) return;
  doAttrs(el);
  const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n: Node | null = tw.nextNode();
  while (n) {
    if (n.nodeType === Node.TEXT_NODE) doText(n as Text);
    else doAttrs(n as Element);
    n = tw.nextNode();
  }
}
function doText(n: Text) {
  const p = n.parentElement;
  if (!p || SKIP.has(p.tagName) || skipped(p)) return;
  const tr = translateText(n.nodeValue ?? '');
  if (tr != null) n.nodeValue = tr;
}
function doAttrs(el: Element) {
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (v) { const tr = translateText(v); if (tr != null) el.setAttribute(a, tr); }
  }
}

/** Start translating the page (Tamil only). Call once at startup. */
export function startTranslation() {
  document.documentElement.lang = lang;
  if (!isTamil) return;
  setDefaultOptions({ locale: taLocale });
  document.documentElement.classList.add('lang-ta');
  const run = () => {
    walk(document.body);
    new MutationObserver(muts => {
      for (const m of muts) {
        if (m.type === 'characterData') doText(m.target as Text);
        else if (m.type === 'attributes') doAttrs(m.target as Element);
        else m.addedNodes.forEach(walk);
      }
    }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  };
  if (document.body) run(); else document.addEventListener('DOMContentLoaded', run);
}
