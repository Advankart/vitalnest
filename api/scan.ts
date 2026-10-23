// POST /api/scan  { kind: 'glucose' | 'bp' | 'medicine', image: <base64 jpeg>, mediaType?: 'image/jpeg' }
// Reads a glucometer / BP monitor screen or a medicine strip with Claude and returns structured fields.
import { cors, userFromToken } from './_lib.js';

export const config = { maxDuration: 60 };

const TOOLS: Record<string, { description: string; schema: any; prompt: string; maxTokens?: number }> = {
  glucose: {
    description: 'Report the blood glucose reading shown on the glucometer display.',
    prompt: `This is a photo of a blood glucose meter (glucometer) screen, usually an Indian brand (Accu-Chek, OneTouch, Dr Morepen, Contour, Sinocare, etc.).
Step 1 – in "readout", list EVERY number/word visible on the screen and where it is (e.g. "big centre: 126; top-left: 10:42; top-right: 23-10; small: mg/dL; icon: apple").
Step 2 – pick the glucose value: it is the LARGEST number on the screen. Ignore the time, date, memory/average labels (e.g. "7d avg", "MEM"), battery and temperature.
7-segment digits are easy to confuse — check segments carefully: 1 vs 7, 5 vs 6, 6 vs 8, 8 vs 0, 9 vs 3, 2 vs 7. A decimal point means mmol/L (e.g. 7.0).
If the screen shows "HI" or "LO" instead of a number, set found=false and say so in note.
Unit: read it from the screen; if not printed, numbers above 35 are mg/dL and numbers with a decimal under 35 are mmol/L.
Meal marker: only if a clear icon/word is shown (apple = before meal, bitten apple = after meal, "AC"/"Fasting" = fasting/before meal, "PC" = after meal).
Never guess. If glare, blur or angle makes any digit uncertain, use confidence "low" (or found=false if unreadable).`,
    schema: {
      type: 'object',
      properties: {
        readout: { type: 'string', description: 'Everything visible on the screen, with positions — written BEFORE deciding' },
        found: { type: 'boolean' },
        value: { type: ['number', 'null'], description: 'Glucose value exactly as displayed' },
        unit: { type: ['string', 'null'], enum: ['mg/dL', 'mmol/L', null] },
        meal_marker: { type: ['string', 'null'], enum: ['fasting', 'before_meal', 'after_meal', null] },
        confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        note: { type: 'string', description: 'Short note, e.g. why unreadable' },
      },
      required: ['readout', 'found', 'value', 'unit', 'confidence'],
    },
  },
  bp: {
    description: 'Report the blood pressure reading shown on the BP monitor display.',
    prompt: `This is a photo of a digital blood pressure monitor screen (Omron, Dr Trust, Rossmax, BPL, etc.).
Step 1 – in "readout", list EVERY number/word visible and where it is, including the printed labels next to them (e.g. "top big: 132 (SYS mmHg); middle: 84 (DIA); bottom small: 76 (heart icon / PULSE/min); top-left: 08:15; M 12").
Step 2 – map the values using the printed labels: SYS/systolic (top, largest), DIA/diastolic (middle), PULSE/heart-rate (bottom or next to a heart icon, often smaller). Ignore time, date, memory number (M / No.), user number and average markers.
7-segment digits are easy to confuse — check segments carefully: 1 vs 7, 5 vs 6, 6 vs 8, 8 vs 0, 9 vs 3. The leading "1" of a 3-digit systolic is often a thin single segment — do not drop it (e.g. "128" not "28").
Sanity rules: systolic is always higher than diastolic; systolic is usually 70–250, diastolic 40–150, pulse 35–180.
Never guess. If a digit is uncertain use confidence "low"; if SYS or DIA cannot be read, set found=false. Use null for a value that is not shown.`,
    schema: {
      type: 'object',
      properties: {
        readout: { type: 'string', description: 'Everything visible on the screen with positions and labels — written BEFORE deciding' },
        found: { type: 'boolean' },
        systolic: { type: ['number', 'null'] },
        diastolic: { type: ['number', 'null'] },
        pulse: { type: ['number', 'null'] },
        confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        note: { type: 'string' },
      },
      required: ['readout', 'found', 'systolic', 'diastolic', 'pulse', 'confidence'],
    },
  },
  medicine: {
    description: 'Report the medicine details printed on the strip, box or bottle.',
    prompt: `These are photo(s) of ONE medicine — a strip, box, bottle or insulin pen, usually an Indian brand. If there are several photos they are different sides of the same pack: combine them.
Step 1 – in "readout", copy the important printed text you can see (brand name line, the "Each tablet/capsule contains:" composition block, strength, manufacturer "Mfd. by / Marketed by").
Step 2 – fill the fields from that text:
• name: the BRAND name in large letters (e.g. "Glycomet GP 1", "Telma 40", "Ecosprin 75"), including suffixes like SR, XR, GP, AM, H, Forte, Plus, 0.5 — these matter.
• strength: the main strength as printed (e.g. "500 mg", "40 mg", "100 IU/mL"). For combinations, list each (e.g. "500 mg + 1 mg").
• composition: active ingredients with amounts exactly as printed (e.g. "Metformin Hydrochloride IP 500 mg (SR) + Glimepiride IP 1 mg"). Leave out excipients and colours.
• form: tablet / capsule / insulin / injection / syrup / inhaler / drops / other.
• manufacturer: the company after "Mfd. by" or "Marketed by".
• purpose: common use in 1–3 plain words based on the ingredients (e.g. "Diabetes", "Blood pressure", "Cholesterol", "Blood thinner", "Acidity").
Only report text you can actually read — use null when not visible. If the composition is not visible (often printed on the back), leave it null and say "composition on the other side" in note. Do not invent dosing instructions.`,
    schema: {
      type: 'object',
      properties: {
        readout: { type: 'string', description: 'Key printed text copied from the pack — written BEFORE deciding' },
        found: { type: 'boolean' },
        name: { type: ['string', 'null'], description: 'Brand / product name' },
        strength: { type: ['string', 'null'] },
        form: { type: ['string', 'null'], enum: ['tablet', 'capsule', 'insulin', 'injection', 'syrup', 'inhaler', 'drops', 'other', null] },
        composition: { type: ['string', 'null'], description: 'Active ingredients with amounts as printed' },
        manufacturer: { type: ['string', 'null'] },
        purpose: { type: ['string', 'null'], description: 'Common use in 1-3 words' },
        confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        note: { type: 'string' },
      },
      required: ['readout', 'found', 'name', 'strength', 'form', 'composition', 'confidence'],
    },
  },
  prescription: {
    description: 'Report every medicine written on the doctor prescription with its schedule.',
    maxTokens: 4000,
    prompt: `These are photo(s) of a doctor's prescription (printed or handwritten, usually from India). Several photos = several pages of the same prescription.
Step 1 – in "readout", copy each medicine line as written (e.g. "Tab. Glycomet GP 1  1-0-1  AC  x 30 days").
Step 2 – return one entry per medicine in "medicines". For each:
• name: brand name as written, with the prefix removed (Tab./Cap./Inj./Syp.) but keep suffixes (SR, XR, GP 1, 40, Forte…). Correct obvious handwriting misreads only when you are sure of the real Indian brand name.
• strength: e.g. "500 mg", "40 mg", "100 IU/mL" if written.
• form: tablet / capsule / insulin / injection / syrup / inhaler / drops / other (from Tab./Cap./Inj. etc.).
• dose: amount per time, e.g. "1 tablet", "½ tablet", "10 units", "5 ml".
• slots: which of morning / afternoon / night. Indian notation "1-0-1" = morning + night, "1-1-1" = all three, "0-0-1" = night, "1-0-0" = morning, "½-0-½" likewise. OD = morning (unless HS/night is written), BD/BID = morning + night, TDS/TID = morning + afternoon + night, QID = all three, HS = night. SOS/PRN = as needed → empty slots and as_needed=true.
• For insulin with different units per time (e.g. "12-0-8 units"), write the units per time in dose, like "12 units morning, 8 units night".
• food_relation: before_food (AC / before meals), empty_stomach, after_food (PC / after meals), with_food, or any.
• duration_days: number of days if written ("x 30 days", "1 month" = 30, "continue" = null).
• notes: anything else for that medicine (e.g. "only if sugar > 250", "alternate days").
Also return doctor and date if visible. Skip lab tests, advice and diet lines — medicines only.
Never invent medicines. If a line is hard to read, include your best reading with confidence "low" for that item.`,
    schema: {
      type: 'object',
      properties: {
        readout: { type: 'string', description: 'Medicine lines as written — BEFORE deciding' },
        found: { type: 'boolean' },
        doctor: { type: ['string', 'null'] },
        date: { type: ['string', 'null'], description: 'Prescription date as written' },
        medicines: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              strength: { type: ['string', 'null'] },
              form: { type: 'string', enum: ['tablet', 'capsule', 'insulin', 'injection', 'syrup', 'inhaler', 'drops', 'other'] },
              dose: { type: ['string', 'null'] },
              slots: { type: 'array', items: { type: 'string', enum: ['morning', 'afternoon', 'night'] } },
              as_needed: { type: 'boolean' },
              food_relation: { type: 'string', enum: ['before_food', 'after_food', 'with_food', 'empty_stomach', 'any'] },
              duration_days: { type: ['number', 'null'] },
              notes: { type: ['string', 'null'] },
              confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
            },
            required: ['name', 'form', 'slots', 'food_relation', 'confidence'],
          },
        },
        confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        note: { type: 'string' },
      },
      required: ['readout', 'found', 'medicines', 'confidence'],
    },
  },
};

