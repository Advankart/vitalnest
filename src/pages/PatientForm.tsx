import { useEffect, useState, type ReactNode } from 'react';
import { t } from '../lib/i18n';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Check, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../lib/store';
import { AVATAR_COLORS, CONDITIONS, defaultReminders, defaultTargets, age, bmi } from '../lib/health';
import type { Condition, Patient } from '../lib/types';
import { Avatar, Button, Field, PageHeader, cx } from '../components/ui';

const BLOOD = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const RELATIONS = ['Self', 'Father', 'Mother', 'Spouse', 'Son', 'Daughter', 'Grandfather', 'Grandmother', 'Brother', 'Sister', 'Other'];

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card mt-4 p-5">
      <h2 className="mb-4 text-[0.9375rem] font-bold">{title}</h2>
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </section>
  );
}

export default function PatientForm() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const first = sp.get('first') === '1';
  const nav = useNavigate();
  const { patients, membership, user, role, refreshPatients, selectPatient, toast, canEditFor } = useApp();
  const existing = patients.find(p => p.id === id);
  const [p, setP] = useState<Partial<Patient>>(() => existing ?? {
    full_name: first ? (user?.display_name ?? '') : '', relation: first ? 'Self' : '', condition: 'type2',
    color: AVATAR_COLORS[patients.length % AVATAR_COLORS.length], daily_kcal_goal: 1800, daily_water_goal_ml: 2500, ...defaultTargets('type2'),
    linked_user_id: first ? user?.id : null,
  });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (existing) setP(existing); }, [existing?.id]); // eslint-disable-line

  const canEditThis = existing ? canEditFor(existing) : role === 'admin' || role === 'caregiver';
  const up = (k: keyof Patient, v: unknown) => setP(s => ({ ...s, [k]: v === '' ? null : v }));
  const num = (k: keyof Patient) => ({ value: (p[k] as number | null | undefined) ?? '', onChange: (e: React.ChangeEvent<HTMLInputElement>) => up(k, e.target.value === '' ? null : Number(e.target.value)), type: 'number', inputMode: 'decimal' as const, className: 'field', disabled: !canEditThis });
  const txt = (k: keyof Patient) => ({ value: (p[k] as string | null | undefined) ?? '', onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => up(k, e.target.value), className: 'field', disabled: !canEditThis });

  function setCondition(c: Condition) {
    setP(s => ({ ...s, condition: c, ...(existing ? {} : defaultTargets(c)) }));
  }

  async function save() {
    if (!p.full_name?.trim()) { toast('Please enter a name', 'err'); return; }
    if (!membership) return;
    setBusy(true);
    try {
      const saved = await api().savePatient({ ...p, family_id: membership.family.id, full_name: p.full_name.trim() });
      if (!existing) {
        for (const r of defaultReminders(saved.condition)) await api().insert('reminders', { ...r, patient_id: saved.id });
      }
      await refreshPatients();
      selectPatient(saved.id);
      toast(existing ? 'Profile saved' : 'Profile created with starter reminders');
      if (first) nav('/', { replace: true }); else nav(-1);
    } catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); }
  }

  async function del() {
    if (!existing || !confirm(t('Delete {name} and ALL their records? This cannot be undone.', { name: existing.full_name }))) return;
    try { await api().deletePatient(existing.id); await refreshPatients(); toast('Deleted'); nav('/patients', { replace: true }); }
    catch (e) { toast((e as Error).message, 'err'); }
  }

  const a = age(p.dob), b = existing ? bmi(p as Patient) : null;

  return (
    <div className="rise pb-6">
      <PageHeader title={existing ? 'Health profile' : first ? 'Your health profile' : 'Add family member'} subtitle={first ? 'Start with the person whose health you track most' : undefined} back={!first} />

      <div className="card flex items-center gap-4 p-5">
        <Avatar name={p.full_name || '?'} color={p.color || AVATAR_COLORS[0]} size={64} />
        <div className="min-w-0 flex-1">
          <input {...txt('full_name')} className="w-full bg-transparent font-display text-xl font-bold outline-none placeholder:text-slate-300" placeholder="Full name" />
          <div className="mt-1 text-sm text-slate-500">{[a !== null ? t('{n} yrs', { n: a }) : null, p.gender ? t(p.gender) : null, p.blood_group, b ? `BMI ${b.toFixed(1)}` : null].filter(Boolean).join(' · ') || t('Fill in details below')}</div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {AVATAR_COLORS.map(c => (
              <button key={c} onClick={() => up('color', c)} className="grid h-6 w-6 shrink-0 place-items-center rounded-full" style={{ background: c }} aria-label="Colour">
                {p.color === c && <Check className="h-3.5 w-3.5 text-white" />}
              </button>
            ))}
          </div>
        </div>
      </div>

      <section className="card mt-4 p-5">
        <h2 className="mb-3 text-[0.9375rem] font-bold">Condition</h2>
        <div className="grid gap-2">
          {(Object.keys(CONDITIONS) as Condition[]).map(c => (
            <button key={c} onClick={() => canEditThis && setCondition(c)}
              className={cx('flex items-center gap-3 rounded-2xl p-3.5 text-left ring-1 transition', p.condition === c ? 'bg-brand-50 ring-2 ring-brand-500 dark:bg-brand-500/10' : 'ring-slate-200 dark:ring-white/10')}>
              <div className={cx('grid h-5 w-5 shrink-0 place-items-center rounded-full border-2', p.condition === c ? 'border-brand-600 bg-brand-600' : 'border-slate-300')}>{p.condition === c && <Check className="h-3 w-3 text-white" />}</div>
              <div><div className="text-[0.875rem] font-semibold">{CONDITIONS[c].label}</div><div className="text-xs text-slate-500">{CONDITIONS[c].desc}</div></div>
            </button>
          ))}
        </div>
      </section>

      <Group title="Personal details">
        <Field label="Relation"><select {...txt('relation')}><option value="">—</option>{RELATIONS.map(r => <option key={r}>{r}</option>)}</select></Field>
        <Field label="Date of birth"><input {...txt('dob')} type="date" /></Field>
        <Field label="Gender"><select {...txt('gender')}><option value="">—</option><option>Male</option><option>Female</option><option>Other</option></select></Field>
        <Field label="Blood group"><select {...txt('blood_group')}><option value="">—</option>{BLOOD.map(b => <option key={b}>{b}</option>)}</select></Field>
        <Field label="Height (cm)"><input {...num('height_cm')} /></Field>
        <Field label="Weight (kg)"><input {...num('weight_kg')} /></Field>
        <Field label="Phone" className="col-span-2"><input {...txt('phone')} type="tel" /></Field>
      </Group>

      <Group title="Medical details">
        <Field label="Diabetes since (year)"><input {...num('diagnosed_year')} placeholder="2015" /></Field>
        <Field label="Insulin / regimen"><input {...txt('insulin_regimen')} placeholder={p.condition === 'type1' ? 'Basal-bolus, pump…' : 'Tablets only'} /></Field>
        {(p.condition === 'type2_cardiac' || p.heart_conditions) && (
          <Field label="Heart conditions" className="col-span-2"><textarea {...txt('heart_conditions')} rows={2} placeholder="e.g. CAD, stent 2021, heart failure, AF" /></Field>
        )}
        <Field label="Other conditions" className="col-span-2"><textarea {...txt('other_conditions')} rows={2} placeholder="e.g. hypertension, thyroid, kidney" /></Field>
        <Field label="Allergies" className="col-span-2"><input {...txt('allergies')} placeholder="Drug / food allergies" /></Field>
      </Group>

      <Group title="Doctor & emergency">
        <Field label="Doctor"><input {...txt('doctor_name')} /></Field>
        <Field label="Doctor phone"><input {...txt('doctor_phone')} type="tel" /></Field>
        <Field label="Hospital / clinic" className="col-span-2"><input {...txt('hospital')} /></Field>
        <Field label="Emergency contact"><input {...txt('emergency_name')} /></Field>
        <Field label="Emergency phone"><input {...txt('emergency_phone')} type="tel" /></Field>
      </Group>

      <Group title="Personal targets">
        <Field label="Fasting min (mg/dL)"><input {...num('target_fasting_min')} /></Field>
        <Field label="Fasting max (mg/dL)"><input {...num('target_fasting_max')} /></Field>
        <Field label="After-meal max (mg/dL)" className="col-span-2"><input {...num('target_pp_max')} /></Field>
        <Field label="BP systolic max"><input {...num('target_sys_max')} /></Field>
        <Field label="BP diastolic max"><input {...num('target_dia_max')} /></Field>
        <Field label="Pulse min (bpm)"><input {...num('target_hr_min')} /></Field>
        <Field label="Pulse max (bpm)"><input {...num('target_hr_max')} /></Field>
        <Field label="Calories / day"><input {...num('daily_kcal_goal')} /></Field>
        <Field label="Water / day (ml)"><input {...num('daily_water_goal_ml')} /></Field>
        <p className="col-span-2 text-xs text-slate-400">Defaults follow common guidelines. Set the targets your doctor gave you{p.condition === 'type2_cardiac' ? ' — heart patients may have a fluid limit' : ''}.</p>
      </Group>

      <section className="card mt-4 space-y-3 p-5">
        <Field label="Notes"><textarea {...txt('notes')} rows={3} placeholder="Anything the family should know" /></Field>
        {canEditThis && (role === 'admin' || !existing || existing.linked_user_id === user?.id) && (
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" className="h-5 w-5 accent-brand-600" checked={p.linked_user_id === user?.id} onChange={e => up('linked_user_id', e.target.checked ? user?.id : null)} />
            This profile is me (I can always edit my own data)
          </label>
        )}
      </section>

      {canEditThis && (
        <div className="mt-5 space-y-3">
          <Button block size="lg" loading={busy} onClick={save}>{existing ? 'Save changes' : 'Create profile'}</Button>
          {existing && role === 'admin' && canEditThis && <Button block variant="danger" onClick={del}><Trash2 className="h-4 w-4" />Delete profile</Button>}
        </div>
      )}
    </div>
  );
}
