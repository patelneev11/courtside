-- Settlement + alert helpers called by Edge Functions with the service role only.

create or replace function public.settle_invoice(
  p_invoice uuid, p_payment_intent text, p_charge text, p_receipt_url text,
  p_card_brand text, p_card_last4 text, p_application_fee_cents integer default 0
) returns public.invoices
language plpgsql security definer set search_path = '' as $$
declare
  i public.invoices;
  pk public.lesson_packages;
begin
  select * into i from public.invoices where id = p_invoice for update;
  if not found then raise exception 'invoice % not found', p_invoice; end if;
  if i.status = 'paid' then return i; end if;
  if i.status not in ('open', 'processing') then raise exception 'invoice % is %', p_invoice, i.status; end if;

  update public.invoices set status = 'paid', stripe_payment_intent_id = p_payment_intent where id = i.id returning * into i;
  insert into public.payments (user_id, invoice_id, description, category, amount_cents, application_fee_cents, status,
                               stripe_payment_intent_id, stripe_charge_id, receipt_url, card_brand, card_last4)
  values (i.student_id, i.id, i.description, i.category, i.amount_cents, coalesce(p_application_fee_cents, 0), 'succeeded',
          p_payment_intent, p_charge, p_receipt_url, p_card_brand, p_card_last4)
  on conflict (stripe_payment_intent_id) do nothing;

  if i.kind = 'lesson' then
    update public.lessons set status = 'confirmed' where id = i.ref_id and status = 'pending_payment';
  elsif i.kind = 'class' then
    update public.class_enrollments set status = 'confirmed' where class_id = i.ref_id and student_id = i.student_id and status = 'pending_payment';
  elsif i.kind = 'court' then
    update public.court_reservations set status = 'confirmed' where id = i.ref_id and status = 'pending_payment';
  elsif i.kind = 'package' then
    select * into pk from public.lesson_packages where id = i.ref_id;
    insert into public.lesson_credits (student_id, coach_id, package_id, remaining) values (i.student_id, pk.coach_id, pk.id, pk.lesson_count);
  end if;

  insert into public.notifications (user_id, kind, title, body, payload)
  values (i.student_id, 'payment_succeeded', 'Payment received', i.description, jsonb_build_object('invoice_id', i.id));
  return i;
end $$;

create or replace function public.refund_invoice(p_payment_intent text) returns public.invoices
language plpgsql security definer set search_path = '' as $$
declare
  i public.invoices;
begin
  select * into i from public.invoices where stripe_payment_intent_id = p_payment_intent for update;
  if not found then return null; end if;
  if i.status = 'refunded' then return i; end if;
  update public.invoices set status = 'refunded' where id = i.id returning * into i;
  update public.payments set status = 'refunded' where stripe_payment_intent_id = p_payment_intent;
  if i.kind = 'lesson' then
    update public.lessons set status = 'cancelled' where id = i.ref_id;
    update public.coach_availability set booked = false where id = (select availability_id from public.lessons where id = i.ref_id);
  elsif i.kind = 'class' then
    update public.class_enrollments set status = 'cancelled' where class_id = i.ref_id and student_id = i.student_id;
  elsif i.kind = 'court' then
    update public.court_reservations set status = 'cancelled' where id = i.ref_id;
    update public.court_slots set status = 'open' where id = (select slot_id from public.court_reservations where id = i.ref_id);
  end if;
  return i;
end $$;

-- Returns true the first time an event id is seen, false on redelivery (webhook idempotency).
create or replace function public.claim_stripe_event(p_id text, p_type text) returns boolean
language sql security definer set search_path = '' as $$
  with ins as (insert into public.stripe_events (id, type) values (p_id, p_type) on conflict (id) do nothing returning 1)
  select exists (select 1 from ins);
$$;

-- Open future slots that match an active alert and haven't been notified yet.
create or replace function public.pending_court_alert_matches() returns table (alert_id uuid, player_id uuid, slot_id uuid, auto_hold boolean, court_name text, starts_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select distinct on (a.id) a.id, a.player_id, s.id, a.auto_hold, c.name, s.starts_at
  from public.court_alerts a
  join public.courts c on (a.court_id = c.id or (a.court_id is null and c.facility_id = a.facility_id))
  join public.facilities f on f.id = c.facility_id
  join public.court_slots s on s.court_id = c.id
  where a.active
    and s.status = 'open' and s.starts_at > now()
    and s.starts_at < now() + interval '14 days'
    and extract(dow from s.starts_at at time zone f.timezone)::smallint = any (a.days)
    and (s.starts_at at time zone f.timezone)::time >= a.start_time
    and (s.starts_at at time zone f.timezone)::time < a.end_time
    and (a.surfaces is null or c.surface = any (a.surfaces))
    and a.last_notified_slot is distinct from s.id
    and not exists (select 1 from public.notifications n where n.user_id = a.player_id and n.kind = 'court_open' and n.payload ->> 'slot_id' = s.id::text)
  order by a.id, s.starts_at;
$$;

-- Releases expired holds (run by the court-alerts cron before matching).
create or replace function public.release_expired_holds() returns integer
language sql security definer set search_path = '' as $$
  with u as (update public.court_slots set status = 'open', held_until = null where status = 'held' and held_until < now() returning 1)
  select count(*)::integer from u;
$$;

revoke execute on function public.settle_invoice, public.refund_invoice, public.claim_stripe_event,
  public.pending_court_alert_matches, public.release_expired_holds from public, anon, authenticated;
grant execute on function public.settle_invoice, public.refund_invoice, public.claim_stripe_event,
  public.pending_court_alert_matches, public.release_expired_holds to service_role;
