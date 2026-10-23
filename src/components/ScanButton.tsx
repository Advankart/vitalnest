import { useRef, useState } from 'react';
import { Camera, ImageUp, Loader2, Plus, Sparkles } from 'lucide-react';
import { scanPhoto, type ScanKind } from '../lib/scan';
import { useApp } from '../lib/store';
import { cx } from './ui';

const LABEL: Record<ScanKind, string> = {
  glucose: 'Fill the frame with the screen · hold steady · avoid glare',
  bp: 'Fill the frame with the screen · hold steady · avoid glare',
  medicine: 'Photo the name side — then add the back for composition',
  prescription: 'Photo the prescription flat, in good light — add more pages after',
};
const TITLE: Record<ScanKind, string> = { glucose: 'Fill from photo', bp: 'Fill from photo', medicine: 'Fill from photo', prescription: 'Read prescription' };
const MULTI: Record<ScanKind, boolean> = { glucose: false, bp: false, medicine: true, prescription: true };

/** Camera button that reads a device screen / medicine label and hands back structured fields. */
export function ScanButton<T>({ kind, onResult, onFiles, className }: { kind: ScanKind; onResult: (r: T) => void; onFiles?: (files: File[]) => void; className?: string }) {
  const { toast } = useApp();
  const cam = useRef<HTMLInputElement>(null), gal = useRef<HTMLInputElement>(null);
  const back = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [shots, setShots] = useState<File[]>([]);   // medicine: sides already read

  async function handle(picked: File[], add = false) {
    if (!picked.length) return;
    const files = (add ? [...shots, ...picked] : picked).slice(0, 3);
    onFiles?.(files);
    setBusy(true);
    try {
      const r = await scanPhoto<T & { found: boolean; note?: string; confidence?: string }>(kind, files);
      if (MULTI[kind]) setShots(files);
      if (!r.found) { toast(r.note ? `Couldn't read it clearly: ${r.note}` : "Couldn't read it clearly — try again closer, without glare", 'err'); return; }
      onResult(r);
      toast(r.confidence === 'low' ? `Filled from photo — please double-check${r.note ? ` (${r.note})` : ''}` : 'Filled from photo ✓ Please check before saving');
    } catch (e) { toast((e as Error).message, 'err'); }
    finally { setBusy(false); for (const x of [cam, gal, back]) if (x.current) x.current.value = ''; }
  }

  return (
    <div className={cx('rounded-2xl bg-gradient-to-r from-brand-50 to-sky-50 p-3 ring-1 ring-brand-100 dark:from-brand-500/10 dark:to-sky-500/10 dark:ring-brand-500/20', className)}>
      <input ref={cam} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => handle([...(e.target.files ?? [])])} />
      <input ref={gal} type="file" accept="image/*" multiple={MULTI[kind]} className="hidden" onChange={e => handle([...(e.target.files ?? [])])} />
      <input ref={back} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => handle([...(e.target.files ?? [])], true)} />
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-600 text-white">{busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}</div>
        <div className="min-w-0 flex-1">
          <div className="text-[0.875rem] font-semibold">{busy ? (kind === 'prescription' ? 'Reading prescription… (10–20 s)' : 'Reading photo…') : TITLE[kind]}</div>
          <div className="text-[0.75rem] text-slate-500 dark:text-slate-400">{LABEL[kind]}</div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" disabled={busy} onClick={() => cam.current?.click()} className="flex items-center justify-center gap-2 rounded-xl bg-brand-600 py-2.5 text-[0.8125rem] font-semibold text-white disabled:opacity-50"><Camera className="h-4 w-4" />Camera</button>
        <button type="button" disabled={busy} onClick={() => gal.current?.click()} className="flex items-center justify-center gap-2 rounded-xl bg-white py-2.5 text-[0.8125rem] font-semibold text-brand-700 ring-1 ring-brand-200 disabled:opacity-50 dark:bg-night-3 dark:text-brand-300 dark:ring-white/10"><ImageUp className="h-4 w-4" />Gallery</button>
      </div>
      {MULTI[kind] && shots.length > 0 && shots.length < 3 && (
        <button type="button" disabled={busy} onClick={() => back.current?.click()} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-brand-300 py-2.5 text-[0.8125rem] font-semibold text-brand-700 disabled:opacity-50 dark:border-brand-500/40 dark:text-brand-300">
          <Plus className="h-4 w-4" />{kind === 'prescription' ? `Add next page (${shots.length}/3)` : `Add other side of the pack (${shots.length}/3) — improves composition`}
        </button>
      )}
    </div>
  );
}
