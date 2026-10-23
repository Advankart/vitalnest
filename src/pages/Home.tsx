import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatDistanceToNowStrict, format, isToday } from 'date-fns';
import { AlertTriangle, Check, ChevronRight, Clock, Droplets, Flame, Pill, Plus, Sparkles, Users } from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer, YAxis } from 'recharts';
import { useApp } from '../lib/store';
import { toggleDose } from '../lib/actions';
import { advice, classify, ctxLabel, dayKey, eA1c, fmtVital, hhmm, medsForDate, STATUS_STYLE, stats, to12h, VITALS, vitalsFor, FOOD_REL } from '../lib/health';
import type { Vital, VitalKind } from '../lib/types';
import { Empty, Ring, Section, Spinner, cx } from '../components/ui';
import { VitalIcon } from '../components/Layout';

export default function Home() {
  const { patient, patients, patientsReady, data, loading, canEdit, refreshData, toast, membership } = useApp();
  const nav = useNavigate();
  const [busyMed, setBusyMed] = useState<string | null>(null);

  const latest = useMemo(() => {
    const m: Partial<Record<VitalKind, Vital>> = {};
    for (const v of data.vitals) if (!m[v.kind]) m[v.kind] = v; // list is newest-first
    return m;
  }, [data.vitals]);

  if (!patient) {
    if (patientsReady && !patients.length && membership) {
      return <div className="pt-6"><Empty icon={<Users className="h-7 w-7" />} title="Add the first person" text="Create a health profile for yourself or a family member to start tracking." action={<Link to="/patients/new?first=1" className="rounded-2xl bg-brand-600 px-5 py-3 font-semibold text-white">Create profile</Link>} /></div>;
    }
    return <Spinner />;
  }

  const now = new Date();
  const g30 = data.vitals.filter(v => v.kind === 'glucose' && +new Date(v.measured_at) > +now - 30 * 864e5);
  const g7 = g30.filter(v => +new Date(v.measured_at) > +now - 7 * 864e5).slice().reverse();
  const gStats = stats(g30.map(v => Number(v.value1)));
  const lg = latest.glucose;
  const lgStatus = lg ? classify(lg, patient) : null;

  const todayMeds = medsForDate(data.meds, now);
  const tk = dayKey(now);
  const taken = (mid: string, t: string) => data.medLogs.find(l => l.medicine_id === mid && l.scheduled_date === tk && l.scheduled_time === t);
  const doneCount = todayMeds.filter(s => taken(s.med.id, s.time)?.status === 'taken').length;

  const waterToday = data.water.filter(w => isToday(new Date(w.logged_at))).reduce((a, b) => a + b.ml, 0);
  const kcalToday = data.meals.filter(m => isToday(new Date(m.eaten_at))).reduce((a, b) => a + Number(b.total_kcal), 0);
  const carbsToday = data.meals.filter(m => isToday(new Date(m.eaten_at))).reduce((a, b) => a + Number(b.total_carbs), 0);

  const critical = Object.values(latest).filter((v): v is Vital => {
    if (!v) return false;
    const recent = +now - +new Date(v.measured_at) < 12 * 36e5;
    return recent && (classify(v, patient).startsWith('critical') || (v.kind === 'glucose' && v.value1 < 70));
  });
  const nextReminders = data.reminders.filter(r => r.enabled && r.days.includes(now.getDay()) && r.time > hhmm(now)).sort((a, b) => a.time.localeCompare(b.time)).slice(0, 3);
  const hour = now.getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  async function toggleMed(mid: string, t: string) {
    if (!canEdit) { toast('View-only access', 'err'); return; }
    setBusyMed(mid + t);
    try {
      const med = data.meds.find(m => m.id === mid);
      if (med) await toggleDose(med, tk, t, !!taken(mid, t));
      await refreshData();
    } catch (e) { toast((e as Error).message, 'err'); } finally { setBusyMed(null); }
  }

  return (
    <div className="rise">
      {/* Hero */}
      <div className="hero-grad relative mt-1 overflow-hidden rounded-[30px] p-5 text-white shadow-[0_20px_40px_-20px_rgba(15,118,110,.8)]">
        <div className="absolute -right-10 -top-12 h-44 w-44 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex items-start justify-between">
          <div>
            <div className="text-[0.8125rem] font-medium text-white/75">{greet}, {patient.full_name.split(' ')[0]}</div>
            <div className="mt-3 text-[0.75rem] font-semibold uppercase tracking-wider text-white/70">Latest blood sugar</div>
            {lg ? (
              <>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="font-display text-[3.25rem] font-extrabold leading-none">{Math.round(lg.value1)}</span>
                  <span className="text-sm font-semibold text-white/75">mg/dL</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[0.7812rem]">
                  {lgStatus && <span className="chip bg-white/20 text-white"><span className="h-1.5 w-1.5 rounded-full" style={{ background: STATUS_STYLE[lgStatus].dot }} />{STATUS_STYLE[lgStatus].label}</span>}
                  <span className="text-white/75">{ctxLabel(lg.context)} · {formatDistanceToNowStrict(new Date(lg.measured_at), { addSuffix: true })}</span>
                </div>
              </>
            ) : <div className="mt-2 text-white/80">No readings yet</div>}
          </div>
          <button onClick={() => nav('/add/glucose')} className="grid h-12 w-12 place-items-center rounded-2xl bg-white/20 ring-1 ring-white/30 backdrop-blur transition active:scale-95" aria-label="Add sugar">
            <Plus className="h-6 w-6" />
          </button>
        </div>
        {g7.length > 1 && (
          <div className="relative -mx-2 mt-3 h-16">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={g7.map(v => ({ v: Number(v.value1) }))}>
                <defs><linearGradient id="hg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity={.45} /><stop offset="1" stopColor="#fff" stopOpacity={0} /></linearGradient></defs>
                <YAxis hide domain={['dataMin - 20', 'dataMax + 20']} />
                <Area type="monotone" dataKey="v" stroke="#fff" strokeWidth={2} fill="url(#hg)" dot={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="relative mt-3 grid grid-cols-3 gap-2 border-t border-white/15 pt-3 text-center">
          <div><div className="font-display text-lg font-bold">{gStats.n ? Math.round(gStats.avg) : '—'}</div><div className="text-[0.6875rem] text-white/70">30-day avg</div></div>
          <div><div className="font-display text-lg font-bold">{gStats.n >= 10 ? `${eA1c(gStats.avg).toFixed(1)}%` : '—'}</div><div className="text-[0.6875rem] text-white/70">Est. HbA1c</div></div>
          <div><div className="font-display text-lg font-bold">{latest.hba1c ? `${Number(latest.hba1c.value1).toFixed(1)}%` : '—'}</div><div className="text-[0.6875rem] text-white/70">Lab HbA1c</div></div>
        </div>
      </div>

      {/* Alerts */}
      {critical.slice(0, 2).map(v => {
        const a = advice(v, patient);
        return (
          <div key={v.id} className="mt-4 flex gap-3 rounded-3xl bg-red-50 p-4 text-red-800 ring-1 ring-red-100 dark:bg-red-500/10 dark:text-red-200 dark:ring-red-500/20">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="text-[0.8438rem]"><b>{VITALS[v.kind].label} {fmtVital(v)} {VITALS[v.kind].unit}</b>{a && <p className="mt-1 leading-snug">{a}</p>}</div>
          </div>
        );
      })}

      {/* Vital tiles */}
      <Section title="Vitals" action={<Link to="/history" className="text-[0.8125rem] font-semibold text-brand-600 dark:text-brand-300">History</Link>}>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-3">
          {vitalsFor(patient.condition).filter(k => k !== 'glucose').slice(0, 4).map(k => {
            const v = latest[k], meta = VITALS[k], st = v ? classify(v, patient) : null;
            return (
              <button key={k} onClick={() => nav(`/add/${k}`)} className="card p-4 text-left transition active:scale-[.98]">
                <div className="flex items-center justify-between">
                  <div className="grid h-9 w-9 place-items-center rounded-xl" style={{ background: meta.color + '18', color: meta.color }}><VitalIcon kind={k} className="h-[1.125rem] w-[1.125rem]" /></div>
                  {st && <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_STYLE[st].dot }} />}
                </div>
                <div className="mt-3 text-[0.7812rem] font-medium text-slate-500 dark:text-slate-400">{meta.label}</div>
                <div className="mt-0.5 flex items-baseline gap-1">
                  <span className="font-display text-[1.625rem] font-bold leading-tight">{v ? fmtVital(v) : '—'}</span>
                  <span className="text-xs text-slate-400">{meta.unit}</span>
                </div>
                <div className="mt-0.5 truncate text-[0.7188rem] text-slate-400">
                  {v ? <>{formatDistanceToNowStrict(new Date(v.measured_at), { addSuffix: true })}{k === 'bp' && v.value3 ? ` · ${Math.round(v.value3)} bpm` : ''}</> : 'Tap to add'}
                </div>
              </button>
            );
          })}
        </div>
      </Section>

      {/* Water & food */}
      <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-3">
        <Link to="/water" className="card flex items-center gap-3 p-4">
          <Ring pct={waterToday / patient.daily_water_goal_ml * 100} size={56} stroke={6} color="#0ea5e9"><Droplets className="h-5 w-5 text-sky-500" /></Ring>
          <div className="min-w-0"><div className="text-[0.75rem] font-medium text-slate-500">Water</div><div className="font-display text-lg font-bold">{(waterToday / 1000).toFixed(1)}<span className="text-xs font-medium text-slate-400"> / {(patient.daily_water_goal_ml / 1000).toFixed(1)} L</span></div></div>
        </Link>
        <Link to="/food" className="card flex items-center gap-3 p-4">
          <Ring pct={kcalToday / patient.daily_kcal_goal * 100} size={56} stroke={6} color="#22c55e"><Flame className="h-5 w-5 text-green-500" /></Ring>
          <div className="min-w-0"><div className="text-[0.75rem] font-medium text-slate-500">Calories</div><div className="font-display text-lg font-bold">{Math.round(kcalToday)}<span className="text-xs font-medium text-slate-400"> kcal</span></div><div className="text-[0.6875rem] text-slate-400">{Math.round(carbsToday)} g carbs</div></div>
        </Link>
      </div>

      {/* Medicines */}
      <Section title="Today's medicines" action={todayMeds.length ? <span className="text-[0.8125rem] font-semibold text-slate-400">{doneCount}/{todayMeds.length} taken</span> : undefined}>
        {todayMeds.length ? (
          <div className="card divide-y divide-slate-100 overflow-hidden dark:divide-white/5">
            {todayMeds.map(({ med, time }) => {
              const done = taken(med.id, time)?.status === 'taken';
              const overdue = !done && time < hhmm(now);
              return (
                <div key={med.id + time} className="flex items-center gap-3 px-4 py-3">
                  <div className={cx('w-16 shrink-0 text-[0.7812rem] font-semibold', overdue ? 'text-amber-600' : 'text-slate-500')}>{to12h(time)}</div>
                  <div className="min-w-0 flex-1">
                    <div className={cx('break-words text-[0.9062rem] font-semibold', done && 'text-slate-400 line-through')}>{med.name} <span className="font-normal text-slate-400">{med.strength}</span></div>
                    <div className="text-xs text-slate-400">{[med.dose, FOOD_REL[med.food_relation ?? '']].filter(Boolean).join(' · ')}</div>
                  </div>
                  <button onClick={() => toggleMed(med.id, time)} disabled={busyMed === med.id + time} aria-label="Mark taken"
                    className={cx('grid h-10 w-10 shrink-0 place-items-center rounded-full ring-2 transition active:scale-90', done ? 'bg-brand-600 text-white ring-brand-600' : overdue ? 'text-amber-500 ring-amber-300' : 'text-slate-300 ring-slate-200 dark:ring-white/10')}>
                    <Check className="h-5 w-5" strokeWidth={3} />
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <Link to="/meds" className="card flex items-center gap-3 p-4 text-sm text-slate-500"><Pill className="h-5 w-5 text-purple-500" />No medicines scheduled today. Add medicines<ChevronRight className="ml-auto h-4 w-4" /></Link>
        )}
      </Section>

      {/* Upcoming */}
      {nextReminders.length > 0 && (
        <Section title="Coming up">
          <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4">
            {nextReminders.map(r => (
              <button key={r.id} onClick={() => nav(r.kind === 'water' ? '/water' : `/add/${r.kind}`)} className="card flex min-w-[11.25rem] items-center gap-3 p-3.5 text-left">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-300"><Clock className="h-5 w-5" /></div>
                <div className="min-w-0"><div className="text-[0.8125rem] font-bold">{to12h(r.time)}</div><div className="truncate text-xs text-slate-500">{r.label}</div></div>
              </button>
            ))}
          </div>
        </Section>
      )}

      {/* Recent */}
      <Section title="Recent entries" action={<Link to="/history" className="text-[0.8125rem] font-semibold text-brand-600 dark:text-brand-300">See all</Link>}>
        {loading && !data.vitals.length ? <Spinner /> : data.vitals.length ? (
          <div className="card divide-y divide-slate-100 dark:divide-white/5">
            {data.vitals.slice(0, 5).map(v => {
              const st = classify(v, patient), m = VITALS[v.kind];
              return (
                <div key={v.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: m.color + '18', color: m.color }}><VitalIcon kind={v.kind} className="h-[1.125rem] w-[1.125rem]" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[0.875rem] font-semibold">{m.label}{v.context ? <span className="font-normal text-slate-400"> · {ctxLabel(v.context)}</span> : null}</div>
                    <div className="text-xs text-slate-400">{format(new Date(v.measured_at), 'd MMM, h:mm a')}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-display font-bold">{fmtVital(v)} <span className="text-[0.6875rem] font-medium text-slate-400">{m.unit}</span></div>
                    <span className="text-[0.6875rem] font-semibold" style={{ color: STATUS_STYLE[st].dot }}>{STATUS_STYLE[st].label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : <Empty icon={<Sparkles className="h-7 w-7" />} title="No entries yet" text="Tap + to log the first reading. Date and time are recorded automatically." />}
      </Section>
    </div>
  );
}
