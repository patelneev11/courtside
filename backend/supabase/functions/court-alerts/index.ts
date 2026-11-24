import { adminClient, env, HttpError, json, serve } from '../_shared/http.ts';

const HOLD_MINUTES = 10;

// Cron (every minute via pg_cron/pg_net or an external scheduler): POST with header x-cron-secret.
// Releases expired holds, then notifies (and optionally holds for 10 min) each matching open slot.
serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== env('CRON_SECRET')) throw new HttpError(401, 'cron only');
  const db = adminClient();
  const { data: released } = await db.rpc('release_expired_holds');
  const { data: matches, error } = await db.rpc('pending_court_alert_matches');
  if (error) throw error;

  let notified = 0;
  let held = 0;
  for (const m of matches ?? []) {
    let isHeld = false;
    if (m.auto_hold) {
      const until = new Date(Date.now() + HOLD_MINUTES * 60_000).toISOString();
      const { data } = await db.from('court_slots').update({ status: 'held', held_until: until, held_by: m.player_id }).eq('id', m.slot_id).eq('status', 'open').select('id');
      isHeld = Boolean(data?.length);
      if (isHeld) held++;
    }
    const when = new Date(m.starts_at).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
    await db.from('notifications').insert({
      user_id: m.player_id, kind: 'court_open', title: `${m.court_name} is open`,
      body: isHeld ? `${when} · held for you for ${HOLD_MINUTES} minutes` : when,
      payload: { slot_id: m.slot_id, alert_id: m.alert_id, held: isHeld },
    });
    await db.from('court_alerts').update({ last_notified_slot: m.slot_id }).eq('id', m.alert_id);
    notified++;
  }
  return json({ released, notified, held });
});
