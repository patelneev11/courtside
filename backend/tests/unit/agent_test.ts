import { assert, assertAlmostEquals, assertEquals } from 'jsr:@std/assert@1';
import { callClaude } from '../../supabase/functions/_shared/claude.ts';
import { acuteChronicRatio, normaliseTo100, playstyle, racket } from '../../supabase/functions/tennis-agent/tasks.ts';

Deno.test('normaliseTo100 always sums to exactly 100', () => {
  const splits: Record<string, number>[] = [{ a: 33, b: 33, c: 33 }, { a: 40, b: 41, c: 21 }, { a: 0, b: 0, c: 0 }, { a: 1, b: 2, c: 3, d: 7 }];
  for (const split of splits) {
    const out = normaliseTo100(split);
    assertEquals(Object.values(out).reduce((s, v) => s + v, 0), 100, JSON.stringify(split));
  }
});

Deno.test('acute:chronic ratio flags a spike in load', () => {
  const now = new Date('2026-11-24T12:00:00Z');
  const at = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();
  const steady = [1, 3, 5, 8, 10, 12, 15, 17, 19, 22, 24, 26].map((d) => ({ started_at: at(d), duration_s: 3600, avg_hr: 130 }));
  assertAlmostEquals(acuteChronicRatio(steady, now), 1, 0.01);
  const spike = [...steady, ...[0.5, 2, 4, 6].map((d) => ({ started_at: at(d), duration_s: 5400, avg_hr: 150 }))];
  assert(acuteChronicRatio(spike, now) > 1.5);
});

Deno.test('racket mock only picks catalogue products', () => {
  const cat = [{ id: 'a', profile: { control: 90, spin: 60, comfort: 70 } }, { id: 'b', profile: { control: 60, spin: 90, comfort: 40 } }];
  const picks = racket.mock(cat, { arm_comfort: true }).picks;
  assertEquals(picks.map((p) => p.product_id), ['a', 'b']);
});

Deno.test('callClaude uses the mock without a key, and forces a tool call with one', async () => {
  Deno.env.delete('ANTHROPIC_API_KEY');
  const m = await callClaude({ task: 't', input: {}, schema: playstyle.schema, mock: playstyle.mock });
  assertEquals(m.mocked, true);

  Deno.env.set('ANTHROPIC_API_KEY', 'test');
  let sent: any;
  const r = await callClaude({ task: 't', input: { a: 1 }, schema: playstyle.schema, mock: playstyle.mock }, (_u, init) => {
    sent = JSON.parse(String(init?.body));
    return Promise.resolve(Response.json({ model: 'claude-x', usage: { input_tokens: 5, output_tokens: 7 }, content: [{ type: 'tool_use', name: 'submit', input: { ok: true } }] }));
  });
  Deno.env.delete('ANTHROPIC_API_KEY');
  assertEquals(sent.tool_choice, { type: 'tool', name: 'submit' });
  assert(sent.system.includes('Never invent statistics'));
  assertEquals(r.output, { ok: true } as any);
  assertEquals(r.usage?.output_tokens, 7);
});
