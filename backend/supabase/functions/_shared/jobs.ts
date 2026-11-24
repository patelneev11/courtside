import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.4';

export interface StepDef {
  key: string;
  label: string;
}

/** Drives an agent_jobs row through start -> steps -> result. Clients follow progress via Realtime. */
export class AgentJob {
  private steps: { key: string; label: string; status: string; at?: string }[];

  private constructor(private db: SupabaseClient, public id: string, defs: StepDef[]) {
    this.steps = defs.map((d) => ({ ...d, status: 'pending' }));
  }

  static async create(db: SupabaseClient, userId: string, kind: string, input: unknown, defs: StepDef[]): Promise<AgentJob> {
    const { data, error } = await db
      .from('agent_jobs')
      .insert({ user_id: userId, kind, input, steps: defs.map((d) => ({ ...d, status: 'pending' })) })
      .select('id')
      .single();
    if (error) throw error;
    return new AgentJob(db, data.id, defs);
  }

  async step(key: string): Promise<void> {
    const i = this.steps.findIndex((s) => s.key === key);
    if (i < 0) throw new Error(`unknown step ${key}`);
    const now = new Date().toISOString();
    this.steps = this.steps.map((s, j) => (j < i ? { ...s, status: 'done', at: s.at ?? now } : j === i ? { ...s, status: 'running', at: now } : s));
    await this.db.from('agent_jobs').update({ status: 'running', current_step: i, steps: this.steps, started_at: i === 0 ? now : undefined }).eq('id', this.id);
  }

  async succeed(result: unknown, meta: { model?: string; usage?: unknown } = {}): Promise<void> {
    this.steps = this.steps.map((s) => ({ ...s, status: 'done', at: s.at ?? new Date().toISOString() }));
    await this.db
      .from('agent_jobs')
      .update({ status: 'succeeded', steps: this.steps, current_step: this.steps.length - 1, result, model: meta.model, usage: meta.usage, finished_at: new Date().toISOString() })
      .eq('id', this.id);
  }

  async fail(err: unknown): Promise<void> {
    const message = err instanceof Error ? err.message : String(err);
    this.steps = this.steps.map((s) => (s.status === 'running' ? { ...s, status: 'failed' } : s));
    await this.db.from('agent_jobs').update({ status: 'failed', steps: this.steps, error: message, finished_at: new Date().toISOString() }).eq('id', this.id);
  }

  /** Runs `work` in the background after the response is sent (EdgeRuntime.waitUntil when available). */
  runInBackground(work: () => Promise<void>): void {
    const p = work().catch((e) => this.fail(e));
    // deno-lint-ignore no-explicit-any
    const rt = (globalThis as any).EdgeRuntime;
    if (rt?.waitUntil) rt.waitUntil(p);
  }
}
