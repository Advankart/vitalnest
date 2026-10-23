import { useMemo, useState, type ReactNode } from 'react';
import { t } from '../lib/i18n';
import { Link } from 'react-router-dom';
import { format, subDays } from 'date-fns';
import { Share2, TrendingDown, TrendingUp, Minus as Flat } from 'lucide-react';
import { useApp } from '../lib/store';
import { adherence, eA1c, stats, timeInRange, VITALS, dayKey } from '../lib/health';
import { BPChart, ContextBars, DailyBars, GlucoseChart, SERIES, SimpleLine, TIRBar } from '../components/Charts';
import { Segmented } from '../components/ui';
import { VitalIcon } from '../components/Layout';
import { TrendsAI } from '../components/TrendsAI';

function Card({ title, kind, right, children }: { title: string; kind?: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="card mt-4 p-4">
      <div className="mb-3 flex items-center gap-2.5">
        {kind && <div className="grid h-8 w-8 place-items-center rounded-lg" style={{ background: (VITALS as any)[kind]?.color + '18' || '#e2e8f0', color: (VITALS as any)[kind]?.color }}><VitalIcon kind={kind} className="h-4 w-4" /></div>}
        <h2 className="flex-1 text-[0.9375rem] font-bold">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}
function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-3 py-2.5 dark:bg-white/[.03]">
      <div className="text-[0.6875rem] font-medium text-slate-500 dark:text-slate-400">{label}</div>
      <div className="font-display text-[1.0625rem] font-bold">{value}<span className="text-[0.6875rem] font-medium text-slate-400"> {unit}</span></div>
    </div>
  );
}
function Delta({ now, prev, goodDown = true }: { now: number; prev: number; goodDown?: boolean }) {
  if (!now || !prev) return null;
  const d = now - prev, pct = (d / prev) * 100;
  if (Math.abs(pct) < 2) return <span className="chip bg-slate-100 text-slate-500 dark:bg-white/5"><Flat className="h-3 w-3" />Stable</span>;
  const good = goodDown ? d < 0 : d > 0;
  return <span className={`chip ${good ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300'}`}>{d < 0 ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}{Math.abs(pct).toFixed(0)}% vs prev</span>;
}

