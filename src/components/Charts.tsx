import type { ReactNode } from 'react';
import { format } from 'date-fns';
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from 'recharts';
import type { Patient, Vital } from '../lib/types';
import { classify, ctxLabel, STATUS_STYLE } from '../lib/health';

export const SERIES = { sys: '#8b5cf6', dia: '#0891b2' };

function Frame({ width, height, children }: { width?: number; height: number; children: ReactNode }) {
  if (width) return <div style={{ width, height }}>{children}</div>;
  return <div style={{ height }} className="w-full"><ResponsiveContainer width="100%" height="100%">{children as React.ReactElement}</ResponsiveContainer></div>;
}

function Tip({ active, payload, render }: { active?: boolean; payload?: { payload: any }[]; render: (p: any) => ReactNode }) {
  if (!active || !payload?.length) return null;
  return <div className="rounded-xl bg-ink px-3 py-2 text-xs text-white shadow-xl dark:bg-white dark:text-ink">{render(payload[0].payload)}</div>;
}

const tickTime = (span: number) => (t: number) => format(new Date(t), span > 3 * 864e5 ? 'd MMM' : 'h a');

export function GlucoseChart({ vitals, patient, width, height = 220, days }: { vitals: Vital[]; patient: Patient; width?: number; height?: number; days: number }) {
  const pts = vitals.filter(v => v.kind === 'glucose').map(v => ({ t: +new Date(v.measured_at), v: Number(v.value1), ctx: v.context, st: classify(v, patient) })).sort((a, b) => a.t - b.t);
  const now = Date.now(), from = now - days * 864e5;
  const max = Math.max(250, ...pts.map(p => p.v)) + 20;
  return (
    <Frame width={width} height={height}>
      <ComposedChart width={width} height={height} data={pts} margin={{ top: 8, right: 16, bottom: 0, left: -4 }}>
        <CartesianGrid vertical={false} />
        <ReferenceArea y1={70} y2={180} fill="#10b981" fillOpacity={0.08} ifOverflow="extendDomain" />
        <ReferenceLine y={70} stroke="#f59e0b" strokeDasharray="4 4" strokeWidth={1} />
        <ReferenceLine y={180} stroke="#f97316" strokeDasharray="4 4" strokeWidth={1} />
        <XAxis dataKey="t" type="number" domain={[from, now]} scale="time" tickFormatter={tickTime(days * 864e5)} tickLine={false} axisLine={false} minTickGap={28} />
        <YAxis domain={[40, Math.ceil(max / 50) * 50]} ticks={Array.from({ length: Math.ceil(max / 50) }, (_, i) => 50 + i * 50).filter(t => t <= Math.ceil(max / 50) * 50)} tickLine={false} axisLine={false} width={40} />
        <Tooltip cursor={{ stroke: '#94a3b8', strokeDasharray: '3 3' }} content={<Tip render={p => <><div className="font-bold">{p.v} mg/dL · {STATUS_STYLE[p.st as keyof typeof STATUS_STYLE].label}</div><div className="opacity-70">{ctxLabel(p.ctx)} · {format(new Date(p.t), 'd MMM, h:mm a')}</div></>} />} />
        <Line dataKey="v" stroke="#e11d48" strokeOpacity={0.18} strokeWidth={1.5} dot={false} isAnimationActive={false} type="monotone" />
        <Scatter dataKey="v" isAnimationActive={false} shape={(props: any) => <circle cx={props.cx} cy={props.cy} r={pts.length > 120 ? 3 : 4.5} fill={STATUS_STYLE[props.payload.st as keyof typeof STATUS_STYLE].dot} stroke="var(--dot-ring, #fff)" strokeWidth={1.5} />} />
      </ComposedChart>
    </Frame>
  );
}

