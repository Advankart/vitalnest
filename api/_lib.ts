// Shared helpers for VitalNest serverless functions (Vercel, Node runtime).
// Files starting with "_" are not exposed as endpoints.

export const SB_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
export const SB_ANON = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();
export const SB_SERVICE = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

export function cors(res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

/** Returns the Supabase user for a bearer token, or null. */
export async function userFromToken(authHeader?: string): Promise<{ id: string } | null> {
  const token = (authHeader || '').replace(/^Bearer\s+/i, '').trim();
  if (!token || !SB_URL || !SB_ANON) return null;
  const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_ANON, Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  const u = await r.json();
  return u?.id ? { id: u.id } : null;
}

/** Minimal Supabase REST client using the service-role key (server only). */
export async function sb<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  if (!SB_SERVICE) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set in Vercel');
  const r = await fetch(`${SB_URL}${path}`, {
    ...init,
    headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : null) as T;
}
