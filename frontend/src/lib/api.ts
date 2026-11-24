import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { callFunction, rpc, supabase } from './supabase'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>

export const live = supabase !== null

// ---- formatting --------------------------------------------------------------------------------
export const money = (cents: number | null | undefined) => `$${((cents ?? 0) / 100).toFixed(2)}`
export const dollars = (cents: number | null | undefined) => `$${Math.round((cents ?? 0) / 100)}`
export const clock = (ts: string | Date) => new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
export const shortDate = (ts: string | Date) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: '2-digit' }).toUpperCase()
const longDay = (ts: string | Date) => new Date(ts).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }).toUpperCase().replace(',', ' ·')
export const initials = (name: string) => name.split(/\s+/).filter(Boolean).map(x => x[0]).join('').slice(0, 2).toUpperCase()
const titleCase = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function ok<T>(r: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (r.error) throw new Error(r.error.message)
  return r.data as NonNullable<T>
}
const db = () => {
  if (!supabase) throw new Error('Backend not configured')
  return supabase
}

// ---- hooks -------------------------------------------------------------------------------------
export function useSession() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(!supabase)
  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])
  return { session, ready }
}

/** Loads backend data when Supabase is configured; returns undefined data in sample-data mode. */
export function useData<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T>()
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!live) return
    let cancelled = false
    load().then(d => { if (!cancelled) { setData(d); setError(null) } }, e => { if (!cancelled) setError(String(e.message ?? e)) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])
  const reload = useCallback(() => setTick(t => t + 1), [])
  return { data, error, reload }
}

export const signIn = async (email: string, password: string) => {
  const { error } = await db().auth.signInWithPassword({ email, password })
  if (error) throw new Error(error.message)
}
export const signOut = async () => { await supabase?.auth.signOut() }
const uid = async () => {
  const { data } = await db().auth.getSession()
  if (!data.session) throw new Error('Not signed in')
  return data.session.user.id
}

// ---- checkout ----------------------------------------------------------------------------------
export interface CheckoutItem { label: string; amount: string; invoiceId?: string }

export async function invoiceItem(invoiceId: string): Promise<CheckoutItem> {
  const inv = ok(await db().from('invoices').select('id, description, amount_cents').eq('id', invoiceId).single())
  return { label: inv.description, amount: money(inv.amount_cents), invoiceId: inv.id }
}

/** Returns true once paid; redirects to Stripe Checkout when real keys are configured. */
export async function payInvoice(invoiceId: string) {
  const r = await callFunction<{ mock?: boolean; status?: string; checkout_url?: string }>('payments-checkout', { invoice_id: invoiceId, return_url: window.location.origin })
  if (r.checkout_url) { window.location.assign(r.checkout_url); return false }
  return r.status === 'paid'
}

// ---- profile + home ----------------------------------------------------------------------------
export async function loadProfile() {
  const id = await uid()
  const [p, style, gear, upcoming, due] = await Promise.all([
    db().from('profiles').select('*').eq('id', id).single(),
    db().from('playstyle_snapshots').select('tactical, primary_style').eq('player_id', id).order('computed_at', { ascending: false }).limit(1).maybeSingle(),
    db().from('wardrobe_overview').select('id', { count: 'exact', head: true }).eq('kind', 'racket').is('retired_at', null),
    db().from('calendar_events').select('id', { count: 'exact', head: true }).gte('starts_at', new Date().toISOString()),
    db().from('invoices').select('amount_cents').eq('status', 'open'),
  ])
  const profile = ok(p)
  const s = style.data
  const primary = s?.primary_style ?? profile.primary_playstyle
  return {
    id,
    raw: profile,
    name: profile.full_name ?? 'Player',
    initials: initials(profile.full_name ?? 'P'),
    ntrp: profile.ntrp != null ? Number(profile.ntrp).toFixed(1) : '–',
    backhand: profile.backhand_style === 'two_handed' ? 'Two-handed' : 'One-handed',
    playstyle: primary ? `${titleCase(primary)} Player` : 'Not calibrated',
    playstyleMatch: primary && s?.tactical?.[primary] != null ? `${s.tactical[primary]}% match` : '',
    rackets: gear.count ?? 0,
    upcoming: upcoming.count ?? 0,
    due: dollars((due.data ?? []).reduce((a: number, r: Row) => a + r.amount_cents, 0)),
    settings: profile.settings ?? {},
  }
}
export type Profile = Awaited<ReturnType<typeof loadProfile>>

