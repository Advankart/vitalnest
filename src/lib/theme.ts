import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { FontScale as Bars } from './textscale';
import { StatusBar } from '@capacitor/status-bar';

export type Theme = 'system' | 'light' | 'dark';
const KEY = 'vn_theme';
export function getTheme(): Theme { try { return (localStorage.getItem(KEY) as Theme) || 'system'; } catch { return 'system'; } }
export function applyTheme() {
  const t = getTheme();
  const dark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  const bg = dark ? '#070c17' : '#f4f6fa';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
  if (Capacitor.isNativePlatform()) {
    // Status/navigation bars: solid app colour with matching icons (the app no longer draws under them)
    Bars.setBars({ color: bg, dark }).catch(() => {
      // older app versions: best effort with the standard plugins
      SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => { });
      StatusBar.setBackgroundColor({ color: bg }).catch(() => { });
    });
  }
}
export function setTheme(t: Theme) { try { localStorage.setItem(KEY, t); } catch { /* ignore */ } applyTheme(); }
export function watchTheme() { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme); applyTheme(); }
