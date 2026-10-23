import { api } from './api';
import { isNative } from './notify';

export const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || (isNative() ? 'https://vitalnest.vercel.app' : '');

export type ScanKind = 'glucose' | 'bp' | 'medicine';
export interface GlucoseScan { found: boolean; value: number | null; unit: 'mg/dL' | 'mmol/L' | null; meal_marker?: string | null; confidence: string; note?: string }
export interface BPScan { found: boolean; systolic: number | null; diastolic: number | null; pulse: number | null; confidence: string; note?: string }
export interface MedScan { found: boolean; name: string | null; strength: string | null; form: string | null; composition: string | null; manufacturer?: string | null; purpose?: string | null; confidence: string; note?: string }

/** Resize a photo to the AI's native resolution (1568px long side) as a sharp JPEG. */
export async function toJpegBase64(file: File, max = 1568): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not open the photo')); i.src = url; });
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    const g = c.getContext('2d')!; g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.9).split(',')[1];
  } finally { URL.revokeObjectURL(url); }
}

/** Read one or more photos (several = different sides of the same medicine pack). */
export async function scanPhoto<T>(kind: ScanKind, files: File | File[]): Promise<T> {
  const token = await api().accessToken();
  if (!token) throw new Error('Photo reading needs you to be signed in (not available in demo mode).');
  const list = (Array.isArray(files) ? files : [files]).slice(0, 3);
  const images = await Promise.all(list.map(f => toJpegBase64(f, list.length > 2 ? 1300 : 1568)));
  const r = await fetch(`${API_BASE}/api/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ kind, images, mediaType: 'image/jpeg' }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Could not read the photo');
  return j as T;
}
