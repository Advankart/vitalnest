import { useRef, useState } from 'react';
import { Camera, ImageUp, Loader2, Sparkles } from 'lucide-react';
import { scanPhoto, type ScanKind } from '../lib/scan';
import { useApp } from '../lib/store';
import { cx } from './ui';

const LABEL: Record<ScanKind, string> = {
  glucose: 'Take a photo of the glucometer screen',
  bp: 'Take a photo of the BP monitor screen',
  medicine: 'Take a photo of the medicine strip or box',
};

/** Camera button that reads a device screen / medicine label and hands back structured fields. */
export function ScanButton<T>({ kind, onResult, className }: { kind: ScanKind; onResult: (r: T) => void; className?: string }) {
  const { toast } = useApp();
  const cam = useRef<HTMLInputElement>(null), gal = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handle(file?: File | null) {
    if (!file) return;
    setBusy(true);
    try {
      const r = await scanPhoto<T & { found: boolean; note?: string; confidence?: string }>(kind, file);
      if (!r.found) { toast(r.note ? `Couldn't read it clearly: ${r.note}` : "Couldn't read it clearly — try again closer, without glare", 'err'); return; }
      onResult(r);
      toast(r.confidence === 'low' ? 'Filled from photo — please double-check the values' : 'Filled from photo ✓ Please check before saving');
    } catch (e) { toast((e as Error).message, 'err'); }
    finally { setBusy(false); if (cam.current) cam.current.value = ''; if (gal.current) gal.current.value = ''; }
  }

  return (
    <div className={cx('rounded-2xl bg-gradient-to-r from-brand-50 to-sky-50 p-3 ring-1 ring-brand-100 dark:from-brand-500/10 dark:to-sky-500/10 dark:ring-brand-500/20', className)}>
      <input ref={cam} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => handle(e.target.files?.[0])} />
      <input ref={gal} type="file" accept="image/*" className="hidden" onChange={e => handle(e.target.files?.[0])} />
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-600 text-white">{busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}</div>
        <div className="min-w-0 flex-1">
          <div className="text-[0.875rem] font-semibold">{busy ? 'Reading photo…' : 'Fill from photo'}</div>
          <div className="text-[0.75rem] text-slate-500 dark:text-slate-400">{LABEL[kind]}</div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" disabled={busy} onClick={() => cam.current?.click()} className="flex items-center justify-center gap-2 rounded-xl bg-brand-600 py-2.5 text-[0.8125rem] font-semibold text-white disabled:opacity-50"><Camera className="h-4 w-4" />Camera</button>
        <button type="button" disabled={busy} onClick={() => gal.current?.click()} className="flex items-center justify-center gap-2 rounded-xl bg-white py-2.5 text-[0.8125rem] font-semibold text-brand-700 ring-1 ring-brand-200 disabled:opacity-50 dark:bg-night-3 dark:text-brand-300 dark:ring-white/10"><ImageUp className="h-4 w-4" />Gallery</button>
      </div>
    </div>
  );
}
