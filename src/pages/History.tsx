import { useMemo, useState } from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import { Trash2, ListX } from 'lucide-react';
import { useApp } from '../lib/store';
import { api } from '../lib/api';
import { classify, ctxLabel, fmtVital, STATUS_STYLE, VITALS, vitalsFor } from '../lib/health';
import type { VitalKind } from '../lib/types';
import { Empty, PageHeader, Segmented } from '../components/ui';
import { VitalIcon } from '../components/Layout';

export default function History() {
  const { patient, data, canEdit, refreshData, toast } = useApp();
  const [kind, setKind] = useState<'all' | VitalKind>('all');
  const [limit, setLimit] = useState(80);
  const rows = useMemo(() => data.vitals.filter(v => kind === 'all' || v.kind === kind), [data.vitals, kind]);
  const groups = useMemo(() => {
    const g: { day: string; items: typeof rows }[] = [];
    for (const v of rows.slice(0, limit)) {
      const d = new Date(v.measured_at);
      const label = isToday(d) ? 'Today' : isYesterday(d) ? 'Yesterday' : format(d, 'EEEE, d MMM yyyy');
      if (!g.length || g[g.length - 1].day !== label) g.push({ day: label, items: [] });
      g[g.length - 1].items.push(v);
    }
    return g;
  }, [rows, limit]);
  if (!patient) return null;

  async function del(id: string) {
    if (!confirm('Delete this entry?')) return;
    try { await api().remove('vitals', id); await refreshData(); toast('Deleted'); } catch (e) { toast((e as Error).message, 'err'); }
  }

  return (
    <div className="rise">
      <PageHeader title="History" subtitle={`${rows.length} readings · ${patient.full_name}`} />
      <Segmented value={kind} onChange={setKind} className="mb-4"
        options={[{ id: 'all', label: 'All' }, ...vitalsFor(patient.condition).map(k => ({ id: k, label: VITALS[k].label.replace('Blood ', '') }))]} />
      {!groups.length && <Empty icon={<ListX className="h-7 w-7" />} title="Nothing here yet" />}
      {groups.map(g => (
        <div key={g.day} className="mb-4">
          <div className="mb-2 px-1 text-[0.75rem] font-bold uppercase tracking-wide text-slate-400">{g.day}</div>
          <div className="card divide-y divide-slate-100 dark:divide-white/5">
            {g.items.map(v => {
              const m = VITALS[v.kind], st = classify(v, patient);
              return (
                <div key={v.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: m.color + '18', color: m.color }}><VitalIcon kind={v.kind} className="h-[1.125rem] w-[1.125rem]" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[0.875rem] font-semibold">{m.label}</div>
                    <div className="truncate text-xs text-slate-400">{format(new Date(v.measured_at), 'h:mm a')}{v.context ? ` · ${ctxLabel(v.context)}` : ''}{v.notes ? ` · ${v.notes}` : ''}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-display font-bold">{fmtVital(v)}<span className="text-[0.6875rem] font-medium text-slate-400"> {m.unit}</span></div>
                    <div className="text-[0.6875rem] font-semibold" style={{ color: STATUS_STYLE[st].dot }}>{STATUS_STYLE[st].label}</div>
                  </div>
                  {canEdit && <button onClick={() => del(v.id)} className="-mr-2 p-2 text-slate-300 hover:text-red-500" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {rows.length > limit && <button onClick={() => setLimit(limit + 100)} className="w-full py-3 text-sm font-semibold text-brand-700">Load more</button>}
    </div>
  );
}
