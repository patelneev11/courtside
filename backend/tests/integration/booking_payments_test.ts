import { assert, assertEquals } from '@std/assert';
import { signStripePayload } from '../../supabase/functions/_shared/stripe.ts';
import { fn, IDS, opts_, service, student, student2 } from './helpers.ts';

const openSlot = async () => (await service().from('court_slots').select('id').eq('status', 'open').gt('starts_at', new Date().toISOString()).order('starts_at').limit(1).single()).data!.id;

Deno.test({ name: 'a court slot can be reserved once; the loser gets an error', ...opts_, fn: async () => {
  const slot = await openSlot();
  const [a, b] = await Promise.all([(await student()).db.rpc('reserve_court_slot', { p_slot: slot }), (await student2()).db.rpc('reserve_court_slot', { p_slot: slot })]);
  const ok = [a, b].filter((r) => !r.error);
  assertEquals(ok.length, 1, JSON.stringify([a.error, b.error]));
  assertEquals(ok[0].data.status, 'pending_payment');
  assert(ok[0].data.invoice_id);
  const dup = await service().from('court_reservations').insert({ slot_id: slot, player_id: IDS.student2, price_cents: 0 });
  assert(dup.error, 'unique active reservation index');
}});

Deno.test({ name: 'book lesson -> checkout (mock) -> confirmed, paid and on the calendar', ...opts_, fn: async () => {
  const s = await student();
  const { data: av } = await service().from('coach_availability').select('id').eq('coach_id', IDS.elena).eq('booked', false).order('starts_at').limit(1).single();
  const { data: lesson, error } = await s.db.rpc('book_lesson', { p_availability: av!.id, p_kind: 'private' });
  assertEquals(error, null);
  assertEquals(lesson.price_cents, 9500);
  const again = await (await student2()).db.rpc('book_lesson', { p_availability: av!.id, p_kind: 'private' });
  assert(again.error, 'slot cannot be double booked');

  const stolen = await fn('payments-checkout', (await student2()).token, { invoice_id: lesson.invoice_id });
  assertEquals(stolen.status, 404, 'cannot pay or see another student invoice');
  const pay = await fn('payments-checkout', s.token, { invoice_id: lesson.invoice_id });
  assertEquals(pay.status, 200, pay.text);
  assertEquals(pay.json.status, 'paid');
  const { data: l } = await s.db.from('lessons').select('status').eq('id', lesson.id).single();
  assertEquals(l?.status, 'confirmed');
  const { data: p } = await s.db.from('payments').select('amount_cents, application_fee_cents').eq('invoice_id', lesson.invoice_id).single();
  assertEquals(p, { amount_cents: 9500, application_fee_cents: 950 });
  const { data: cal } = await s.db.from('calendar_events').select('type').eq('id', lesson.id);
  assertEquals(cal?.[0]?.type, 'lesson');
  const twice = await fn('payments-checkout', s.token, { invoice_id: lesson.invoice_id });
  assertEquals(twice.status, 409);
}});

Deno.test({ name: 'class enrollment respects capacity', ...opts_, fn: async () => {
  const svc = service();
  const { data: c } = await svc.from('classes').insert({ coach_id: IDS.marcus, title: 'Tiny clinic', kind: 'clinic', starts_at: new Date(Date.now() + 3 * 86_400_000).toISOString(), duration_min: 60, capacity: 1, price_cents: 0 }).select('id').single();
  const first = await (await student()).db.rpc('enroll_in_class', { p_class: c!.id });
  assertEquals(first.error, null);
  assertEquals(first.data.status, 'confirmed');
  const second = await (await student2()).db.rpc('enroll_in_class', { p_class: c!.id });
  assert(second.error?.message.includes('full'));
}});

Deno.test({ name: 'stripe webhook: signature required, settles once, ignores redelivery, refunds release the slot', ...opts_, fn: async () => {
  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;
  const slot = await openSlot();
  const { data: r } = await (await student2()).db.rpc('reserve_court_slot', { p_slot: slot });
  const evt = { id: `evt_${crypto.randomUUID()}`, type: 'checkout.session.completed', data: { object: { id: 'cs_test', payment_status: 'paid', payment_intent: `pi_${crypto.randomUUID()}`, metadata: { invoice_id: r.invoice_id } } } };
  const raw = JSON.stringify(evt);
  assertEquals((await fn('stripe-webhook', null, raw, { headers: { 'stripe-signature': 't=1,v1=bad' } })).status, 400);
  const sig = await signStripePayload(raw, secret);
  const first = await fn('stripe-webhook', null, raw, { headers: { 'stripe-signature': sig } });
  assertEquals(first.json, { received: true }, first.text);
  const again = await fn('stripe-webhook', null, raw, { headers: { 'stripe-signature': sig } });
  assertEquals(again.json.duplicate, true);
  const svc = service();
  assertEquals((await svc.from('payments').select('id').eq('invoice_id', r.invoice_id)).data?.length, 1);
  assertEquals((await svc.from('court_reservations').select('status').eq('id', r.id).single()).data?.status, 'confirmed');

  const refund = { id: `evt_${crypto.randomUUID()}`, type: 'charge.refunded', data: { object: { refunded: true, payment_intent: evt.data.object.payment_intent } } };
  const rraw = JSON.stringify(refund);
  assertEquals((await fn('stripe-webhook', null, rraw, { headers: { 'stripe-signature': await signStripePayload(rraw, secret) } })).status, 200);
  assertEquals((await svc.from('invoices').select('status').eq('id', r.invoice_id).single()).data?.status, 'refunded');
  assertEquals((await svc.from('court_slots').select('status').eq('id', slot).single()).data?.status, 'open');
}});

