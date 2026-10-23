import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AppUser, CustomFood, Family, Membership, Patient, PatientTable, Person, Report, Role } from './types';
import { demoApi } from './demo';

/* ------------------------------------------------------------------ */
/*  Configuration                                                      */
/* ------------------------------------------------------------------ */
// Keys must be plain ASCII. A key copied from a shortened display (e.g. ending in "…") is unusable,
// so treat it as missing rather than crashing every request.
const clean = (v?: string) => { const t = (v ?? '').trim(); return t && /^[\x21-\x7E]+$/.test(t) ? t : undefined; };
const ENV_URL = clean(import.meta.env.VITE_SUPABASE_URL as string | undefined);
const ENV_KEY = clean(import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined);

function safeGet(k: string) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k: string, v: string | null) { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* ignore */ } }

export function getServerConfig(): { url: string; key: string } | null {
  if (ENV_URL && ENV_KEY) return { url: ENV_URL, key: ENV_KEY };
  const raw = safeGet('vn_server');
  if (raw) { try { const c = JSON.parse(raw); if (c.url && c.key) return c; } catch { /* ignore */ } }
  return null;
}
export function setServerConfig(url: string, key: string) { safeSet('vn_server', JSON.stringify({ url: url.trim(), key: key.replace(/[^\x21-\x7E]/g, '') })); }
export const hasBuiltInServer = !!(ENV_URL && ENV_KEY);
export function isDemo() { return safeGet('vn_demo') === '1' || !getServerConfig(); }
export function setDemo(on: boolean) { safeSet('vn_demo', on ? '1' : null); }

/** Usernames are mapped to an internal e-mail so Supabase Auth can be used without real e-mail */
export const usernameToEmail = (u: string) => `${u.trim().toLowerCase()}@vitalnest.app`;
export const validUsername = (u: string) => /^[a-z0-9._]{3,24}$/i.test(u.trim());

/* ------------------------------------------------------------------ */
/*  API contract — implemented by Supabase and by the offline demo     */
/* ------------------------------------------------------------------ */
export interface Api {
  mode: 'cloud' | 'demo';
  currentUser(): Promise<AppUser | null>;
  onAuthChange(cb: () => void): () => void;
  signIn(username: string, password: string): Promise<void>;
  signUp(username: string, password: string, displayName: string): Promise<void>;
  signOut(): Promise<void>;
  changePassword(pw: string): Promise<void>;
  accessToken(): Promise<string | null>;
  registerPush(token: string, platform: 'android' | 'web', alertsVitals: boolean, alertsMeds: boolean): Promise<void>;
  unregisterPush(token: string): Promise<void>;

  myFamilies(): Promise<Membership[]>;
  createFamily(name: string): Promise<Family>;
  joinFamily(code: string): Promise<Family>;
  renameFamily(id: string, name: string): Promise<void>;
  familyPeople(familyId: string): Promise<Person[]>;
  setRole(familyId: string, userId: string, role: Role): Promise<void>;
  removeMember(familyId: string, userId: string): Promise<void>;

  patients(familyId: string): Promise<Patient[]>;
  savePatient(p: Partial<Patient>): Promise<Patient>;
  deletePatient(id: string): Promise<void>;

  list<T>(table: PatientTable, patientIds: string[], sinceISO?: string, timeCol?: string): Promise<T[]>;
  insert<T>(table: PatientTable, row: Partial<T>): Promise<T>;
  update<T>(table: PatientTable, id: string, patch: Partial<T>): Promise<T>;
  remove(table: PatientTable, id: string): Promise<void>;
  upsertMedLog(row: { medicine_id: string; patient_id: string; scheduled_date: string; scheduled_time: string; status: 'taken' | 'skipped' }): Promise<void>;
  deleteMedLog(medicine_id: string, date: string, time: string): Promise<void>;

  customFoods(familyId: string): Promise<CustomFood[]>;
  addCustomFood(f: Omit<CustomFood, 'id'>): Promise<CustomFood>;

  uploadReport(patientId: string, file: File, meta: Partial<Report>): Promise<Report>;
  reportUrl(r: Report): Promise<string>;
  deleteReport(r: Report): Promise<void>;

  subscribe(onChange: () => void): () => void;
}

