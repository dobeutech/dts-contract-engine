import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { findWebhookPayloads } from "@/lib/mongo/webhook-payloads";
import type { WebhookProvider } from "@/lib/mongo/types";

// Node-runtime read API for archived webhook payloads. Edge callers
// should fetch this URL rather than importing the mongodb driver.
//
// Authorization is layered:
//  1. Middleware redirects unauthenticated users to /login.
//  2. We re-verify the Supabase session here in case the public-prefix
//     list is ever misconfigured.
//  3. Archived webhook bodies contain Stripe customer PII (email, last4,
//     etc.) and are more sensitive than the rest of the admin surface,
//     so we additionally require an INTERNAL_API_BEARER_TOKEN. This
//     turns the endpoint into a service-to-service surface — admin UIs
//     proxy through a backend that holds the token, and the Supabase
//     Edge Function has its own auth path. If the token is unset,
//     return 503 (misconfigured) rather than fail-open.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_PROVIDERS: WebhookProvider[] = ["stripe", "adobe-sign"];

export async function GET(req: Request) {
  const expectedToken = process.env.INTERNAL_API_BEARER_TOKEN?.trim();
  if (!expectedToken) {
    return NextResponse.json(
      { ok: false, error: "internal api bearer not configured" },
      { status: 503 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }

  const auth = req.headers.get("authorization");
  const presented = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!presented || presented !== expectedToken) {
    return NextResponse.json(
      { ok: false, error: "forbidden" },
      { status: 403 },
    );
  }

  const url = new URL(req.url);
  const providerParam = url.searchParams.get("provider");
  // null = absent (no filter); any other value (including "") must match
  // an allowed provider, otherwise treat as invalid input.
  if (
    providerParam !== null &&
    !ALLOWED_PROVIDERS.includes(providerParam as WebhookProvider)
  ) {
    return NextResponse.json(
      { ok: false, error: "invalid provider" },
      { status: 400 },
    );
  }
  const provider = providerParam
    ? (providerParam as WebhookProvider)
    : undefined;

  const eventId = url.searchParams.get("event_id") ?? undefined;
  const sinceParam = url.searchParams.get("since");
  const since = sinceParam ? new Date(sinceParam) : undefined;
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;

  if (limit !== undefined && Number.isNaN(limit)) {
    return NextResponse.json(
      { ok: false, error: "invalid limit" },
      { status: 400 },
    );
  }

  if (since && Number.isNaN(since.getTime())) {
    return NextResponse.json(
      { ok: false, error: "invalid since" },
      { status: 400 },
    );
  }

  if (limit !== undefined && Number.isNaN(limit)) {
    return NextResponse.json(
      { ok: false, error: "invalid limit" },
      { status: 400 },
    );
  }

  const docs = await findWebhookPayloads({ provider, eventId, since, limit });
  return NextResponse.json({
    ok: true,
    count: docs.length,
    payloads: docs.map((d) => ({
      id: d._id.toString(),
      provider: d.provider,
      received_at: d.received_at.toISOString(),
      event_id: d.event_id,
      signature_verified: d.signature_verified,
      processing_status: d.processing_status,
      processing_error: d.processing_error,
      headers: d.headers,
      raw_body: d.raw_body,
      raw_body_truncated: d.raw_body_truncated,
      parsed_body: d.parsed_body,
    })),
  });
}
