import { assert, assertEquals } from '@std/assert';
import { admin, anon, fn, IDS, opts_, service, student, student2, waitFor } from './helpers.ts';

Deno.test({ name: 'tennis agent: async job goes queued -> running -> succeeded with all steps done', ...opts_, fn: async () => {
  const s = await student();
  const start = await fn('tennis-agent', s.token, { kind: 'match_analysis', match_id: IDS.match });
  assertEquals(start.status, 202, start.text);
  const job = await waitFor(async () => {
    const { data } = await s.db.from('agent_jobs').select('*').eq('id', start.json.job_id).single();
    return data?.status === 'succeeded' || data?.status === 'failed' ? data : null;
  });
  assertEquals(job.status, 'succeeded', job.error);
  assert(job.steps.every((st: any) => st.status === 'done'));
  assert(job.finished_at && job.started_at);
  const { data: m } = await s.db.from('matches').select('ai_summary, stats').eq('id', IDS.match).single();
  assert(m?.ai_summary?.includes(String(m.stats.first_serve_pct)), 'summary quotes the exact stat');
  assertEquals((await (await student2()).db.from('agent_jobs').select('id').eq('id', start.json.job_id)).data?.length, 0);
}});

Deno.test({ name: 'tennis agent: validation and coach access', ...opts_, fn: async () => {
  const s = await student();
  assertEquals((await fn('tennis-agent', s.token, { kind: 'nope' })).status, 400);
  assertEquals((await fn('tennis-agent', null, { kind: 'playstyle' })).status, 401);
  assertEquals((await fn('tennis-agent', (await student2()).token, { kind: 'drills', player_id: IDS.student })).status, 403);
  const r = await fn('tennis-agent', s.token, { kind: 'racket_recommendation', arm_comfort: true, wait: true });
  assertEquals(r.json.status, 'succeeded');
  const { data: products } = await service().from('products').select('id');
  const ids = new Set(products!.map((p) => p.id));
  assert(r.json.result.picks.length > 0 && r.json.result.picks.every((p: any) => ids.has(p.product_id)));
}});

Deno.test({ name: 'playstyle job writes a snapshot that sums to 100 and updates the badge', ...opts_, fn: async () => {
  const s = await student();
  const r = await fn('tennis-agent', s.token, { kind: 'playstyle', wait: true });
  assertEquals(r.json.status, 'succeeded');
  const { data } = await s.db.from('playstyle_snapshots').select('equipment, tactical').order('computed_at', { ascending: false }).limit(1).single();
  const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
  assertEquals([sum(data!.equipment), sum(data!.tactical)], [100, 100]);
}});

Deno.test({ name: 'reels import: student imports go to moderation, admins publish', ...opts_, fn: async () => {
  const code = `Ctest${Date.now().toString(36)}`;
  const s = await student();
  const r = await fn('reels-import', s.token, { urls: [`https://www.instagram.com/reel/${code}/`, 'https://example.com/nope'], category: 'footwork', verify: false });
  assertEquals(r.status, 200, r.text);
  assertEquals(r.json.imported, 1);
  assertEquals(r.json.results[0].reel.status, 'pending');
  assertEquals(r.json.results[1].ok, false);
  assertEquals((await anon().from('reel_feed').select('id').eq('external_id', code)).data?.length, 0);
  const a = await admin();
  const pub = await a.db.from('reels').update({ status: 'published', published_at: new Date().toISOString() }).eq('external_id', code).select('id');
  assertEquals(pub.data?.length, 1);
  const { data: feed } = await anon().from('reel_feed').select('embed_url, category').eq('external_id', code).single();
  assertEquals(feed, { embed_url: `https://www.instagram.com/reel/${code}/embed/captioned/`, category: 'FOOTWORK' });
  const selfPublish = await s.db.from('reels').update({ status: 'published' }).eq('external_id', code).select('id');
  assertEquals(selfPublish.data?.length ?? 0, 0);
  const again = await fn('reels-import', (await student2()).token, { urls: [`https://www.instagram.com/reel/${code}/`], category: '<b>x</b>', verify: false });
  assertEquals(again.json.results[0].already_imported, true);
  assertEquals((await anon().from('reel_feed').select('category').eq('external_id', code).single()).data?.category, 'FOOTWORK', 're-import cannot unpublish or edit');
}});

Deno.test({ name: 'market search checks every retailer and stores ranked offers', ...opts_, fn: async () => {
  const s = await student();
  const r = await fn('market-search', s.token, { query: 'babolat pure aero', wait: true });
  assertEquals(r.json.status, 'succeeded', r.text);
  const res = r.json.result;
  assertEquals(res.product.model, 'Pure Aero');
  assertEquals(res.sources_checked.length, 6);
  const totals = res.offers.filter((o: any) => o.in_stock).map((o: any) => o.price_cents + o.shipping_cents);
  assertEquals(totals, [...totals].sort((a: number, b: number) => a - b));
  assert(((await s.db.from('deal_offers').select('id').eq('product_id', res.product.id)).data?.length ?? 0) > 0);
  assertEquals((await fn('market-search', s.token, { query: 'zzzz unknown' })).status, 404);
}});

Deno.test({ name: 'court alerts: cron secret required; notifies once per slot and can hold it', ...opts_, fn: async () => {
  assertEquals((await fn('court-alerts', null, {})).status, 401);
  const svc = service();
  const { data: c } = await svc.from('courts').select('id, facility_id').eq('name', 'McCarren · Court 2').single();
  const { data: alert } = await svc.from('court_alerts').insert({ player_id: IDS.student2, court_id: c!.id, start_time: '07:00', end_time: '21:00', auto_hold: true }).select('id').single();
  const hdr = { headers: { 'x-cron-secret': Deno.env.get('CRON_SECRET')! } };
  const first = await fn('court-alerts', null, {}, hdr);
  assertEquals(first.status, 200, first.text);
  assert(first.json.notified >= 1 && first.json.held >= 1);
  const { data: a } = await svc.from('court_alerts').select('last_notified_slot').eq('id', alert!.id).single();
  const { data: slot } = await svc.from('court_slots').select('status, held_until').eq('id', a!.last_notified_slot).single();
  assertEquals(slot?.status, 'held');
  const s2 = await student2();
  const { data: note } = await s2.db.from('notifications').select('payload').eq('kind', 'court_open').eq('payload->>slot_id', a!.last_notified_slot).single();
  assertEquals(note?.payload.held, true);
  // the alert owner can book their held slot; others cannot
  assert((await (await student()).db.rpc('reserve_court_slot', { p_slot: a!.last_notified_slot })).error);
  assertEquals((await s2.db.rpc('reserve_court_slot', { p_slot: a!.last_notified_slot })).error, null);
  await svc.from('court_alerts').update({ active: false }).eq('id', alert!.id);
}});

Deno.test({ name: 'calendar feed serves ICS for a private token only', ...opts_, fn: async () => {
  const s = await student();
  const { data: link } = await s.db.from('calendar_links').upsert({ user_id: IDS.student, provider: 'apple' }).select('feed_token').single();
  const r = await fn(`calendar-feed?token=${link!.feed_token}`, null);
  assertEquals(r.status, 200);
  assert(r.text.startsWith('BEGIN:VCALENDAR'));
  assert(r.text.includes('BEGIN:VEVENT'), 'feed lists the student\'s bookings');
  assertEquals((await fn(`calendar-feed?token=${crypto.randomUUID()}`, null)).status, 404);
}});
