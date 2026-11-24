import { assertEquals } from '@std/assert';
import { formEncode, signStripePayload, verifyStripeSignature } from '../../supabase/functions/_shared/stripe.ts';

Deno.test('form-encodes nested objects and arrays the way Stripe expects', () => {
  const s = formEncode({ mode: 'payment', line_items: [{ quantity: 1, price_data: { unit_amount: 9500 } }], expand: ['latest_charge'], skip: undefined }).join('&');
  assertEquals(decodeURIComponent(s), 'mode=payment&line_items[0][quantity]=1&line_items[0][price_data][unit_amount]=9500&expand[0]=latest_charge');
});

Deno.test('accepts a valid signature and rejects tampering, wrong secret and stale timestamps', async () => {
  const body = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' });
  const header = await signStripePayload(body, 'whsec_a');
  assertEquals(await verifyStripeSignature(body, header, 'whsec_a'), true);
  assertEquals(await verifyStripeSignature(body + ' ', header, 'whsec_a'), false);
  assertEquals(await verifyStripeSignature(body, header, 'whsec_b'), false);
  assertEquals(await verifyStripeSignature(body, null, 'whsec_a'), false);
  const old = await signStripePayload(body, 'whsec_a', Math.floor(Date.now() / 1000) - 3600);
  assertEquals(await verifyStripeSignature(body, old, 'whsec_a'), false);
});
