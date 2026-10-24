// POST /api/report-summary { report_id, lang?: 'en'|'ta', refresh?: boolean }
// Reads an uploaded report (PDF or photo) with Claude and saves a clean, structured summary.
// Made once per language and stored on the report, so opening it again costs nothing.
import { asUser, cors, sb, SB_SERVICE, SB_URL, userFromToken } from './_lib.js';
import { callClaude } from './_claude.js';

export const config = { maxDuration: 120 };

const MODELS = [process.env.ANTHROPIC_REPORT_MODEL, 'claude-sonnet-4-5', 'claude-haiku-4-5'] as string[];

/** Follow-up visits / tests with an exact calendar date, so the app can remind the family. */
const NEXT_VISITS = {
  type: 'array',
  description: 'Every future review visit or test mentioned (e.g. "review after 7 days", "repeat echo after 3 months", "next visit on 24/11"). Give an exact date.',
  items: {
    type: 'object',
    properties: {
      what: { type: 'string', description: 'Short, e.g. "Review with Dr. Kumar (Cardiology)", "Repeat Echo", "Fasting lipid profile"' },
      kind: { type: 'string', enum: ['visit', 'test'] },
      doctor: { type: ['string', 'null'] },
      date: { type: ['string', 'null'], description: 'YYYY-MM-DD. If relative ("after 2 weeks"), count from the discharge/prescription date of the document; if no document date, from the upload date given.' },
      time: { type: ['string', 'null'], description: 'HH:MM 24h if a time is written' },
      when_text: { type: ['string', 'null'], description: 'The words used, e.g. "after 1 week", "SOS"' },
    },
    required: ['what', 'kind', 'date'],
  },
};

const flagList = { type: 'string', enum: ['low', 'normal', 'high', 'critical', 'unknown'] };
const TOOL = {
  description: 'Structured summary of a medical document.',
  schema: {
    type: 'object',
    properties: {
      readable: { type: 'boolean', description: 'false if the document is not a medical report or cannot be read' },
      doc_type: { type: 'string', enum: ['discharge_summary', 'lab_report', 'prescription', 'scan_report', 'consultation', 'other'] },
      title: { type: 'string', description: 'Short title, e.g. "Discharge summary – Apollo Hospitals"' },
      hospital: { type: ['string', 'null'] }, doctor: { type: ['string', 'null'] },
      date: { type: ['string', 'null'], description: 'Main date as written (admission–discharge for discharge summaries)' },
      summary: { type: 'string', description: '2–4 short sentences in plain language: why, what was found/done, current condition' },
      diagnoses: { type: 'array', items: { type: 'string' }, description: 'Final diagnoses in plain words, medical term in brackets' },
      key_findings: {
        type: 'array', description: 'Most important findings (max 8), e.g. echo EF 35%, angiogram blocks, X-ray result',
        items: { type: 'object', properties: { label: { type: 'string' }, detail: { type: 'string' }, flag: { type: 'string', enum: ['normal', 'attention', 'critical'] } }, required: ['label', 'detail', 'flag'] },
      },
      lab_results: {
        type: 'array', description: 'Lab values exactly as printed (max 25), latest value if repeated',
        items: { type: 'object', properties: { test: { type: 'string' }, value: { type: 'string' }, unit: { type: ['string', 'null'] }, range: { type: ['string', 'null'] }, flag: flagList }, required: ['test', 'value', 'flag'] },
      },
      procedures: { type: 'array', items: { type: 'string' }, description: 'Procedures / surgeries done, with date if given' },
      medicines: {
        type: 'array', description: 'Medicines advised at discharge / on the prescription',
        items: { type: 'object', properties: { name: { type: 'string' }, dose: { type: ['string', 'null'] }, timing: { type: ['string', 'null'], description: 'e.g. 1-0-1, after food' }, duration: { type: ['string', 'null'] }, purpose: { type: ['string', 'null'], description: 'Common use in 1–3 plain words' } }, required: ['name'] },
      },
      follow_up: { type: 'array', items: { type: 'string' }, description: 'Review visits and tests to do, with dates' },
      advice: { type: 'array', items: { type: 'string' }, description: 'Diet, activity, care instructions' },
      warning_signs: { type: 'array', items: { type: 'string' }, description: 'When to go to hospital immediately, as written' },
      next_visits: NEXT_VISITS,
    },
    required: ['readable', 'doc_type', 'title', 'summary', 'diagnoses', 'key_findings', 'lab_results', 'procedures', 'medicines', 'follow_up', 'advice', 'warning_signs'],
  },
};

const SYSTEM = `You read Indian medical documents (discharge summaries, lab reports, prescriptions, scan reports) for a family health app.
Extract only what is written — never invent values, diagnoses or medicines. If something is unclear, leave it out.
Write in simple language an elderly patient and family understand; keep drug names, lab test names, numbers and units exactly as printed.
Do not give your own medical advice or change any treatment.`;
const TAMIL = `\nLANGUAGE: Write summary, diagnoses (keep the medical term in brackets in English), key finding labels/details, procedures, follow_up, advice, warning_signs and medicine purpose in simple Tamil (தமிழ்) script. Keep medicine names, lab test names, values, units and dates in English/digits exactly as printed. Enum fields stay in English.`;

