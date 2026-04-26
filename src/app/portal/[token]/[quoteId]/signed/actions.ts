"use server";

import { ok, fail, type ActionResult } from "@/lib/actions/result";
import { findClientByToken, getPortalQuote } from "@/lib/db/portal";
import { recordAudit } from "@/lib/db/audit";
import { getStripe } from "@/lib/integrations/stripe";

export async function createDepositCheckoutAction(
  formData: FormData,
): Promise<ActionResult<{ url: string }>> {
  const token = String(formData.get("token") ?? "");
  const quoteId = String(formData.get("quoteId") ?? "");
  if (!token || !quoteId) return fail("Missing inputs", "validation_failed");

  const client = await findClientByToken(token);
  if (!client) return fail("Invalid portal link", "not_found");
  if (!client.email) return fail("Client has no email on file.", "conflict");

  const quote = await getPortalQuote(client.id, quoteId);
  if (!quote) return fail("Quote not found", "not_found");
  if (!quote.calc?.depositAmountCents)
    return fail("This quote has no deposit configured.", "conflict");
  // Guard: only allow checkout after Adobe Sign has confirmed signing.
  if (quote.status !== "signed")
    return fail(
      "The contract must be signed before paying the deposit.",
      "conflict",
    );

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://contracts.dobeu.tech";
  const successUrl = `${baseUrl}/portal/${token}/${quoteId}/paid?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${baseUrl}/portal/${token}/${quoteId}/signed`;

  let session;
  try {
    const stripe = getStripe();
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: client.email,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Deposit — ${quote.project_name ?? quote.project_type} (dobeu)`,
              description: `Deposit to begin work on ${client.company}'s engagement.`,
            },
            unit_amount: quote.calc.depositAmountCents,
          },
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        quote_id: quote.id,
        client_id: client.id,
        kind: "dts.deposit",
      },
      payment_intent_data: {
        metadata: {
          quote_id: quote.id,
          client_id: client.id,
          kind: "dts.deposit",
        },
      },
    });
  } catch (e) {
    return fail(
      e instanceof Error ? `Stripe error: ${e.message}` : "Stripe error",
    );
  }

  await recordAudit({
    actorId: null,
    action: "stripe.checkout.create",
    entityType: "quote",
    entityId: quote.id,
    diff: { sessionId: session.id, amountCents: quote.calc.depositAmountCents },
  });

  if (!session.url) return fail("Stripe did not return a session URL.");
  return ok({ url: session.url });
}