export default function Trends() {
  const { patient, data } = useApp();
  const [range, setRange] = useState<'7' | '30' | '90' | '365'>('30');
  const days = Number(range);
  const since = Date.now() - days * 864e5, prevSince = since - days * 864e5;
  const inR = useMemo(() => data.vitals.filter(v => +new Date(v.measured_at) >= since), [data.vitals, since]);
  const prevR = useMemo(() => data.vitals.filter(v => { const t = +new Date(v.measured_at); return t >= prevSince && t < since; }), [data.vitals, since, prevSince]);
  if (!patient) return null;

  const g = inR.filter(v => v.kind === 'glucose'), gs = stats(g.map(v => Number(v.value1)));
  const gp = stats(prevR.filter(v => v.kind === 'glucose').map(v => Number(v.value1)));
  const fast = stats(g.filter(v => v.context === 'fasting').map(v => Number(v.value1)));
  const pp = stats(g.filter(v => v.context === 'after_meal').map(v => Number(v.value1)));
  const tir = timeInRange(g);
  const bp = inR.filter(v => v.kind === 'bp');
  const sys = stats(bp.map(v => Number(v.value1))), dia = stats(bp.map(v => Number(v.value2)));
  const sysPrev = stats(prevR.filter(v => v.kind === 'bp').map(v => Number(v.value1)));
  const hr = stats(inR.filter(v => v.kind === 'heart_rate').map(v => Number(v.value1)));
  const wt = inR.filter(v => v.kind === 'weight');
  const a1cs = data.vitals.filter(v => v.kind === 'hba1c').slice(0, 6);
  const adh = adherence(data.meds, data.medLogs, Math.min(days, 90));

  const barDays = Math.min(days, 30);
  const dayRows = (fn: (k: string) => number) => Array.from({ length: barDays }, (_, i) => {
    const d = subDays(new Date(), barDays - 1 - i);
    return { day: format(d, barDays > 10 ? 'd/M' : 'EEE'), v: fn(dayKey(d)) };
  });
  const kcalRows = dayRows(k => data.meals.filter(m => dayKey(new Date(m.eaten_at)) === k).reduce((a, b) => a + Number(b.total_kcal), 0));
  const waterRows = dayRows(k => data.water.filter(w => dayKey(new Date(w.logged_at)) === k).reduce((a, b) => a + b.ml, 0));
  const hasK = (k: string) => inR.some(v => v.kind === k);

  return (
    <div className="rise">
      <div className="mb-4 flex items-center justify-between pt-1">
        <div><h1 className="text-[1.5rem] font-extrabold">Trends</h1><p className="text-[0.8125rem] text-slate-500">{patient.full_name}</p></div>
        <Link to="/export" className="flex items-center gap-1.5 rounded-full bg-brand-600 px-4 py-2 text-[0.8125rem] font-semibold text-white shadow-md"><Share2 className="h-4 w-4" />Share</Link>
      </div>
      <TrendsAI />
      <Segmented value={range} onChange={setRange} options={[{ id: '7', label: '7 days' }, { id: '30', label: '30 days' }, { id: '90', label: '3 months' }, { id: '365', label: '1 year' }]} />

      <Card title="Blood sugar" kind="glucose" right={<Delta now={gs.avg} prev={gp.avg} />}>
        {g.length ? <>
          <GlucoseChart vitals={g} patient={patient} days={days} />
          <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(6.5rem,1fr))] gap-2">
            <Stat label="Average" value={Math.round(gs.avg).toString()} unit="mg/dL" />
            <Stat label="Fasting avg" value={fast.n ? Math.round(fast.avg).toString() : '—'} unit="mg/dL" />
            <Stat label="After-meal avg" value={pp.n ? Math.round(pp.avg).toString() : '—'} unit="mg/dL" />
            <Stat label="Lowest" value={Math.round(gs.min).toString()} unit="mg/dL" />
            <Stat label="Highest" value={Math.round(gs.max).toString()} unit="mg/dL" />
            <Stat label="Est. HbA1c" value={gs.n >= 10 ? eA1c(gs.avg).toFixed(1) : '—'} unit="%" />
          </div>
          <p className="mt-2 text-[0.7188rem] text-slate-400">{t('{n} readings · variability (CV) {cv}%', { n: gs.n, cv: gs.avg ? (gs.sd / gs.avg * 100).toFixed(0) : 0 })} {gs.avg && gs.sd / gs.avg > 0.36 ? t('— high, discuss with doctor') : ''}. {t('Dots are coloured by status; green band = 70–180 mg/dL.')}</p>
        </> : <p className="py-6 text-center text-sm text-slate-400">No sugar readings in this period</p>}
      </Card>

      {g.length > 0 && (
        <Card title="Time in range">
          <TIRBar tir={tir} />
          <p className="mt-3 text-[0.7188rem] text-slate-400">Common goal: more than 70% in range and less than 4% low (international consensus for most adults; your doctor may set different goals).</p>
        </Card>
      )}

      {g.length > 0 && (
        <Card title="Average by time of day">
          <ContextBars vitals={g} patient={patient} />
        </Card>
      )}

      {(hasK('bp') || patient.condition === 'type2_cardiac') && (
        <Card title="Blood pressure" kind="bp" right={<Delta now={sys.avg} prev={sysPrev.avg} />}>
          {bp.length ? <>
            <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.75rem] font-medium text-slate-500">
              <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: SERIES.sys }} />Systolic</span>
              <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: SERIES.dia }} />Diastolic</span>
              <span className="flex items-center gap-1.5"><span className="w-4 border-t border-dashed border-slate-400" />Your target</span>
            </div>
            <BPChart vitals={bp} patient={patient} days={days} />
            <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(6.5rem,1fr))] gap-2">
              <Stat label="Average" value={`${Math.round(sys.avg)}/${Math.round(dia.avg)}`} unit="mmHg" />
              <Stat label="Highest" value={`${Math.round(sys.max)}`} unit={t('sys')} />
              <Stat label="Above target" value={`${Math.round(bp.filter(v => v.value1 > patient.target_sys_max || Number(v.value2) > patient.target_dia_max).length / bp.length * 100)}`} unit="%" />
            </div>
          </> : <p className="py-6 text-center text-sm text-slate-400">No BP readings in this period</p>}
        </Card>
      )}

      {hasK('heart_rate') && (
        <Card title="Heart rate" kind="heart_rate" right={<span className="text-[0.7812rem] font-semibold text-slate-500">avg {Math.round(hr.avg)} bpm</span>}>
          <SimpleLine vitals={inR} kind="heart_rate" color={VITALS.heart_rate.color} unit="bpm" days={days} band={[patient.target_hr_min, patient.target_hr_max]} />
        </Card>
      )}

      {hasK('weight') && (
        <Card title="Weight" kind="weight" right={wt.length > 1 ? <span className="text-[0.7812rem] font-semibold text-slate-500">{(Number(wt[0].value1) - Number(wt[wt.length - 1].value1) >= 0 ? '+' : '')}{(Number(wt[0].value1) - Number(wt[wt.length - 1].value1)).toFixed(1)} kg</span> : undefined}>
          <SimpleLine vitals={inR} kind="weight" color={VITALS.weight.color} unit="kg" days={days} />
          {patient.condition === 'type2_cardiac' && <p className="mt-2 text-[0.7188rem] text-slate-400">For heart patients, a sudden gain (about 1 kg in a day or 2 kg in a week) can mean fluid build-up — tell your doctor.</p>}
        </Card>
      )}

      {hasK('spo2') && (
        <Card title="Oxygen (SpO₂)" kind="spo2"><SimpleLine vitals={inR} kind="spo2" color={VITALS.spo2.color} unit="%" days={days} /></Card>
      )}

      {a1cs.length > 0 && (
        <Card title="HbA1c (lab)" kind="hba1c">
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {a1cs.map(v => (
              <div key={v.id} className="min-w-[5.5rem] rounded-2xl bg-slate-50 p-3 text-center dark:bg-white/[.03]">
                <div className="font-display text-xl font-bold" style={{ color: v.value1 > 7 ? '#ea580c' : '#059669' }}>{Number(v.value1).toFixed(1)}%</div>
                <div className="text-[0.6875rem] text-slate-400">{format(new Date(v.measured_at), 'MMM yyyy')}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card title="Medicine adherence" right={<span className="font-display text-lg font-bold" style={{ color: adh.pct >= 90 ? '#059669' : adh.pct >= 75 ? '#d97706' : '#dc2626' }}>{adh.due ? `${adh.pct.toFixed(0)}%` : '—'}</span>}>
        <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/5"><div className="h-full rounded-full bg-brand-500" style={{ width: `${adh.pct}%` }} /></div>
        <p className="mt-2 text-[0.75rem] text-slate-500">{t('{a} of {b} doses marked taken in the last {n} days', { a: adh.taken, b: adh.due, n: Math.min(days, 90) })}</p>
      </Card>

      <Card title={t('Calories · last {n} days', { n: barDays })}>
        <DailyBars rows={kcalRows} color="#16a34a" unit="kcal" goal={patient.daily_kcal_goal} />
      </Card>
      <Card title={t('Water · last {n} days', { n: barDays })}>
        <DailyBars rows={waterRows} color="#0284c7" unit="ml" goal={patient.daily_water_goal_ml} />
      </Card>
    </div>
  );
}
