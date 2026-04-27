import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { findClientByToken, getPortalQuote } from "@/lib/db/portal";
import { notFound } from "next/navigation";
import { DepositCheckoutButton } from "./checkout-button";

interface Props {
  params: Promise<{ token: string; quoteId: string }>;
}

export default async function SignedPage({ params }: Props) {
  const { token, quoteId } = await params;
  const client = await findClientByToken(token);
  if (!client) notFound();
  const quote = await getPortalQuote(client.id, quoteId);
  if (!quote) notFound();
  // Only show "Pay deposit" once the contract has actually been signed and
  // before the deposit has cleared.
  if (quote.status !== "signed") notFound();

  return (
    <div className="space-y-6">
      <h1 className="text-3xl">Signature received.</h1>
      <p className="text-muted-foreground">
        Thanks for signing, {client.contact_name ?? client.company}. The last
        step is the deposit so we can put your kickoff on the calendar.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Pay the deposit</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <DepositCheckoutButton token={token} quoteId={quoteId} />
          <p className="text-xs text-muted-foreground">
            Payments are processed securely through Stripe. You will receive a
            receipt by email.
          </p>
        </CardContent>
      </Card>

      <p className="text-sm">
        <Link
          href={`/portal/${token}`}
          className="text-[var(--brand-amber-warm)]"
        >
          ← Back to all your quotes
        </Link>
      </p>
    </div>
  );
}
