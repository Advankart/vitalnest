import { useEffect, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { Browser } from '@capacitor/browser';
import { registerPlugin } from '@capacitor/core';
import { APK_URL, needsNativeUpdate } from '../lib/update';
import { t } from '../lib/i18n';
import { useApp } from '../lib/store';

const Updater = registerPlugin<{
  canInstall(): Promise<{ allowed: boolean }>;
  openInstallSetting(): Promise<void>;
  install(o: { url: string }): Promise<void>;
  addListener(e: 'progress', cb: (p: { pct: number }) => void): Promise<{ remove(): Promise<void> }>;
}>('Updater');
const DIRECT_APK = 'https://github.com/Advankart/vitalnest/releases/latest/download/VitalNest.apk';

/** Shown only inside the Android app when a new APK is required. Downloads and opens the installer in-app. */
export function UpdateBanner() {
  const { toast } = useApp();
  const [show, setShow] = useState(false);
  const [pct, setPct] = useState<number | null>(null);
  const [needPerm, setNeedPerm] = useState(false);
  useEffect(() => { needsNativeUpdate().then(setShow); }, []);
  if (!show) return null;

  async function update() {
    try {
      const { allowed } = await Updater.canInstall();
      if (!allowed) { setNeedPerm(true); await Updater.openInstallSetting(); return; }
      setNeedPerm(false); setPct(0);
      const l = await Updater.addListener('progress', p => setPct(p.pct));
      try { await Updater.install({ url: DIRECT_APK }); } finally { l.remove(); }
      setPct(100);
    } catch (e) {
      const msg = (e as Error)?.message || '';
      if (/not implemented|UNIMPLEMENTED/i.test(msg)) { Browser.open({ url: APK_URL }); return; }   // older app: browser download
      setPct(null); toast(msg || t('Update failed — please try again'), 'err');
    }
  }

  const busy = pct !== null && pct < 100;
  return (
    <div className="mx-4 mt-3 rounded-2xl bg-brand-600 p-3 text-white shadow-lg">
      <div className="flex items-center gap-3">
        {busy ? <Loader2 className="h-5 w-5 shrink-0 animate-spin" /> : <Download className="h-5 w-5 shrink-0" />}
        <div className="min-w-0 flex-1">
          <div className="text-[0.875rem] font-semibold">{busy ? t('Downloading update… {n}%', { n: Math.max(0, pct!) }) : pct === 100 ? t('Tap Install on the next screen') : 'App update available'}</div>
          <div className="text-[0.75rem] opacity-85">{needPerm ? t('Allow "Install unknown apps" for VitalNest, come back and tap Update again.') : 'Tap Update, then Install — your data stays.'}</div>
        </div>
        {!busy && <button onClick={update} className="shrink-0 rounded-xl bg-white px-3 py-2 text-[0.8125rem] font-semibold text-brand-700">Update</button>}
      </div>
      {busy && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/25"><div className="h-full rounded-full bg-white transition-all" style={{ width: `${Math.max(3, pct!)}%` }} /></div>}
    </div>
  );
}
