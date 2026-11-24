/**
 * Claude Tennis Agent client. Calls the Anthropic Messages API with a forced tool call so the
 * model must return JSON matching a schema. When ANTHROPIC_API_KEY is unset (local dev / CI),
 * `mock` produces a deterministic result instead so every flow still works end to end.
 */

export const TENNIS_SYSTEM_PROMPT = `You are the Courtside Tennis Agent, an expert tennis coach and sports scientist.
Rules:
- Only use the numbers you are given. Never invent statistics, prices, or availability.
- Be specific and actionable; name the stroke, the moment in the point, and the fix.
- Write in calm, editorial English. No emojis.`;

export interface ClaudeResult<T> {
  output: T;
  model: string;
  usage: { input_tokens: number; output_tokens: number } | null;
  mocked: boolean;
}

export interface ClaudeRequest<T> {
  task: string;
  input: unknown;
  schema: Record<string, unknown>;
  mock: () => T;
  images?: { media_type: 'image/jpeg' | 'image/png' | 'image/webp'; data: string }[];
  maxTokens?: number;
}

export async function callClaude<T>(req: ClaudeRequest<T>, fetchImpl: typeof fetch = fetch): Promise<ClaudeResult<T>> {
  const key = Deno.env.get('ANTHROPIC_API_KEY');
  const model = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-sonnet-4-5';
  if (!key) return { output: req.mock(), model: 'mock', usage: null, mocked: true };

  const content: unknown[] = (req.images ?? []).map((img) => ({ type: 'image', source: { type: 'base64', ...img } }));
  content.push({ type: 'text', text: `${req.task}\n\nInput JSON:\n${JSON.stringify(req.input)}` });

  const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      max_tokens: req.maxTokens ?? 2048,
      system: TENNIS_SYSTEM_PROMPT,
      tools: [{ name: 'submit', description: 'Submit the structured result.', input_schema: req.schema }],
      tool_choice: { type: 'tool', name: 'submit' },
      messages: [{ role: 'user', content }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 500)}`);
  const body = await res.json();
  const block = (body.content as { type: string; input?: T }[]).find((b) => b.type === 'tool_use');
  if (!block?.input) throw new Error('Claude returned no structured output');
  return { output: block.input, model: body.model ?? model, usage: body.usage ?? null, mocked: false };
}