const valid = (o: any) => o && typeof o.summary === 'string' && Array.isArray(o.diagnoses) && Array.isArray(o.lab_results);

export default async function handler(req: any, res: any) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const user = await userFromToken(req.headers.authorization);
    if (!user) return res.status(401).json({ error: 'Please sign in again.' });
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const id = String(body.report_id || ''), lang = body.lang === 'ta' ? 'ta' : 'en';
    if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'Bad request' });

    // access check (row-level security as the signed-in user)
    const [r] = await asUser<any[]>(req.headers.authorization, `/rest/v1/reports?id=eq.${id}&select=id,title,category,file_path,mime_type,size_bytes,ai_summary,report_date,created_at`);
    if (!r) return res.status(403).json({ error: 'No access to this report' });

    const existing = r.ai_summary?.[lang];

    // Older summaries had no exact follow-up dates: work them out from the saved text (small, cheap call — no re-reading the file)
    if (body.followups && existing && valid(existing)) {
      if (Array.isArray(existing.next_visits)) return res.status(200).json({ ...existing, cached: true });
      let next_visits: any[] = [];
      if ((existing.follow_up ?? []).length) {
        const c = await callClaude({
          models: ['claude-haiku-4-5', 'claude-sonnet-4-5'], temperature: 0, maxTokens: 1200,
          tool: { description: 'Follow-up visits and tests with exact dates.', schema: { type: 'object', properties: { next_visits: NEXT_VISITS }, required: ['next_visits'] } },
          content: [{ type: 'text', text: `Medical document: ${existing.title}. Document date: ${existing.date || 'not given'}. Uploaded on: ${r.report_date || String(r.created_at || '').slice(0, 10)}. Doctor: ${existing.doctor || '-'}.\nFollow-up instructions:\n- ${existing.follow_up.join('\n- ')}\n\nList each future visit/test with an exact date (YYYY-MM-DD). Keep "what" in the same language as the instructions.` }],
        });
        next_visits = Array.isArray(c.out?.next_visits) ? c.out.next_visits : [];
      }
      const updated = { ...existing, next_visits };
      await sb(`/rest/v1/reports?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ ai_summary: { ...(r.ai_summary || {}), [lang]: updated } }) });
      return res.status(200).json({ ...updated, cached: false });
    }

    if (existing && !body.refresh && valid(existing)) return res.status(200).json({ ...existing, cached: true });

    const mime = String(r.mime_type || '');
    const isPdf = mime === 'application/pdf' || /\.pdf$/i.test(r.file_path);
    const isImg = /^image\/(jpeg|png|webp|gif)$/.test(mime);
    if (!isPdf && !isImg) return res.status(400).json({ error: 'Only PDF and photo reports can be summarised.' });
    if ((r.size_bytes ?? 0) > 22 * 1024 * 1024) return res.status(413).json({ error: 'This file is too large to summarise.' });

    const f = await fetch(`${SB_URL}/storage/v1/object/reports/${String(r.file_path).split('/').map(encodeURIComponent).join('/')}`, { headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}` } });
    if (!f.ok) return res.status(502).json({ error: 'Could not open the report file' });
    const buf = Buffer.from(await f.arrayBuffer());
    if (isImg && buf.length > 5 * 1024 * 1024) return res.status(413).json({ error: 'This photo is too large to summarise — upload it again (photos are now made smaller automatically).' });
    const data = buf.toString('base64');
    const file = isPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
      : { type: 'image', source: { type: 'base64', media_type: mime, data } };

    let out: any = null, model = '';
    for (let attempt = 0; attempt < 2 && !valid(out); attempt++) {
      const c = await callClaude({
        models: MODELS, system: SYSTEM + (lang === 'ta' ? TAMIL : ''), tool: TOOL, temperature: 0,
        maxTokens: (lang === 'ta' ? 9000 : 4000) * (attempt + 1),
        content: [file, { type: 'text', text: `This is a "${r.category || 'medical'}" document titled "${r.title}", uploaded on ${r.report_date || String(r.created_at || '').slice(0, 10)}. Summarise it for the family using the report tool. For discharge summaries focus on: diagnosis, what was done, condition at discharge, discharge medicines, follow-up and warning signs. For lab reports list every abnormal value first.` }],
      });
      out = c.out; model = c.model;
    }
    if (!valid(out)) return res.status(502).json({ error: 'AI answer was incomplete — please try again.' });

    const result = { ...out, model, lang, at: new Date().toISOString() };
    await sb(`/rest/v1/reports?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ ai_summary: { ...(r.ai_summary || {}), [lang]: result } }) });
    return res.status(200).json({ ...result, cached: false });
  } catch (e: any) {
    return res.status(e?.status || 500).json({ error: e?.message || String(e) });
  }
}
