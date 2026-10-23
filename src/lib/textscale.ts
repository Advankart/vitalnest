import { Capacitor, registerPlugin } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';

/** Text size: 'auto' follows the phone's font-size setting; numbers are fixed scales. */
export type TextSize = 'auto' | '0.9' | '1' | '1.15' | '1.3' | '1.5';
export const TEXT_SIZES: { id: TextSize; label: string }[] = [
  { id: 'auto', label: 'Auto' }, { id: '0.9', label: 'Small' }, { id: '1', label: 'Normal' },
  { id: '1.15', label: 'Large' }, { id: '1.3', label: 'Larger' }, { id: '1.5', label: 'Largest' },
];
const KEY = 'vn_text_size';
const FontScale = registerPlugin<{ get(): Promise<{ scale: number }> }>('FontScale');
let phoneScale = 1;

export function getTextSize(): TextSize { try { return (localStorage.getItem(KEY) as TextSize) || 'auto'; } catch { return 'auto'; } }

export function applyTextSize() {
  const t = getTextSize();
  const s = t === 'auto' ? phoneScale : Number(t);
  const v = Math.min(1.7, Math.max(0.85, s || 1));
  document.documentElement.style.setProperty('--vn-scale', String(v));
  document.documentElement.toggleAttribute('data-textlg', v >= 1.25);
}
export function setTextSize(t: TextSize) { try { localStorage.setItem(KEY, t); } catch { /* ignore */ } applyTextSize(); }

async function readPhoneScale() {
  // In the Android app the WebView's own text zoom is switched off; use the phone setting instead.
  // In Chrome, <meta name="text-scale"> lets the browser apply the phone setting to rem sizes itself.
  if (!Capacitor.isNativePlatform()) return;
  try { phoneScale = (await FontScale.get()).scale || 1; } catch { phoneScale = 1; }
  applyTextSize();
}

export function initTextSize() {
  applyTextSize();
  readPhoneScale();
  if (Capacitor.isNativePlatform()) CapApp.addListener('resume', readPhoneScale).catch(() => { });
}
