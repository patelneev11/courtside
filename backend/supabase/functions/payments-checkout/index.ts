import { adminClient, env, HttpError, json, readJson, requireUser, serve } from '../_shared/http.ts';
import { applicationFeeCents, stripe, stripeConfigured } from '../_shared/stripe.ts';

// POST /payments-checkout { invoice_id, return_url? } -> { checkout_url }
// Coach invoices are paid as Stripe Connect destination charges (platform keeps PLATFORM_FEE_BPS).
// Without STRIPE_SECRET_KEY and with ALLOW_MOCK_PAYMENTS=true, the invoice is settled immediately (local dev only).
serve(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'POST only');
  const { user, db } = await requireUser(req);
  const { invoice_id, return_url } = await readJson<{ invoice_id: string; return_url?: string }>(req);
  if (!invoice_id) throw new HttpError(400, 'invoice_id required');

  const { data: inv } = await db.from('invoices').select('*').eq('id', invoice_id).eq('student_id', user.id).single();
  if (!inv) throw new HttpError(404, 'invoice not found');
  if (!['open', 'processing'].includes(inv.status)) throw new HttpError(409, `invoice is ${inv.status}`);
  if (inv.amount_cents === 0) throw new HttpError(409, 'nothing to pay');

  const admin = adminClient();
  const fee = inv.payee_coach_id ? applicationFeeCents(inv.amount_cents) : 0;

  if (!stripeConfigured()) {
    if (Deno.env.get('ALLOW_MOCK_PAYMENTS') !== 'true') throw new HttpError(503, 'payments are not configured');
    const pi = `pi_mock_${crypto.randomUUID().replaceAll('-', '')}`;
    const { error } = await admin.rpc('settle_invoice', {
      p_invoice: inv.id, p_payment_intent: pi, p_charge: null, p_receipt_url: null, p_card_brand: 'visa', p_card_last4: '4242', p_application_fee_cents: fee,
    });
    if (error) throw error;
    return json({ mock: true, status: 'paid', payment_intent: pi });
  }

  if (inv.status === 'processing' && inv.stripe_checkout_session_id) {
    const open = await stripe('GET', `checkout/sessions/${inv.stripe_checkout_session_id}`);
    if (open.status === 'open') return json({ checkout_url: open.url, session_id: open.id });
    if (open.status === 'complete') throw new HttpError(409, 'payment is already being processed');
  }

  // Customer per user, created lazily.
  let { data: acct } = await admin.from('billing_accounts').select('*').eq('profile_id', user.id).maybeSingle();
  if (!acct?.stripe_customer_id) {
    const c = await stripe('POST', 'customers', { email: user.email, metadata: { profile_id: user.id } });
    const { data } = await admin.from('billing_accounts').upsert({ profile_id: user.id, stripe_customer_id: c.id }).select('*').single();
    acct = data;
  }

  let transfer: Record<string, unknown> | undefined;
  if (inv.payee_coach_id) {
    const { data: coach } = await admin.from('billing_accounts').select('stripe_connect_account_id, connect_charges_enabled').eq('profile_id', inv.payee_coach_id).maybeSingle();
    if (!coach?.stripe_connect_account_id || !coach.connect_charges_enabled) throw new HttpError(409, 'this coach has not finished payout setup yet');
    transfer = { destination: coach.stripe_connect_account_id };
  }

  const back = return_url ?? env('APP_URL', 'http://localhost:5173');
  const session = await stripe('POST', 'checkout/sessions', {
    mode: 'payment',
    customer: acct?.stripe_customer_id,
    client_reference_id: inv.id,
    success_url: `${back}?payment=success&invoice=${inv.id}`,
    cancel_url: `${back}?payment=cancelled&invoice=${inv.id}`,
    line_items: [{ quantity: 1, price_data: { currency: inv.currency, unit_amount: inv.amount_cents, product_data: { name: inv.description } } }],
    payment_intent_data: { metadata: { invoice_id: inv.id }, ...(transfer ? { application_fee_amount: fee, transfer_data: transfer } : {}) },
    payment_method_options: { card: { setup_future_usage: 'off_session' } },
    metadata: { invoice_id: inv.id, application_fee_cents: fee },
  });
  await admin.from('invoices').update({ status: 'processing', stripe_checkout_session_id: session.id }).eq('id', inv.id);
  return json({ checkout_url: session.url, session_id: session.id });
});
