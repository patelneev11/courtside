import { adminClient, HttpError, json, readJson, requireUser, serve } from '../_shared/http.ts';
import { checkEmbed, fetchOEmbed, parseInstagramUrl } from './instagram.ts';

interface Body {
  urls: string[];
  category?: string;
  title?: string;
  verify?: boolean;
}

const MAX_URLS = 25;

// POST /reels-import  { urls: ["https://www.instagram.com/reel/<code>/"], category?: "FOOTWORK" }
// Admin imports are published immediately; anyone else's go to the moderation queue.
serve(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'POST only');
  const { user } = await requireUser(req);
  const body = await readJson<Body>(req);
  if (!Array.isArray(body.urls) || body.urls.length === 0) throw new HttpError(400, 'urls must be a non-empty array');
  if (body.urls.length > MAX_URLS) throw new HttpError(400, `at most ${MAX_URLS} urls per request`);

  const db = adminClient();
  const { data: me } = await db.from('profiles').select('role').eq('id', user.id).single();
  const isAdmin = me?.role === 'admin';
  const token = Deno.env.get('META_OEMBED_TOKEN');
  const category = (body.category ?? 'GENERAL').toUpperCase().slice(0, 40);

  const results = [];
  for (const raw of body.urls) {
    const parsed = parseInstagramUrl(raw);
    if (!parsed) {
      results.push({ url: raw, ok: false, error: 'not an Instagram reel/post URL' });
      continue;
    }
    try {
      if (!isAdmin) {
        const { data: existing } = await db.from('reels').select('id, status, embed_url, imported_by').eq('source', 'instagram').eq('external_id', parsed.shortcode).maybeSingle();
        if (existing) {
          const visible = existing.status === 'published' || existing.imported_by === user.id;
          results.push({ url: raw, ok: true, already_imported: true, reel: visible ? { id: existing.id, status: existing.status, embed_url: existing.embed_url } : null });
          continue;
        }
      }
      const check = body.verify === false ? { ok: true, handle: null } : await checkEmbed(parsed.embedUrl);
      if (!check.ok) {
        results.push({ url: raw, ok: false, error: 'post is private, deleted or not embeddable' });
        continue;
      }
      const meta = await fetchOEmbed(parsed.canonicalUrl, token).catch((e) => ({ error: String(e) }));
      const o = meta && !('error' in meta) ? meta : null;
      const row = {
        source: 'instagram',
        source_url: parsed.canonicalUrl,
        external_id: parsed.shortcode,
        embed_url: parsed.embedUrl,
        creator_handle: o?.author_name ? `@${o.author_name}` : check.handle ? `@${check.handle}` : '',
        title: body.title ?? o?.title?.split('\n')[0]?.slice(0, 140) ?? '',
        caption: o?.title ?? null,
        thumbnail_url: o?.thumbnail_url ?? null,
        category,
        metadata: meta ?? {},
        imported_by: user.id,
        status: isAdmin ? 'published' : 'pending',
        published_at: isAdmin ? new Date().toISOString() : null,
      };
      const { data, error } = await db
        .from('reels')
        .upsert(row, { onConflict: 'source,external_id', ignoreDuplicates: !isAdmin })
        .select('id, status, embed_url')
        .maybeSingle();
      if (error) throw error;
      results.push({ url: raw, ok: true, reel: data, enriched: Boolean(o) });
    } catch (e) {
      results.push({ url: raw, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return json({ imported: results.filter((r) => r.ok).length, results });
});
