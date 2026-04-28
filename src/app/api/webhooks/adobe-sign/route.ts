import { NextResponse } from "next/server";
import {
  downloadSignedPdf,
  verifyWebhookClientId,
} from "@/lib/integrations/adobe-sign";
import { createServiceClient } from "@/lib/supabase/service";
import { recordAudit } from "@/lib/db/audit";
import {
  archiveWebhookPayload,
  updateWebhookPayloadStatus,
} from "@/lib/mongo/webhook-payloads";

// Native mongodb driver is Node-only — this route runs on Node by default.
export const runtime = "nodejs";

// Adobe Sign verifies the webhook URL on registration by sending a GET that
// expects the X-AdobeSign-ClientId header to be echoed back in the response.
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
}

export async function POST(req: Request) {
  const clientIdHeader = req.headers.get("x-adobesign-clientid");

  // Capture raw bytes once so we can both archive forensically and parse below.
  const raw = await req.text();
  const archiveId = await archiveWebhookPayload({
    provider: "adobe-sign",
    headers: req.headers,
    rawBody: raw,
  });

  if (!verifyWebhookClientId(clientIdHeader)) {
    await updateWebhookPayloadStatus(archiveId, {
      signatureVerified: false,
      processingStatus: "failed",
      processingError: "invalid client id",
    });
    return NextResponse.json(
      { ok: false, error: "invalid client id" },
      {
        status: 401,
      },
    );
  }

  let payload: AdobeWebhookPayload;
  try {
    payload = JSON.parse(raw) as AdobeWebhookPayload;
  } catch {
    await updateWebhookPayloadStatus(archiveId, {
      signatureVerified: true,
      processingStatus: "failed",
      processingError: "bad json",
    });
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  const event = payload.event ?? "unknown";
  const agreementId = payload.agreement?.id;
  // If no agreementId, the early return below ends the request and we
  // never set "processed" — short-circuit it here so the archive doc
  // doesn't sit at "verified" forever.
  await updateWebhookPayloadStatus(archiveId, {
    signatureVerified: true,
    processingStatus: agreementId ? "verified" : "processed",
    eventId: agreementId ?? null,
  });

  // Always echo the client id back per Adobe's spec.
  const ok = NextResponse.json(
    { ok: true },
    { headers: { "X-AdobeSign-ClientId": clientIdHeader as string } },
  );

  if (!agreementId) return ok;

  const supabase = createServiceClient();
  const { data: contract } = await supabase
    .schema("dts")
    .from("contracts")
    .select("id, quote_id")
    .eq("signature_provider_ref", agreementId)
    .maybeSingle();

  if (!contract) {
    // Webhook before our DB write. Record only.
    await recordAudit({
      actorId: null,
      action: "adobe_sign.webhook.unmatched",
      diff: { event, agreementId },
    });
    await updateWebhookPayloadStatus(archiveId, {
      processingStatus: "processed",
    });
    return ok;
  }

  if (
    event === "AGREEMENT_WORKFLOW_COMPLETED" ||
    event === "AGREEMENT_ACTION_COMPLETED"
  ) {
    try {
      const pdf = await downloadSignedPdf(agreementId);
      const path = `contracts/${contract.id}/signed.pdf`;
      const { error: upErr } = await supabase.storage
        .from("contracts")
        .upload(path, pdf, {
          contentType: "application/pdf",
          upsert: true,
        });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage
        .from("contracts")
        .getPublicUrl(path);
      await supabase
        .schema("dts")
        .from("contracts")
        .update({
          signed_pdf_url: pub.publicUrl,
          signed_at: new Date().toISOString(),
        })
        .eq("id", contract.id);

      await supabase
        .schema("dts")
        .from("quotes")
        .update({
          status: "signed",
          signed_at: new Date().toISOString(),
          contract_pdf_url: pub.publicUrl,
        })
        .eq("id", contract.quote_id);

      await recordAudit({
        actorId: null,
        action: "adobe_sign.webhook.signed",
        entityType: "contract",
        entityId: contract.id,
        diff: { agreementId, event },
      });
    } catch (e) {
      await recordAudit({
        actorId: null,
        action: "adobe_sign.webhook.error",
        entityType: "contract",
        entityId: contract.id,
        diff: {
          agreementId,
          event,
          message: e instanceof Error ? e.message : String(e),
        },
      });
      await updateWebhookPayloadStatus(archiveId, {
        processingStatus: "failed",
        processingError: e instanceof Error ? e.message : String(e),
      });
      // Return 5xx so Adobe Sign retries transient failures (storage down, etc.).
      // The handler is idempotent (upsert on storage, status check on DB).
      return new NextResponse(
        JSON.stringify({ ok: false, error: "processing_error" }),
        {
          status: 500,
          headers: {
            "X-AdobeSign-ClientId": clientIdHeader as string,
            "Content-Type": "application/json",
          },
        },
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
  }

  await updateWebhookPayloadStatus(archiveId, {
    processingStatus: "processed",
  });
  return ok;
}