/* ------------------------------------------------------------------ */
/*  Supabase implementation                                            */
/* ------------------------------------------------------------------ */
function cloudApi(sb: SupabaseClient): Api {
  const check = <T,>(r: { data: T; error: { message: string } | null }) => {
    if (r.error) throw new Error(friendly(r.error.message));
    return r.data;
  };
  return {
    mode: 'cloud',
    async currentUser() {
      const { data } = await sb.auth.getSession();
      const u = data.session?.user;
      if (!u) return null;
      return {
        id: u.id,
        username: (u.user_metadata?.username as string) || u.email?.split('@')[0] || 'user',
        display_name: (u.user_metadata?.display_name as string) || null,
      };
    },
    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange(() => cb());
      return () => data.subscription.unsubscribe();
    },
    async signIn(username, password) {
      const { error } = await sb.auth.signInWithPassword({ email: usernameToEmail(username), password });
      if (error) throw new Error(error.message.includes('Invalid') ? 'Wrong username or password' : friendly(error.message));
    },
    async signUp(username, password, displayName) {
      if (!validUsername(username)) throw new Error('Username: 3–24 letters, numbers, dot or underscore');
      const avail = await sb.rpc('username_available', { uname: username.trim() });
      if (avail.data === false) throw new Error('That username is taken');
      const { data, error } = await sb.auth.signUp({
        email: usernameToEmail(username), password,
        options: { data: { username: username.trim().toLowerCase(), display_name: displayName } },
      });
      if (error) throw new Error(friendly(error.message));
      if (!data.session) {
        // e-mail confirmation still switched on in Supabase → try signing in directly
        const r = await sb.auth.signInWithPassword({ email: usernameToEmail(username), password });
        if (r.error) throw new Error('Account created, but Supabase "Confirm email" is ON. Turn it off in Authentication → Sign In / Providers → Email.');
      }
    },
    async signOut() { await sb.auth.signOut(); },
    async changePassword(pw) { const { error } = await sb.auth.updateUser({ password: pw }); if (error) throw new Error(friendly(error.message)); },
    async accessToken() { const { data } = await sb.auth.getSession(); return data.session?.access_token ?? null; },
    async registerPush(tok, plat, av, am) { check(await sb.rpc('register_push_token', { tok, plat, av, am })); },
    async unregisterPush(tok) { await sb.rpc('unregister_push_token', { tok }); },

    async myFamilies() {
      const u = (await sb.auth.getUser()).data.user;
      if (!u) return [];
      const rows = check(await sb.from('family_members').select('role, families(*)').eq('user_id', u.id)) as unknown as { role: Role; families: Family }[];
      return rows.filter(r => r.families).map(r => ({ role: r.role, family: r.families }));
    },
    async createFamily(name) { return check(await sb.rpc('create_family', { fname: name })) as Family; },
    async joinFamily(code) { return check(await sb.rpc('join_family', { code })) as Family; },
    async renameFamily(id, name) { check(await sb.from('families').update({ name }).eq('id', id)); },
    async familyPeople(fid) { return check(await sb.rpc('family_people', { fid })) as Person[]; },
    async setRole(fid, uid, role) { check(await sb.from('family_members').update({ role }).eq('family_id', fid).eq('user_id', uid)); },
    async removeMember(fid, uid) { check(await sb.from('family_members').delete().eq('family_id', fid).eq('user_id', uid)); },

    async patients(fid) { return check(await sb.from('patients').select('*').eq('family_id', fid).order('created_at')) as Patient[]; },
    async savePatient(p) {
      const { id, created_at, ...rest } = p;
      if (id) return check(await sb.from('patients').update(rest).eq('id', id).select().single()) as Patient;
      return check(await sb.from('patients').insert(rest).select().single()) as Patient;
    },
    async deletePatient(id) { check(await sb.from('patients').delete().eq('id', id)); },

    async list<T>(table: PatientTable, ids: string[], since?: string, timeCol?: string) {
      if (!ids.length) return [] as T[];
      let q = sb.from(table).select('*').in('patient_id', ids);
      if (since && timeCol) q = q.gte(timeCol, since);
      if (timeCol) q = q.order(timeCol, { ascending: false });
      return check(await q.limit(5000)) as T[];
    },
    async insert<T>(table: PatientTable, row: Partial<T>) { return check(await sb.from(table).insert(row as object).select().single()) as T; },
    async update<T>(table: PatientTable, id: string, patch: Partial<T>) { return check(await sb.from(table).update(patch as object).eq('id', id).select().single()) as T; },
    async remove(table, id) { check(await sb.from(table).delete().eq('id', id)); },
    async upsertMedLog(row) { check(await sb.from('medicine_logs').upsert(row, { onConflict: 'medicine_id,scheduled_date,scheduled_time' })); },
    async deleteMedLog(mid, date, time) { check(await sb.from('medicine_logs').delete().eq('medicine_id', mid).eq('scheduled_date', date).eq('scheduled_time', time)); },

    async customFoods(fid) { return check(await sb.from('custom_foods').select('*').eq('family_id', fid).order('name')) as CustomFood[]; },
    async addCustomFood(f) { return check(await sb.from('custom_foods').insert(f).select().single()) as CustomFood; },

    async uploadReport(pid, file, meta) {
      const clean = file.name.replace(/[^\w.\-]+/g, '_').slice(-80);
      const path = `${pid}/${Date.now()}-${clean}`;
      const up = await sb.storage.from('reports').upload(path, file, { contentType: file.type || undefined });
      if (up.error) throw new Error(friendly(up.error.message));
      return check(await sb.from('reports').insert({
        ...meta, patient_id: pid, file_path: path, file_name: file.name, mime_type: file.type, size_bytes: file.size,
      }).select().single()) as Report;
    },
    async reportUrl(r) {
      const { data, error } = await sb.storage.from('reports').createSignedUrl(r.file_path, 60 * 30);
      if (error) throw new Error(friendly(error.message));
      return data.signedUrl;
    },
    async deleteReport(r) {
      await sb.storage.from('reports').remove([r.file_path]);
      check(await sb.from('reports').delete().eq('id', r.id));
    },

    subscribe(onChange) {
      const ch = sb.channel('vn-live');
      for (const t of ['vitals', 'meals', 'water_logs', 'medicine_logs']) {
        ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, () => onChange());
      }
      ch.subscribe();
      return () => { sb.removeChannel(ch); };
    },
  };
}

function friendly(m: string) {
  if (/row-level security/i.test(m)) return 'You only have view access here. Ask the family admin to make you a caregiver.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'No internet connection — please try again.';
  if (/Password should be/i.test(m)) return 'Password must be at least 6 characters.';
  if (/already registered/i.test(m)) return 'That username is taken';
  return m;
}

/* ------------------------------------------------------------------ */
let _api: Api | null = null;
export function api(): Api {
  if (_api) return _api;
  const cfg = getServerConfig();
  if (!isDemo() && cfg) {
    const sb = createClient(cfg.url, cfg.key, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'vn-auth' } });
    _api = cloudApi(sb);
  } else {
    _api = demoApi();
  }
  return _api;
}
export function resetApi() { _api = null; }
