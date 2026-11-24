/** Instagram reel URL handling. Playback uses Instagram's official embed, which needs no token. */

const HOSTS = new Set(['instagram.com', 'www.instagram.com', 'm.instagram.com', 'instagr.am']);
const PATH = /^\/(?:[A-Za-z0-9._]+\/)?(reel|reels|p|tv)\/([A-Za-z0-9_-]{5,40})\/?$/;

export interface ParsedReel {
  shortcode: string;
  kind: 'reel' | 'p' | 'tv';
  canonicalUrl: string;
  embedUrl: string;
}

export function parseInstagramUrl(raw: string): ParsedReel | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (!['https:', 'http:'].includes(url.protocol) || !HOSTS.has(url.hostname.toLowerCase())) return null;
  const m = url.pathname.match(PATH);
  if (!m) return null;
  const kind = (m[1] === 'reels' ? 'reel' : m[1]) as ParsedReel['kind'];
  const shortcode = m[2];
  const canonicalUrl = `https://www.instagram.com/${kind}/${shortcode}/`;
  return { shortcode, kind, canonicalUrl, embedUrl: `${canonicalUrl}embed/captioned/` };
}

export interface OEmbed {
  author_name?: string;
  title?: string;
  thumbnail_url?: string;
  html?: string;
}

/** Meta oEmbed (needs an app token with "oEmbed Read"). Returns null when no token is configured. */
export async function fetchOEmbed(canonicalUrl: string, token: string | undefined, fetchImpl: typeof fetch = fetch): Promise<OEmbed | null> {
  if (!token) return null;
  const u = new URL('https://graph.facebook.com/v21.0/instagram_oembed');
  u.searchParams.set('url', canonicalUrl);
  u.searchParams.set('omitscript', 'true');
  u.searchParams.set('access_token', token);
  const res = await fetchImpl(u);
  if (!res.ok) throw new Error(`oEmbed ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as OEmbed;
}

export interface EmbedCheck {
  ok: boolean;
  handle: string | null;
}

/** Loads the official embed page: confirms the post is public and reads the creator handle it shows. */
export async function checkEmbed(embedUrl: string, fetchImpl: typeof fetch = fetch): Promise<EmbedCheck> {
  const res = await fetchImpl(embedUrl, { headers: { 'User-Agent': 'Mozilla/5.0 Courtside/1.0' } });
  if (!res.ok) return { ok: false, handle: null };
  const html = await res.text();
  if (/This content is no longer available|Page Not Found/i.test(html)) return { ok: false, handle: null };
  const m = html.match(/class="UsernameText">([A-Za-z0-9._]{1,30})</);
  return { ok: true, handle: m ? m[1] : null };
}
