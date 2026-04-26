"use server";

import { ok, fail, type ActionResult } from "@/lib/actions/result";
import { findClientByToken, getPortalQuote } from "@/lib/db/portal";
import { getPricingConfig } from "@/lib/db/pricing-config";
import { recordAudit } from "@/lib/db/audit";
import { buildContractPdf } from "@/lib/integrations/pdf";
import {
  createAgreement,
  getSigningUrlForAgreement,
} from "@/lib/integrations/adobe-sign";
import { createServiceClient } from "@/lib/supabase/service";

export async function startSigningAction(
  formData: FormData,
): Promise<ActionResult<{ signingUrl: string }>> {
  const token = String(formData.get("token") ?? "");
  const quoteId = String(formData.get("quoteId") ?? "");
  if (!token || !quoteId) return fail("Missing inputs", "validation_failed");

  const client = await findClientByToken(token);
  if (!client) return fail("Invalid portal link", "not_found");
  if (!client.email)
    return fail(
      "Client has no email on file. Ask Jeremy to add one.",
      "conflict",
    );

  const quote = await getPortalQuote(client.id, quoteId);
  if (!quote) return fail("Quote not found", "not_found");
  if (quote.status !== "sent")
    return fail("This quote can't be signed in its current state.", "conflict");

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://contracts.dobeu.tech";
  const redirectUrl = `${baseUrl}/portal/${token}/${quoteId}/signed`;

  const supabase = createServiceClient();

  // Idempotency: reuse an existing pending contract/agreement for this quote
  // so repeated clicks don't create duplicate Adobe Sign agreements.
  const { data: existingContract } = await supabase
    .schema("dts")
    .from("contracts")
    .select("id, signature_provider_ref")
    .eq("quote_id", quote.id)
    .is("signed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let contractId: string;
  let signingUrl: string | null;

  if (existingContract?.signature_provider_ref) {
    // Reuse the existing agreement — just fetch a fresh signing URL.
    contractId = existingContract.id as string;
    try {
      signingUrl = await getSigningUrlForAgreement(
        existingContract.signature_provider_ref as string,
      );
    } catch (e) {
      return fail(
        e instanceof Error
          ? `Adobe Sign error: ${e.message}`
          : "Adobe Sign error",
      );
    }
  } else {
    // First time: build the PDF, create the Adobe Sign agreement, and record
    // the contract row.
    const configRow = await getPricingConfig(quote.pricing_config_id);
    if (!configRow) return fail("Pricing config missing", "internal_error");

    let pdf: Buffer;
    try {
      pdf = await buildContractPdf({ quote, client, config: configRow.config });
    } catch (e) {
      return fail(
        e instanceof Error
          ? `PDF build failed: ${e.message}`
          : "PDF build failed",
      );
    }

    let agreement;
    try {
      agreement = await createAgreement({
        pdf,
        pdfFileName: `dobeu-contract-${quote.id.slice(0, 8)}.pdf`,
        agreementName: `${client.company} — ${quote.project_name ?? quote.project_type}`,
        signerEmail: client.email,
        signerName: client.contact_name ?? client.company,
        redirectUrl,
        webhookEnabled: true,
      });
    } catch (e) {
      return fail(
        e instanceof Error
          ? `Adobe Sign error: ${e.message}`
          : "Adobe Sign error",
      );
    }

    const { data: newContract, error: contractErr } = await supabase
      .schema("dts")
      .from("contracts")
      .insert({
        quote_id: quote.id,
        version: 1,
        signature_provider: "adobe_sign",
        signature_provider_ref: agreement.agreementId,
      })
      .select("id")
      .single();
    if (contractErr) {
      return fail(`Failed to record contract: ${contractErr.message}`);
    }
    contractId = newContract.id;
    signingUrl = agreement.signingUrl;

    const { error: quoteUpdateErr } = await supabase
      .schema("dts")
      .from("quotes")
      .update({ status: "sent" }) // remains 'sent' until webhook flips to 'signed'
      .eq("id", quote.id)
      .eq("status", "sent"); // guard: only update if still in 'sent' state
    if (quoteUpdateErr) {
      return fail(`Failed to update quote: ${quoteUpdateErr.message}`);
    }

    await recordAudit({
      actorId: null,
      action: "quote.move_forward",
      entityType: "quote",
      entityId: quote.id,
      diff: { contractId, agreementId: agreement.agreementId },
    });
  }

  return ok({
    signingUrl:
      signingUrl ?? `${baseUrl}/portal/${token}/${quoteId}?awaiting=email`,
  });
}