const MODELS = [process.env.ANTHROPIC_MODEL, 'claude-opus-4-5', 'claude-sonnet-4-5', 'claude-haiku-4-5'].filter(Boolean) as string[];

const num = (x: any) => (typeof x === 'number' && isFinite(x) ? x : typeof x === 'string' && x.trim() && isFinite(+x) ? +x : null);

/** Sanity-check what was read; anything implausible is dropped or flagged for the user to double-check. */
function check(kind: string, o: any) {
  const low = (why: string) => { o.confidence = 'low'; o.note = o.note ? `${o.note}; ${why}` : why; };
  if (kind === 'glucose') {
    o.value = num(o.value);
    if (o.value != null && !o.unit) o.unit = o.value < 35 && !Number.isInteger(o.value) ? 'mmol/L' : 'mg/dL';
    const mg = o.value == null ? null : o.unit === 'mmol/L' ? o.value * 18 : o.value;
    if (mg == null) o.found = false;
    else if (mg < 20 || mg > 600) { o.found = false; o.note = 'Value looks outside the meter range'; }
    else if (mg < 50 || mg > 450) low('Unusual value');
  }
  if (kind === 'bp') {
    for (const k of ['systolic', 'diastolic', 'pulse']) o[k] = num(o[k]);
    let { systolic: s, diastolic: d } = o;
    if (s != null && d != null && d > s) { o.systolic = d; o.diastolic = s; s = o.systolic; d = o.diastolic; low('SYS/DIA order corrected'); }
    if (s == null || d == null) o.found = false;
    else if (s < 60 || s > 280 || d < 30 || d > 180) { o.found = false; o.note = 'Values look unrealistic'; }
    else if (s - d < 10 || s > 230 || d > 140) low('Unusual values');
    if (o.pulse != null && (o.pulse < 30 || o.pulse > 220)) { o.pulse = null; low('Pulse not clear'); }
  }
  if (kind === 'medicine' && !o.name && !o.composition) o.found = false;
  if (kind === 'prescription') { o.medicines = (o.medicines || []).filter((m: any) => m?.name); if (!o.medicines.length) o.found = false; }
  return o;
}

