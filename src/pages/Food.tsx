import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { addDays, format, isToday } from 'date-fns';
import { ChevronLeft, ChevronRight, Globe, Minus, Plus, Search, Trash2, Utensils, X } from 'lucide-react';
import { useApp } from '../lib/store';
import { api } from '../lib/api';
import { FOODS, searchFoods, searchOpenFoodFacts, type Food } from '../lib/foods';
import { dayKey } from '../lib/health';
import type { CustomFood, FoodItem, Meal } from '../lib/types';
import { Button, ChipSelect, Empty, Field, PageHeader, Ring, Sheet, ViewOnlyNote, cx } from '../components/ui';

const MEAL_TYPES = [{ id: 'breakfast', label: 'Breakfast' }, { id: 'lunch', label: 'Lunch' }, { id: 'snack', label: 'Snack' }, { id: 'dinner', label: 'Dinner' }];
const guessMeal = () => { const h = new Date().getHours(); return h < 11 ? 'breakfast' : h < 16 ? 'lunch' : h < 19 ? 'snack' : 'dinner'; };
const GI_STYLE = { low: 'text-emerald-600', med: 'text-amber-600', high: 'text-rose-600' };

export function FoodLog() {
  const { patient, data, canEdit, refreshData, toast } = useApp();
  const nav = useNavigate();
  const [day, setDay] = useState(new Date());
  if (!patient) return null;
  const dk = dayKey(day);
  const meals = data.meals.filter(m => dayKey(new Date(m.eaten_at)) === dk).sort((a, b) => a.eaten_at.localeCompare(b.eaten_at));
  const kcal = meals.reduce((a, b) => a + Number(b.total_kcal), 0), carbs = meals.reduce((a, b) => a + Number(b.total_carbs), 0), protein = meals.reduce((a, b) => a + Number(b.total_protein), 0);

  async function del(id: string) {
    if (!confirm('Delete this meal?')) return;
    try { await api().remove('meals', id); await refreshData(); } catch (e) { toast((e as Error).message, 'err'); }
  }

  return (
    <div className="rise">
      <PageHeader title="Food & calories" subtitle={patient.full_name} right={canEdit ? <Button size="sm" onClick={() => nav('/food/add')}><Plus className="h-4 w-4" />Add</Button> : undefined} />
      <div className="mb-4 flex items-center justify-between">
        <button onClick={() => setDay(addDays(day, -1))} className="grid h-10 w-10 place-items-center rounded-full bg-white shadow-sm dark:bg-night-2" aria-label="Previous day"><ChevronLeft className="h-5 w-5" /></button>
        <div className="text-center font-bold">{isToday(day) ? 'Today' : format(day, 'EEE, d MMM')}</div>
        <button onClick={() => setDay(addDays(day, 1))} disabled={isToday(day)} className="grid h-10 w-10 place-items-center rounded-full bg-white shadow-sm disabled:opacity-30 dark:bg-night-2" aria-label="Next day"><ChevronRight className="h-5 w-5" /></button>
      </div>
      <div className="card flex items-center gap-5 p-5">
        <Ring pct={kcal / patient.daily_kcal_goal * 100} size={96} stroke={9} color={kcal > patient.daily_kcal_goal ? '#f97316' : '#22c55e'}>
          <div className="text-center"><div className="font-display text-xl font-extrabold leading-none">{Math.round(kcal)}</div><div className="text-[10px] text-slate-400">of {patient.daily_kcal_goal}</div></div>
        </Ring>
        <div className="grid flex-1 grid-cols-2 gap-3">
          <div><div className="text-[11.5px] text-slate-500">Carbs</div><div className="font-display text-xl font-bold">{Math.round(carbs)}<span className="text-xs font-medium text-slate-400"> g</span></div></div>
          <div><div className="text-[11.5px] text-slate-500">Protein</div><div className="font-display text-xl font-bold">{Math.round(protein)}<span className="text-xs font-medium text-slate-400"> g</span></div></div>
          <div className="col-span-2 text-[11.5px] text-slate-400">{kcal <= patient.daily_kcal_goal ? `${Math.round(patient.daily_kcal_goal - kcal)} kcal left today` : `${Math.round(kcal - patient.daily_kcal_goal)} kcal over goal`}</div>
        </div>
      </div>
      <div className="mt-4 space-y-3">
        {!meals.length && <Empty icon={<Utensils className="h-7 w-7" />} title="No meals logged" text="Optional — log meals to see calories and carbs next to your sugar readings." />}
        {MEAL_TYPES.map(mt => meals.filter(m => m.meal_type === mt.id).map(m => (
          <div key={m.id} className="card p-4">
            <div className="flex items-center justify-between">
              <div><span className="font-bold">{mt.label}</span><span className="ml-2 text-xs text-slate-400">{format(new Date(m.eaten_at), 'h:mm a')}</span></div>
              <div className="flex items-center gap-2"><span className="font-display font-bold">{Math.round(m.total_kcal)} <span className="text-xs font-medium text-slate-400">kcal</span></span>
                {canEdit && <button onClick={() => del(m.id)} className="p-1 text-slate-300 hover:text-red-500" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>}</div>
            </div>
            <ul className="mt-2 space-y-1 text-[13px] text-slate-600 dark:text-slate-300">
              {m.items.map((it, i) => <li key={i} className="flex justify-between"><span>{it.qty} × {it.name} <span className="text-slate-400">({it.unit})</span></span><span className="text-slate-400">{Math.round(it.kcal)}</span></li>)}
            </ul>
            <div className="mt-2 text-[11.5px] text-slate-400">{Math.round(m.total_carbs)} g carbs · {Math.round(m.total_protein)} g protein</div>
          </div>
        )))}
      </div>
    </div>
  );
}

