/**
 * Retailer adapters for the multi-store deal search. Each adapter returns offers for one product.
 * Live adapters run when their credentials are set; otherwise a deterministic sample offer is used
 * so the pipeline (and the frontend's progress UI) works end to end in development.
 */
export interface ProductRef {
  id: string;
  brand: string;
  model: string;
  year: number | null;
  msrp_cents: number | null;
  gtin: string | null;
}
export interface Offer {
  retailer: string;
  title: string;
  price_cents: number;
  shipping_cents: number;
  condition: 'new' | 'used' | 'demo' | 'refurbished';
  in_stock: boolean;
  url: string;
  match_confidence: number;
  sample?: boolean;
}
export interface Retailer {
  key: string;
  name: string;
  live: () => boolean;
  search: (p: ProductRef, fetchImpl?: typeof fetch) => Promise<Offer[]>;
}

const q = (p: ProductRef) => `${p.brand} ${p.model}${p.year ? ` ${p.year}` : ''}`;

/** Stable pseudo-random in [0,1) from a string, so sample prices don't change between runs. */
export function seeded(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10_000) / 10_000;
}

function sample(name: string, searchUrl: (s: string) => string, opts: { discount: [number, number]; shipping: number; condition?: Offer['condition'] }) {
  return (p: ProductRef): Offer[] => {
    const msrp = p.msrp_cents ?? 25_000;
    const r = seeded(`${name}:${p.id}`);
    const off = opts.discount[0] + (opts.discount[1] - opts.discount[0]) * r;
    return [{
      retailer: name,
      title: q(p),
      price_cents: Math.round((msrp * (1 - off)) / 100) * 100 - 1,
      shipping_cents: opts.shipping,
      condition: opts.condition ?? 'new',
      in_stock: r > 0.12,
      url: searchUrl(encodeURIComponent(q(p))),
      match_confidence: 0.9,
      sample: true,
    }];
  };
}

/** eBay Browse API (needs an application OAuth token: EBAY_APP_TOKEN). */
async function ebayLive(p: ProductRef, fetchImpl: typeof fetch = fetch): Promise<Offer[]> {
  const u = new URL('https://api.ebay.com/buy/browse/v1/item_summary/search');
  u.searchParams.set('q', `${q(p)} tennis racket`);
  u.searchParams.set('limit', '10');
  u.searchParams.set('filter', 'buyingOptions:{FIXED_PRICE},priceCurrency:USD');
  if (p.gtin) u.searchParams.set('gtin', p.gtin);
  const res = await fetchImpl(u, { headers: { Authorization: `Bearer ${Deno.env.get('EBAY_APP_TOKEN')}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' } });
  if (!res.ok) throw new Error(`eBay ${res.status}`);
  const body = await res.json();
  return (body.itemSummaries ?? []).map((it: any) => ({
    retailer: 'eBay',
    title: it.title,
    price_cents: Math.round(Number(it.price?.value ?? 0) * 100),
    shipping_cents: Math.round(Number(it.shippingOptions?.[0]?.shippingCost?.value ?? 0) * 100),
    condition: /new/i.test(it.condition ?? '') ? 'new' : /refurb/i.test(it.condition ?? '') ? 'refurbished' : 'used',
    in_stock: true,
    url: it.itemWebUrl,
    match_confidence: titleMatch(it.title, p),
  }));
}

/** Share of brand/model tokens present in a listing title (0..1). */
export function titleMatch(title: string, p: ProductRef): number {
  const want = `${p.brand} ${p.model}`.toLowerCase().split(/\s+/).filter(Boolean);
  const have = title.toLowerCase();
  const hits = want.filter((w) => have.includes(w)).length;
  return Math.round((hits / want.length) * 100) / 100;
}

export const RETAILERS: Retailer[] = [
  { key: 'tennis_warehouse', name: 'Tennis Warehouse', live: () => false, search: async (p) => sample('Tennis Warehouse', (s) => `https://www.tennis-warehouse.com/search-tennis.html?searchtext=${s}`, { discount: [0, 0.08], shipping: 0 })(p) },
  { key: 'tennis_express', name: 'Tennis Express', live: () => false, search: async (p) => sample('Tennis Express', (s) => `https://www.tennisexpress.com/search.cfm?searchKeyword=${s}`, { discount: [0.02, 0.12], shipping: 0 })(p) },
  { key: 'midwest_sports', name: 'Midwest Sports', live: () => false, search: async (p) => sample('Midwest Sports', (s) => `https://www.midwestsports.com/search?q=${s}`, { discount: [0.03, 0.12], shipping: 0 })(p) },
  { key: 'holabird', name: 'Holabird Sports', live: () => false, search: async (p) => sample('Holabird Sports', (s) => `https://www.holabirdsports.com/search?q=${s}`, { discount: [0.02, 0.1], shipping: 0 })(p) },
  { key: 'amazon', name: 'Amazon', live: () => false, search: async (p) => sample('Amazon', (s) => `https://www.amazon.com/s?k=${s}`, { discount: [0, 0.15], shipping: 0 })(p) },
  {
    key: 'ebay', name: 'eBay', live: () => Boolean(Deno.env.get('EBAY_APP_TOKEN')),
    search: (p, f) => Deno.env.get('EBAY_APP_TOKEN') ? ebayLive(p, f) : Promise.resolve(sample('eBay', (s) => `https://www.ebay.com/sch/i.html?_nkw=${s}`, { discount: [0.15, 0.35], shipping: 995, condition: 'used' })(p)),
  },
];

/** Cheapest in-stock, confidently matched offers first; ties go to new over used. */
export function rankOffers(offers: Offer[], minConfidence = 0.6): Offer[] {
  const condRank = { new: 0, demo: 1, refurbished: 2, used: 3 } as const;
  return offers
    .filter((o) => o.match_confidence >= minConfidence && o.price_cents > 0)
    .sort((a, b) => Number(b.in_stock) - Number(a.in_stock) || (a.price_cents + a.shipping_cents) - (b.price_cents + b.shipping_cents) || condRank[a.condition] - condRank[b.condition]);
}
