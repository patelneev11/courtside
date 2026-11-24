import { adminClient, HttpError, json, readJson, requireUser, serve } from '../_shared/http.ts';
import { AgentJob } from '../_shared/jobs.ts';
import { type Offer, type ProductRef, rankOffers, RETAILERS } from './retailers.ts';

// POST /market-search { product_id } or { query: "Babolat Pure Aero" } -> 202 { job_id, search_id }
serve(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'POST only');
  const { user } = await requireUser(req);
  const body = await readJson<{ product_id?: string; query?: string; wait?: boolean }>(req);
  const admin = adminClient();

  let product: ProductRef | null = null;
  if (body.product_id) {
    product = (await admin.from('products').select('id, brand, model, year, msrp_cents, gtin').eq('id', body.product_id).maybeSingle()).data;
  } else if (body.query?.trim()) {
    product = await resolveProduct(admin, body.query.trim());
  } else {
    throw new HttpError(400, 'product_id or query required');
  }
  if (!product) throw new HttpError(404, 'no product in the catalogue matches that search');

  const steps = [{ key: 'identify', label: `Identifying ${product.brand} ${product.model}` }, ...RETAILERS.map((r) => ({ key: r.key, label: `Checking ${r.name}` })), { key: 'rank', label: 'Ranking deals' }];
  const job = await AgentJob.create(admin, user.id, 'deal_search', { product_id: product.id, query: body.query ?? null }, steps);
  const { data: search } = await admin.from('deal_searches').insert({ user_id: user.id, query: body.query ?? `${product.brand} ${product.model}`, product_id: product.id, agent_job_id: job.id }).select('id').single();

  const p = product;
  const work = async () => {
    await job.step('identify');
    const all: Offer[] = [];
    const checked: string[] = [];
    const failures: Record<string, string> = {};
    for (const r of RETAILERS) {
      await job.step(r.key);
      try {
        all.push(...(await r.search(p)));
        checked.push(r.name);
      } catch (e) {
        failures[r.name] = e instanceof Error ? e.message : String(e);
      }
    }
    await job.step('rank');
    const ranked = rankOffers(all);
    if (ranked.length) {
      await admin.from('deal_offers').upsert(
        ranked.map(({ sample: _s, ...o }) => ({ ...o, product_id: p.id, fetched_at: new Date().toISOString() })),
        { onConflict: 'product_id,retailer,url' },
      );
    }
    await admin.from('deal_searches').update({ sources_checked: checked }).eq('id', search?.id);
    await job.succeed({ product: p, offers: ranked, best: ranked[0] ?? null, sources_checked: checked, failures, sample_data: ranked.some((o) => o.sample) });
  };

  if (body.wait) {
    await work().catch((e) => job.fail(e));
    return json((await admin.from('agent_jobs').select('*').eq('id', job.id).single()).data);
  }
  job.runInBackground(work);
  return json({ job_id: job.id, search_id: search?.id, status: 'queued' }, 202);
});

/** Picks the catalogue product whose brand+model best covers the query words. */
async function resolveProduct(admin: ReturnType<typeof adminClient>, query: string): Promise<ProductRef | null> {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  const { data } = await admin.from('products').select('id, brand, model, year, msrp_cents, gtin');
  let best: { p: ProductRef; s: number } | null = null;
  for (const p of data ?? []) {
    const name = `${p.brand} ${p.model} ${p.year ?? ''}`.toLowerCase();
    const s = words.filter((w) => name.includes(w)).length / words.length + (p.year ?? 0) / 1e6;
    if (s > 0.5 && (!best || s > best.s)) best = { p, s };
  }
  return best?.p ?? null;
}
