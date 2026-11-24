import { assert, assertEquals } from '@std/assert';
import { anon, elena, IDS, marcus, opts_, service, student, student2 } from './helpers.ts';

Deno.test({ name: 'students see only their own matches; linked coaches see them; others do not', ...opts_, fn: async () => {
  // Booking tests may have linked Marcus to this student; make him unlinked for this check.
  await service().from('coach_students').delete().eq('coach_id', IDS.marcus).eq('student_id', IDS.student);
  const seen = async (c: { db: any }) => (await c.db.from('matches').select('id').eq('id', IDS.match)).data?.length ?? 0;
  assertEquals(await seen(await student()), 1);
  assertEquals(await seen(await student2()), 0);
  assertEquals(await seen(await elena()), 1, 'linked coach');
  assertEquals(await seen(await marcus()), 0, 'unlinked coach');
  assertEquals((await anon().from('matches').select('id')).data?.length ?? 0, 0);
}});

Deno.test({ name: 'privacy setting hides stats from coaches', ...opts_, fn: async () => {
  const s = await student();
  const { data: p } = await s.db.from('profiles').select('settings').eq('id', IDS.student).single();
  const settings = { ...(p?.settings ?? {}), privacy: { share_stats_with_coaches: false } };
  await s.db.from('profiles').update({ settings }).eq('id', IDS.student);
  try {
    assertEquals((await (await elena()).db.from('matches').select('id').eq('id', IDS.match)).data?.length, 0);
    assertEquals((await (await elena()).db.from('wearable_sessions').select('id').eq('player_id', IDS.student)).data?.length, 0);
  } finally {
    await s.db.from('profiles').update({ settings: { ...settings, privacy: { share_stats_with_coaches: true } } }).eq('id', IDS.student);
  }
  assertEquals((await (await elena()).db.from('matches').select('id').eq('id', IDS.match)).data?.length, 1);
}});

Deno.test({ name: 'users cannot change their own role; service role can', ...opts_, fn: async () => {
  const s = await student2();
  const { error } = await s.db.from('profiles').update({ role: 'admin' }).eq('id', IDS.student2);
  assert(error, 'role escalation must fail');
  const ok = await s.db.from('profiles').update({ full_name: 'Jordan L.' }).eq('id', IDS.student2).select('full_name').single();
  assertEquals(ok.data?.full_name, 'Jordan L.');
  const svc = await service().from('profiles').update({ role: 'student' }).eq('id', IDS.student2);
  assertEquals(svc.error, null);
}});

Deno.test({ name: 'wearable tokens and Stripe ids are not client readable', ...opts_, fn: async () => {
  const s = await student();
  const tokens = await s.db.from('wearable_tokens').select('*');
  assert(tokens.error || tokens.data?.length === 0);
  const billing = await s.db.from('billing_accounts').select('stripe_customer_id');
  assert(billing.error || billing.data?.length === 0);
  const events = await s.db.from('stripe_events').select('*');
  assert(events.error || events.data?.length === 0);
}});

