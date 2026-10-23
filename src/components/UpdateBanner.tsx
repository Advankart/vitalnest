import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { Browser } from '@capacitor/browser';
import { APK_URL, needsNativeUpdate } from '../lib/update';

/** Shown only inside the Android app, when a new APK is required (rare — normal updates are automatic). */
export function UpdateBanner() {
  const [show, setShow] = useState(false);
  useEffect(() => { needsNativeUpdate().then(setShow); }, []);
  if (!show) return null;
  return (
    <div className="mx-4 mt-3 flex items-center gap-3 rounded-2xl bg-brand-600 p-3 text-white shadow-lg">
      <Download className="h-5 w-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-[0.875rem] font-semibold">App update available</div>
        <div className="text-[0.75rem] opacity-85">Tap Update, then Install — your data stays.</div>
      </div>
      <button onClick={() => Browser.open({ url: APK_URL })} className="shrink-0 rounded-xl bg-white px-3 py-2 text-[0.8125rem] font-semibold text-brand-700">Update</button>
    </div>
  );
}
