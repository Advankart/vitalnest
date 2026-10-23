import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, ChevronRight, Droplets, FileText, History, KeyRound, LogOut, Moon, Share2, Sun, SunMoon, UserRound, Users, Utensils, Info, FlaskConical } from 'lucide-react';
import { useApp } from '../lib/store';
import { api, isDemo, setDemo, resetApi } from '../lib/api';
import { resetDemo } from '../lib/demo';
import { Avatar, Button, Field, Segmented, Sheet } from '../components/ui';
import { getTheme, setTheme, type Theme } from '../lib/theme';

export default function More() {
  const { user, membership, patient, role, refreshAuth, toast } = useApp();
  const [theme, setT] = useState<Theme>(getTheme());
  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState('');
  const demo = isDemo();

  const Item = ({ to, icon, label, sub, color }: { to: string; icon: React.ReactNode; label: string; sub?: string; color: string }) => (
    <Link to={to} className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-slate-50 dark:hover:bg-white/5">
      <div className="grid h-10 w-10 place-items-center rounded-xl text-white" style={{ background: color }}>{icon}</div>
      <div className="min-w-0 flex-1"><div className="font-semibold">{label}</div>{sub && <div className="truncate text-xs text-slate-500">{sub}</div>}</div>
      <ChevronRight className="h-4 w-4 text-slate-300" />
    </Link>
  );

  async function signOut() {
    await api().signOut();
    if (demo) { setDemo(false); resetDemo(); resetApi(); window.location.replace('/'); return; }
    await refreshAuth();
  }

  return (
    <div className="rise">
      <h1 className="pt-1 text-[24px] font-extrabold">More</h1>
      <div className="card mt-4 flex items-center gap-3 p-4">
        <Avatar name={user?.display_name || user?.username || '?'} color="#0f766e" size={52} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold">{user?.display_name || user?.username}</div>
          <div className="truncate text-xs text-slate-500">@{user?.username} · {membership?.family.name} · {role}</div>
        </div>
      </div>
      {demo && <div className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-[13px] text-amber-900 dark:bg-amber-500/10 dark:text-amber-200"><b>Demo mode.</b> Sample data is stored only on this device. Sign out to leave the demo.</div>}

      <div className="card mt-4 divide-y divide-slate-100 overflow-hidden dark:divide-white/5">
        <Item to={patient ? `/patients/${patient.id}` : '/patients'} icon={<UserRound className="h-5 w-5" />} label="Health profile" sub={patient ? `${patient.full_name} · personal & medical details` : undefined} color="#0f766e" />
        <Item to="/patients" icon={<Users className="h-5 w-5" />} label="All family members" sub="Profiles you track" color="#7c3aed" />
        <Item to="/family" icon={<KeyRound className="h-5 w-5" />} label="Family & sharing" sub="Invite code, logins & roles" color="#0284c7" />
      </div>
      <div className="card mt-4 divide-y divide-slate-100 overflow-hidden dark:divide-white/5">
        <Item to="/food" icon={<Utensils className="h-5 w-5" />} label="Food & calories" color="#16a34a" />
        <Item to="/water" icon={<Droplets className="h-5 w-5" />} label="Water" color="#0ea5e9" />
        <Item to="/reports" icon={<FileText className="h-5 w-5" />} label="Health reports" sub="Upload lab reports, prescriptions, scans" color="#475569" />
        <Item to="/history" icon={<History className="h-5 w-5" />} label="All readings" color="#e11d48" />
        <Item to="/add/hba1c" icon={<FlaskConical className="h-5 w-5" />} label="Add lab HbA1c" color="#be185d" />
      </div>
      <div className="card mt-4 divide-y divide-slate-100 overflow-hidden dark:divide-white/5">
        <Item to="/reminders" icon={<Bell className="h-5 w-5" />} label="Reminders & notifications" color="#f59e0b" />
        <Item to="/export" icon={<Share2 className="h-5 w-5" />} label="Share & export" sub="WhatsApp, PDF, Excel" color="#25D366" />
      </div>

      <div className="card mt-4 p-4">
        <div className="label">Appearance</div>
        <Segmented value={theme} onChange={v => { setT(v); setTheme(v); }} options={[{ id: 'system', label: <span className="inline-flex items-center gap-1"><SunMoon className="h-4 w-4" />Auto</span> }, { id: 'light', label: <span className="inline-flex items-center gap-1"><Sun className="h-4 w-4" />Light</span> }, { id: 'dark', label: <span className="inline-flex items-center gap-1"><Moon className="h-4 w-4" />Dark</span> }]} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {!demo && <Button variant="soft" onClick={() => setPwOpen(true)}><KeyRound className="h-4 w-4" />Password</Button>}
        <Button variant="danger" onClick={signOut} className={demo ? 'col-span-2' : ''}><LogOut className="h-4 w-4" />{demo ? 'Leave demo' : 'Sign out'}</Button>
      </div>
      <p className="mt-6 flex gap-2 px-1 text-[11.5px] leading-relaxed text-slate-400"><Info className="h-4 w-4 shrink-0" />VitalNest is a personal record-keeping tool. Ranges and tips follow common guidelines and are not a diagnosis. Always follow your doctor's advice; in an emergency call 108 / 112.</p>

      <Sheet open={pwOpen} onClose={() => setPwOpen(false)} title="Change password">
        <Field label="New password"><input type="password" className="field" value={pw} onChange={e => setPw(e.target.value)} minLength={6} autoComplete="new-password" /></Field>
        <Button block className="mt-4" disabled={pw.length < 6} onClick={async () => { try { await api().changePassword(pw); toast('Password changed'); setPwOpen(false); setPw(''); } catch (e) { toast((e as Error).message, 'err'); } }}>Update password</Button>
      </Sheet>
    </div>
  );
}
