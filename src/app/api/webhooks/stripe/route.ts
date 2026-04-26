import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/integrations/stripe";
import { createServiceClient } from "@/lib/supabase/service";
import { recordAudit } from "@/lib/db/audit";
import { sendKickoffNotification } from "@/lib/integrations/email";

// Stripe requires the raw body for signature verification.
export const runtime = "nodejs";

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret) {
    return NextResponse.json(
      { ok: false, error: "missing signature config" },
      { status: 400 },
    );
  }

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(raw, sig, secret);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "verify failed" },
      { status: 400 },
    );
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const quoteId = session.metadata?.quote_id;
      const clientId = session.metadata?.client_id;
      // Only process deposit payments from this app; ignore unrelated sessions.
      const isDeposit = session.metadata?.kind === "dts.deposit";
      const isPaid = session.payment_status === "paid";
      if (quoteId && clientId && isDeposit && isPaid) {
        const supabase = createServiceClient();

        await supabase
          .schema("dts")
          .from("quotes")
          .update({ status: "active" })
          .eq("id", quoteId);

        await recordAudit({
          actorId: null,
          action: "stripe.deposit.paid",
          entityType: "quote",
          entityId: quoteId,
          diff: {
            sessionId: session.id,
            amount: session.amount_total,
            paymentIntent: session.payment_intent,
          },
        });

        const { data: client } = await supabase
          .schema("dts")
          .from("clients")
          .select("company,email,contact_name")
          .eq("id", clientId)
          .maybeSingle();

        const { data: quote } = await supabase
          .schema("dts")
          .from("quotes")
          .select("project_name,project_type,calc,contract_pdf_url")
          .eq("id", quoteId)
          .maybeSingle();

        await sendKickoffNotification({
          client: client ?? { company: "Unknown" },
          quote: { id: quoteId, ...(quote ?? {}) },
          amountPaidCents: session.amount_total ?? 0,
        });
      }
    } else {
      await recordAudit({
        actorId: null,
        action: `stripe.webhook.${event.type}`,
        diff: { id: event.id },
      });
    }
  } catch (e) {
    await recordAudit({
      actorId: null,
      action: "stripe.webhook.error",
      diff: {
        type: event.type,
        message: e instanceof Error ? e.message : String(e),
      },
    });
    // Return 5xx so Stripe retries transient failures (DB down, etc.).
    // The handler is idempotent: duplicate events are safe to process.
    return NextResponse.json(
      { ok: false, error: "processing_error" },
      { status: 500 },
    );
  }

  return NextResponse.json({ received: true });
}
