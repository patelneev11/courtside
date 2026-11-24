import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const URL_ = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

export const IDS = {
  student: '11111111-1111-1111-1111-111111111111',
  elena: '22222222-2222-2222-2222-222222222222',
  marcus: '33333333-3333-3333-3333-333333333333',
  student2: '44444444-4444-4444-4444-444444444444',
  admin: '99999999-9999-9999-9999-999999999999',
  match: 'a0000000-0000-0000-0000-000000000001',
};

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
export const service = () => createClient(URL_, SERVICE, opts);
export const anon = () => createClient(URL_, ANON, opts);

const cache = new Map<string, { db: SupabaseClient; token: string }>();
export async function as(email: string) {
  if (cache.has(email)) return cache.get(email)!;
  const db = createClient(URL_, ANON, opts);
  const { data, error } = await db.auth.signInWithPassword({ email, password: 'courtside-demo' });
  if (error) throw error;
  const v = { db, token: data.session!.access_token };
  cache.set(email, v);
  return v;
}
export const student = () => as('student@courtside.dev');
export const student2 = () => as('student2@courtside.dev');
export const elena = () => as('elena@courtside.dev');
export const marcus = () => as('marcus@courtside.dev');
export const admin = () => as('admin@courtside.dev');

export async function fn(name: string, token: string | null, body?: unknown, init: RequestInit = {}) {
  const res = await fetch(`${URL_}/functions/v1/${name}`, {
    method: body === undefined ? 'GET' : 'POST',
    ...init,
    headers: { apikey: ANON, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, json, text };
}

export async function waitFor<T>(f: () => Promise<T | null | undefined>, ms = 15000): Promise<T> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await f();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('timed out');
}

export const opts_ = { sanitizeOps: false, sanitizeResources: false };
