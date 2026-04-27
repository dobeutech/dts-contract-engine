import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { findWebhookPayloads } from "@/lib/mongo/webhook-payloads";
import type { WebhookProvider } from "@/lib/mongo/types";

// Node-runtime read API for archived webhook payloads. Edge callers
// should fetch this URL rather than importing the mongodb driver.
//
// Defense in depth: middleware already redirects unauth users to
// /login, but we re-check the session here so a misconfigured
// public-prefix list cannot expose payload contents.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_PROVIDERS: WebhookProvider[] = ["stripe", "adobe-sign"];

function parseProvider(value: string | null): WebhookProvider | undefined {
  if (!value) return undefined;
  return ALLOWED_PROVIDERS.includes(value as WebhookProvider)
    ? (value as WebhookProvider)
    : undefined;
}

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const provider = parseProvider(url.searchParams.get("provider"));
  const eventId = url.searchParams.get("event_id") ?? undefined;
  const sinceParam = url.searchParams.get("since");
  const since = sinceParam ? new Date(sinceParam) : undefined;
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;

  if (since && Number.isNaN(since.getTime())) {
    return NextResponse.json(
      { ok: false, error: "invalid since" },
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
      parsed_body: d.parsed_body,
    })),
  });
}
