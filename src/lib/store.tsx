import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api } from './api';
import type { AppUser, Meal, Medicine, MedicineLog, Membership, Patient, Reminder, Role, Vital, WaterLog } from './types';
import { rescheduleAll } from './notify';

interface PatientData {
  vitals: Vital[];
  meals: Meal[];
  water: WaterLog[];
  meds: Medicine[];
  medLogs: MedicineLog[];
  reminders: Reminder[];
}
const EMPTY: PatientData = { vitals: [], meals: [], water: [], meds: [], medLogs: [], reminders: [] };

interface Ctx {
  ready: boolean;
  user: AppUser | null;
  memberships: Membership[];
  membership: Membership | null;
  role: Role;
  patients: Patient[];
  patient: Patient | null;
  data: PatientData;
  loading: boolean;
  canEdit: boolean;
  selectFamily(id: string): void;
  selectPatient(id: string): void;
  refreshAuth(): Promise<void>;
  refreshPatients(): Promise<void>;
  refreshData(): Promise<void>;
  toast(msg: string, kind?: 'ok' | 'err'): void;
  toasts: { id: number; msg: string; kind: 'ok' | 'err' }[];
}

const AppCtx = createContext<Ctx>(null as unknown as Ctx);
export const useApp = () => useContext(AppCtx);

const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AppUser | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [familyId, setFamilyId] = useState<string | null>(get('vn_family'));
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientId, setPatientId] = useState<string | null>(get('vn_patient'));
  const [data, setData] = useState<PatientData>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState<Ctx['toasts']>([]);
  const userIdRef = useRef<string | null>(null);

  const toast = useCallback((msg: string, kind: 'ok' | 'err' = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3200);
  }, []);

  const refreshAuth = useCallback(async () => {
    const u = await api().currentUser();
    if ((u?.id ?? null) === userIdRef.current && ready) return;
    userIdRef.current = u?.id ?? null;
    setUser(u);
    if (u) {
      const ms = await api().myFamilies().catch(() => []);
      setMemberships(ms);
      setFamilyId(prev => (prev && ms.some(m => m.family.id === prev)) ? prev : ms[0]?.family.id ?? null);
    } else {
      setMemberships([]); setPatients([]); setData(EMPTY);
    }
    setReady(true);
  }, [ready]);

  const reloadMemberships = useCallback(async () => {
    const ms = await api().myFamilies().catch(() => []);
    setMemberships(ms);
    setFamilyId(prev => (prev && ms.some(m => m.family.id === prev)) ? prev : ms[0]?.family.id ?? null);
  }, []);

  useEffect(() => {
    refreshAuth();
    const off = api().onAuthChange(() => { refreshAuth(); });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const membership = memberships.find(m => m.family.id === familyId) ?? null;
  const role: Role = membership?.role ?? 'viewer';

  const refreshPatients = useCallback(async () => {
    if (!familyId) { setPatients([]); return; }
    await reloadMemberships();
    const ps = await api().patients(familyId);
    setPatients(ps);
    setPatientId(prev => (prev && ps.some(p => p.id === prev)) ? prev : ps[0]?.id ?? null);
  }, [familyId, reloadMemberships]);

  useEffect(() => { if (familyId) { set('vn_family', familyId); refreshPatients(); } }, [familyId]); // eslint-disable-line
  useEffect(() => { if (patientId) set('vn_patient', patientId); }, [patientId]);

  const patient = patients.find(p => p.id === patientId) ?? null;

  const refreshData = useCallback(async () => {
    if (!patientId) { setData(EMPTY); return; }
    setLoading(true);
    const since = new Date(Date.now() - 366 * 864e5).toISOString();
    const ids = [patientId];
    try {
      const [vitals, meals, water, meds, medLogs, reminders] = await Promise.all([
        api().list<Vital>('vitals', ids, since, 'measured_at'),
        api().list<Meal>('meals', ids, since, 'eaten_at'),
        api().list<WaterLog>('water_logs', ids, since, 'logged_at'),
        api().list<Medicine>('medicines', ids),
        api().list<MedicineLog>('medicine_logs', ids, since, 'logged_at'),
        api().list<Reminder>('reminders', ids),
      ]);
      setData({ vitals, meals, water, meds, medLogs, reminders });
    } catch (e) {
      toast((e as Error).message, 'err');
    } finally { setLoading(false); }
  }, [patientId, toast]);

  useEffect(() => { refreshData(); }, [refreshData]);

  // live updates from other family members
  useEffect(() => {
    if (!user) return;
    let t: ReturnType<typeof setTimeout>;
    const off = api().subscribe(() => { clearTimeout(t); t = setTimeout(() => refreshData(), 600); });
    return () => { clearTimeout(t); off(); };
  }, [user, refreshData]);

  // keep phone reminders in sync whenever patients / meds / reminders change
  useEffect(() => {
    if (!user || !patients.length) return;
    rescheduleAll(patients).catch(() => { /* ignore */ });
  }, [user, patients, data.meds, data.reminders]);

  const canEdit = role === 'admin' || role === 'caregiver' || (!!patient && patient.linked_user_id === user?.id);

  const value = useMemo<Ctx>(() => ({
    ready, user, memberships, membership, role, patients, patient, data, loading, canEdit,
    selectFamily: (id) => setFamilyId(id),
    selectPatient: (id) => setPatientId(id),
    refreshAuth: async () => { userIdRef.current = '__force'; await refreshAuth(); },
    refreshPatients, refreshData, toast, toasts,
  }), [ready, user, memberships, membership, role, patients, patient, data, loading, canEdit, refreshAuth, refreshPatients, refreshData, toast, toasts]);

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
