import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { ChevronLeft, Loader2, X } from 'lucide-react';
import { useApp } from '../lib/store';
import { STATUS_STYLE, type Status } from '../lib/health';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'soft' | 'ghost' | 'danger' | 'dark'; loading?: boolean; size?: 'sm' | 'md' | 'lg'; block?: boolean };
export function Button({ variant = 'primary', loading, size = 'md', block, className, children, disabled, ...rest }: BtnProps) {
  const v = {
    primary: 'bg-brand-600 text-white shadow-[0_8px_20px_-8px_rgba(13,148,136,.7)] hover:bg-brand-700 active:bg-brand-800',
    soft: 'bg-brand-50 text-brand-700 hover:bg-brand-100 dark:bg-brand-500/15 dark:text-brand-300',
    ghost: 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5',
    danger: 'bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-500/15 dark:text-red-300',
    dark: 'bg-ink text-white hover:bg-slate-800 dark:bg-white dark:text-ink',
  }[variant];
  const s = { sm: 'h-9 px-3.5 text-[0.8125rem] rounded-xl', md: 'h-12 px-5 text-[0.9375rem] rounded-2xl', lg: 'h-14 px-6 text-base rounded-2xl' }[size];
  return (
    <button {...rest} disabled={disabled || loading}
      className={cx('inline-flex select-none items-center justify-center gap-2 font-semibold transition active:scale-[.98] disabled:opacity-50', v, s, block && 'w-full', className)}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}{children}
    </button>
  );
}

export function Field({ label, children, hint, className }: { label?: string; children: ReactNode; hint?: string; className?: string }) {
  return (
    <label className={cx('block', className)}>
      {label && <span className="label">{label}</span>}
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { id: T; label: ReactNode }[]; className?: string }) {
  return (
    <div className={cx('no-scrollbar flex gap-1 overflow-x-auto rounded-2xl bg-slate-100 p-1 dark:bg-night-3', className)}>
      {options.map(o => (
        <button key={o.id} type="button" onClick={() => onChange(o.id)}
          className={cx('flex-1 whitespace-nowrap rounded-xl px-3 py-2 text-[0.8125rem] font-semibold transition',
            value === o.id ? 'bg-white text-ink shadow-sm dark:bg-night-2 dark:text-white' : 'text-slate-500 dark:text-slate-400')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ChipSelect<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { id: T; label: string }[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(o => (
        <button key={o.id} type="button" onClick={() => onChange(o.id)}
          className={cx('rounded-full px-3.5 py-2 text-[0.8125rem] font-semibold ring-1 transition',
            value === o.id ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-600 ring-slate-200 dark:bg-night-3 dark:text-slate-300 dark:ring-white/10')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function PageHeader({ title, subtitle, back = true, right }: { title: string; subtitle?: string; back?: boolean; right?: ReactNode }) {
  const nav = useNavigate();
  return (
    <div className="mb-4 flex items-center gap-2">
      {back && (
        <button onClick={() => (window.history.length > 1 ? nav(-1) : nav('/'))} aria-label="Back"
          className="-ml-2 grid h-10 w-10 place-items-center rounded-full text-slate-600 hover:bg-slate-200/60 dark:text-slate-300 dark:hover:bg-white/5">
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[1.375rem] font-bold">{title}</h1>
        {subtitle && <p className="truncate text-[0.8125rem] text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="sheet-in safe-bottom relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-[28px] bg-white p-5 pb-6 dark:bg-night-2 sm:rounded-[28px]">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-200 dark:bg-white/10 sm:hidden" />
        {title && (
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold">{title}</h2>
            <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 dark:bg-white/5" aria-label="Close"><X className="h-4 w-4" /></button>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-10 text-center">
      <div className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">{icon}</div>
      <h3 className="font-bold">{title}</h3>
      {text && <p className="mt-1 max-w-xs text-sm text-slate-500 dark:text-slate-400">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function StatusPill({ status }: { status: Status }) {
  const s = STATUS_STYLE[status];
  return <span className={cx('chip', s.cls)}>{s.label}</span>;
}

export function Avatar({ name, color, size = 40, ring }: { name: string; color: string; size?: number; ring?: boolean }) {
  const ini = name.replace(/[^\p{L}\s]/gu, ' ').trim().split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className={cx('grid shrink-0 place-items-center rounded-full font-display font-bold text-white', ring && 'ring-2 ring-white ring-offset-2 ring-offset-transparent dark:ring-night')}
      style={{ width: size, height: size, fontSize: size * 0.38, background: `linear-gradient(135deg, ${color}, ${color}cc)` }}>
      {ini}
    </div>
  );
}

export function Ring({ pct, size = 64, stroke = 7, color = '#0ea5e9', track = 'rgba(148,163,184,.2)', children }: { pct: number; size?: number; stroke?: number; color?: string; track?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, p = Math.max(0, Math.min(100, pct));
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - p / 100)} style={{ transition: 'stroke-dashoffset .6s ease' }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}

export function Toasts() {
  const { toasts } = useApp();
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4 safe-top">
      {toasts.map(t => (
        <div key={t.id} className={cx('rise pointer-events-auto max-w-md rounded-2xl px-4 py-3 text-sm font-medium shadow-lg',
          t.kind === 'err' ? 'bg-red-600 text-white' : 'bg-ink text-white dark:bg-white dark:text-ink')}>{t.msg}</div>
      ))}
    </div>
  );
}

export function Section({ title, action, children, className }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('mt-6', className)}>
      <div className="mb-2.5 flex items-center justify-between px-1">
        <h2 className="text-[0.9375rem] font-bold text-slate-800 dark:text-slate-100">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Spinner() {
  return <div className="grid min-h-[40vh] place-items-center"><Loader2 className="h-7 w-7 animate-spin text-brand-600" /></div>;
}

export function ViewOnlyNote() {
  const { canEdit } = useApp();
  if (canEdit) return null;
  return <div className="mb-3 rounded-2xl bg-amber-50 px-4 py-3 text-[0.8125rem] text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">You have view-only access. Ask the family admin to make you a caregiver to add entries.</div>;
}