export async function saveProfile(fields: { full_name: string; ntrp: number | null; backhand_style: string }) {
  ok(await db().from('profiles').update(fields).eq('id', await uid()))
}
export async function saveSettings(settings: Row) {
  ok(await db().from('profiles').update({ settings }).eq('id', await uid()))
}

const setScores = (score: string | null) => (score ?? '').split(/\s+/).filter(Boolean).map(set => {
  const [a, b] = set.split(/[-–]/).map(n => parseInt(n, 10))
  return { text: set.replace('-', '–'), won: a > b }
})

export async function loadHome() {
  const id = await uid()
  const now = new Date()
  const [next, match, checklist, racket, swing, profile, invoice] = await Promise.all([
    db().from('calendar_events').select('*').gte('starts_at', now.toISOString()).order('starts_at').limit(1).maybeSingle(),
    db().from('matches').select('*').eq('player_id', id).order('played_at', { ascending: false }).limit(1).maybeSingle(),
    db().from('checklist_items').select('*').eq('player_id', id).eq('for_date', ymd(now)).order('position'),
    db().from('wardrobe_overview').select('*').eq('kind', 'racket').is('retired_at', null).order('primary_item', { ascending: false }).limit(1).maybeSingle(),
    db().from('swing_analyses').select('*').eq('player_id', id).eq('status', 'succeeded').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    db().from('profiles').select('home_court_id').eq('id', id).single(),
    db().from('invoices').select('*').eq('status', 'open').order('due_at', { ascending: true, nullsFirst: false }).limit(1).maybeSingle(),
  ])
  let courtQ = db().from('court_availability').select('*').gte('starts_at', now.toISOString()).order('starts_at').limit(3)
  courtQ = profile.data?.home_court_id ? courtQ.eq('court_id', profile.data.home_court_id) : courtQ.eq('favorite', true)
  const slots = ok(await courtQ) ?? []
  const facility = slots[0] ? ok(await db().from('facilities').select('name, city').eq('id', slots[0].facility_id).single()) : null
  const m = match.data, r = racket.data, s = swing.data, inv = invoice.data, ev = next.data
  return {
    next: ev ? { day: `${new Date(ev.starts_at).toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()} · ${new Date(ev.starts_at).getDate()} ${new Date(ev.starts_at).toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}`, title: ev.title, time: clock(ev.starts_at) } : null,
    match: m ? {
      meta: `${new Date(m.played_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${titleCase(m.surface ?? '')}`,
      sets: setScores(m.score),
      headline: `${m.result === 'win' ? 'Won' : m.result === 'loss' ? 'Lost' : 'Played'} vs ${m.opponent_name ?? 'opponent'}.`,
      text: m.ai_takeaway ?? m.ai_summary ?? 'Analysis pending.',
      firstServe: `${m.stats?.first_serve_pct ?? '–'}%`,
      ratio: String(m.stats?.winner_error_ratio ?? '–'),
      winners: String(m.stats?.winners ?? '–'),
    } : null,
    training: {
      title: `${now.toLocaleDateString('en-US', { weekday: 'long' })} build`,
      items: (checklist.data ?? []).map((c: Row) => ({ id: c.id as string, title: c.title as string, done: !!c.done_at, note: c.kind === 'drill' ? 'Drill' : c.kind === 'workout' ? 'Workout' : 'Task' })),
    },
    racket: r ? {
      name: `${r.model}${r.primary_item ? ' · Primary' : ''}`,
      strings: `${r.string_name ?? 'Strings'} · ${r.tension_main_lbs ?? '–'} lbs`,
      hours: `${Number(r.hours_since_restring ?? 0)} hours played`,
      restring: r.restring_due ? 'Restring due' : `Restring in ${Number(r.hours_until_restring ?? 0)}h`,
    } : null,
    finding: s ? { quote: `“${s.key_finding}”`, badge: s.overall_score != null ? `${s.overall_score}/100` : '', text: s.summary ?? '' } : null,
    court: facility ? {
      name: slots[0].facility_name,
      meta: `${facility.city ?? ''} · ${titleCase(slots[0].surface)} · ${slots[0].indoor ? 'Indoor' : 'Outdoor'}`,
      slots: slots.map((x: Row) => ({ id: x.slot_id as string, time: clock(x.starts_at), open: x.status === 'open' })),
    } : null,
    invoice: inv ? { label: inv.description, amount: money(inv.amount_cents), due: inv.due_at ? `Due ${new Date(inv.due_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'Due now', invoiceId: inv.id } : null,
  }
}

export async function toggleChecklist(id: string, done: boolean) {
  ok(await db().from('checklist_items').update({ done_at: done ? new Date().toISOString() : null }).eq('id', id))
}

export async function reserveSlot(slotId: string): Promise<CheckoutItem> {
  const res = await rpc<Row>('reserve_court_slot', { p_slot: slotId })
  return invoiceItem(res.invoice_id)
}

// ---- stats -------------------------------------------------------------------------------------
export async function loadStats() {
  const id = await uid()
  const [style, matches, wear, workout] = await Promise.all([
    db().from('playstyle_snapshots').select('*').eq('player_id', id).order('computed_at', { ascending: false }).limit(1).maybeSingle(),
    db().from('matches').select('serve_zones, stats, played_at').eq('player_id', id).order('played_at', { ascending: false }).limit(5),
    db().from('wearable_sessions').select('*').eq('player_id', id).not('recovery_score', 'is', null).order('started_at', { ascending: false }).limit(1).maybeSingle(),
    db().from('workouts').select('*').eq('player_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  const zones = { wide: 0, body: 0, t: 0 } as Record<string, number>
  for (const m of matches.data ?? []) for (const z of (m.serve_zones ?? []) as Row[]) zones[z.zone] = (zones[z.zone] ?? 0) + (z.attempts ?? 0)
  const total = zones.wide + zones.body + zones.t || 1
  const pct = (n: number) => `${Math.round(n / total * 100)}%`
  const sp = style.data
  return {
    rings: sp ? { power: sp.equipment?.power ?? 0, control: sp.equipment?.control ?? 0, spin: sp.equipment?.spin ?? 0 } : null,
    style: sp ? { name: titleCase(sp.primary_style ?? 'all_court'), rationale: sp.rationale ?? '' } : null,
    serve: { wide: pct(zones.wide), body: pct(zones.body), t: pct(zones.t), matches: matches.data?.length ?? 0 },
    recovery: wear.data ? { score: wear.data.recovery_score as number, provider: titleCase(wear.data.provider).toUpperCase(), detail: `Avg HR ${wear.data.avg_hr ?? '–'} · ${Math.round((wear.data.duration_s ?? 0) / 60)} min session` } : null,
    plan: workout.data ? { title: workout.data.title, text: workout.data.focus ?? '' } : null,
  }
}

export const runAgent = <T = Row>(kind: string, params: Row = {}) =>
  callFunction<Row>('tennis-agent', { kind, wait: true, ...params }).then(job => {
    if (job.status !== 'succeeded') throw new Error(job.error ?? 'Analysis failed')
    return job.result as T
  })

export async function loadTraining() {
  const id = await uid()
  const [workouts, drill, logs] = await Promise.all([
    db().from('workouts').select('*').eq('player_id', id).order('created_at', { ascending: false }).limit(3),
    db().from('drills').select('*').eq('player_id', id).eq('active', true).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    db().from('drill_logs').select('logged_at').eq('player_id', id).gte('logged_at', new Date(Date.now() - 60 * 86_400_000).toISOString()),
  ])
  const days = new Set((logs.data ?? []).map((l: Row) => ymd(new Date(l.logged_at))))
  const prev = (d: Date) => new Date(d.getTime() - 86_400_000)
  let streak = 0
  let d = dayStart(new Date())
  if (!days.has(ymd(d))) d = prev(d)
  while (days.has(ymd(d))) { streak++; d = prev(d) }
  const monday = dayStart(new Date()); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  const week = Array.from({ length: 7 }, (_, i) => days.has(ymd(new Date(monday.getTime() + i * 86_400_000))))
  return {
    sessions: (workouts.data ?? []).map((w: Row) => ({
      id: w.id as string, title: w.title as string, focus: (w.focus ?? '') as string,
      minutes: `${w.duration_min ?? 0} MIN`, intensity: String(w.intensity ?? '').toUpperCase(),
      movements: Array.isArray(w.plan?.blocks) ? w.plan.blocks.length : Array.isArray(w.plan) ? w.plan.length : 0,
      duration: w.duration_min ?? 0,
    })),
    drill: drill.data ? { title: drill.data.title, text: drill.data.description ?? '' } : null,
    streak, week,
  }
}

export async function loadWearables() {
  const id = await uid()
  const [conns, latest] = await Promise.all([
    db().from('wearable_connections').select('*').eq('player_id', id),
    db().from('wearable_sessions').select('*').eq('player_id', id).order('started_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  const ago = (ts?: string | null) => {
    if (!ts) return 'Connected'
    const min = Math.round((Date.now() - new Date(ts).getTime()) / 60000)
    return min < 60 ? `Last sync ${min} min ago` : min < 1440 ? `Last sync ${Math.round(min / 60)} h ago` : `Last sync ${Math.round(min / 1440)} d ago`
  }
  const s = latest.data
  return {
    recovery: s?.recovery_score ?? null,
    metrics: s ? [['AVG HR', String(s.avg_hr ?? '–'), 'BPM · LAST SESSION'], ['MAX HR', String(s.max_hr ?? '–'), 'BPM · LAST SESSION'], ['CALORIES', String(s.calories ?? '–'), `${Math.round((s.duration_s ?? 0) / 60)} MIN SESSION`]] : null,
    devices: (conns.data ?? []).map((c: Row) => ({ id: c.id as string, provider: c.provider as string, status: ago(c.last_synced_at) })),
  }
}
export async function disconnectWearable(id: string) { ok(await db().from('wearable_connections').delete().eq('id', id)) }

// ---- aces --------------------------------------------------------------------------------------
export async function loadReels() {
  const rows = ok(await db().from('reel_feed').select('*').order('published_at', { ascending: false, nullsFirst: false }).limit(30)) ?? []
  return rows.map((r: Row) => ({
    id: r.id as string,
    creator: r.creator_handle ? `@${String(r.creator_handle).replace(/^@/, '')}` : (r.creator_name ?? 'Instagram'),
    title: (r.title ?? r.caption ?? 'Tennis reel') as string,
    category: String(r.category ?? 'TENNIS').toUpperCase(),
    url: (r.source_url ?? r.embed_url) as string,
    likes: Number(r.like_count ?? 0), liked: !!r.liked, saved: !!r.saved,
  }))
}
export async function likeReel(id: string, like: boolean) {
  const user_id = await uid()
  if (like) ok(await db().from('reel_likes').insert({ reel_id: id, user_id }))
  else ok(await db().from('reel_likes').delete().eq('reel_id', id).eq('user_id', user_id))
}
export async function saveItem(kind: 'reel' | 'article', refId: string) {
  ok(await db().from('saved_items').insert({ user_id: await uid(), kind, ref_id: refId }))
}

export async function loadArticles() {
  const rows = ok(await db().from('articles').select('*').eq('status', 'published').order('featured', { ascending: false }).order('published_at', { ascending: false })) ?? []
  return rows.map((a: Row) => ({ id: a.id as string, title: a.title as string, dek: (a.dek ?? '') as string, category: String(a.category ?? '').toUpperCase(), minutes: `${a.read_minutes ?? 5} MIN`, body: (a.body_md ?? '') as string }))
}

export async function loadFolders() {
  const rows = ok(await db().from('saved_folder_summary').select('*').order('created_at')) ?? []
  return rows.map((f: Row) => ({ id: f.id as string, name: f.name as string, count: Number(f.item_count ?? 0), updated: f.updated_at ?? f.created_at }))
}
export async function createFolder(name: string) { ok(await db().from('saved_folders').insert({ user_id: await uid(), name })) }

// ---- coach -------------------------------------------------------------------------------------
export async function analyzeSwing(file: File, source: 'upload' | 'live') {
  const id = await uid()
  const ext = (file.name.split('.').pop() || 'mp4').toLowerCase()
  const path = `${id}/${Date.now()}.${ext}`
  ok(await db().storage.from('swing-videos').upload(path, file, { contentType: file.type || 'video/mp4' }))
  const swing = ok(await db().from('swing_analyses').insert({ player_id: id, source, stroke: 'backhand', video_path: path }).select('id').single())
  const out = await runAgent<Row>('swing_analysis', { swing_id: swing.id })
  const cps = (out.checkpoints ?? []) as Row[]
  return {
    headline: out.key_finding as string,
    text: out.summary as string,
    metrics: [...cps.slice(0, 2).map(c => [`${c.score}`, String(c.label).toLowerCase()]), [`${out.overall_score}`, 'overall score']],
  }
}

export async function loadFindings() {
  const rows = ok(await db().from('swing_analyses').select('id, created_at, key_finding, overall_score').eq('status', 'succeeded').order('created_at', { ascending: false }).limit(5)) ?? []
  return rows.map((r: Row) => ({ id: r.id as string, date: new Date(r.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }).toUpperCase(), title: r.key_finding as string, high: (r.overall_score ?? 100) < 70 }))
}

export const askCoach = (question: string, history: { from: string; text: string }[]) =>
  runAgent<{ reply: string }>('coach_chat', { question, history }).then(o => o.reply)

const coachNames = async (ids: string[]) => {
  if (!ids.length) return {} as Record<string, string>
  const rows = ok(await db().from('profiles').select('id, full_name').in('id', ids)) ?? []
  return Object.fromEntries(rows.map((r: Row) => [r.id, r.full_name])) as Record<string, string>
}

export async function loadClasses() {
  const rows = ok(await db().from('class_directory').select('*').eq('cancelled', false).gte('starts_at', new Date().toISOString()).order('starts_at').limit(12)) ?? []
  const names = await coachNames([...new Set(rows.map((r: Row) => r.coach_id as string))])
  const courtIds = [...new Set(rows.map((r: Row) => r.court_id).filter(Boolean))]
  const courts = courtIds.length ? ok(await db().from('courts').select('id, facilities(name)').in('id', courtIds)) ?? [] : []
  const venue = Object.fromEntries(courts.map((c: Row) => [c.id, c.facilities?.name]))
  return rows.map((c: Row) => ({
    id: c.id as string, title: c.title as string, coach: `Coach ${(names[c.coach_id] ?? '').split(' ')[0]}`, venue: (venue[c.court_id] ?? 'Courtside') as string,
    price: dollars(c.price_cents), spots: `${c.spots_left} spots`,
    when: `${new Date(c.starts_at).toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()} · ${clock(c.starts_at)}`,
    level: Number(c.level_max ?? 7) <= 3 ? 'Beginner' : 'Intermediate',
  }))
}
export async function joinClass(id: string): Promise<CheckoutItem> {
  const e = await rpc<Row>('enroll_in_class', { p_class: id })
  return invoiceItem(e.invoice_id)
}

export async function loadCoaches() {
  const [coaches, follows] = await Promise.all([
    db().from('coaches').select('*, profiles(full_name)').order('created_at'),
    db().from('follows').select('coach_id'),
  ])
  return {
    coaches: (ok(coaches) ?? []).map((c: Row) => ({ id: c.profile_id as string, name: (c.profiles?.full_name ?? 'Coach') as string, headline: String(c.headline ?? '').toUpperCase(), bio: (c.bio ?? '') as string, rate: dollars(c.hourly_rate_cents), rateCents: c.hourly_rate_cents as number, semiCents: (c.semi_private_rate_cents ?? c.hourly_rate_cents) as number })),
    following: (follows.data ?? []).map((f: Row) => f.coach_id as string),
  }
}
export async function setFollow(coachId: string, follow: boolean) {
  const student_id = await uid()
  if (follow) ok(await db().from('follows').insert({ student_id, coach_id: coachId }))
  else ok(await db().from('follows').delete().eq('student_id', student_id).eq('coach_id', coachId))
}

export async function loadConversations() {
  const rows = ok(await db().from('conversations').select('*').order('last_message_at', { ascending: false, nullsFirst: false })) ?? []
  const names = await coachNames(rows.map((r: Row) => r.coach_id))
  const last = await Promise.all(rows.map((r: Row) => db().from('messages').select('body').eq('conversation_id', r.id).order('created_at', { ascending: false }).limit(1).maybeSingle()))
  return rows.map((r: Row, i: number) => ({ id: r.id as string, name: names[r.coach_id] ?? 'Coach', preview: (last[i].data?.body ?? 'Tap to open conversation') as string }))
}
export async function loadMessages(conversationId: string) {
  const me = await uid()
  const rows = ok(await db().from('messages').select('*').eq('conversation_id', conversationId).order('created_at')) ?? []
  const unread = rows.filter((m: Row) => m.sender_id !== me && !m.read_at).map((m: Row) => m.id)
  if (unread.length) await db().from('messages').update({ read_at: new Date().toISOString() }).in('id', unread)
  return rows.map((m: Row) => ({ id: m.id as string, mine: m.sender_id === me, body: m.body as string, day: new Date(m.created_at).toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase() }))
}
export async function sendMessage(conversationId: string, body: string) {
  ok(await db().from('messages').insert({ conversation_id: conversationId, sender_id: await uid(), body }))
}
export function subscribeMessages(conversationId: string, onChange: () => void) {
  if (!supabase) return () => {}
  const ch = supabase.channel(`messages:${conversationId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, onChange)
    .subscribe()
  return () => { supabase?.removeChannel(ch) }
}

export async function loadPathway() {
  const [stages, progress] = await Promise.all([
    db().from('pathway_stages').select('*').order('position'),
    db().from('pathway_progress').select('*'),
  ])
  const done = Object.fromEntries((progress.data ?? []).map((p: Row) => [p.stage_id, p]))
  let unlocked = true
  const steps = (ok(stages) ?? []).map((s: Row) => {
    const p = done[s.id]
    const status = p?.completed_at ? 'Complete' : unlocked ? 'In progress' : 'Locked'
    if (!p?.completed_at) unlocked = false
    return { id: s.id as string, num: String(s.position).padStart(2, '0'), title: s.title as string, text: (s.description ?? '') as string, status }
  })
  const pct = steps.length ? Math.round(steps.filter(s => s.status === 'Complete').length / steps.length * 100) : 0
  return { steps, pct: `${pct}%` }
}

// ---- book --------------------------------------------------------------------------------------
export async function loadCourtDay(day: Date) {
  const from = dayStart(day), to = new Date(from.getTime() + 86_400_000)
  const start = from < new Date() ? new Date() : from
  const [slots, facilities] = await Promise.all([
    db().from('court_availability').select('*').eq('status', 'open').gte('starts_at', start.toISOString()).lt('starts_at', to.toISOString()).order('starts_at'),
    db().from('facilities').select('id, address, kind'),
  ])
  const addr = Object.fromEntries((facilities.data ?? []).map((f: Row) => [f.id, f.address]))
  const venues = new Map<string, { id: string; name: string; tag: string; address: string; clay: boolean; slots: { id: string; time: string; price: string }[] }>()
  for (const s of ok(slots) ?? []) {
    if (!venues.has(s.facility_id)) venues.set(s.facility_id, { id: s.facility_id, name: s.facility_name, tag: `${String(s.facility_kind ?? 'public').toUpperCase()} · ${String(s.surface).toUpperCase()}`, address: addr[s.facility_id] ?? '', clay: s.surface === 'clay', slots: [] })
    const v = venues.get(s.facility_id)!
    if (v.slots.length < 4) v.slots.push({ id: s.slot_id, time: clock(s.starts_at), price: dollars(s.hourly_rate_cents * (new Date(s.ends_at).getTime() - new Date(s.starts_at).getTime()) / 3_600_000) })
  }
  return [...venues.values()]
}

export async function loadLessonOptions(coachId: string | null, kind: string) {
  const [coaches, courts] = await Promise.all([loadCoaches(), db().from('courts').select('id, name, facilities(name)').eq('active', true)])
  const coach = coaches.coaches.find(c => c.id === coachId) ?? coaches.coaches[0]
  const avail = coach ? ok(await db().from('coach_availability').select('*').eq('coach_id', coach.id).eq('booked', false).gte('starts_at', new Date().toISOString()).contains('kinds', [kind]).order('starts_at').limit(20)) ?? [] : []
  const firstDay = avail[0] ? ymd(new Date(avail[0].starts_at)) : null
  const times = avail.filter((a: Row) => ymd(new Date(a.starts_at)) === firstDay).map((a: Row) => ({ id: a.id as string, time: clock(a.starts_at), minutes: Math.round((new Date(a.ends_at).getTime() - new Date(a.starts_at).getTime()) / 60000) }))
  return {
    coaches: coaches.coaches, coach,
    courts: (courts.data ?? []).map((c: Row) => ({ id: c.id as string, name: `${c.facilities?.name ?? ''} · ${c.name}` })),
    day: avail[0] ? longDay(avail[0].starts_at) : 'NO OPEN TIMES',
    times,
  }
}
export async function bookLesson(availabilityId: string, kind: string, courtId: string | null): Promise<CheckoutItem> {
  const l = await rpc<Row>('book_lesson', { p_availability: availabilityId, p_kind: kind, p_court: courtId, p_use_credit: false })
  return invoiceItem(l.invoice_id)
}

export async function loadAlerts() {
  const rows = ok(await db().from('court_alerts').select('*, facilities(name)').order('created_at')) ?? []
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const hour = (t: string) => { const h = parseInt(t, 10); return `${h % 12 || 12}` }
  const ampm = (t: string) => (parseInt(t, 10) >= 12 ? 'PM' : 'AM')
  return Promise.all(rows.map(async (a: Row) => {
    let q = db().from('court_availability').select('slot_id', { count: 'exact', head: true }).eq('status', 'open').gte('starts_at', new Date().toISOString())
    if (a.facility_id) q = q.eq('facility_id', a.facility_id)
    if (a.court_id) q = q.eq('court_id', a.court_id)
    const days: number[] = a.days ?? []
    const weekdays = days.length === 5 && [1, 2, 3, 4, 5].every(d => days.includes(d))
    const when = weekdays ? 'Weekdays' : days.length ? days.map(d => dayNames[d]).join(', ') : 'Any day'
    const { count } = await q
    return { id: a.id as string, name: String(a.facilities?.name ?? a.label ?? 'Any court').toUpperCase(), window: `${when} · ${hour(a.start_time)}–${hour(a.end_time)} ${ampm(a.end_time)}`, openings: count ?? 0, active: !!a.active }
  }))
}
export async function setAlertActive(id: string, active: boolean) { ok(await db().from('court_alerts').update({ active }).eq('id', id)) }
export async function addAlert() {
  const player_id = await uid()
  const { data: p } = await db().from('profiles').select('home_court_id').eq('id', player_id).single()
  const court = p?.home_court_id ? ok(await db().from('courts').select('facility_id').eq('id', p.home_court_id).single()) : null
  ok(await db().from('court_alerts').insert({ player_id, facility_id: court?.facility_id ?? null, label: 'Evening hit', days: [1, 2, 3, 4, 5], start_time: '17:00', end_time: '20:00' }))
}

// ---- drawer ------------------------------------------------------------------------------------
export async function loadDrawer() {
  const id = await uid()
  const month = new Date(); month.setDate(1)
  const [rackets, events, spend, paid] = await Promise.all([
    db().from('wardrobe_overview').select('*').eq('kind', 'racket').is('retired_at', null).order('primary_item', { ascending: false }),
    db().from('calendar_events').select('*').gte('starts_at', new Date().toISOString()).order('starts_at').limit(5),
    db().from('spending_summary').select('amount_cents').eq('user_id', id).eq('month', ymd(month)),
    db().from('invoices').select('description, amount_cents, created_at').eq('status', 'paid').order('created_at', { ascending: false }).limit(5),
  ])
  const r = rackets.data?.[0]
  return {
    racket: r ? { name: `${r.model}${r.primary_item ? ' · Primary' : ''}`, detail: `${r.tension_main_lbs ?? '–'} lbs · ${Number(r.hours_since_restring ?? 0)} hours played` } : null,
    events: (events.data ?? []).map((e: Row) => [shortDate(e.starts_at), e.title, clock(e.starts_at)] as [string, string, string]),
    spend: dollars((spend.data ?? []).reduce((a: number, x: Row) => a + Number(x.amount_cents), 0)),
    month: `${month.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()} SPEND`,
    payments: (paid.data ?? []).map((p: Row) => [shortDate(p.created_at), p.description, money(p.amount_cents)] as [string, string, string]),
  }
}
