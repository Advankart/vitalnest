import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Pill, Syringe, X } from 'lucide-react';
import { api } from '../lib/api';
import { cx } from './ui';

const urls = new Map<string, Promise<string>>();
export function photoUrl(path: string) {
  if (!urls.has(path)) {
    const p = api().photoUrl(path);
    p.catch(() => urls.delete(path));
    urls.set(path, p);
  }
  return urls.get(path)!;
}

function useUrl(path?: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true; setUrl(null);
    if (path) photoUrl(path).then(u => live && setUrl(u)).catch(() => { });
    return () => { live = false; };
  }, [path]);
  return url;
}

/** Full-screen photo viewer (pinch to zoom on phones). */
export function PhotoViewer({ src, title, onClose }: { src: string; title?: string; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return createPortal(
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[80] flex flex-col bg-black/95" onClick={onClose}>
      <div className="safe-top flex items-center justify-between px-4 py-3 text-white">
        <div className="min-w-0 truncate font-semibold">{title}</div>
        <button onClick={onClose} aria-label="Close" className="grid h-10 w-10 place-items-center rounded-full bg-white/15"><X className="h-5 w-5" /></button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-2" style={{ touchAction: 'pinch-zoom' }}>
        <img src={src} alt={title} className="max-h-full max-w-full object-contain" onClick={e => e.stopPropagation()} />
      </div>
    </div>,
    document.body,
  );
}

/** Small tablet photo; tap to see it full size. Falls back to a pill / syringe icon. */
export function MedThumb({ path, form, name, size = 'md', className }: { path?: string | null; form?: string; name?: string; size?: 'sm' | 'md'; className?: string }) {
  const url = useUrl(path);
  const [open, setOpen] = useState(false);
  const box = size === 'sm' ? 'h-9 w-9 rounded-xl' : 'h-11 w-11 rounded-2xl';
  const inj = form === 'insulin' || form === 'injection';
  if (!path || !url) {
    return (
      <div className={cx('grid shrink-0 place-items-center', box, inj ? 'bg-rose-50 text-rose-600 dark:bg-rose-500/10' : 'bg-purple-50 text-purple-600 dark:bg-purple-500/10', path && 'animate-pulse', className)}>
        {inj ? <Syringe className="h-[45%] w-[45%]" /> : <Pill className="h-[45%] w-[45%]" />}
      </div>
    );
  }
  return (
    <>
      <button type="button" onClick={e => { e.stopPropagation(); setOpen(true); }} aria-label={`View photo of ${name ?? 'medicine'}`}
        className={cx('shrink-0 overflow-hidden bg-slate-100 ring-1 ring-slate-900/10 dark:bg-white/5 dark:ring-white/10', box, className)}>
        <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
      </button>
      {open && <PhotoViewer src={url} title={name} onClose={() => setOpen(false)} />}
    </>
  );
}
