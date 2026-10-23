import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';

/**
 * Web updates arrive by themselves (the app loads the live site).
 * Only when the Android shell itself changes (new permission / plugin) do phones need a new APK:
 * raise this to that build's number (the N in "VitalNest 1.0.N") and older apps show an "Update app" banner.
 */
export const REQUIRED_NATIVE_BUILD = 34;
export const APK_URL = 'https://vitalnest.vercel.app/download';

export async function nativeBuild(): Promise<number | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try { return Number((await CapApp.getInfo()).build) || 0; } catch { return null; }
}

export async function needsNativeUpdate(): Promise<boolean> {
  const b = await nativeBuild();
  return b != null && b < REQUIRED_NATIVE_BUILD;
}

/** Pick up a new web version quickly: check when the app comes back to the front, and reload at a safe moment. */
export function watchWebUpdates() {
  if (!('serviceWorker' in navigator)) return;
  let pending = false;
  // never reload while someone is typing a reading, filling a form or taking a photo
  const safe = () => !/^\/(add|food\/add|patients\/)/.test(location.pathname)
    && !document.querySelector('[role="dialog"]') && !(document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement);
  const tryReload = () => { if (pending && document.visibilityState === 'visible' && safe()) location.reload(); };
  const check = () => navigator.serviceWorker.getRegistration().then(r => r?.update()).catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => { pending = true; tryReload(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { tryReload(); check(); } });
  window.addEventListener('popstate', () => setTimeout(tryReload, 300));
  if (Capacitor.isNativePlatform()) CapApp.addListener('resume', check).catch(() => {});
  setInterval(check, 30 * 60_000);
}
