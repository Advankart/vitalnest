import { useEffect, useRef, useState } from 'react';
import { t } from '../lib/i18n';
import { ChevronRight, Flame, Leaf, RefreshCw, Sparkles, Utensils } from 'lucide-react';
import { useApp } from '../lib/store';
import { api } from '../lib/api';
import { cachedAI, currentSlot, getAI, SLOT_LABEL, type DietPlan, type MealSlot, type Motivation } from '../lib/ai';
import type { Patient } from '../lib/types';
import { Sheet, cx } from './ui';

const TONE: Record<Motivation['tone'], string> = {
  great: 'from-emerald-500 to-teal-500', good: 'from-teal-500 to-sky-500', keep_going: 'from-sky-500 to-indigo-500', attention: 'from-amber-500 to-orange-500',
};

/** "You are progressing well" — a short AI message based on this week's readings. */
export function MotivationCard({ latestId }: { latestId?: string }) {
  const { patient, data } = useApp();
  const pid = patient?.id ?? '';
  const extra = `_${latestId ?? ''}_${data.medLogs.length}`;
  const [m, setM] = useState<Motivation | null>(() => (pid ? cachedAI<Motivation>('motivation', pid, extra) : null));
  const [err, setErr] = useState(false);
  useEffect(() => {
    if (!pid || api().mode !== 'cloud') return;
    let live = true; setErr(false);
    const t = setTimeout(() => getAI<Motivation>('motivation', pid, { extra }).then(v => live && setM(v)).catch(() => live && setErr(true)), 400);
    return () => { live = false; clearTimeout(t); };
  }, [pid, extra]);
  if (api().mode !== 'cloud' || err && !m) return null;
  if (!m) return <div className="mt-4 h-[5.5rem] animate-pulse rounded-3xl bg-slate-200/70 dark:bg-white/5" />;
  return (
    <div className={cx('rise mt-4 flex items-start gap-3 rounded-3xl bg-gradient-to-r p-4 text-white shadow-lg', TONE[m.tone] ?? TONE.good)}>
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/20 text-[1.5rem]">{m.emoji || '✨'}</div>
      <div className="min-w-0 flex-1">
        <div className="font-display text-[1rem] font-bold leading-snug">{m.headline}</div>
        <div className="mt-0.5 text-[0.8125rem] leading-snug text-white/90">{m.message}</div>
      </div>
      <Sparkles className="h-4 w-4 shrink-0 opacity-70" />
    </div>
  );
}

const PREFS: { id: NonNullable<Patient['diet_pref']>; label: string }[] = [
  { id: 'veg', label: 'Veg' }, { id: 'egg', label: 'Veg + egg' }, { id: 'nonveg', label: 'Non-veg' }, { id: 'jain', label: 'Jain' },
];

function MealBlock({ meal, big }: { meal: DietPlan['meals'][number]; big?: boolean }) {
  return (
    <div>
      <div className={cx('font-semibold', big ? 'text-[1rem]' : 'text-[0.9062rem]')}>{meal.title}</div>
      <div className="mt-2 divide-y divide-slate-100 dark:divide-white/5">
        {(meal.items ?? []).map((it, i) => (
          <div key={i} className="flex items-baseline gap-2 py-1.5 text-[0.8438rem]">
            <span className="min-w-0 flex-1 break-words">{it.name} <span className="text-slate-400">· {it.qty}</span></span>
            <span className="shrink-0 font-semibold tabular-nums text-orange-600 dark:text-orange-300">{Math.round(Number(it.kcal) || 0)} kcal</span>
          </div>
        ))}
      </div>
      <div className="mt-1 flex items-center justify-between text-[0.75rem]">
        <span className="min-w-0 flex-1 pr-2 text-slate-500"><Leaf className="mr-1 inline h-3 w-3 text-emerald-500" />{meal.why}</span>
        <span className="shrink-0 font-bold">{Math.round(Number(meal.total_kcal) || 0)} kcal</span>
      </div>
    </div>
  );
}

