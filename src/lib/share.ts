import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { isNative } from './notify';

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const toBase64 = (blob: Blob) => new Promise<string>((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(',')[1]);
  r.onerror = rej;
  r.readAsDataURL(blob);
});

/** Share a file via the phone's share sheet (WhatsApp, Gmail, Drive…). Falls back to download on desktop. */
export async function shareFile(blob: Blob, filename: string, title: string, text?: string): Promise<'shared' | 'downloaded'> {
  if (isNative()) {
    const data = await toBase64(blob);
    const w = await Filesystem.writeFile({ path: filename, data, directory: Directory.Cache });
    await Share.share({ title, text, files: [w.uri], dialogTitle: title });
    return 'shared';
  }
  const file = new File([blob], filename, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try { await nav.share({ files: [file], title, text }); return 'shared'; }
    catch (e) { if ((e as Error).name === 'AbortError') return 'shared'; }
  }
  downloadBlob(blob, filename);
  return 'downloaded';
}

/** Save a file to the phone (Documents) or download in the browser. */
export async function saveFile(blob: Blob, filename: string): Promise<string> {
  if (isNative()) {
    const data = await toBase64(blob);
    await Filesystem.writeFile({ path: `VitalNest/${filename}`, data, directory: Directory.Documents, recursive: true });
    return `Saved to Documents/VitalNest/${filename}`;
  }
  downloadBlob(blob, filename);
  return 'Downloaded';
}

export async function shareText(text: string, whatsapp = false) {
  if (whatsapp) {
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    if (isNative()) { await Share.share({ text }).catch(() => window.open(url, '_system')); return; }
    window.open(url, '_blank', 'noopener');
    return;
  }
  if (isNative()) { await Share.share({ text }); return; }
  if (navigator.share) { try { await navigator.share({ text }); return; } catch { /* cancelled */ return; } }
  await navigator.clipboard?.writeText(text);
}