export default async function handler(req: any, res: any) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const user = await userFromToken(req.headers.authorization);
  if (!user) return res.status(401).json({ error: 'Please sign in again.' });

  const key = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!key) return res.status(500).json({ error: 'Photo reading is not set up yet (ANTHROPIC_API_KEY missing in Vercel).' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  const { kind } = body;
  const mediaType = ['image/jpeg', 'image/png', 'image/webp'].includes(body.mediaType) ? body.mediaType : 'image/jpeg';
  const tool = TOOLS[kind];
  const images: string[] = (Array.isArray(body.images) ? body.images : [body.image]).filter((x: any) => typeof x === 'string' && x.length > 100).slice(0, 3);
  if (!tool || !images.length) return res.status(400).json({ error: 'Bad request' });
  if (images.reduce((n, x) => n + x.length, 0) > 4_200_000) return res.status(413).json({ error: 'Photo is too large' });

  let lastErr = '';
  for (const model of MODELS) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        max_tokens: tool.maxTokens ?? 1200,
        temperature: 0,
        tools: [{ name: 'report', description: tool.description, input_schema: tool.schema }],
        tool_choice: { type: 'tool', name: 'report' },
        messages: [{
          role: 'user',
          content: [
            ...images.map(data => ({ type: 'image', source: { type: 'base64', media_type: mediaType, data } })),
            { type: 'text', text: tool.prompt },
          ],
        }],
      }),
    });
    const j: any = await r.json().catch(() => ({}));
    if (r.ok) {
      const out = (j.content || []).find((c: any) => c.type === 'tool_use')?.input;
      if (!out) return res.status(502).json({ error: 'Could not read the photo' });
      const { readout, ...rest } = out;
      return res.status(200).json({ kind, model, ...check(kind, rest) });
    }
    lastErr = j?.error?.message || `HTTP ${r.status}`;
    // try the next model only when this model name is not available
    if (!(r.status === 404 || r.status === 529 || r.status === 503 || /model|overloaded/i.test(lastErr))) break;
  }
  return res.status(502).json({ error: `Photo reading failed: ${lastErr}` });
}
