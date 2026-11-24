import { adminClient, env, HttpError, json, serve } from '../_shared/http.ts';
import { stripe, stripeConfigured, verifyStripeSignature } from '../_shared/stripe.ts';

// Stripe -> POST /stripe-webhook. Deploy with --no-verify-jwt; authenticity comes from the signature.
serve(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'POST only');
  const raw = await req.text();
  if (!(await verifyStripeSignature(raw, req.headers.get('stripe-signature'), env('STRIPE_WEBHOOK_SECRET')))) throw new HttpError(400, 'bad signature');
  const event = JSON.parse(raw);
  const db = adminClient();

  const { data: first, error } = await db.rpc('claim_stripe_event', { p_id: event.id, p_type: event.type });
  if (error) throw error;
  if (!first) return json({ received: true, duplicate: true });

  try {
    await handle(db, event);
  } catch (e) {
    // Let Stripe retry: forget the event so the redelivery is processed.
    await db.from('stripe_events').delete().eq('id', event.id);
    throw e;
  }
  return json({ received: true });
});

async function handle(db: ReturnType<typeof adminClient>, event: any) {
  const o = event.data.object;
  switch (event.type) {
    case 'checkout.session.completed': {
      if (o.payment_status !== 'paid') return;
      const invoiceId = o.metadata?.invoice_id ?? o.client_reference_id;
      let charge: any = null;
      if (stripeConfigured() && o.payment_intent) {
        const pi = await stripe('GET', `payment_intents/${o.payment_intent}`, { expand: ['latest_charge'] });
        charge = pi.latest_charge;
        const pm = charge?.payment_method_details?.card;
        if (pm && charge?.payment_method) {
          await db.from('payment_methods').upsert({
            id: charge.payment_method, user_id: (await db.from('invoices').select('student_id').eq('id', invoiceId).single()).data?.student_id,
            brand: pm.brand, last4: pm.last4, exp_month: pm.exp_month, exp_year: pm.exp_year,
          });
        }
      }
      const card = charge?.payment_method_details?.card;
      const { data: settled, error } = await db.rpc('settle_invoice', {
        p_invoice: invoiceId, p_payment_intent: o.payment_intent, p_charge: charge?.id ?? null, p_receipt_url: charge?.receipt_url ?? null,
        p_card_brand: card?.brand ?? null, p_card_last4: card?.last4 ?? null, p_application_fee_cents: Number(o.metadata?.application_fee_cents ?? 0),
      });
      if (error) throw error;
      if (settled?.status === 'void' && stripeConfigured() && o.payment_intent) {
        await stripe('POST', 'refunds', { payment_intent: o.payment_intent, metadata: { reason: 'booking_cancelled', invoice_id: invoiceId } });
      }
      return;
    }
    case 'checkout.session.expired': {
      await db.from('invoices').update({ status: 'open', stripe_checkout_session_id: null }).eq('stripe_checkout_session_id', o.id).eq('status', 'processing');
      return;
    }
    case 'charge.refunded': {
      if (!o.refunded) return; // partial refunds are left for manual handling
      const { error } = await db.rpc('refund_invoice', { p_payment_intent: o.payment_intent });
      if (error) throw error;
      return;
    }
    case 'account.updated': {
      await db.from('billing_accounts').update({
        connect_charges_enabled: Boolean(o.charges_enabled), connect_payouts_enabled: Boolean(o.payouts_enabled), updated_at: new Date().toISOString(),
      }).eq('stripe_connect_account_id', o.id);
      return;
    }
    case 'payment_method.detached': {
      await db.from('payment_methods').delete().eq('id', o.id);
      return;
    }
  }
}
