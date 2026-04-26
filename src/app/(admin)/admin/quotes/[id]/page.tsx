import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listClients, getClient } from "@/lib/db/clients";
import { getQuote } from "@/lib/db/quotes";
import { getPricingConfig } from "@/lib/db/pricing-config";
import { QuoteBuilder } from "../quote-builder";
import { updateQuoteAction } from "../actions";
import { QuoteStatusBar } from "./status-bar";
import type { QuoteInputT } from "@/lib/validation/schemas";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function QuoteDetailPage({ params }: Props) {
  const { id } = await params;
  const quote = await getQuote(id);
  if (!quote) notFound();

  const [clients, configRow, client] = await Promise.all([
    listClients(),
    getPricingConfig(quote.pricing_config_id),
    getClient(quote.client_id),
  ]);

  if (!configRow) notFound();

  async function save(input: QuoteInputT) {
    "use server";
    return updateQuoteAction(id, input);
  }

  const portalUrl = client?.portal_token
    ? `/portal/${client.portal_token}/${quote.id}`
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/admin/quotes" className="text-sm text-muted-foreground">
            ← All quotes
          </Link>
          <h1 className="mt-1 flex items-center gap-3 text-3xl">
            {quote.project_name ?? `${quote.project_type} quote`}
            <Badge variant="outline">{quote.status}</Badge>
          </h1>
          <p className="text-sm text-muted-foreground">
            Pricing: v{configRow.version} · Created{" "}
            {new Date(quote.created_at).toLocaleString()}
          </p>
        </div>
      </div>

      <QuoteStatusBar
        quoteId={quote.id}
        status={quote.status}
        portalUrl={portalUrl}
        clientHasToken={!!client?.portal_token}
      />

      {quote.status === "draft" ? (
        <QuoteBuilder
          config={configRow.config}
          clients={clients}
          existing={quote}
          onSave={save}
          saveLabel="Save draft"
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Quote details (locked)</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="overflow-auto rounded-md bg-[var(--brand-code-bg-dark)] p-4 text-xs">
              {JSON.stringify(quote, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
