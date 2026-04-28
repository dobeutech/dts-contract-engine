# `webhook-payloads-read` (Supabase Edge Function)

Edge-runtime read API for the `webhook_payloads` collection in MongoDB
Atlas. Exists because the native `mongodb` Node driver used inside the
Next.js app cannot run on Vercel's Edge Runtime, and Atlas Data API was
sunset in September 2025. Supabase Edge Functions run on Deno, which
has a working Atlas-compatible driver.

## Why this exists

The Next.js app already exposes the same data at
`/api/internal/webhook-payloads` (Node runtime). Use that endpoint for
any in-app caller. Use *this* function only when you need:

- True edge latency (geo-distributed reads from Supabase's edge network)
- A read path that does not consume Vercel function quota
- A surface that can be called from clients that already hold a Supabase
  JWT but should not depend on the Next app being up

## Auth

This function relies on Supabase's gateway-level JWT verification. With
`verify_jwt = true` (the default), Supabase rejects calls that lack a
valid bearer token before our code runs. Do not flip that flag off.

## Secrets (set on the Supabase project, not Vercel)

```bash
supabase secrets set MONGODB_URI="<your atlas connection string>"
supabase secrets set MONGODB_DB_NAME="dts_contract_engine"   # optional
```

## Deploy

This directory is intentionally excluded from the project's ESLint and
TypeScript checks (the URL imports and `Deno` globals don't resolve
under Node). Run Deno's own toolchain before deploy:

```bash
deno lint  supabase/functions/webhook-payloads-read
deno check supabase/functions/webhook-payloads-read/index.ts
supabase functions deploy webhook-payloads-read
```

## Local development

```bash
supabase functions serve webhook-payloads-read --env-file .env.local

# In another shell:
curl 'http://localhost:54321/functions/v1/webhook-payloads-read?provider=stripe&limit=5' \
  -H "Authorization: Bearer <a-supabase-jwt>"
```

## Query parameters

| Param | Type | Default | Notes |
|---|---|---|---|
| `provider` | `"stripe" \| "adobe-sign"` | unset | Filter by provider |
| `event_id` | string | unset | Exact match on Stripe event id or Adobe agreement id |
| `since` | ISO 8601 | unset | Lower bound on `received_at` |
| `limit` | int 1-200 | 25 | Max docs returned |

Response shape mirrors `/api/internal/webhook-payloads` so callers can
swap endpoints with no code change beyond the URL.