/** AI heart-healthy Indian menu: shows the meal for right now, with calories; full day in a sheet. */
export function DietCard() {
  const { patient, canEdit, refreshPatients, toast } = useApp();
  const pid = patient?.id ?? '';
  const [pref, setPrefState] = useState<string>(patient?.diet_pref ?? 'veg');
  useEffect(() => { setPrefState(patient?.diet_pref ?? 'veg'); }, [pid, patient?.diet_pref]);
  const [plan, setPlan] = useState<DietPlan | null>(() => (pid ? cachedAI<DietPlan>('diet', pid, `_${patient?.diet_pref ?? 'veg'}`) : null));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(false);
  const slot: MealSlot = currentSlot();
  const reqId = useRef(0);

  async function load(p = pref, refresh = false) {
    if (!pid) return;
    const id = ++reqId.current;
    const cached = !refresh ? cachedAI<DietPlan>('diet', pid, `_${p}`) : null;
    if (cached) { setPlan(cached); setErr(''); }       // instant when this menu was already made today
    setBusy(true); setErr('');
    try {
      const v = await getAI<DietPlan>('diet', pid, { refresh, extra: `_${p}`, body: { pref: p } });
      if (id === reqId.current) setPlan(v);
    } catch (e) { if (id === reqId.current) setErr((e as Error).message); }
    finally { if (id === reqId.current) setBusy(false); }
  }
  useEffect(() => { if (pid && api().mode === 'cloud') load(pref); }, [pid]); // eslint-disable-line

  function setPref(p: string) {
    if (!patient || !canEdit || p === pref) return;
    setPrefState(p);                     // switch at once…
    load(p);                             // …start the new menu immediately…
    api().savePatient({ id: patient.id, diet_pref: p as Patient['diet_pref'] })   // …and remember the choice in the background
      .then(() => refreshPatients()).catch(e => toast((e as Error).message, 'err'));
  }

  if (!patient || api().mode !== 'cloud') return null;
  const meals = plan?.meals ?? [];
  const idx = Math.max(0, meals.findIndex(m => m.slot === slot));
  const meal = meals[idx];
  const next = meals.slice(idx + 1).find(m => m.slot === 'lunch' || m.slot === 'dinner' || m.slot === 'breakfast');
  const prefLabel = PREFS.find(x => x.id === pref)?.label ?? '';

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="text-[1.0625rem] font-bold">Heart-healthy menu</h2>
        {plan && <button onClick={() => load(pref, true)} disabled={busy} className="flex items-center gap-1 text-[0.8125rem] font-semibold text-brand-600 disabled:opacity-50 dark:text-brand-300"><RefreshCw className={cx('h-3.5 w-3.5', busy && 'animate-spin')} />New ideas</button>}
      </div>
      <div className="card overflow-hidden">
        <div className="flex items-center gap-3 bg-gradient-to-r from-orange-50 to-amber-50 px-4 py-3 dark:from-orange-500/10 dark:to-amber-500/5">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-500 text-white"><Utensils className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <div className="text-[0.75rem] font-semibold uppercase tracking-wide text-orange-700 dark:text-orange-300">{t('Recommended for your ' + SLOT_LABEL[meal?.slot ?? slot].toLowerCase())}</div>
            <div className="text-[0.75rem] text-slate-500">Diabetes &amp; heart friendly · AI suggestion</div>
          </div>
          {meal && <div className="shrink-0 text-right"><div className="font-display text-lg font-bold leading-none">{Math.round(Number(meal.total_kcal) || 0)}</div><div className="text-[0.6875rem] text-slate-500">kcal</div></div>}
        </div>
        <div className="p-4">
          {plan && busy && <div className="mb-3 flex items-center gap-2 rounded-xl bg-orange-50 px-3 py-2 text-[0.75rem] font-semibold text-orange-700 dark:bg-orange-500/10 dark:text-orange-300"><RefreshCw className="h-3.5 w-3.5 animate-spin" />{t('Preparing {pref} menu…', { pref: t(prefLabel) })}</div>}
          {!plan && busy && <div className="space-y-2"><div className="h-4 w-2/3 animate-pulse rounded bg-slate-200 dark:bg-white/10" /><div className="h-3 w-full animate-pulse rounded bg-slate-100 dark:bg-white/5" /><div className="h-3 w-5/6 animate-pulse rounded bg-slate-100 dark:bg-white/5" /><div className="pt-1 text-xs text-slate-400">Preparing today's menu…</div></div>}
          {!plan && !busy && err && <div className="text-[0.8125rem] text-slate-500">{err} <button onClick={() => load(pref)} className="font-semibold text-brand-600">Try again</button></div>}
          {meal && <div className={cx('transition-opacity', busy && 'opacity-40')}><MealBlock meal={meal} /></div>}
          {next && !busy && (
            <button onClick={() => setOpen(true)} className="mt-3 flex w-full items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-left text-[0.8125rem] dark:bg-white/[.03]">
              <span className="shrink-0 font-semibold text-slate-500">{t(SLOT_LABEL[next.slot])}:</span>
              <span className="min-w-0 flex-1 truncate">{next.title}</span>
              <span className="shrink-0 font-semibold text-orange-600 dark:text-orange-300">{Math.round(Number(next.total_kcal) || 0)} kcal</span>
            </button>
          )}
          {canEdit && (
            <div className="no-scrollbar -mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1">
              {PREFS.map(p => <button key={p.id} onClick={() => setPref(p.id)} className={cx('chip shrink-0 py-1.5 text-[0.75rem] transition active:scale-95', pref === p.id ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500 dark:bg-white/5')}>{pref === p.id && busy && <RefreshCw className="h-3 w-3 animate-spin" />}{p.label}</button>)}
            </div>
          )}
        </div>
        {plan && (
          <button onClick={() => setOpen(true)} className="flex w-full items-center gap-2 border-t border-slate-100 px-4 py-3 text-[0.8438rem] font-semibold text-brand-700 dark:border-white/5 dark:text-brand-300">
            <Flame className="h-4 w-4 text-orange-500" />{t('Full day menu · {n} kcal', { n: Math.round(Number(plan.day_total_kcal) || 0) })}<ChevronRight className="ml-auto h-4 w-4" />
          </button>
        )}
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title="Today's heart-healthy menu">
        {plan && (
          <div className="space-y-5">
            {(plan.meals ?? []).map(m => (
              <div key={m.slot} className={cx('rounded-2xl p-3 ring-1', m.slot === slot ? 'bg-orange-50/60 ring-orange-200 dark:bg-orange-500/5 dark:ring-orange-500/20' : 'ring-slate-100 dark:ring-white/5')}>
                <div className="mb-1 flex items-center justify-between text-[0.75rem] font-bold uppercase tracking-wide text-slate-500"><span>{SLOT_LABEL[m.slot]}</span>{m.slot === slot && <span className="text-orange-600">Now</span>}</div>
                <MealBlock meal={m} big />
              </div>
            ))}
            <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 dark:bg-white/[.03]"><span className="font-semibold">Day total</span><span className="font-display text-lg font-bold">{Math.round(Number(plan.day_total_kcal) || 0)} kcal</span></div>
            {plan.tips?.length > 0 && <ul className="space-y-1.5 text-[0.8438rem] text-slate-600 dark:text-slate-300">{plan.tips.map((t, i) => <li key={i} className="flex gap-2"><Leaf className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />{t}</li>)}</ul>}
            <p className="text-[0.75rem] text-slate-400">{t("AI suggestion based on {name}'s readings and a {n} kcal goal. Follow your doctor's or dietitian's advice first.", { name: patient.full_name.split(' ')[0], n: patient.daily_kcal_goal })}</p>
          </div>
        )}
      </Sheet>
    </section>
  );
}
