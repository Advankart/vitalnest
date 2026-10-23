import { useState } from 'react';
import { format, isToday, subDays } from 'date-fns';
import { GlassWater, Trash2 } from 'lucide-react';
import { useApp } from '../lib/store';
import { api } from '../lib/api';
import { dayKey } from '../lib/health';
import type { WaterLog } from '../lib/types';
import { Button, PageHeader, ViewOnlyNote } from '../components/ui';
import { DailyBars } from '../components/Charts';

export default function Water() {
  const { patient, data, canEdit, refreshData, toast } = useApp();
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  if (!patient) return null;
  const today = data.water.filter(w => isToday(new Date(w.logged_at)));
  const total = today.reduce((a, b) => a + b.ml, 0), goal = patient.daily_water_goal_ml;
  const pct = Math.min(100, total / goal * 100);
  const week = Array.from({ length: 7 }, (_, i) => { const d = subDays(new Date(), 6 - i); const k = dayKey(d); return { day: format(d, 'EEE'), v: data.water.filter(w => dayKey(new Date(w.logged_at)) === k).reduce((a, b) => a + b.ml, 0) }; });

  async function add(ml: number) {
    if (!canEdit || !ml) return;
    setBusy(true);
    try { await api().insert<WaterLog>('water_logs', { patient_id: patient!.id, ml, logged_at: new Date().toISOString() }); await refreshData(); toast(`+${ml} ml`); setCustom(''); }
    catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); }
  }
  async function del(id: string) { try { await api().remove('water_logs', id); await refreshData(); } catch (e) { toast((e as Error).message, 'err'); } }

  return (
    <div className="rise">
      <PageHeader title="Water" subtitle={patient.full_name} />
      <ViewOnlyNote />
      <div className="card flex flex-col items-center p-6">
        <div className="relative h-52 w-36 overflow-hidden rounded-b-[44px] rounded-t-2xl border-4 border-sky-100 bg-sky-50/50 dark:border-sky-500/20 dark:bg-sky-500/5">
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-sky-600 to-sky-400 transition-all duration-700" style={{ height: `${pct}%` }}>
            <div className="absolute -top-2 left-0 h-4 w-[200%] animate-[wave_3s_linear_infinite] rounded-[50%] bg-sky-400/70" />
          </div>
          <div className="absolute inset-0 grid place-items-center text-center">
            <div className={pct > 45 ? 'text-white' : ''}><div className="font-display text-3xl font-extrabold">{(total / 1000).toFixed(2)}</div><div className="text-xs font-semibold opacity-80">of {(goal / 1000).toFixed(1)} L</div></div>
          </div>
        </div>
        <p className="mt-4 text-sm text-slate-500">{total >= goal ? 'Goal reached today 🎉' : `${Math.ceil((goal - total) / 250)} more glasses to reach your goal`}</p>
        {patient.condition === 'type2_cardiac' && <p className="mt-1 text-center text-[0.7188rem] text-slate-400">If your doctor set a fluid limit for your heart, use that as your goal in the health profile.</p>}
      </div>
      <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(4.75rem,1fr))] gap-2">
        {[150, 250, 500, 1000].map(ml => (
          <button key={ml} disabled={busy || !canEdit} onClick={() => add(ml)} className="card flex flex-col items-center gap-1 py-4 transition active:scale-95 disabled:opacity-50">
            <GlassWater className="text-sky-500" style={{ width: 16 + ml / 60, height: 16 + ml / 60 }} />
            <span className="text-[0.8125rem] font-bold">{ml >= 1000 ? '1 L' : `${ml} ml`}</span>
          </button>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <input className="field" inputMode="numeric" value={custom} onChange={e => setCustom(e.target.value.replace(/\D/g, ''))} placeholder="Custom amount (ml)" />
        <Button onClick={() => add(Number(custom))} disabled={!custom || !canEdit}>Add</Button>
      </div>
      <section className="card mt-4 p-4"><h2 className="mb-2 text-[0.9375rem] font-bold">This week</h2><DailyBars rows={week} color="#0284c7" unit="ml" goal={goal} /></section>
      {today.length > 0 && (
        <section className="card mt-4 divide-y divide-slate-100 dark:divide-white/5">
          {today.map(w => (
            <div key={w.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <span className="text-slate-500">{format(new Date(w.logged_at), 'h:mm a')}</span>
              <span className="flex items-center gap-2 font-semibold">{w.ml} ml{canEdit && <button onClick={() => del(w.id)} className="p-1 text-slate-300 hover:text-red-500" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>}</span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
