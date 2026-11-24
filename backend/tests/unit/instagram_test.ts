import { assertEquals } from '@std/assert';
import { checkEmbed, fetchOEmbed, parseInstagramUrl } from '../../supabase/functions/reels-import/instagram.ts';

Deno.test('parses reel, reels, post and tv URLs to a canonical embed', () => {
  const cases: [string, string, string][] = [
    ['https://www.instagram.com/reel/C9xYz_12ab/', 'C9xYz_12ab', 'reel'],
    ['https://instagram.com/reels/C9xYz_12ab?igsh=abc', 'C9xYz_12ab', 'reel'],
    ['https://www.instagram.com/atptour/reel/C9xYz_12ab/', 'C9xYz_12ab', 'reel'],
    ['https://www.instagram.com/p/DRBC_YICG56', 'DRBC_YICG56', 'p'],
    ['http://m.instagram.com/tv/B-abc123/', 'B-abc123', 'tv'],
  ];
  for (const [url, code, kind] of cases) {
    const p = parseInstagramUrl(url);
    assertEquals(p?.shortcode, code, url);
    assertEquals(p?.kind, kind, url);
    assertEquals(p?.embedUrl, `https://www.instagram.com/${kind}/${code}/embed/captioned/`);
  }
});

Deno.test('rejects non-Instagram and profile URLs', () => {
  for (const url of ['https://example.com/reel/abcdef/', 'https://www.instagram.com/atptour/', 'https://www.instagram.com/atptour/reels/', 'not a url', 'javascript:alert(1)', 'https://instagram.com.evil.io/reel/abcdef/']) {
    assertEquals(parseInstagramUrl(url), null, url);
  }
});

Deno.test('checkEmbed reads the handle and detects removed posts', async () => {
  const ok = await checkEmbed('x', () => Promise.resolve(new Response('<span class="UsernameText">atptour</span>')));
  assertEquals(ok, { ok: true, handle: 'atptour' });
  const gone = await checkEmbed('x', () => Promise.resolve(new Response('Sorry, This content is no longer available')));
  assertEquals(gone.ok, false);
  const missing = await checkEmbed('x', () => Promise.resolve(new Response('', { status: 404 })));
  assertEquals(missing.ok, false);
});

Deno.test('oEmbed is skipped without a token and called with one', async () => {
  assertEquals(await fetchOEmbed('https://www.instagram.com/reel/abc12/', undefined), null);
  let called = '';
  const r = await fetchOEmbed('https://www.instagram.com/reel/abc12/', 'tok', (u) => {
    called = String(u);
    return Promise.resolve(Response.json({ author_name: 'wta', title: 'Forecourt patterns' }));
  });
  assertEquals(r?.author_name, 'wta');
  assertEquals(called.startsWith('https://graph.facebook.com/'), true);
  assertEquals(new URL(called).searchParams.get('url'), 'https://www.instagram.com/reel/abc12/');
});
