import { NextResponse } from "next/server";
import {
  downloadSignedPdf,
  verifyAdobeSignWebhook,
} from "@/lib/integrations/adobe-sign";
import { createServiceClient } from "@/lib/supabase/service";
import { recordAudit } from "@/lib/db/audit";
import { uploadSignedContract } from "@/lib/storage/contracts";

// Adobe Sign verifies the webhook URL on registration by sending a GET that
// expects the X-AdobeSign-ClientId header to be echoed back in the response.
// This is the ONLY response that should echo the header — the POST handler
// must not, since echoing makes the static client id reflectable from any
// log entry or error capture.
// Source: https://opensource.adobe.com/acrobat-sign/developer_guide/webhooks.html
export async function GET(req: Request) {
  const clientId = req.headers.get("x-adobesign-clientid");
  if (!clientId) return NextResponse.json({ ok: false }, { status: 400 });
  return new NextResponse(JSON.stringify({ xAdobeSignClientId: clientId }), {
    status: 200,
    headers: {
      "X-AdobeSign-ClientId": clientId,
      "Content-Type": "application/json",
    },
  });
}

interface AdobeWebhookPayload {
  event?: string;
  agreement?: { id?: string; status?: string };
  occurredAt?: string;
}

export const runtime = "nodejs";

export async function POST(req: Request) {
  const clientIdHeader = req.headers.get("x-adobesign-clientid");
  const hmacHeader = req.headers.get("x-adobesign-clientsecret-sha256");
  const raw = await req.text();

  const verification = verifyAdobeSignWebhook({
    clientIdHeader,
    hmacHeader,
    rawBody: raw,
  });
  if (!verification.ok) {
    // Don't echo the header back; don't leak the failure reason to caller.
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }

  let payload: AdobeWebhookPayload;
  try {
    payload = JSON.parse(raw) as AdobeWebhookPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  const event = payload.event ?? "unknown";
  const agreementId = payload.agreement?.id;
  const occurredAt = payload.occurredAt ?? new Date().toISOString();

  if (!agreementId) {
    return NextResponse.json({ ok: true });
  }

  const supabase = createServiceClient();

  // Idempotency: each (agreement, event_type, occurredAt) is processed once.
  // Adobe Sign retries deliveries with the same payload on transient failures.
  const eventKey = `${agreementId}::${event}::${occurredAt}`;
  const { data: insertedEvent, error: insertErr } = await supabase
    .schema("dts")
    .from("adobe_sign_events")
    .insert({
      event_key: eventKey,
      agreement_id: agreementId,
      event_type: event,
    })
    .select("event_key")
    .maybeSingle();

  if (insertErr) {
    // Unique violation on event_key means we've already processed this delivery.
    // Postgres error code 23505 = unique_violation.
    const code = (insertErr as { code?: string }).code;
    if (code === "23505") {
      return NextResponse.json({ ok: true, deduped: true });
    }
    // Real DB failure — return 500 so Adobe Sign retries.
    return NextResponse.json(
      { ok: false, error: "ledger_unavailable" },
      { status: 500 },
    );
  }
  if (!insertedEvent) {
    // Should be unreachable; defensive bail.
    return NextResponse.json({ ok: true, deduped: true });
  }

  const { data: contract } = await supabase
    .schema("dts")
    .from("contracts")
    .select("id, quote_id, signed_at")
    .eq("signature_provider_ref", agreementId)
    .maybeSingle();

  if (!contract) {
    await recordAudit({
      actorId: null,
      action: "adobe_sign.webhook.unmatched",
      diff: { event, agreementId },
    });
    await markEventProcessed(supabase, eventKey);
    return NextResponse.json({ ok: true });
  }

  if (
    event === "AGREEMENT_WORKFLOW_COMPLETED" ||
    event === "AGREEMENT_ACTION_COMPLETED"
  ) {
    // Fast path: contract already marked signed — trust the prior write and bail.
    if (contract.signed_at) {
      await markEventProcessed(supabase, eventKey);
      return NextResponse.json({ ok: true, alreadySigned: true });
    }

    try {
      const pdf = await downloadSignedPdf(agreementId);
      const { path } = await uploadSignedContract(contract.id as string, pdf);

      // Store the storage path (NOT a public URL). Portal pages mint a
      // short-lived signed URL on demand via getSignedContractUrl(path).
      const nowIso = new Date().toISOString();
      const { error: contractErr } = await supabase
        .schema("dts")
        .from("contracts")
        .update({
          signed_pdf_url: path,
          signed_at: nowIso,
        })
        .eq("id", contract.id)
        .is("signed_at", null); // idempotent guard
      if (contractErr) throw contractErr;

      const { error: quoteErr } = await supabase
        .schema("dts")
        .from("quotes")
        .update({
          status: "signed",
          signed_at: nowIso,
          contract_pdf_url: path,
        })
        .eq("id", contract.quote_id)
        .eq("status", "sent"); // only flip from sent → signed
      if (quoteErr) throw quoteErr;

      await recordAudit({
        actorId: null,
        action: "adobe_sign.webhook.signed",
        entityType: "contract",
        entityId: contract.id,
        diff: { agreementId, event },
      });
      await markEventProcessed(supabase, eventKey);
    } catch (e) {
      await recordAudit({
        actorId: null,
        action: "adobe_sign.webhook.error",
        entityType: "contract",
        entityId: contract.id,
        diff: {
          agreementId,
          event,
          message: e instanceof Error ? e.message : "unknown",
        },
      });
      // Roll back the dedup row so Adobe Sign's retry actually re-runs us.
      await supabase
        .schema("dts")
        .from("adobe_sign_events")
        .delete()
        .eq("event_key", eventKey);
      return NextResponse.json(
        { ok: false, error: "processing_error" },
        { status: 500 },
      );
    }
  } else {
    await recordAudit({
      actorId: null,
      action: `adobe_sign.webhook.${event.toLowerCase()}`,
      entityType: "contract",
      entityId: contract.id,
      diff: { agreementId, event },
    });
    await markEventProcessed(supabase, eventKey);
  }

  return NextResponse.json({ ok: true });
}

async function markEventProcessed(
  supabase: ReturnType<typeof createServiceClient>,
  eventKey: string,
): Promise<void> {
  await supabase
    .schema("dts")
    .from("adobe_sign_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("event_key", eventKey);
}
