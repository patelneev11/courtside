-- Hardening from review: column-level write limits, hold ownership, private profiles,
-- rebookable lessons, invoice snapshots, and refund/cancel paths that only touch their own booking.

-- Private profiles: visible to the owner, admins, linked coach/student pairs, or when public. Coaches are always listed.
drop policy "profiles are readable by signed-in users" on public.profiles;
create policy "profiles are readable when public or related" on public.profiles for select to authenticated using (
  id = (select auth.uid())
  or role <> 'student'
  or lower(settings -> 'privacy' ->> 'profile_public') is distinct from 'false'
  or public.is_admin()
  or exists (select 1 from public.coach_students cs
             where (cs.coach_id = (select auth.uid()) and cs.student_id = profiles.id)
                or (cs.student_id = (select auth.uid()) and cs.coach_id = profiles.id))
);

create or replace function public.can_view_player(player uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select player = (select auth.uid())
    or exists (
      select 1
      from public.coach_students cs
      join public.profiles p on p.id = cs.student_id
      where cs.coach_id = (select auth.uid())
        and cs.student_id = player
        and lower(p.settings -> 'privacy' ->> 'share_stats_with_coaches') is distinct from 'false'
    );
$$;

-- Recipients may only set read_at; coaches may only edit lesson notes. Everything else goes through RPCs.
revoke update on public.messages from authenticated, anon;
grant update (read_at) on public.messages to authenticated;
revoke update on public.lessons from authenticated, anon;
grant update (notes) on public.lessons to authenticated;

-- Players can register a freshly uploaded swing video for analysis (path must be in their own folder).
create policy "players register swing uploads" on public.swing_analyses for insert to authenticated with check (
  player_id = (select auth.uid())
  and video_path like (select auth.uid())::text || '/%'
  and status = 'queued' and agent_job_id is null and summary is null and overall_score is null
  and key_finding is null and recommended_drill_id is null
  and checkpoints = '[]'::jsonb and annotated_frames = '[]'::jsonb and pose_metrics = '{}'::jsonb
);

-- Cancelled lessons release their availability slot for rebooking.
alter table public.lessons drop constraint lessons_availability_id_key;
create unique index lessons_active_availability on public.lessons (availability_id) where status <> 'cancelled';

-- Holds record who they are for; alert rows are user-editable so they cannot prove ownership.
alter table public.court_slots add column held_by uuid references public.profiles (id) on delete set null;

-- Invoices snapshot what was bought (e.g. package lesson_count) so later catalogue edits don't change it.
alter table public.invoices add column metadata jsonb not null default '{}';
alter table public.lesson_credits add column invoice_id uuid references public.invoices (id) on delete set null;

create or replace function public.release_expired_holds() returns integer
language sql security definer set search_path = '' as $$
  with u as (update public.court_slots set status = 'open', held_until = null, held_by = null
             where status = 'held' and held_until < now() returning 1)
  select count(*)::integer from u;
$$;

create or replace function public.reserve_court_slot(p_slot uuid)
returns public.court_reservations
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  s public.court_slots;
  ct public.courts;
  r public.court_reservations;
  inv uuid;
  cents integer;
begin
  if me is null then raise exception 'not signed in'; end if;
  select * into s from public.court_slots where id = p_slot for update;
  if not found then raise exception 'slot not found'; end if;
  if s.starts_at <= now() then raise exception 'slot is in the past'; end if;
  if s.status = 'held' and s.held_until > now() and s.held_by is distinct from me then
    raise exception 'slot is held by another player';
  end if;
  if s.status in ('booked', 'closed') then raise exception 'slot is no longer available'; end if;

  select * into ct from public.courts where id = s.court_id;
  cents := round(ct.hourly_rate_cents * extract(epoch from (s.ends_at - s.starts_at)) / 3600.0);

  update public.court_slots set status = 'booked', held_until = null, held_by = null where id = s.id;
  insert into public.court_reservations (slot_id, player_id, price_cents, status)
  values (s.id, me, cents, case when cents = 0 then 'confirmed' else 'pending_payment' end::public.booking_status)
  returning * into r;

  if cents > 0 then
    insert into public.invoices (student_id, kind, ref_id, description, amount_cents, category, due_at)
    values (me, 'court', r.id, ct.name || ' · ' || to_char(s.starts_at, 'Mon DD HH24:MI'), cents, 'court_time',
            least(s.starts_at, now() + interval '7 days'))
    returning id into inv;
    update public.court_reservations set invoice_id = inv where id = r.id returning * into r;
  end if;
  return r;
end $$;

create or replace function public.enroll_in_class(p_class uuid)
returns public.class_enrollments
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  c public.classes;
  e public.class_enrollments;
  taken integer;
  inv uuid;
begin
  if me is null then raise exception 'not signed in'; end if;
  select * into c from public.classes where id = p_class for update;
  if not found or c.cancelled then raise exception 'class not found'; end if;
  if c.starts_at <= now() then raise exception 'class already started'; end if;
  select count(*) into taken from public.class_enrollments where class_id = c.id and status <> 'cancelled';
  if taken >= c.capacity then raise exception 'class is full'; end if;

  insert into public.class_enrollments (class_id, student_id, status)
  values (c.id, me, case when c.price_cents = 0 then 'confirmed' else 'pending_payment' end::public.booking_status)
  on conflict (class_id, student_id) do update set status = excluded.status, invoice_id = null
    where public.class_enrollments.status = 'cancelled'
  returning * into e;
  if e is null then raise exception 'already enrolled'; end if;

  insert into public.coach_students (coach_id, student_id) values (c.coach_id, me) on conflict do nothing;

  if c.price_cents > 0 then
    insert into public.invoices (student_id, payee_coach_id, kind, ref_id, description, amount_cents, category, due_at)
    values (me, c.coach_id, 'class', c.id, c.title || ' · ' || to_char(c.starts_at, 'Mon DD HH24:MI'), c.price_cents, 'coaching',
            least(c.starts_at, now() + interval '7 days'))
    returning id into inv;
    update public.class_enrollments set invoice_id = inv where class_id = c.id and student_id = me returning * into e;
  end if;
  return e;
end $$;

-- Cancels a booking the caller owns, releases the slot and voids an unpaid (or mid-checkout) invoice.
-- Paid bookings must be refunded instead; the refund webhook then cancels them.
-- A checkout that completes after cancellation is refunded automatically by the webhook.
create or replace function public.cancel_booking(p_kind public.invoice_kind, p_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  inv public.invoices;
  inv_id uuid;
  ref uuid;
begin
  -- Find the invoice first and lock it before the booking row: the same order settle_invoice/refund_invoice use.
  if p_kind = 'court' then
    select invoice_id into inv_id from public.court_reservations
    where id = p_id and (player_id = me or me is null) and status <> 'cancelled';
  elsif p_kind = 'lesson' then
    select invoice_id into inv_id from public.lessons
    where id = p_id and (student_id = me or coach_id = me or me is null) and status <> 'cancelled';
  elsif p_kind = 'class' then
    select invoice_id into inv_id from public.class_enrollments
    where class_id = p_id and student_id = me and status <> 'cancelled';
  else
    raise exception 'cannot cancel %', p_kind;
  end if;
  if not found then raise exception 'booking not found'; end if;

  select * into inv from public.invoices where id = inv_id for update;
  if inv.status = 'paid' and me is not null then raise exception 'this booking is paid; request a refund to cancel it'; end if;

  if p_kind = 'court' then
    update public.court_reservations set status = 'cancelled'
    where id = p_id and status <> 'cancelled' and invoice_id is not distinct from inv_id returning slot_id into ref;
    if not found then raise exception 'booking changed; try again'; end if;
    update public.court_slots set status = 'open', held_until = null, held_by = null where id = ref and status = 'booked';
  elsif p_kind = 'lesson' then
    update public.lessons set status = 'cancelled'
    where id = p_id and status <> 'cancelled' and invoice_id is not distinct from inv_id returning availability_id into ref;
    if not found then raise exception 'booking changed; try again'; end if;
    update public.coach_availability set booked = false where id = ref;
  else
    update public.class_enrollments set status = 'cancelled'
    where class_id = p_id and student_id = me and status <> 'cancelled' and invoice_id is not distinct from inv_id;
    if not found then raise exception 'booking changed; try again'; end if;
  end if;
  update public.invoices set status = 'void' where id = inv_id and status in ('open', 'processing');
end $$;

create or replace function public.buy_lesson_package(p_package uuid)
returns public.invoices
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  pk public.lesson_packages;
  i public.invoices;
begin
  if me is null then raise exception 'not signed in'; end if;
  select * into pk from public.lesson_packages where id = p_package and active;
  if not found then raise exception 'package not found'; end if;
  insert into public.invoices (student_id, payee_coach_id, kind, ref_id, description, amount_cents, category, metadata)
  values (me, pk.coach_id, 'package', pk.id, pk.title, pk.price_cents, 'coaching',
          jsonb_build_object('coach_id', pk.coach_id, 'lesson_count', pk.lesson_count))
  returning * into i;
  return i;
end $$;

-- Settles an invoice. A payment for a voided invoice (booking cancelled mid-checkout) is recorded and the
-- invoice is returned still 'void' so the caller refunds it.
create or replace function public.settle_invoice(
  p_invoice uuid, p_payment_intent text, p_charge text, p_receipt_url text,
  p_card_brand text, p_card_last4 text, p_application_fee_cents integer default 0
) returns public.invoices
language plpgsql security definer set search_path = '' as $$
declare
  i public.invoices;
begin
  select * into i from public.invoices where id = p_invoice for update;
  if not found then raise exception 'invoice % not found', p_invoice; end if;
  if i.status = 'paid' then return i; end if;
  if i.status not in ('open', 'processing', 'void') then raise exception 'invoice % is %', p_invoice, i.status; end if;

  insert into public.payments (user_id, invoice_id, description, category, amount_cents, application_fee_cents, status,
                               stripe_payment_intent_id, stripe_charge_id, receipt_url, card_brand, card_last4)
  values (i.student_id, i.id, i.description, i.category, i.amount_cents, coalesce(p_application_fee_cents, 0), 'succeeded',
          p_payment_intent, p_charge, p_receipt_url, p_card_brand, p_card_last4)
  on conflict (stripe_payment_intent_id) do nothing;

  if i.status = 'void' then
    update public.invoices set stripe_payment_intent_id = p_payment_intent where id = i.id returning * into i;
    return i;
  end if;

  update public.invoices set status = 'paid', stripe_payment_intent_id = p_payment_intent where id = i.id returning * into i;
  if i.kind = 'lesson' then
    update public.lessons set status = 'confirmed' where id = i.ref_id and invoice_id = i.id and status = 'pending_payment';
  elsif i.kind = 'class' then
    update public.class_enrollments set status = 'confirmed'
    where class_id = i.ref_id and student_id = i.student_id and invoice_id = i.id and status = 'pending_payment';
  elsif i.kind = 'court' then
    update public.court_reservations set status = 'confirmed' where id = i.ref_id and invoice_id = i.id and status = 'pending_payment';
  elsif i.kind = 'package' then
    insert into public.lesson_credits (student_id, coach_id, package_id, invoice_id, remaining)
    select i.student_id, coalesce((i.metadata ->> 'coach_id')::uuid, pk.coach_id), pk.id, i.id,
           coalesce((i.metadata ->> 'lesson_count')::integer, pk.lesson_count)
    from (select 1) one left join public.lesson_packages pk on pk.id = i.ref_id;
  end if;

  insert into public.notifications (user_id, kind, title, body, payload)
  values (i.student_id, 'payment_succeeded', 'Payment received', i.description, jsonb_build_object('invoice_id', i.id));
  return i;
end $$;

-- Refunds only cancel the booking this invoice paid for, never a later rebooking of the same slot or class.
create or replace function public.refund_invoice(p_payment_intent text) returns public.invoices
language plpgsql security definer set search_path = '' as $$
declare
  i public.invoices;
  ref uuid;
begin
  select * into i from public.invoices where stripe_payment_intent_id = p_payment_intent for update;
  if not found then return null; end if;
  if i.status = 'refunded' then return i; end if;
  update public.invoices set status = 'refunded' where id = i.id returning * into i;
  update public.payments set status = 'refunded' where stripe_payment_intent_id = p_payment_intent;
  if i.kind = 'lesson' then
    update public.lessons set status = 'cancelled' where id = i.ref_id and invoice_id = i.id and status <> 'cancelled'
    returning availability_id into ref;
    if found then update public.coach_availability set booked = false where id = ref; end if;
  elsif i.kind = 'class' then
    update public.class_enrollments set status = 'cancelled'
    where class_id = i.ref_id and student_id = i.student_id and invoice_id = i.id and status <> 'cancelled';
  elsif i.kind = 'court' then
    update public.court_reservations set status = 'cancelled' where id = i.ref_id and invoice_id = i.id and status <> 'cancelled'
    returning slot_id into ref;
    if found then update public.court_slots set status = 'open' where id = ref and status = 'booked'; end if;
  elsif i.kind = 'package' then
    update public.lesson_credits set remaining = 0 where invoice_id = i.id;
  end if;
  return i;
end $$;

-- Pathway progress is written only through this function (no client insert/update policy).
create or replace function public.complete_pathway_lesson(p_stage uuid, p_lesson text)
returns public.pathway_progress
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  st public.pathway_stages;
  pr public.pathway_progress;
  blocked boolean;
begin
  if me is null then raise exception 'not signed in'; end if;
  select * into st from public.pathway_stages where id = p_stage;
  if not found then raise exception 'unknown stage'; end if;
  if not exists (select 1 from jsonb_array_elements(st.lessons) l where l ->> 'key' = p_lesson) then
    raise exception 'unknown lesson %', p_lesson;
  end if;
  select exists (
    select 1 from public.pathway_stages s
    left join public.pathway_progress p on p.stage_id = s.id and p.player_id = me
    where s.position < st.position and p.completed_at is null
  ) into blocked;
  if blocked then raise exception 'stage is locked'; end if;

  insert into public.pathway_progress (player_id, stage_id, completed_lessons)
  values (me, p_stage, array[p_lesson])
  on conflict (player_id, stage_id) do update
    set completed_lessons = (select array_agg(distinct x) from unnest(public.pathway_progress.completed_lessons || p_lesson) x)
  returning * into pr;

  if (select count(*) from jsonb_array_elements(st.lessons)) <= cardinality(pr.completed_lessons) and pr.completed_at is null then
    update public.pathway_progress set completed_at = now()
    where player_id = pr.player_id and stage_id = pr.stage_id returning * into pr;
  end if;
  return pr;
end $$;
revoke execute on function public.complete_pathway_lesson from public, anon;
grant execute on function public.complete_pathway_lesson to authenticated;

-- Creates an agent job unless the account hit its hourly cap; serialised per user so concurrent requests can't overshoot.
create or replace function public.create_agent_job(p_user uuid, p_kind text, p_input jsonb, p_steps jsonb, p_limit integer)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));
  if (select count(*) from public.agent_jobs where user_id = p_user and created_at > now() - interval '1 hour') >= p_limit then
    raise exception 'agent job limit reached' using errcode = 'P0429';
  end if;
  insert into public.agent_jobs (user_id, kind, input, steps) values (p_user, p_kind::public.agent_job_kind, p_input, p_steps) returning agent_jobs.id into id;
  return id;
end $$;
revoke execute on function public.create_agent_job from public, anon, authenticated;
grant execute on function public.create_agent_job to service_role;