export function BPChart({ vitals, patient, width, height = 220, days }: { vitals: Vital[]; patient: Patient; width?: number; height?: number; days: number }) {
  const pts = vitals.filter(v => v.kind === 'bp').map(v => ({ t: +new Date(v.measured_at), sys: Number(v.value1), dia: Number(v.value2), pulse: v.value3 })).sort((a, b) => a.t - b.t);
  const now = Date.now(), from = now - days * 864e5;
  return (
    <Frame width={width} height={height}>
      <LineChart width={width} height={height} data={pts} margin={{ top: 8, right: 16, bottom: 0, left: -4 }}>
        <CartesianGrid vertical={false} />
        <ReferenceLine y={patient.target_sys_max} stroke={SERIES.sys} strokeDasharray="4 4" strokeOpacity={0.5} />
        <ReferenceLine y={patient.target_dia_max} stroke={SERIES.dia} strokeDasharray="4 4" strokeOpacity={0.5} />
        <XAxis dataKey="t" type="number" domain={[from, now]} scale="time" tickFormatter={tickTime(days * 864e5)} tickLine={false} axisLine={false} minTickGap={28} />
        <YAxis domain={[40, 'dataMax + 15']} tickLine={false} axisLine={false} width={40} />
        <Tooltip cursor={{ stroke: '#94a3b8', strokeDasharray: '3 3' }} content={<Tip render={p => <><div className="font-bold">{p.sys}/{p.dia} mmHg{p.pulse ? ` · ${p.pulse} bpm` : ''}</div><div className="opacity-70">{format(new Date(p.t), 'd MMM, h:mm a')}</div></>} />} />
        <Line dataKey="sys" name="Systolic" stroke={SERIES.sys} strokeWidth={2} dot={pts.length < 40 ? { r: 3.5, strokeWidth: 0, fill: SERIES.sys } : false} isAnimationActive={false} type="monotone" />
        <Line dataKey="dia" name="Diastolic" stroke={SERIES.dia} strokeWidth={2} dot={pts.length < 40 ? { r: 3.5, strokeWidth: 0, fill: SERIES.dia } : false} isAnimationActive={false} type="monotone" />
      </LineChart>
    </Frame>
  );
}

export function SimpleLine({ vitals, kind, color, unit, width, height = 180, days, band }: { vitals: Vital[]; kind: string; color: string; unit: string; width?: number; height?: number; days: number; band?: [number, number] }) {
  const pts = vitals.filter(v => v.kind === kind).map(v => ({ t: +new Date(v.measured_at), v: Number(v.value1) })).sort((a, b) => a.t - b.t);
  const now = Date.now(), from = now - days * 864e5;
  return (
    <Frame width={width} height={height}>
      <LineChart width={width} height={height} data={pts} margin={{ top: 8, right: 16, bottom: 0, left: -4 }}>
        <CartesianGrid vertical={false} />
        {band && <ReferenceArea y1={band[0]} y2={band[1]} fill="#10b981" fillOpacity={0.08} />}
        <XAxis dataKey="t" type="number" domain={[from, now]} scale="time" tickFormatter={tickTime(days * 864e5)} tickLine={false} axisLine={false} minTickGap={28} />
        <YAxis domain={['dataMin - 3', 'dataMax + 3']} tickLine={false} axisLine={false} width={40} tickFormatter={v => String(Math.round(v))} />
        <Tooltip cursor={{ stroke: '#94a3b8', strokeDasharray: '3 3' }} content={<Tip render={p => <><div className="font-bold">{Number.isInteger(p.v) ? p.v : p.v.toFixed(1)} {unit}</div><div className="opacity-70">{format(new Date(p.t), 'd MMM, h:mm a')}</div></>} />} />
        <Line dataKey="v" stroke={color} strokeWidth={2} dot={pts.length < 40 ? { r: 3.5, strokeWidth: 0, fill: color } : false} isAnimationActive={false} type="monotone" />
      </LineChart>
    </Frame>
  );
}

