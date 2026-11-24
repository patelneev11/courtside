import { assert, assertEquals } from '@std/assert';
import { rankOffers, RETAILERS, titleMatch } from '../../supabase/functions/market-search/retailers.ts';
import { toIcs } from '../../supabase/functions/calendar-feed/ics.ts';

const product = { id: 'p1', brand: 'Babolat', model: 'Pure Aero', year: 2023, msrp_cents: 27900, gtin: null };

Deno.test('every retailer returns an offer; sample prices are stable', async () => {
  Deno.env.delete('EBAY_APP_TOKEN');
  const a = (await Promise.all(RETAILERS.map((r) => r.search(product)))).flat();
  const b = (await Promise.all(RETAILERS.map((r) => r.search(product)))).flat();
  assertEquals(a.length, RETAILERS.length);
  assertEquals(a.map((o) => o.price_cents), b.map((o) => o.price_cents));
});

Deno.test('ranking: in stock first, then cheapest total, drops poor matches', () => {
  const base = { title: '', condition: 'new' as const, url: 'u', match_confidence: 0.9, shipping_cents: 0 };
  const ranked = rankOffers([
    { ...base, retailer: 'A', price_cents: 20000, in_stock: false },
    { ...base, retailer: 'B', price_cents: 22000, in_stock: true },
    { ...base, retailer: 'C', price_cents: 20000, shipping_cents: 995, in_stock: true },
    { ...base, retailer: 'D', price_cents: 100, in_stock: true, match_confidence: 0.2 },
  ]);
  assertEquals(ranked.map((o) => o.retailer), ['C', 'B', 'A']);
});

Deno.test('titleMatch scores brand/model coverage', () => {
  assertEquals(titleMatch('Babolat Pure Aero 2023 Tennis Racquet', product), 1);
  assert(titleMatch('Wilson Blade 98', product) < 0.5);
});

Deno.test('ICS output is RFC 5545 shaped and escapes text', () => {
  const ics = toIcs([{ type: 'lesson', id: 'x', title: 'Private lesson, Elena; court 4', starts_at: '2026-11-25T22:00:00Z', ends_at: '2026-11-25T23:00:00Z', status: 'confirmed' }]);
  assert(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert(ics.includes('DTSTART:20261125T220000Z'));
  assert(ics.includes('SUMMARY:Private lesson\\, Elena\\; court 4'));
  assert(ics.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75));
});
