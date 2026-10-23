import { useState } from 'react';
import { Eye, EyeOff, HeartPulse, ShieldCheck, Users, BellRing, Server, Smartphone } from 'lucide-react';
import { isNative } from '../lib/notify';
import { api, getServerConfig, hasBuiltInServer, resetApi, setDemo, setServerConfig, isDemo } from '../lib/api';
import { useApp } from '../lib/store';
import { Button, Field, Segmented, Sheet } from '../components/ui';

export default function Auth() {
  const { refreshAuth, toast } = useApp();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [srv, setSrv] = useState(false);
  const noServer = !getServerConfig();
  const demo = isDemo();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    if (noServer) { setSrv(true); return; }
    setBusy(true);
    const leavingDemo = !noServer && demo;
    if (leavingDemo) { setDemo(false); resetApi(); }
    try {
      if (mode === 'in') await api().signIn(username, pw);
      else {
        if (pw.length < 6) throw new Error('Password must be at least 6 characters');
        await api().signUp(username, pw, name || username);
      }
      if (leavingDemo) { window.location.replace('/'); return; }
      await refreshAuth();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  async function tryDemo() {
    setDemo(true); resetApi();
    await api().signIn('demo', '');
    await refreshAuth();
    toast('Demo mode — sample data stays on this device');
    window.location.replace('/');
  }

  return (
    <div className="min-h-screen">
      <div className="hero-grad relative overflow-hidden px-6 pb-24 pt-14 text-white safe-top">
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-emerald-300/20 blur-3xl" />
        <div className="relative mx-auto max-w-md">
          <div className="mb-6 grid h-14 w-14 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur">
            <HeartPulse className="h-7 w-7" />
          </div>
          <h1 className="text-[2rem] font-extrabold leading-tight">VitalNest</h1>
          <p className="mt-2 max-w-xs text-[0.9375rem] text-white/80">Sugar, BP, heart and medicines — tracked together for the whole family.</p>
          <div className="mt-6 flex flex-wrap gap-2 text-[0.75rem] font-semibold">
            <span className="chip bg-white/15 py-1.5"><Users className="h-3.5 w-3.5" />Family sharing</span>
            <span className="chip bg-white/15 py-1.5"><BellRing className="h-3.5 w-3.5" />Smart reminders</span>
            <span className="chip bg-white/15 py-1.5"><ShieldCheck className="h-3.5 w-3.5" />Private & secure</span>
          </div>
        </div>
      </div>

      <div className="relative mx-auto -mt-14 max-w-md px-4 pb-10">
        <form onSubmit={submit} className="card rise space-y-4 p-5">
          <Segmented value={mode} onChange={setMode} options={[{ id: 'in', label: 'Sign in' }, { id: 'up', label: 'Create account' }]} />
          {mode === 'up' && (
            <Field label="Your name"><input className="field" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Priya Sharma" autoComplete="name" /></Field>
          )}
          <Field label="Username" hint={mode === 'up' ? 'Letters, numbers, dot or underscore. No e-mail needed.' : undefined}>
            <input className="field" value={username} onChange={e => setUsername(e.target.value.replace(/\s/g, ''))} placeholder="username" autoCapitalize="none" autoComplete="username" required />
          </Field>
          <Field label="Password">
            <div className="relative">
              <input className="field pr-12" type={show ? 'text' : 'password'} value={pw} onChange={e => setPw(e.target.value)} placeholder="••••••••" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} required />
              <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400" aria-label="Show password">
                {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </Field>
          {err && <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{err}</div>}
          <Button type="submit" block size="lg" loading={busy}>{mode === 'in' ? 'Sign in' : 'Create account'}</Button>
        </form>

        <div className="mt-5 space-y-2 text-center">
          <button onClick={tryDemo} className="text-sm font-semibold text-brand-700 dark:text-brand-300">Explore with sample data →</button>
          {!isNative() && (
            <div><a href="https://github.com/Advankart/vitalnest/releases/latest/download/VitalNest.apk" className="mt-2 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-[0.8125rem] font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 dark:bg-night-2 dark:text-slate-200 dark:ring-white/10"><Smartphone className="h-4 w-4 text-brand-600" />Download Android app</a></div>
          )}
          {!hasBuiltInServer && (
            <div><button onClick={() => setSrv(true)} className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400"><Server className="h-3.5 w-3.5" />Server settings</button></div>
          )}
        </div>
        <p className="mx-auto mt-8 max-w-xs text-center text-[0.6875rem] leading-relaxed text-slate-400">
          VitalNest helps you keep records. It does not give medical diagnoses — always follow your doctor's advice.
        </p>
      </div>
      <ServerSheet open={srv} onClose={() => setSrv(false)} />
    </div>
  );
}

function ServerSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const cfg = getServerConfig();
  const [url, setUrl] = useState(cfg?.url ?? '');
  const [key, setKey] = useState(cfg?.key ?? '');
  return (
    <Sheet open={open} onClose={onClose} title="Connect your Supabase">
      <p className="mb-4 text-sm text-slate-500">Only needed if this build wasn't set up with your server. Find these in Supabase → Project Settings → API.</p>
      <div className="space-y-3">
        <Field label="Project URL"><input className="field" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://xxxx.supabase.co" autoCapitalize="none" /></Field>
        <Field label="Anon / publishable key"><input className="field" value={key} onChange={e => setKey(e.target.value)} placeholder="eyJhbGci… or sb_publishable_…" autoCapitalize="none" /></Field>
        <Button block onClick={() => { setServerConfig(url, key); setDemo(false); resetApi(); window.location.replace('/'); }} disabled={!url || !key}>Save & reload</Button>
      </div>
    </Sheet>
  );
}
