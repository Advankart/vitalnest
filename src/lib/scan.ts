import { api } from './api';
import { isNative } from './notify';

export const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || (isNative() ? 'https://vitalnest.vercel.app' : '');

export type ScanKind = 'glucose' | 'bp' | 'medicine';
export interface GlucoseScan { found: boolean; value: number | null; unit: 'mg/dL' | 'mmol/L' | null; meal_marker?: string | null; confidence: string; note?: string }
export interface BPScan { found: boolean; systolic: number | null; diastolic: number | null; pulse: number | null; confidence: string; note?: string }
export interface MedScan { found: boolean; name: string | null; strength: string | null; form: string | null; composition: string | null; manufacturer?: string | null; purpose?: string | null; confidence: string; note?: string }

/** Shrink a photo to ≤1400px JPEG so uploads are fast and small. */
async function toJpegBase64(file: File, max = 1400): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not open the photo')); i.src = url; });
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.85).split(',')[1];
  } finally { URL.revokeObjectURL(url); }
}

export async function scanPhoto<T>(kind: ScanKind, file: File): Promise<T> {
  const token = await api().accessToken();
  if (!token) throw new Error('Photo reading needs you to be signed in (not available in demo mode).');
  const image = await toJpegBase64(file);
  const r = await fetch(`${API_BASE}/api/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ kind, image, mediaType: 'image/jpeg' }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Could not read the photo');
  return j as T;
}