export function AddMeal() {
  const { patient, membership, canEdit, refreshData, toast } = useApp();
  const nav = useNavigate();
  const [mealType, setMealType] = useState(guessMeal());
  const [q, setQ] = useState('');
  const [items, setItems] = useState<(FoodItem & { base: Food })[]>([]);
  const [custom, setCustom] = useState<CustomFood[]>([]);
  const [off, setOff] = useState<Food[] | null>(null);
  const [offBusy, setOffBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState('');

  useEffect(() => { if (membership) api().customFoods(membership.family.id).then(setCustom).catch(() => { }); }, [membership]);
  const customAsFood: Food[] = custom.map(c => ({ name: c.name, unit: c.unit, kcal: c.kcal, carbs: c.carbs, protein: c.protein, cat: 'My foods' }));
  const results = useMemo(() => searchFoods(q, customAsFood), [q, custom]); // eslint-disable-line

  const add = (f: Food) => {
    setItems(s => {
      const i = s.findIndex(x => x.name === f.name);
      if (i >= 0) return s.map((x, j) => j === i ? scale(x.base, x.qty + 1) : x);
      return [...s, scale(f, f.unit === '100 g' ? 1 : 1)];
    });
    setQ(''); setOff(null);
  };
  const scale = (f: Food, qty: number) => ({ base: f, name: f.name, unit: f.unit, qty, kcal: f.kcal * qty, carbs: f.carbs * qty, protein: f.protein * qty });
  const setQty = (i: number, qty: number) => setItems(s => qty <= 0 ? s.filter((_, j) => j !== i) : s.map((x, j) => j === i ? scale(x.base, Math.round(qty * 4) / 4) : x));
  const tot = items.reduce((a, b) => ({ kcal: a.kcal + b.kcal, carbs: a.carbs + b.carbs, protein: a.protein + b.protein }), { kcal: 0, carbs: 0, protein: 0 });

  async function searchOff() {
    setOffBusy(true);
    try { setOff(await searchOpenFoodFacts(q)); } catch (e) { toast((e as Error).message, 'err'); } finally { setOffBusy(false); }
  }

  async function save() {
    if (!items.length) return;
    setBusy(true);
    try {
      await api().insert<Meal>('meals', {
        patient_id: patient!.id, meal_type: mealType, notes: notes || null,
        items: items.map(({ base, ...it }) => ({ ...it, kcal: Math.round(it.kcal), carbs: Math.round(it.carbs * 10) / 10, protein: Math.round(it.protein * 10) / 10 })),
        total_kcal: Math.round(tot.kcal), total_carbs: Math.round(tot.carbs), total_protein: Math.round(tot.protein), eaten_at: new Date().toISOString(),
      });
      await refreshData(); toast(`${Math.round(tot.kcal)} kcal logged`); nav(-1);
    } catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); }
  }

  if (!patient) return null;
  return (
    <div className="rise pb-32">
      <PageHeader title="Log a meal" subtitle={patient.full_name} />
      <ViewOnlyNote />
      <ChipSelect value={mealType} onChange={setMealType} options={MEAL_TYPES} />

      <div className="relative mt-4">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
        <input className="field pl-12" value={q} onChange={e => { setQ(e.target.value); setOff(null); }} placeholder={`Search ${FOODS.length}+ Indian foods — idli, dal, roti…`} />
        {q && <button onClick={() => setQ('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400" aria-label="Clear"><X className="h-4 w-4" /></button>}
      </div>

      {items.length > 0 && !q && (
        <div className="card mt-4 divide-y divide-slate-100 dark:divide-white/5">
          {items.map((it, i) => (
            <div key={it.name} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold">{it.name}</div>
                <div className="text-xs text-slate-400">{Math.round(it.kcal)} kcal · {Math.round(it.carbs)} g carbs · per {it.unit}</div>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => setQty(i, it.qty - (it.qty <= 1 ? 0.5 : 1))} className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 dark:bg-white/5" aria-label="Less"><Minus className="h-4 w-4" /></button>
                <span className="w-8 text-center font-bold tabular-nums">{it.qty}</span>
                <button onClick={() => setQty(i, it.qty + (it.qty < 1 ? 0.5 : 1))} className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 dark:bg-white/5" aria-label="More"><Plus className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {(q || !items.length) && (
        <div className="mt-3">
          <div className="card divide-y divide-slate-100 overflow-hidden dark:divide-white/5">
            {(off ?? results).map(f => (
              <button key={f.name + f.unit} onClick={() => add(f)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-white/5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-medium">{f.name}</div>
                  <div className="text-xs text-slate-400">per {f.unit} · {f.carbs} g carbs{f.gi ? <span className={GI_STYLE[f.gi]}> · {f.gi} GI</span> : null}</div>
                </div>
                <div className="text-right"><div className="font-display font-bold">{f.kcal}</div><div className="text-[10px] text-slate-400">kcal</div></div>
                <Plus className="h-5 w-5 text-brand-600" />
              </button>
            ))}
            {!(off ?? results).length && <div className="px-4 py-6 text-center text-sm text-slate-400">No match in the Indian food list</div>}
          </div>
          {q.length > 2 && !off && (
            <Button variant="soft" block className="mt-3" loading={offBusy} onClick={searchOff}><Globe className="h-4 w-4" />Search packaged foods (Open Food Facts)</Button>
          )}
          <button onClick={() => setAddOpen(true)} className="mt-3 w-full text-center text-[13px] font-semibold text-brand-700 dark:text-brand-300">+ Add your own food</button>
        </div>
      )}

      {items.length > 0 && !q && (
        <Field label="Notes (optional)" className="mt-4"><input className="field" value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. eaten outside, extra oil" /></Field>
      )}

      <div className={cx('fixed inset-x-0 bottom-24 z-30 mx-auto max-w-xl px-4 transition', items.length ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0')}>
        <div className="flex items-center gap-3 rounded-3xl bg-ink p-3 pl-5 text-white shadow-2xl dark:bg-white dark:text-ink">
          <div className="flex-1"><div className="font-display text-lg font-bold">{Math.round(tot.kcal)} kcal</div><div className="text-xs opacity-70">{Math.round(tot.carbs)} g carbs · {Math.round(tot.protein)} g protein · {items.length} items</div></div>
          <Button onClick={save} loading={busy} disabled={!canEdit}>Save meal</Button>
        </div>
      </div>

      <Sheet open={addOpen} onClose={() => setAddOpen(false)} title="Add your own food">
        <CustomFoodForm initial={q} onSaved={(f) => { setCustom(c => [...c, f]); add({ name: f.name, unit: f.unit, kcal: f.kcal, carbs: f.carbs, protein: f.protein, cat: 'My foods' }); setAddOpen(false); }} />
      </Sheet>
    </div>
  );
}

function CustomFoodForm({ initial, onSaved }: { initial: string; onSaved: (f: CustomFood) => void }) {
  const { membership, toast } = useApp();
  const [f, setF] = useState({ name: initial, unit: 'serving', kcal: '', carbs: '', protein: '' });
  return (
    <div className="space-y-3">
      <Field label="Food name"><input className="field" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Serving"><input className="field" value={f.unit} onChange={e => setF({ ...f, unit: e.target.value })} placeholder="bowl, pc, 100 g" /></Field>
        <Field label="Calories"><input className="field" inputMode="decimal" value={f.kcal} onChange={e => setF({ ...f, kcal: e.target.value })} /></Field>
        <Field label="Carbs (g)"><input className="field" inputMode="decimal" value={f.carbs} onChange={e => setF({ ...f, carbs: e.target.value })} /></Field>
        <Field label="Protein (g)"><input className="field" inputMode="decimal" value={f.protein} onChange={e => setF({ ...f, protein: e.target.value })} /></Field>
      </div>
      <Button block disabled={!f.name || !f.kcal} onClick={async () => {
        try { onSaved(await api().addCustomFood({ family_id: membership!.family.id, name: f.name, unit: f.unit, kcal: +f.kcal, carbs: +f.carbs || 0, protein: +f.protein || 0 })); }
        catch (e) { toast((e as Error).message, 'err'); }
      }}>Save food for the family</Button>
    </div>
  );
}
