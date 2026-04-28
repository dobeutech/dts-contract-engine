// Supabase Edge Function — Deno runtime.
// Reference implementation of an edge-runtime read path against MongoDB
// Atlas. Lives outside the Next.js app because the Vercel Edge Runtime
// cannot run the native mongodb driver; the Deno driver works on
// Supabase's edge.
//
// Deploy:
//   supabase secrets set MONGODB_URI=...   # in the Supabase project, not Vercel
//   supabase functions deploy webhook-payloads-read
//
// Auth: requires a Supabase JWT in `Authorization: Bearer <token>`.
// Supabase's gateway verifies the JWT before invoking this function when
// `verify_jwt = true` (the default), so we only need to read the
// resolved user from the request context for logging.

// @ts-expect-error — Deno-only import resolved at deploy time, not in Node TS.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
// @ts-expect-error — Deno-only import resolved at deploy time, not in Node TS.
import { MongoClient } from "https://deno.land/x/mongo@v0.32.0/mod.ts";

// @ts-expect-error — Deno globals unavailable in Node typecheck.
const env = Deno.env;

const ALLOWED_PROVIDERS = new Set(["stripe", "adobe-sign"]);

let cachedClient: unknown = null;

async function getDb() {
  if (cachedClient) return cachedClient;
  const uri = env.get("MONGODB_URI");
  if (!uri) throw new Error("MONGODB_URI not set in function secrets");
  const dbName = env.get("MONGODB_DB_NAME") ?? "dts_contract_engine";
  const client = new MongoClient();
  await client.connect(uri);
  cachedClient = client.database(dbName);
  return cachedClient;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

serve(async (req: Request) => {
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ ok: false, error: "method" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }
  try {
    const url = new URL(req.url);
    const providerParam = url.searchParams.get("provider");
    // null = absent (no filter); any other value (including "") must
    // match an allowed provider, otherwise treat as invalid input.
    if (providerParam !== null && !ALLOWED_PROVIDERS.has(providerParam)) {
      return new Response(
        JSON.stringify({ ok: false, error: "invalid provider" }),
        { status: 400, headers: { "content-type": "application/json" } },
      );
    }
    const provider = providerParam ?? undefined;
    const eventId = url.searchParams.get("event_id") ?? undefined;
    const sinceParam = url.searchParams.get("since");
    const since = sinceParam ? new Date(sinceParam) : undefined;
    if (since && Number.isNaN(since.getTime())) {
      return new Response(
        JSON.stringify({ ok: false, error: "invalid since" }),
        { status: 400, headers: { "content-type": "application/json" } },
      );
    }
    const limit = clamp(
      Number.parseInt(url.searchParams.get("limit") ?? "25", 10) || 25,
      1,
      200,
    );

    // deno-lint-ignore no-explicit-any
    const filter: any = {};
    if (provider) filter.provider = provider;
    if (eventId) filter.event_id = eventId;
    if (since) filter.received_at = { $gte: since };

    // deno-lint-ignore no-explicit-any
    const db = (await getDb()) as any;
    const docs = await db
      .collection("webhook_payloads")
      .find(filter)
      .sort({ received_at: -1 })
      .limit(limit)
      .toArray();

    return new Response(
      JSON.stringify({
        ok: true,
        count: docs.length,
        // deno-lint-ignore no-explicit-any
        payloads: docs.map((d: any) => ({
          id: String(d._id),
          provider: d.provider,
          received_at: d.received_at,
          event_id: d.event_id,
          signature_verified: d.signature_verified,
          processing_status: d.processing_status,
          processing_error: d.processing_error,
          headers: d.headers,
          raw_body: d.raw_body,
          parsed_body: d.parsed_body,
        })),
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: e instanceof Error ? e.message : "unknown",
      }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
});
