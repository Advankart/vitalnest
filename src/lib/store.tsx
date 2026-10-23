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
  patientsReady: boolean;
  patient: Patient | null;
  data: PatientData;
  loading: boolean;
  canEdit: boolean;
  memberIds: string[];
  canEditFor(p: Patient | null | undefined): boolean;
  selectFamily(id: string): void;
  selectPatient(id: string): void;
  refreshAuth(): Promise<void>;
  refreshPatients(): Promise<void>;
  refreshData(): Promise<void>;
  toast(msg: string, kind?: 'ok' | 'err'): void;
  toasts: { id: number; msg: string; kind: 'ok' | 'err' }[];
}

/**
 * Who may change a person's health data:
 *  - the person themself (profile linked to their login)
 *  - a caregiver
 *  - an admin, only for profiles that are NOT linked to another member's login
 * (so two admins cannot edit each other's data). Mirrors can_edit_patient() in the database.
 */
export function canEditPatient(p: Patient | null | undefined, role: Role, userId: string | undefined, memberIds: string[]) {
  if (!p || !userId) return false;
  if (p.linked_user_id === userId || role === 'caregiver') return true;
  return role === 'admin' && (!p.linked_user_id || !memberIds.includes(p.linked_user_id));
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
  const [patientsReady, setPatientsReady] = useState(false);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const openedFor = useRef<string | null>(null);   // user whose own profile was picked on this app open
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
    if (!familyId) { setPatients([]); setPatientsReady(true); return; }
    await reloadMemberships();
    const [ps, people] = await Promise.all([
      api().patients(familyId).catch(() => [] as Patient[]),
      api().familyPeople(familyId).catch(() => []),
    ]);
    setMemberIds(people.map(x => x.user_id));
    setPatients(ps);
    setPatientsReady(true);
    const uid = userIdRef.current;
    // On every app open, show the signed-in person's own profile first (if they have one).
    if (uid && openedFor.current !== uid) {
      openedFor.current = uid;
      const mine = ps.find(p => p.linked_user_id === uid);
      if (mine) { setPatientId(mine.id); return; }
    }
    setPatientId(prev => (prev && ps.some(p => p.id === prev)) ? prev : ps[0]?.id ?? null);
  }, [familyId, reloadMemberships]);

  // Reload when the family OR the signed-in user changes (the saved family id may be the same
  // after logging in, so depending on familyId alone left the screen empty until a refresh).
  useEffect(() => {
    setPatientsReady(false);
    if (!user) { setPatients([]); return; }
    if (familyId) { set('vn_family', familyId); refreshPatients(); }
  }, [familyId, user?.id]); // eslint-disable-line
  useEffect(() => { if (patientId) set('vn_patient', patientId); }, [patientId]);

  const patient = patients.find(p => p.id === patientId) ?? null;

  const refreshData = useCallback(async () => {
    if (!patientId || !user) { setData(EMPTY); return; }
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
  }, [patientId, user?.id, toast]); // eslint-disable-line

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

  const canEditFor = useCallback((p: Patient | null | undefined) => canEditPatient(p, role, user?.id, memberIds), [role, user?.id, memberIds]);
  const canEdit = canEditFor(patient);

  const value = useMemo<Ctx>(() => ({
    ready, user, memberships, membership, role, patients, patientsReady, patient, data, loading, canEdit, memberIds, canEditFor,
    selectFamily: (id) => setFamilyId(id),
    selectPatient: (id) => setPatientId(id),
    refreshAuth: async () => { userIdRef.current = '__force'; await refreshAuth(); },
    refreshPatients, refreshData, toast, toasts,
  }), [ready, user, memberships, membership, role, patients, patientsReady, patient, data, loading, canEdit, memberIds, canEditFor, refreshAuth, refreshPatients, refreshData, toast, toasts]);

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
