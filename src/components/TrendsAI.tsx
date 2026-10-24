import { useState } from 'react';
import { t } from '../lib/i18n';
import { AlertTriangle, CheckCircle2, Eye, Lightbulb, RefreshCw, Sparkles, Stethoscope } from 'lucide-react';
import { formatDistanceToNowStrict } from 'date-fns';
import { useApp } from '../lib/store';
import { api } from '../lib/api';
import { cachedAI, getAI, type TrendAI } from '../lib/ai';
import { Button, cx } from './ui';

const OVERALL: Record<TrendAI['overall'], [string, string]> = {
  improving: ['Improving', 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'],
  stable: ['Stable', 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300'],
  mixed: ['Mixed', 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'],
  worsening: ['Needs attention', 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300'],
  not_enough_data: ['Need more readings', 'bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-300'],
};
const TONE = {
  good: { icon: CheckCircle2, cls: 'text-emerald-600 dark:text-emerald-400' },
  watch: { icon: Eye, cls: 'text-amber-600 dark:text-amber-400' },
  alert: { icon: AlertTriangle, cls: 'text-red-600 dark:text-red-400' },
};

/** AI trend analysis (Claude) — generated on tap, cached for the day for the whole family. */
export function TrendsAI() {
  const { patient } = useApp();
  const pid = patient?.id ?? '';
  const [a, setA] = useState<TrendAI | null>(() => (pid ? cachedAI<TrendAI>('trends', pid) : null));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!patient || api().mode !== 'cloud') return null;

  async function run(refresh = false) {
    setBusy(true); setErr('');
    try { setA(await getAI<TrendAI>('trends', pid, { refresh })); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <section className="card mt-4 overflow-hidden">
      <div className="flex items-center gap-3 bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 text-white">
        <Sparkles className="h-5 w-5 shrink-0" />
        <div className="min-w-0 flex-1"><div className="font-bold">AI trend analysis</div><div className="text-[0.75rem] text-white/80">Sugar, BP, heart, weight & medicines — last 90 days</div></div>
        {a && <button onClick={() => run(true)} disabled={busy} aria-label="Refresh analysis" className="grid h-9 w-9 place-items-center rounded-full bg-white/15 disabled:opacity-50"><RefreshCw className={cx('h-4 w-4', busy && 'animate-spin')} /></button>}
      </div>
      <div className="p-4">
        {!a && (
          <div className="text-center">
            <p className="mb-3 text-[0.8438rem] text-slate-500">{t("Get a plain-language summary of how {name}'s readings are changing, what's going well and what to watch.", { name: patient.full_name.split(' ')[0] })}</p>
            <Button loading={busy} onClick={() => run()}><Sparkles className="h-4 w-4" />{busy ? 'Analysing…' : 'Analyse my trends'}</Button>
            {err && <p className="mt-2 text-[0.8125rem] text-red-600">{err}</p>}
          </div>
        )}
        {a && (
          <div className="space-y-4">
            <div>
              <span className={cx('chip mb-2', OVERALL[a.overall]?.[1])}>{OVERALL[a.overall]?.[0] ?? a.overall}</span>
              <p className="text-[0.9062rem] leading-relaxed">{a.summary}</p>
            </div>
            {a.highlights?.length > 0 && (
              <div className="space-y-2.5">
                {(a.highlights ?? []).map((h, i) => {
                  const t = TONE[h.tone] ?? TONE.watch; const Icon = t.icon;
                  return (
                    <div key={i} className="flex gap-2.5">
                      <Icon className={cx('mt-0.5 h-[1.125rem] w-[1.125rem] shrink-0', t.cls)} />
                      <div className="min-w-0"><div className="text-[0.875rem] font-semibold">{h.title}</div><div className="text-[0.8125rem] text-slate-500 dark:text-slate-400">{h.detail}</div></div>
                    </div>
                  );
                })}
              </div>
            )}
            {a.patterns?.length > 0 && (
              <div className="rounded-2xl bg-slate-50 p-3 text-[0.8125rem] dark:bg-white/[.03]">
                <div className="mb-1 font-semibold">Patterns noticed</div>
                <ul className="list-disc space-y-0.5 pl-4 text-slate-600 dark:text-slate-300">{(a.patterns ?? []).map((p, i) => <li key={i}>{p}</li>)}</ul>
              </div>
            )}
            {a.suggestions?.length > 0 && (
              <div>
                <div className="mb-1.5 flex items-center gap-1.5 text-[0.875rem] font-semibold"><Lightbulb className="h-4 w-4 text-amber-500" />Try this</div>
                <ul className="space-y-1.5 text-[0.8438rem]">{(a.suggestions ?? []).map((s, i) => <li key={i} className="flex gap-2"><span className="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />{s}</li>)}</ul>
              </div>
            )}
            {a.doctor_note && (
              <div className="flex gap-2.5 rounded-2xl bg-red-50 p-3 text-[0.8125rem] text-red-800 ring-1 ring-red-100 dark:bg-red-500/10 dark:text-red-200 dark:ring-red-500/20">
                <Stethoscope className="mt-0.5 h-4 w-4 shrink-0" />{a.doctor_note}
              </div>
            )}
            <p className="text-[0.6875rem] text-slate-400">{t('AI analysis')}{a.generated_at ? ` · ${formatDistanceToNowStrict(new Date(a.generated_at), { addSuffix: true })}` : ''}. {t('Not medical advice — always follow your doctor.')}</p>
            {err && <p className="text-[0.8125rem] text-red-600">{err}</p>}
          </div>
        )}
      </div>
    </section>
  );
}
