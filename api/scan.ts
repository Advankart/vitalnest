// POST /api/scan  { kind: 'glucose' | 'bp' | 'medicine', image: <base64 jpeg>, mediaType?: 'image/jpeg' }
// Reads a glucometer / BP monitor screen or a medicine strip with Claude and returns structured fields.
import { cors, userFromToken } from './_lib.js';

export const config = { maxDuration: 60 };

const TOOLS: Record<string, { description: string; schema: any; prompt: string }> = {
  glucose: {
    description: 'Report the blood glucose reading shown on the glucometer display.',
    prompt: 'This is a photo of a blood glucose meter (glucometer) display. Read the main glucose number exactly as shown on the screen (often 7-segment digits). Also read the unit (mg/dL or mmol/L) and any meal marker icon (before meal / after meal / fasting) if clearly shown. Do not guess: if the number is not clearly readable, set found=false.',
    schema: {
      type: 'object',
      properties: {
        found: { type: 'boolean' },
        value: { type: ['number', 'null'], description: 'Glucose value exactly as displayed' },
        unit: { type: ['string', 'null'], enum: ['mg/dL', 'mmol/L', null] },
        meal_marker: { type: ['string', 'null'], enum: ['fasting', 'before_meal', 'after_meal', null] },
        confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        note: { type: 'string', description: 'Short note, e.g. why unreadable' },
      },
      required: ['found', 'value', 'unit', 'confidence'],
    },
  },
  bp: {
    description: 'Report the blood pressure reading shown on the BP monitor display.',
    prompt: 'This is a photo of a digital blood pressure monitor display. Read SYS (systolic, usually the top/largest number), DIA (diastolic, middle number) and PULSE (heart rate, usually the bottom smaller number, sometimes next to a heart icon), exactly as displayed (often 7-segment digits). Do not guess: if a value is not clearly readable, return null for it; if SYS/DIA are unreadable set found=false.',
    schema: {
      type: 'object',
      properties: {
        found: { type: 'boolean' },
        systolic: { type: ['number', 'null'] },
        diastolic: { type: ['number', 'null'] },
        pulse: { type: ['number', 'null'] },
        confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        note: { type: 'string' },
      },
      required: ['found', 'systolic', 'diastolic', 'pulse', 'confidence'],
    },
  },
  medicine: {
    description: 'Report the medicine details printed on the strip, box or bottle.',
    prompt: 'This is a photo of a medicine strip, box or bottle (often Indian brands). Read what is printed: the brand name, strength (e.g. 500 mg, 100 IU/mL), dosage form, and the composition / active ingredients with amounts exactly as printed (e.g. "Metformin Hydrochloride IP 500 mg"). Also give the manufacturer if printed, and a short plain-language purpose based on the active ingredients (e.g. "Diabetes", "Blood pressure", "Cholesterol", "Blood thinner"). Only report what you can read; use null when not visible. Do not invent dosing instructions.',
    schema: {
      type: 'object',
      properties: {
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
      required: ['found', 'name', 'strength', 'form', 'composition', 'confidence'],
    },
  },
};

const MODELS = [process.env.ANTHROPIC_MODEL, 'claude-sonnet-4-5', 'claude-haiku-4-5', 'claude-3-5-haiku-latest'].filter(Boolean) as string[];

export default async function handler(req: any, res: any) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const user = await userFromToken(req.headers.authorization);
  if (!user) return res.status(401).json({ error: 'Please sign in again.' });

  const key = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!key) return res.status(500).json({ error: 'Photo reading is not set up yet (ANTHROPIC_API_KEY missing in Vercel).' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  const { kind, image } = body;
  const mediaType = ['image/jpeg', 'image/png', 'image/webp'].includes(body.mediaType) ? body.mediaType : 'image/jpeg';
  const tool = TOOLS[kind];
  if (!tool || typeof image !== 'string' || image.length < 100) return res.status(400).json({ error: 'Bad request' });
  if (image.length > 6_000_000) return res.status(413).json({ error: 'Photo is too large' });

  let lastErr = '';
  for (const model of MODELS) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        max_tokens: 700,
        tools: [{ name: 'report', description: tool.description, input_schema: tool.schema }],
        tool_choice: { type: 'tool', name: 'report' },
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
            { type: 'text', text: tool.prompt },
          ],
        }],
      }),
    });
    const j: any = await r.json().catch(() => ({}));
    if (r.ok) {
      const out = (j.content || []).find((c: any) => c.type === 'tool_use')?.input;
      if (!out) return res.status(502).json({ error: 'Could not read the photo' });
      return res.status(200).json({ kind, ...out });
    }
    lastErr = j?.error?.message || `HTTP ${r.status}`;
    // try the next model only when this model name is not available
    if (!(r.status === 404 || /model/i.test(lastErr))) break;
  }
  return res.status(502).json({ error: `Photo reading failed: ${lastErr}` });
}