export function DailyBars({ rows, color, unit, goal, width, height = 170 }: { rows: { day: string; v: number }[]; color: string; unit: string; goal?: number; width?: number; height?: number }) {
  return (
    <Frame width={width} height={height}>
      <BarChart width={width} height={height} data={rows} margin={{ top: 8, right: 16, bottom: 0, left: -4 }} barCategoryGap="22%">
        <CartesianGrid vertical={false} />
        <XAxis dataKey="day" tickLine={false} axisLine={false} minTickGap={8} />
        <YAxis tickLine={false} axisLine={false} width={40} />
        {goal && <ReferenceLine y={goal} stroke="#94a3b8" strokeDasharray="4 4" label={{ value: 'Goal', position: 'insideTopRight', fill: '#94a3b8', fontSize: 10 }} />}
        <Tooltip cursor={{ fill: 'rgba(148,163,184,.12)' }} content={<Tip render={p => <><div className="font-bold">{Math.round(p.v).toLocaleString()} {unit}</div><div className="opacity-70">{p.day}</div></>} />} />
        <Bar dataKey="v" radius={[4, 4, 0, 0]} isAnimationActive={false}>
          {rows.map((r, i) => <Cell key={i} fill={color} fillOpacity={goal && r.v >= goal ? 1 : 0.55} />)}
        </Bar>
      </BarChart>
    </Frame>
  );
}

export function ContextBars({ vitals, patient, width, height = 170 }: { vitals: Vital[]; patient: Patient; width?: number; height?: number }) {
  const order = ['fasting', 'before_meal', 'after_meal', 'bedtime', 'night', 'random'];
  const rows = order.map(c => {
    const xs = vitals.filter(v => v.kind === 'glucose' && v.context === c).map(v => Number(v.value1));
    const avg = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
    return { day: ctxLabel(c).replace('2 h after meal', 'After meal'), v: Math.round(avg), n: xs.length, st: classify({ kind: 'glucose', value1: avg, context: c }, patient) };
  }).filter(r => r.n);
  return (
    <Frame width={width} height={height}>
      <BarChart width={width} height={height} data={rows} margin={{ top: 16, right: 8, bottom: 0, left: -4 }} barCategoryGap="28%">
        <CartesianGrid vertical={false} />
        <XAxis dataKey="day" tickLine={false} axisLine={false} interval={0} />
        <YAxis tickLine={false} axisLine={false} width={40} />
        <Tooltip cursor={{ fill: 'rgba(148,163,184,.12)' }} content={<Tip render={p => <><div className="font-bold">Avg {p.v} mg/dL</div><div className="opacity-70">{p.day} · {p.n} readings</div></>} />} />
        <Bar dataKey="v" radius={[4, 4, 0, 0]} isAnimationActive={false} label={{ position: 'top', fill: '#64748b', fontSize: 11, fontWeight: 600 }}>
          {rows.map((r, i) => <Cell key={i} fill={STATUS_STYLE[r.st].dot} />)}
        </Bar>
      </BarChart>
    </Frame>
  );
}

export function TIRBar({ tir }: { tir: { veryLow: number; low: number; inRange: number; high: number; veryHigh: number } }) {
  const segs = [
    { k: 'Very low <54', v: tir.veryLow, c: '#b91c1c' },
    { k: 'Low 54–69', v: tir.low, c: '#f59e0b' },
    { k: 'In range 70–180', v: tir.inRange, c: '#10b981' },
    { k: 'High 181–250', v: tir.high, c: '#f97316' },
    { k: 'Very high >250', v: tir.veryHigh, c: '#dc2626' },
  ];
  return (
    <div>
      <div className="flex h-4 gap-[2px] overflow-hidden rounded-full">
        {segs.filter(s => s.v > 0).map(s => <div key={s.k} title={`${s.k}: ${s.v.toFixed(0)}%`} style={{ width: `${s.v}%`, background: s.c }} className="first:rounded-l-full last:rounded-r-full" />)}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12.5px]">
        {segs.map(s => (
          <div key={s.k} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.c }} />
            <span className="flex-1 text-slate-500 dark:text-slate-400">{s.k}</span>
            <span className="font-semibold tabular-nums">{s.v.toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
