import { adminClient, env, HttpError, json, readJson, requireUser, serve } from '../_shared/http.ts';
import { stripe } from '../_shared/stripe.ts';

// POST /connect-onboarding { return_url? } -> { url } : Stripe Express onboarding for coaches.
// POST /connect-onboarding { action: 'dashboard' } -> { url } : Express dashboard login link.
serve(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'POST only');
  const { user, db } = await requireUser(req);
  const body = await readJson<{ return_url?: string; action?: 'onboard' | 'dashboard' }>(req).catch(() => ({} as { return_url?: string; action?: 'onboard' | 'dashboard' }));
  const { data: me } = await db.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'coach') throw new HttpError(403, 'coaches only');

  const admin = adminClient();
  const { data: acct } = await admin.from('billing_accounts').select('*').eq('profile_id', user.id).maybeSingle();
  let accountId = acct?.stripe_connect_account_id as string | undefined;

  if (body.action === 'dashboard') {
    if (!accountId) throw new HttpError(409, 'finish onboarding first');
    const link = await stripe('POST', `accounts/${accountId}/login_links`);
    return json({ url: link.url });
  }

  if (!accountId) {
    const a = await stripe('POST', 'accounts', {
      type: 'express', email: user.email, business_type: 'individual',
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      business_profile: { mcc: '7997', product_description: 'Tennis coaching' },
      metadata: { profile_id: user.id },
    });
    accountId = a.id;
    await admin.from('billing_accounts').upsert({ profile_id: user.id, stripe_connect_account_id: accountId });
  }
  const back = body.return_url ?? env('APP_URL', 'http://localhost:5173');
  const link = await stripe('POST', 'account_links', { account: accountId, type: 'account_onboarding', refresh_url: `${back}?connect=refresh`, return_url: `${back}?connect=done` });
  return json({ url: link.url });
});
