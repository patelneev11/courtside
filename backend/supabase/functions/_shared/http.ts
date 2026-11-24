import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2.49.4';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

export function env(name: string, fallback?: string): string {
  const v = Deno.env.get(name) ?? fallback;
  if (v === undefined) throw new HttpError(500, `${name} is not configured`);
  return v;
}

/** Service-role client: bypasses RLS. Only use after authorising the caller. */
export function adminClient(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
}

/** Client acting as the caller, so RLS applies. */
export function userClient(req: Request): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    auth: { persistSession: false },
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
}

export async function requireUser(req: Request): Promise<{ user: User; db: SupabaseClient }> {
  const db = userClient(req);
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) throw new HttpError(401, 'sign in required');
  return { user: data.user, db };
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, 'body must be JSON');
  }
}

type Handler = (req: Request) => Promise<Response>;

export function serve(handler: Handler): void {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    try {
      return await handler(req);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: 'internal error' }, 500);
    }
  });
}
