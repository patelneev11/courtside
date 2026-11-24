# Courtside backend

Supabase (Postgres + Auth + Storage + Realtime) with Deno Edge Functions. It backs the student app in `../frontend` and already models the coach side. The frontend is not wired to it yet.

## Run locally

Requires Docker, Node 20+ and Deno 2.

```bash
cd backend
npm ci
npm start                 # local Supabase stack (Studio: http://127.0.0.1:54323)
npm run reset             # apply migrations + seed demo data
cp supabase/functions/.env.example supabase/functions/.env
npm run functions         # serve Edge Functions (keep running)
npm test                  # unit + integration tests
```

Demo logins (password `courtside-demo`): `student@courtside.dev`, `student2@courtside.dev`, `elena@courtside.dev` (coach), `marcus@courtside.dev` (coach), `admin@courtside.dev`.

**Instagram Reels trial:** with functions running, `python3 -m http.server 8090 -d tools` and open `http://127.0.0.1:8090/reels-trial.html`. Paste Reel links, import, and they play via Instagram's official embed.

## Layout

| Path | What |
|---|---|
| `supabase/migrations/` | Schema, RLS, booking RPCs, storage buckets, payment settlement |
| `supabase/seed.sql` | Demo data matching the frontend's mock content |
| `supabase/functions/tennis-agent` | Claude agent jobs: `match_analysis`, `playstyle`, `workout`, `drills`, `swing_analysis`, `racket_recommendation`, `training_load` |
| `supabase/functions/reels-import` | Import Instagram Reel/post links for Aces (official embed; Meta oEmbed when a token is set) |
| `supabase/functions/market-search` | Multi-retailer deal search for one product, run as an agent job |
| `supabase/functions/payments-checkout` | Stripe Checkout for an invoice; coach invoices use Connect destination charges |
| `supabase/functions/stripe-webhook` | Signed, idempotent webhook: settles invoices, refunds, Connect status |
| `supabase/functions/connect-onboarding` | Stripe Express onboarding and dashboard links for coaches |
| `supabase/functions/court-alerts` | Cron: notifies matching open court slots and can hold them for 10 min |
| `supabase/functions/calendar-feed` | Private ICS feed for Apple/Google Calendar |
| `tests/unit`, `tests/integration` | Deno tests (integration runs against the local stack) |

## Data rules

- **Exact numbers are never written by the LLM.** Match stats come from logged points (`compute_match_stats`) or computer vision. Claude writes only summaries, tactics and plans from those numbers.
- **Agent jobs** (`agent_jobs`) move `queued → running → succeeded | failed` with ordered `steps`. Clients subscribe via Realtime; pass `"wait": true` to get the finished job in one call.
- **RLS everywhere.** Players own their data. Linked coaches (`coach_students`) can read it unless the student turns off `settings.privacy.share_stats_with_coaches`. Only admins change roles. Stripe ids and wearable tokens are service-role only.
- **Bookings** go through RPCs (`reserve_court_slot`, `book_lesson`, `enroll_in_class`, `buy_lesson_package`, `cancel_booking`) that lock rows, create invoices and prevent double booking.

## Client API (for wiring the frontend later)

- Tables and views via `supabase-js`: `reel_feed`, `articles`, `court_availability`, `class_directory`, `calendar_events`, `spending_summary`, `wardrobe_overview`, `saved_folder_summary`, and others.
- Functions: `POST /functions/v1/<name>` with the user's JWT.

## Keys to add for production

Set these with `supabase secrets set`. Every function works without them in development: Claude, CV and retailers return mock output, and payments settle instantly when `ALLOW_MOCK_PAYMENTS=true`.

| Secret | For |
|---|---|
| `ANTHROPIC_API_KEY` (+ optional `ANTHROPIC_MODEL`) | Claude tennis agent |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PLATFORM_FEE_BPS` | Payments + Connect payouts |
| `META_OEMBED_TOKEN` | Reel captions/thumbnails (Meta app with oEmbed Read) |
| `EBAY_APP_TOKEN` | Live eBay prices (other retailers need affiliate/product feeds) |
| `CV_SERVICE_URL`, `CV_SERVICE_TOKEN` | Pose estimation worker for swing analysis |
| `CRON_SECRET` | Court-alerts scheduler |
| `APP_URL` | Checkout/onboarding return URLs |
| `AGENT_JOBS_PER_HOUR` | Per-account cap on AI/deal-search jobs (default 30) |

Set `ALLOW_MOCK_PAYMENTS=false` in production.
