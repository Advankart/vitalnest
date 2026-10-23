import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Activity, ChevronDown, Droplet, Droplets, FileText, Flame, FlaskConical, Gauge, HeartPulse, Home, LayoutGrid, Pill, Plus, Scale, Thermometer, Wind, Check, Bell } from 'lucide-react';
import { useApp } from '../lib/store';
import { Avatar, Sheet, cx } from './ui';
import { CONDITIONS, VITALS, vitalsFor } from '../lib/health';
import type { VitalKind } from '../lib/types';
import { onDue } from '../lib/notify';

export function VitalIcon({ kind, className = 'h-5 w-5' }: { kind: string; className?: string }) {
  const I = ({ glucose: Droplet, bp: Gauge, heart_rate: HeartPulse, weight: Scale, spo2: Wind, temperature: Thermometer, hba1c: FlaskConical, water: Droplets } as Record<string, typeof Droplet>)[kind] ?? Activity;
  return <I className={className} />;
}

function PatientSwitcher() {
  const { patients, patient, selectPatient, membership, memberships, selectFamily } = useApp();
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  if (!patient) return null;
  return (
    <>
      <button onClick={() => setOpen(true)} className="flex min-w-0 items-center gap-2.5 rounded-full py-1 pl-1 pr-3 transition hover:bg-slate-200/50 dark:hover:bg-white/5">
        <Avatar name={patient.full_name} color={patient.color} size={38} />
        <div className="min-w-0 text-left">
          <div className="flex items-center gap-1 truncate font-display text-[15px] font-bold leading-tight">{patient.full_name.split(' ')[0]}<ChevronDown className="h-4 w-4 text-slate-400" /></div>
          <div className="truncate text-[11.5px] font-medium text-slate-500 dark:text-slate-400">{CONDITIONS[patient.condition].label}</div>
        </div>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Switch person">
        <div className="space-y-2">
          {patients.map(p => (
            <button key={p.id} onClick={() => { selectPatient(p.id); setOpen(false); }}
              className={cx('flex w-full items-center gap-3 rounded-2xl p-3 text-left ring-1 transition', p.id === patient.id ? 'bg-brand-50 ring-brand-200 dark:bg-brand-500/10 dark:ring-brand-500/30' : 'ring-slate-100 hover:bg-slate-50 dark:ring-white/5 dark:hover:bg-white/5')}>
              <Avatar name={p.full_name} color={p.color} size={44} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{p.full_name}</div>
                <div className="truncate text-xs text-slate-500">{[p.relation, CONDITIONS[p.condition].label].filter(Boolean).join(' · ')}</div>
              </div>
              {p.id === patient.id && <Check className="h-5 w-5 text-brand-600" />}
            </button>
          ))}
        </div>
        <button onClick={() => { setOpen(false); nav('/patients/new'); }} className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 p-3 text-sm font-semibold text-slate-500 dark:border-white/10">
          <Plus className="h-4 w-4" /> Add family member
        </button>
        {memberships.length > 1 && (
          <div className="mt-5">
            <div className="label">Family group</div>
            <div className="flex flex-wrap gap-2">
              {memberships.map(m => (
                <button key={m.family.id} onClick={() => { selectFamily(m.family.id); setOpen(false); }}
                  className={cx('chip px-3 py-2 text-[13px]', m.family.id === membership?.family.id ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-white/5')}>{m.family.name}</button>
              ))}
            </div>
          </div>
        )}
      </Sheet>
    </>
  );
}

function QuickAdd({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate();
  const { patient } = useApp();
  const kinds: VitalKind[] = patient ? vitalsFor(patient.condition) : ['glucose', 'bp', 'heart_rate', 'weight'];
  const go = (p: string) => { onClose(); nav(p); };
  const Tile = ({ icon, label, color, onClick }: { icon: ReactNode; label: string; color: string; onClick: () => void }) => (
    <button onClick={onClick} className="flex flex-col items-center gap-2 rounded-2xl p-3 transition hover:bg-slate-50 active:scale-95 dark:hover:bg-white/5">
      <div className="grid h-14 w-14 place-items-center rounded-2xl text-white shadow-lg" style={{ background: `linear-gradient(140deg, ${color}, ${color}bb)`, boxShadow: `0 10px 20px -10px ${color}` }}>{icon}</div>
      <span className="text-center text-[12px] font-semibold leading-tight text-slate-700 dark:text-slate-200">{label}</span>
    </button>
  );
  return (
    <Sheet open={open} onClose={onClose} title="Add entry">
      <div className="grid grid-cols-4 gap-1">
        {kinds.map(k => <Tile key={k} icon={<VitalIcon kind={k} className="h-6 w-6" />} label={VITALS[k].label} color={VITALS[k].color} onClick={() => go(`/add/${k}`)} />)}
        <Tile icon={<Flame className="h-6 w-6" />} label="Food" color="#16a34a" onClick={() => go('/food/add')} />
        <Tile icon={<Droplets className="h-6 w-6" />} label="Water" color="#0284c7" onClick={() => go('/water')} />
        <Tile icon={<Pill className="h-6 w-6" />} label="Medicine" color="#9333ea" onClick={() => go('/meds')} />
        <Tile icon={<FileText className="h-6 w-6" />} label="Report" color="#475569" onClick={() => go('/reports?upload=1')} />
      </div>
    </Sheet>
  );
}

export default function Layout() {
  const [qa, setQa] = useState(false);
  const [due, setDue] = useState<{ title: string; body: string; path: string } | null>(null);
  const loc = useLocation();
  const nav = useNavigate();
  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);
  useEffect(() => onDue(s => setDue(s)), []);
  const isHome = loc.pathname === '/';

  const Tab = ({ to, icon, label }: { to: string; icon: ReactNode; label: string }) => (
    <NavLink to={to} end={to === '/'} className={({ isActive }) => cx('flex flex-1 flex-col items-center gap-0.5 py-2 text-[10.5px] font-semibold transition', isActive ? 'text-brand-600 dark:text-brand-300' : 'text-slate-400')}>
      {icon}<span>{label}</span>
    </NavLink>
  );

  return (
    <div className="mx-auto min-h-screen max-w-xl">
      {isHome && (
        <header className="safe-top sticky top-0 z-30 bg-canvas/85 backdrop-blur-xl dark:bg-night/85">
          <div className="flex items-center justify-between px-4 py-2.5">
            <PatientSwitcher />
            <button onClick={() => nav('/reminders')} aria-label="Reminders" className="grid h-10 w-10 place-items-center rounded-full bg-white text-slate-600 shadow-sm ring-1 ring-slate-900/5 dark:bg-night-2 dark:text-slate-300 dark:ring-white/5">
              <Bell className="h-[18px] w-[18px]" />
            </button>
          </div>
        </header>
      )}
      <main className={cx('px-4 pb-32', !isHome && 'safe-top pt-3')}>
        <Outlet />
      </main>

      {due && (
        <div className="rise fixed inset-x-3 top-3 z-[55] mx-auto max-w-md rounded-3xl bg-ink p-4 text-white shadow-2xl safe-top dark:bg-white dark:text-ink">
          <div className="font-semibold">{due.title}</div>
          <div className="mt-0.5 text-sm opacity-75">{due.body}</div>
          <div className="mt-3 flex gap-2">
            <button onClick={() => { nav(due.path); setDue(null); }} className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white">Open</button>
            <button onClick={() => setDue(null)} className="rounded-xl px-4 py-2 text-sm font-semibold opacity-70">Dismiss</button>
          </div>
        </div>
      )}

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40">
        <div className="mx-auto max-w-xl px-3 pb-2">
          <div className="relative flex items-center rounded-[26px] bg-white/90 px-2 shadow-[0_10px_40px_-12px_rgba(15,23,42,.25)] ring-1 ring-slate-900/5 backdrop-blur-xl dark:bg-night-2/90 dark:ring-white/10">
            <Tab to="/" icon={<Home className="h-[22px] w-[22px]" />} label="Home" />
            <Tab to="/trends" icon={<Activity className="h-[22px] w-[22px]" />} label="Trends" />
            <div className="flex flex-1 justify-center">
              <button onClick={() => setQa(true)} aria-label="Add entry"
                className="-mt-7 grid h-[60px] w-[60px] place-items-center rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-white shadow-[0_12px_24px_-8px_rgba(13,148,136,.8)] ring-4 ring-canvas transition active:scale-95 dark:ring-night">
                <Plus className="h-7 w-7" strokeWidth={2.5} />
              </button>
            </div>
            <Tab to="/meds" icon={<Pill className="h-[22px] w-[22px]" />} label="Medicines" />
            <Tab to="/more" icon={<LayoutGrid className="h-[22px] w-[22px]" />} label="More" />
          </div>
        </div>
      </nav>
      <QuickAdd open={qa} onClose={() => setQa(false)} />
    </div>
  );
}