Deno.test({ name: 'chat is limited to members; students can only attach their own swings', ...opts_, fn: async () => {
  const s = await student();
  const existing = await s.db.from('conversations').select('id').eq('coach_id', IDS.elena).maybeSingle();
  const { data: convo, error } = existing.data ? existing : await s.db.from('conversations').insert({ student_id: IDS.student, coach_id: IDS.elena }).select('id').single();
  assertEquals(error, null);
  const sent = await s.db.from('messages').insert({ conversation_id: convo!.id, sender_id: IDS.student, body: 'Can you look at my backhand?' }).select('id').single();
  assertEquals(sent.error, null);
  assertEquals((await (await elena()).db.from('messages').select('id').eq('id', sent.data!.id)).data?.length, 1);
  assertEquals((await (await student2()).db.from('messages').select('id').eq('conversation_id', convo!.id)).data?.length, 0);
  assertEquals((await (await marcus()).db.from('messages').select('id').eq('conversation_id', convo!.id)).data?.length, 0);
  const intrude = await (await student2()).db.from('messages').insert({ conversation_id: convo!.id, sender_id: IDS.student2, body: 'hi' });
  assert(intrude.error, 'non-member cannot post');
  const spoof = await s.db.from('messages').insert({ conversation_id: convo!.id, sender_id: IDS.elena, body: 'spoof' });
  assert(spoof.error, 'cannot send as someone else');

  const other = await service().from('swing_analyses').insert({ player_id: IDS.student2, source: 'upload', video_path: `${IDS.student2}/x.mp4` }).select('id').single();
  const attach = await s.db.from('messages').insert({ conversation_id: convo!.id, sender_id: IDS.student, swing_analysis_id: other.data!.id });
  assert(attach.error, "cannot attach another player's swing");
  const { data: mine } = await s.db.from('swing_analyses').select('id').eq('player_id', IDS.student).limit(1).single();
  assertEquals((await s.db.from('messages').insert({ conversation_id: convo!.id, sender_id: IDS.student, swing_analysis_id: mine!.id })).error, null);
  const notes = await service().from('notifications').select('id').eq('user_id', IDS.elena).eq('kind', 'message');
  assert((notes.data?.length ?? 0) > 0, 'coach notified of new message');
}});

Deno.test({ name: 'content: published is public, pending is private, students cannot publish articles', ...opts_, fn: async () => {
  const slug = `coach-draft-${Date.now()}`;
  assert(((await anon().from('articles').select('id')).data?.length ?? 0) >= 4);
  const s = await student();
  const draft = await s.db.from('articles').insert({ slug: `student-${slug}`, title: 't', category: 'TACTICS', body_md: 'x', author_id: IDS.student, status: 'published' });
  assert(draft.error, 'students cannot write articles');
  const coach = await elena();
  const c = await coach.db.from('articles').insert({ slug, title: 'Draft', category: 'TACTICS', body_md: 'x', author_id: IDS.elena }).select('id, status').single();
  assertEquals(c.data?.status, 'pending');
  assertEquals((await anon().from('articles').select('id').eq('slug', slug)).data?.length, 0);
  const pub = await coach.db.from('articles').update({ status: 'published' }).eq('id', c.data!.id).select('id');
  assert(pub.error || pub.data?.length === 0, 'coach cannot self-publish');
}});

Deno.test({ name: 'exact match stats come from logged points', ...opts_, fn: async () => {
  const s = await student();
  const { data: m } = await s.db.from('matches').insert({ player_id: IDS.student, opponent_name: 'Test' }).select('id').single();
  const pts = [
    { seq: 1, server: 'player', winner: 'player', serve_number: 1, serve_zone: 't', serve_side: 'deuce', rally_length: 1, ending: 'ace', ending_stroke: 'serve' },
    { seq: 2, server: 'player', winner: 'opponent', serve_number: 2, serve_zone: 'wide', serve_side: 'ad', rally_length: 0, ending: 'double_fault', ending_stroke: 'serve' },
    { seq: 3, server: 'player', winner: 'player', serve_number: 1, serve_zone: 'body', serve_side: 'deuce', rally_length: 6, ending: 'winner', ending_stroke: 'forehand' },
    { seq: 4, server: 'opponent', winner: 'opponent', rally_length: 9, ending: 'unforced_error', ending_stroke: 'backhand' },
  ].map((p) => ({ ...p, match_id: m!.id }));
  assertEquals((await s.db.from('match_points').insert(pts)).error, null);
  const { data, error } = await s.db.rpc('compute_match_stats', { p_match: m!.id });
  assertEquals(error, null);
  const st = data.stats;
  // winners include aces; unforced errors include double faults
  assertEquals([st.points_played, st.points_won, st.aces, st.double_faults, st.winners, st.unforced_errors], [4, 2, 1, 1, 2, 2]);
  assertEquals(st.first_serve_pct, 67);
  assertEquals(data.momentum.map((x: any) => x.diff), [1, 0, 1, 0]);
  const other = await (await student2()).db.rpc('compute_match_stats', { p_match: m!.id });
  assert(other.error || !other.data?.id, "cannot compute someone else's match");
}});
