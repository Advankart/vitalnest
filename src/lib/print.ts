import { Capacitor, registerPlugin } from '@capacitor/core';

const NativePrint = registerPlugin<{ printHtml(o: { html: string; name: string }): Promise<void> }>('Print');

/** Print an HTML document: Android print screen in the app, the browser print dialog on the web. */
export async function printHtml(html: string, name: string) {
  if (Capacitor.isNativePlatform()) {
    try { await NativePrint.printHtml({ html, name }); return; }
    catch (e) {
      const msg = (e as Error)?.message || '';
      // older app without the print plugin → fall back to the web print dialog
      if (!/not implemented|not available|UNIMPLEMENTED/i.test(msg)) throw e;
    }
  }
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open(); doc.write(html); doc.close();
  await new Promise<void>(res => {
    const go = () => setTimeout(res, 250);
    const imgs = [...doc.images].filter(i => !i.complete);
    if (!imgs.length) go(); else { let n = imgs.length; imgs.forEach(i => { i.onload = i.onerror = () => { if (--n === 0) go(); }; }); }
  });
  frame.contentWindow!.focus();
  frame.contentWindow!.print();
  setTimeout(() => frame.remove(), 60_000);
}
