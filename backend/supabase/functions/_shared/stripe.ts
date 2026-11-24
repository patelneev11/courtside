/** Minimal Stripe REST client (form-encoded) + webhook signature verification, no SDK needed in Deno. */

export function formEncode(obj: Record<string, unknown>, prefix = ''): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (typeof item === 'object' && item !== null) out.push(...formEncode(item as Record<string, unknown>, `${key}[${i}]`));
        else out.push(`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(item))}`);
      });
    } else if (typeof v === 'object') {
      out.push(...formEncode(v as Record<string, unknown>, key));
    } else {
      out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
    }
  }
  return out;
}

export function stripeConfigured(): boolean {
  return Boolean(Deno.env.get('STRIPE_SECRET_KEY'));
}

export class StripeError extends Error {
  constructor(readonly status: number, readonly code: string | undefined, message: string) {
    super(message);
  }
}

export async function stripe<T = any>(method: 'GET' | 'POST', path: string, params: Record<string, unknown> = {}, fetchImpl: typeof fetch = fetch): Promise<T> {
  const key = Deno.env.get('STRIPE_SECRET_KEY');
  if (!key) throw new Error('STRIPE_SECRET_KEY is not configured');
  const body = formEncode(params).join('&');
  const url = `https://api.stripe.com/v1/${path}${method === 'GET' && body ? `?${body}` : ''}`;
  const res = await fetchImpl(url, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Stripe-Version': '2024-06-20' },
    body: method === 'POST' ? body : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new StripeError(res.status, data?.error?.code, `Stripe ${res.status}: ${data?.error?.message ?? 'request failed'}`);
  return data as T;
}

const enc = new TextEncoder();

async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** Verifies a `Stripe-Signature` header (t=...,v1=...) against the raw body. */
export async function verifyStripeSignature(rawBody: string, header: string | null, secret: string, toleranceS = 300, nowS = Math.floor(Date.now() / 1000)): Promise<boolean> {
  if (!header) return false;
  const parts = header.split(',').map((p) => p.split('=') as [string, string]);
  const t = Number(parts.find(([k]) => k === 't')?.[1]);
  const v1 = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!t || v1.length === 0 || Math.abs(nowS - t) > toleranceS) return false;
  const expected = await hmacHex(secret, `${t}.${rawBody}`);
  return v1.some((v) => safeEqual(v, expected));
}

/** Builds a valid signature header; used by tests and the local mock checkout. */
export async function signStripePayload(rawBody: string, secret: string, t = Math.floor(Date.now() / 1000)): Promise<string> {
  return `t=${t},v1=${await hmacHex(secret, `${t}.${rawBody}`)}`;
}

/** Platform fee taken on coach payouts (basis points). */
export function applicationFeeCents(amount: number): number {
  const bps = Number(Deno.env.get('PLATFORM_FEE_BPS') ?? '1000');
  return Math.round((amount * bps) / 10_000);
}
