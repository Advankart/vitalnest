import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, Crown, Eye, HandHeart, MessageCircle, Pencil, UserMinus, ChevronRight, Plus } from 'lucide-react';
import { useApp } from '../lib/store';
import { api } from '../lib/api';
import { CONDITIONS, age } from '../lib/health';
import type { Person, Role } from '../lib/types';
import { Avatar, Button, PageHeader, Section, cx } from '../components/ui';
import { shareText } from '../lib/share';

const ROLES: Record<Role, { label: string; desc: string; icon: typeof Crown }> = {
  admin: { label: 'Admin', desc: 'Full control', icon: Crown },
  caregiver: { label: 'Caregiver', desc: 'Can add & edit for everyone', icon: HandHeart },
  viewer: { label: 'Viewer', desc: 'Can see all stats', icon: Eye },
};

export function Patients() {
  const { patients, role, selectPatient } = useApp();
  return (
    <div className="rise">
      <PageHeader title="Health profiles" subtitle="Everyone tracked in this family" right={role !== 'viewer' ? <Link to="/patients/new" className="rounded-xl bg-brand-600 px-3.5 py-2 text-[0.8125rem] font-semibold text-white"><Plus className="mr-1 inline h-4 w-4" />Add</Link> : undefined} />
      <div className="space-y-2">
        {patients.map(p => (
          <Link key={p.id} to={`/patients/${p.id}`} onClick={() => selectPatient(p.id)} className="card flex items-center gap-3 p-4">
            <Avatar name={p.full_name} color={p.color} size={48} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{p.full_name}</div>
              <div className="truncate text-xs text-slate-500">{[p.relation, age(p.dob) !== null ? `${age(p.dob)} yrs` : null, CONDITIONS[p.condition].label].filter(Boolean).join(' · ')}</div>
            </div>
            <ChevronRight className="h-4 w-4 text-slate-300" />
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function Family() {
  const { membership, role, user, toast, refreshAuth } = useApp();
  const [people, setPeople] = useState<Person[]>([]);
  const [editName, setEditName] = useState(false);
  const [name, setName] = useState(membership?.family.name ?? '');
  const fid = membership?.family.id;
  const load = () => fid && api().familyPeople(fid).then(setPeople).catch(e => toast(e.message, 'err'));
  useEffect(() => { load(); }, [fid]); // eslint-disable-line
  if (!membership) return null;
  const code = membership.family.invite_code;
  const appUrl = window.location.origin.startsWith('http') && !window.location.origin.includes('localhost') ? window.location.origin : 'the VitalNest app';
  const invite = `You're invited to *${membership.family.name}* on VitalNest 💚\n\nSee our family's sugar, BP & medicine records.\n1️⃣ Open ${appUrl}\n2️⃣ Create an account (username + password)\n3️⃣ Choose "I have a code" and enter: *${code}*`;

  async function setRole(p: Person, r: Role) {
    try { await api().setRole(fid!, p.user_id, r); load(); toast(`${p.display_name || p.username} is now ${ROLES[r].label}`); } catch (e) { toast((e as Error).message, 'err'); }
  }
  async function remove(p: Person) {
    const self = p.user_id === user?.id;
    if (!confirm(self ? 'Leave this family?' : `Remove ${p.display_name || p.username} from the family?`)) return;
    try { await api().removeMember(fid!, p.user_id); if (self) { await refreshAuth(); window.location.replace('/'); } else load(); } catch (e) { toast((e as Error).message, 'err'); }
  }

  return (
    <div className="rise">
      <PageHeader title="Family & sharing" />
      <div className="hero-grad overflow-hidden rounded-[28px] p-5 text-white">
        {editName ? (
          <div className="flex gap-2">
            <input className="field flex-1 text-ink" value={name} onChange={e => setName(e.target.value)} />
            <Button variant="dark" onClick={async () => { await api().renameFamily(fid!, name); await refreshAuth(); setEditName(false); }}>Save</Button>
          </div>
        ) : (
          <div className="flex items-center gap-2"><h2 className="text-xl font-bold">{membership.family.name}</h2>{role === 'admin' && <button onClick={() => setEditName(true)} className="opacity-70" aria-label="Rename"><Pencil className="h-4 w-4" /></button>}</div>
        )}
        <p className="mt-1 text-[0.8125rem] text-white/75">Invite family members so they can see health stats from their own phone.</p>
        <div className="mt-4 rounded-2xl bg-white/15 p-4 text-center ring-1 ring-white/20 backdrop-blur">
          <div className="text-[0.6875rem] font-semibold uppercase tracking-widest text-white/70">Invite code</div>
          <div className="mt-1 font-mono font-bold tracking-[.2em]" style={{ fontSize: 'min(2.125rem, 9vw)' }}>{code}</div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button onClick={() => shareText(invite, true)} className="flex items-center justify-center gap-2 rounded-2xl bg-[#25D366] py-3 text-sm font-semibold text-white"><MessageCircle className="h-4 w-4" />WhatsApp invite</button>
          <button onClick={() => { navigator.clipboard?.writeText(code); toast('Code copied'); }} className="flex items-center justify-center gap-2 rounded-2xl bg-white/20 py-3 text-sm font-semibold"><Copy className="h-4 w-4" />Copy code</button>
        </div>
      </div>

      <Section title={`Members (${people.length})`}>
        <div className="card divide-y divide-slate-100 dark:divide-white/5">
          {people.map(p => {
            const R = ROLES[p.role];
            return (
              <div key={p.user_id} className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <Avatar name={p.display_name || p.username} color="#475569" size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{p.display_name || p.username}{p.user_id === user?.id && <span className="ml-1 text-xs font-normal text-slate-400">(you)</span>}</div>
                    <div className="flex items-center gap-1 text-xs text-slate-500"><R.icon className="h-3 w-3" />{R.label} · @{p.username}</div>
                  </div>
                  {(role === 'admin' || p.user_id === user?.id) && p.role !== 'admin' && (
                    <button onClick={() => remove(p)} className="p-2 text-slate-300 hover:text-red-500" aria-label="Remove"><UserMinus className="h-4 w-4" /></button>
                  )}
                </div>
                {role === 'admin' && p.user_id !== user?.id && (
                  <div className="mt-2 flex flex-wrap gap-1.5 pl-[3.25rem]">
                    {(Object.keys(ROLES) as Role[]).map(r => (
                      <button key={r} onClick={() => setRole(p, r)} className={cx('chip py-1.5', p.role === r ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500 dark:bg-white/5')}>{ROLES[r].label}</button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-2 px-1 text-[0.75rem] text-slate-400">New members join as <b>Viewer</b>. Make someone a <b>Caregiver</b> if they log readings for others. A person can always edit their own profile if it's linked to their login.</p>
      </Section>
    </div>
  );
}
