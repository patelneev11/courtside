-- Transactional booking: lock the slot, create the booking + invoice, link coach and student.

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
  if s.status = 'held' and s.held_until > now() and not exists (
       select 1 from public.court_alerts a where a.player_id = me and a.last_notified_slot = s.id and a.auto_hold) then
    raise exception 'slot is held by another player';
  end if;
  if s.status in ('booked', 'closed') then raise exception 'slot is no longer available'; end if;

  select * into ct from public.courts where id = s.court_id;
  cents := round(ct.hourly_rate_cents * extract(epoch from (s.ends_at - s.starts_at)) / 3600.0);

  update public.court_slots set status = 'booked', held_until = null where id = s.id;
  insert into public.court_reservations (slot_id, player_id, price_cents, status)
  values (s.id, me, cents, case when cents = 0 then 'confirmed' else 'pending_payment' end)
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

create or replace function public.book_lesson(p_availability uuid, p_kind public.lesson_kind, p_court uuid default null, p_use_credit boolean default false)
returns public.lessons
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  a public.coach_availability;
  co public.coaches;
  l public.lessons;
  cents integer;
  credit uuid;
  inv uuid;
begin
  if me is null then raise exception 'not signed in'; end if;
  select * into a from public.coach_availability where id = p_availability for update;
  if not found then raise exception 'slot not found'; end if;
  if a.booked then raise exception 'slot already booked'; end if;
  if a.starts_at <= now() then raise exception 'slot is in the past'; end if;
  if not (p_kind = any (a.kinds)) then raise exception 'coach does not offer % lessons in this slot', p_kind; end if;
  if a.coach_id = me then raise exception 'cannot book yourself'; end if;

  select * into co from public.coaches where profile_id = a.coach_id;
  cents := round((case when p_kind = 'semi_private' then coalesce(co.semi_private_rate_cents, co.hourly_rate_cents) else co.hourly_rate_cents end)
                 * extract(epoch from (a.ends_at - a.starts_at)) / 3600.0);

  if p_use_credit then
    select id into credit from public.lesson_credits
    where student_id = me and coach_id = a.coach_id and remaining > 0 order by created_at limit 1 for update;
    if credit is null then raise exception 'no lesson credits left with this coach'; end if;
    update public.lesson_credits set remaining = remaining - 1 where id = credit;
    cents := 0;
  end if;

  update public.coach_availability set booked = true where id = a.id;
  insert into public.lessons (coach_id, student_id, availability_id, kind, starts_at, ends_at, court_id, price_cents, status)
  values (a.coach_id, me, a.id, p_kind, a.starts_at, a.ends_at, coalesce(p_court, a.court_id), cents,
          case when cents = 0 then 'confirmed' else 'pending_payment' end)
  returning * into l;

  insert into public.coach_students (coach_id, student_id) values (a.coach_id, me) on conflict do nothing;

  if cents > 0 then
    insert into public.invoices (student_id, payee_coach_id, kind, ref_id, description, amount_cents, category, due_at)
    values (me, a.coach_id, 'lesson', l.id,
            initcap(replace(p_kind::text, '_', '-')) || ' lesson · ' || to_char(a.starts_at, 'Mon DD HH24:MI'),
            cents, 'coaching', least(a.starts_at, now() + interval '7 days'))
    returning id into inv;
    update public.lessons set invoice_id = inv where id = l.id returning * into l;
  end if;

  insert into public.notifications (user_id, kind, title, body, payload)
  values (a.coach_id, 'lesson_booked', 'New lesson booked', to_char(a.starts_at, 'Mon DD HH24:MI'), jsonb_build_object('lesson_id', l.id));
  return l;
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
  values (c.id, me, case when c.price_cents = 0 then 'confirmed' else 'pending_payment' end)
  on conflict (class_id, student_id) do update set status = excluded.status
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

-- Cancels a booking the caller owns; releases the slot and voids any unpaid invoice.
-- Paid bookings are refunded by the payments function, which then calls this with the service role.
create or replace function public.cancel_booking(p_kind public.invoice_kind, p_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  inv uuid;
begin
  if p_kind = 'court' then
    update public.court_reservations set status = 'cancelled'
    where id = p_id and (player_id = me or me is null) and status <> 'cancelled' returning invoice_id into inv;
    if not found then raise exception 'reservation not found'; end if;
    update public.court_slots set status = 'open' where id = (select slot_id from public.court_reservations where id = p_id);
  elsif p_kind = 'lesson' then
    update public.lessons set status = 'cancelled'
    where id = p_id and (student_id = me or coach_id = me or me is null) and status <> 'cancelled' returning invoice_id into inv;
    if not found then raise exception 'lesson not found'; end if;
    update public.coach_availability set booked = false where id = (select availability_id from public.lessons where id = p_id);
  elsif p_kind = 'class' then
    update public.class_enrollments set status = 'cancelled'
    where class_id = p_id and student_id = me and status <> 'cancelled' returning invoice_id into inv;
    if not found then raise exception 'enrollment not found'; end if;
  else
    raise exception 'cannot cancel %', p_kind;
  end if;
  update public.invoices set status = 'void' where id = inv and status = 'open';
end $$;

-- Creates an invoice for a lesson package; credits are granted by the Stripe webhook on payment.
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
  insert into public.invoices (student_id, payee_coach_id, kind, ref_id, description, amount_cents, category)
  values (me, pk.coach_id, 'package', pk.id, pk.title, pk.price_cents, 'coaching')
  returning * into i;
  return i;
end $$;

create or replace function public.set_primary_playstyle(p_style public.tactical_style)
returns public.profiles
language sql security invoker set search_path = '' as $$
  update public.profiles set primary_playstyle = p_style where id = (select auth.uid()) returning *;
$$;

revoke execute on function public.reserve_court_slot, public.book_lesson, public.enroll_in_class,
  public.cancel_booking, public.buy_lesson_package from anon, public;
grant execute on function public.reserve_court_slot, public.book_lesson, public.enroll_in_class,
  public.cancel_booking, public.buy_lesson_package to authenticated, service_role;
