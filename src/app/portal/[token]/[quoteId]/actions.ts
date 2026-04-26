"use server";

import { ok, fail, type ActionResult } from "@/lib/actions/result";
import { findClientByToken, getPortalQuote } from "@/lib/db/portal";
import { getPricingConfig } from "@/lib/db/pricing-config";
import { recordAudit } from "@/lib/db/audit";
import { buildContractPdf } from "@/lib/integrations/pdf";
import { createAgreement } from "@/lib/integrations/adobe-sign";
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

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://contracts.dobeu.tech";
  const redirectUrl = `${baseUrl}/portal/${token}/${quoteId}/signed`;

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

  const supabase = createServiceClient();
  const { data: contract, error: contractErr } = await supabase
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

  await supabase
    .schema("dts")
    .from("quotes")
    .update({ status: "sent" }) // remain 'sent' until webhook flips to 'signed'
    .eq("id", quote.id);

  await recordAudit({
    actorId: null,
    action: "quote.move_forward",
    entityType: "quote",
    entityId: quote.id,
    diff: { contractId: contract?.id, agreementId: agreement.agreementId },
  });

  return ok({
    signingUrl:
      agreement.signingUrl ??
      `${baseUrl}/portal/${token}/${quoteId}?awaiting=email`,
  });
}
