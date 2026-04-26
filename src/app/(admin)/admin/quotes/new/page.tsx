import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { listClients } from "@/lib/db/clients";
import { getActivePricingConfig } from "@/lib/db/pricing-config";
import { QuoteBuilder } from "../quote-builder";
import { createQuoteAndRedirect } from "../actions";
import type { QuoteInputT } from "@/lib/validation/schemas";

interface Props {
  searchParams: Promise<{ client?: string }>;
}

export default async function NewQuotePage({ searchParams }: Props) {
  const { client } = await searchParams;
  const [clients, active] = await Promise.all([
    listClients(),
    getActivePricingConfig(),
  ]);

  if (!active) {
    return (
      <Card>
        <CardContent className="space-y-3 py-10 text-center">
          <p className="text-muted-foreground">
            Publish a pricing config before building quotes.
          </p>
          <Link
            href="/admin/pricing"
            className="text-[var(--brand-amber-warm)]"
          >
            Go to pricing →
          </Link>
        </CardContent>
      </Card>
    );
  }

  if (clients.length === 0) {
    return (
      <Card>
        <CardContent className="space-y-3 py-10 text-center">
          <p className="text-muted-foreground">
            Create a client before building a quote.
          </p>
          <Link
            href="/admin/clients/new"
            className="text-[var(--brand-amber-warm)]"
          >
            New client →
          </Link>
        </CardContent>
      </Card>
    );
  }

  async function save(input: QuoteInputT) {
    "use server";
    return createQuoteAndRedirect(input);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl">New quote</h1>
      <QuoteBuilder
        config={active.config}
        clients={clients}
        initialClientId={client}
        onSave={save}
        saveLabel="Create draft"
      />
    </div>
  );
}
