import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, KeyRound, LogOut } from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../lib/store';
import { Button, Field } from '../components/ui';

export default function Onboarding() {
  const { user, refreshAuth, selectFamily, toast } = useApp();
  const nav = useNavigate();
  const [tab, setTab] = useState<'create' | 'join'>('create');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    try {
      const f = tab === 'create' ? await api().createFamily(name.trim() || 'My Family') : await api().joinFamily(code);
      await refreshAuth();
      selectFamily(f.id);
      if (tab === 'create') nav('/patients/new?first=1', { replace: true });
      else { toast(`Joined ${f.name}`); nav('/', { replace: true }); }
    } catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-10 safe-top">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500">Signed in as <b>{user?.username}</b></div>
        <button onClick={() => api().signOut().then(refreshAuth)} className="flex items-center gap-1 text-sm text-slate-400"><LogOut className="h-4 w-4" />Sign out</button>
      </div>
      <h1 className="mt-8 text-[28px] font-extrabold">Set up your family</h1>
      <p className="mt-1 text-slate-500">Create a family group to track health for everyone, or join one with an invite code.</p>

      <div className="mt-6 grid grid-cols-2 gap-3">
        {([['create', 'Create family', <Home key="h" className="h-6 w-6" />], ['join', 'I have a code', <KeyRound key="k" className="h-6 w-6" />]] as const).map(([id, label, icon]) => (
          <button key={id} onClick={() => setTab(id)} className={`card flex flex-col items-start gap-3 p-4 text-left transition ${tab === id ? 'ring-2 ring-brand-500' : ''}`}>
            <div className={`grid h-11 w-11 place-items-center rounded-2xl ${tab === id ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500 dark:bg-white/5'}`}>{icon}</div>
            <span className="font-semibold">{label}</span>
          </button>
        ))}
      </div>

      <div className="card mt-4 space-y-4 p-5">
        {tab === 'create' ? (
          <Field label="Family name"><input className="field" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Sharma Family" /></Field>
        ) : (
          <Field label="Invite code" hint="Ask the family admin — it's in More → Family.">
            <input className="field text-center font-mono text-2xl tracking-[.4em] uppercase" maxLength={6} value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="ABC123" />
          </Field>
        )}
        <Button block size="lg" loading={busy} onClick={go} disabled={tab === 'join' && code.length < 6}>{tab === 'create' ? 'Create & continue' : 'Join family'}</Button>
      </div>
    </div>
  );
}