Deno.test({ name: 'lesson package payment grants credits that pay for a lesson', ...opts_, fn: async () => {
  const s = await student2();
  const { data: pk } = await service().from('lesson_packages').select('id').eq('coach_id', IDS.marcus).single();
  const { data: inv } = await s.db.rpc('buy_lesson_package', { p_package: pk!.id });
  assertEquals((await fn('payments-checkout', s.token, { invoice_id: inv.id })).status, 200);
  const credit = () => s.db.from('lesson_credits').select('id, remaining').eq('coach_id', IDS.marcus).gt('remaining', 0).order('created_at').limit(1).single();
  const before = (await credit()).data!;
  assert(before.remaining > 0);
  const { data: av } = await service().from('coach_availability').select('id').eq('coach_id', IDS.marcus).eq('booked', false).order('starts_at').limit(1).single();
  const { data: lesson, error } = await s.db.rpc('book_lesson', { p_availability: av!.id, p_kind: 'private', p_use_credit: true });
  assertEquals(error, null);
  assertEquals([lesson.status, lesson.price_cents, lesson.invoice_id], ['confirmed', 0, null]);
  assertEquals((await s.db.from('lesson_credits').select('remaining').eq('id', before.id).single()).data?.remaining, before.remaining - 1);
  assertEquals((await s.db.from('lesson_credits').select('remaining').eq('package_id', pk!.id).order('created_at', { ascending: false }).limit(1).single()).data?.remaining! >= 9, true);
}});

Deno.test({ name: 'review hardening: holds belong to their player; cancelled lessons rebook; refunds only touch their own booking', ...opts_, fn: async () => {
  const svc = service();
  const s = await student();
  const s2 = await student2();

  const held = await openSlot();
  await svc.from('court_slots').update({ status: 'held', held_until: new Date(Date.now() + 600_000).toISOString(), held_by: IDS.student }).eq('id', held);
  const { data: alert } = await s2.db.from('court_alerts').select('id').limit(1).maybeSingle();
  if (alert) await s2.db.from('court_alerts').update({ last_notified_slot: held, auto_hold: true }).eq('id', alert.id);
  assert((await s2.db.rpc('reserve_court_slot', { p_slot: held })).error?.message.includes('held'), 'alert edits cannot claim a hold');
  assertEquals((await s.db.rpc('reserve_court_slot', { p_slot: held })).error, null);

  // Cancel mid-checkout voids the invoice; the slot can be rebooked; refunding the old payment leaves the new booking alone.
  const { data: av } = await svc.from('coach_availability').select('id').eq('coach_id', IDS.elena).eq('booked', false).order('starts_at').limit(1).single();
  const { data: first } = await s.db.rpc('book_lesson', { p_availability: av!.id, p_kind: 'private' });
  await svc.from('invoices').update({ status: 'processing' }).eq('id', first.invoice_id);
  assertEquals((await s.db.rpc('cancel_booking', { p_kind: 'lesson', p_id: first.id })).error, null);
  assertEquals((await svc.from('invoices').select('status').eq('id', first.invoice_id).single()).data?.status, 'void');
  const late = await svc.rpc('settle_invoice', { p_invoice: first.invoice_id, p_payment_intent: `pi_${crypto.randomUUID()}`, p_charge: null, p_receipt_url: null, p_card_brand: null, p_card_last4: null });
  assertEquals(late.data?.status, 'void', 'late payment is flagged for refund, booking stays cancelled');

  const { data: second, error } = await s2.db.rpc('book_lesson', { p_availability: av!.id, p_kind: 'private' });
  assertEquals(error, null, 'cancelled lesson slot can be rebooked');
  await svc.rpc('refund_invoice', { p_payment_intent: late.data.stripe_payment_intent_id });
  assertEquals((await svc.from('lessons').select('status').eq('id', second.id).single()).data?.status, 'pending_payment');
  assertEquals((await svc.from('coach_availability').select('booked').eq('id', av!.id).single()).data?.booked, true);

  const pay = await fn('payments-checkout', s2.token, { invoice_id: second.invoice_id });
  assertEquals(pay.status, 200, pay.text);
  assert((await s2.db.rpc('cancel_booking', { p_kind: 'lesson', p_id: second.id })).error?.message.includes('refund'), 'paid bookings need a refund');
}});

Deno.test({ name: 'review hardening: package credits use the price-time snapshot', ...opts_, fn: async () => {
  const svc = service();
  const s = await student2();
  const { data: pk } = await svc.from('lesson_packages').insert({ coach_id: IDS.elena, title: 'Trial pack', lesson_count: 3, price_cents: 20000 }).select('id').single();
  const { data: inv } = await s.db.rpc('buy_lesson_package', { p_package: pk!.id });
  await svc.from('lesson_packages').update({ lesson_count: 30 }).eq('id', pk!.id);
  assertEquals((await fn('payments-checkout', s.token, { invoice_id: inv.id })).status, 200);
  assertEquals((await svc.from('lesson_credits').select('remaining').eq('package_id', pk!.id).single()).data?.remaining, 3);
}});
