// Calls Claude with one forced tool so the answer always comes back as structured JSON.
export interface ToolDef { name?: string; description: string; schema: any }

export async function callClaude(opts: { models: string[]; tool: ToolDef; content: any[]; system?: string; maxTokens?: number; temperature?: number }) {
  const key = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!key) throw Object.assign(new Error('AI is not set up yet (ANTHROPIC_API_KEY missing in Vercel).'), { status: 500 });
  const name = opts.tool.name || 'report';
  let lastErr = '';
  for (const model of opts.models.filter(Boolean)) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model, max_tokens: opts.maxTokens ?? 1200, temperature: opts.temperature ?? 0,
        ...(opts.system ? { system: opts.system } : {}),
        tools: [{ name, description: opts.tool.description, input_schema: opts.tool.schema }],
        tool_choice: { type: 'tool', name },
        messages: [{ role: 'user', content: opts.content }],
      }),
    });
    const j: any = await r.json().catch(() => ({}));
    if (r.ok) {
      const out = (j.content || []).find((c: any) => c.type === 'tool_use')?.input;
      if (!out) throw Object.assign(new Error('AI returned no answer'), { status: 502 });
      return { model, out, truncated: j.stop_reason === 'max_tokens' };
    }
    lastErr = j?.error?.message || `HTTP ${r.status}`;
    if (!(r.status === 404 || r.status === 529 || r.status === 503 || /model|overloaded/i.test(lastErr))) break;
  }
  throw Object.assign(new Error(`AI request failed: ${lastErr}`), { status: 502 });
}
