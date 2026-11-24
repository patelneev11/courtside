import { adminClient, corsHeaders, HttpError, serve } from '../_shared/http.ts';
import { toIcs } from './ics.ts';

// GET /calendar-feed?token=<calendar_links.feed_token> -> text/calendar (subscribe from Apple/Google Calendar).
serve(async (req) => {
  const token = new URL(req.url).searchParams.get('token') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(token)) throw new HttpError(404, 'not found');
  const db = adminClient();
  const { data: link } = await db.from('calendar_links').select('user_id').eq('feed_token', token).maybeSingle();
  if (!link) throw new HttpError(404, 'not found');
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data: events } = await db.from('calendar_events').select('type, id, title, starts_at, ends_at, status, court_id').eq('user_id', link.user_id).gte('starts_at', since).order('starts_at');
  const courtIds = [...new Set((events ?? []).map((e) => e.court_id).filter(Boolean))];
  const { data: courts } = courtIds.length ? await db.from('courts').select('id, name').in('id', courtIds) : { data: [] };
  const names = new Map((courts ?? []).map((c) => [c.id, c.name]));
  const ics = toIcs((events ?? []).map((e: any) => ({ ...e, location: names.get(e.court_id) ?? null })));
  return new Response(ics, { headers: { ...corsHeaders, 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'private, max-age=300' } });
});
