import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { findClientByToken, getPortalQuote } from "@/lib/db/portal";
import { getSignedContractUrl } from "@/lib/storage/contracts";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ token: string; quoteId: string }>;
}

export default async function PaidPage({ params }: Props) {
  const { token, quoteId } = await params;
  const client = await findClientByToken(token);
  if (!client) notFound();
  const quote = await getPortalQuote(client.id, quoteId);
  if (!quote) notFound();
  // Only show this page once the deposit has actually cleared (status flipped
  // to 'active' by the Stripe webhook).
  if (quote.status !== "active") notFound();

  // contract_pdf_url is the storage path now, not a public URL. Mint a
  // short-lived signed URL on each render so the link in the user's tab
  // expires when they leave.
  const contractUrl = quote.contract_pdf_url
    ? await getSignedContractUrl(quote.contract_pdf_url)
    : null;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl">You&apos;re in. Welcome to dobeu.</h1>
      <p className="text-muted-foreground">
        Payment received. Jeremy and the team have been notified and will reach
        out within one business day to schedule kickoff.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>What happens next</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            1. We will email a kickoff calendar invite within 1 business day.
          </p>
          <p>
            2. You will receive a copy of the signed agreement and your receipt.
          </p>
          <p>
            3. We will share a Notion or Linear space for project visibility.
          </p>
        </CardContent>
      </Card>

      {contractUrl ? (
        <a
          href={contractUrl}
          target="_blank"
          rel="noreferrer"
          className="text-[var(--brand-amber-warm)]"
        >
          Download signed contract →
        </a>
      ) : null}

      <p className="text-sm">
        <Link
          href={`/portal/${token}`}
          className="text-[var(--brand-amber-warm)]"
        >
          ← Back to your portal
        </Link>
      </p>
    </div>
  );
}
