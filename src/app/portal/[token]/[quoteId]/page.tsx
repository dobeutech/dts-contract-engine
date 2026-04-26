import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { findClientByToken, getPortalQuote } from "@/lib/db/portal";
import { getPricingConfig } from "@/lib/db/pricing-config";
import { formatCents } from "@/lib/pricing/engine";
import { PortalActions } from "./portal-actions";

interface Props {
  params: Promise<{ token: string; quoteId: string }>;
}

export default async function PortalQuotePage({ params }: Props) {
  const { token, quoteId } = await params;
  const client = await findClientByToken(token);
  if (!client) notFound();
  const quote = await getPortalQuote(client.id, quoteId);
  if (!quote) notFound();
  if (
    quote.status === "draft" ||
    quote.status === "void" ||
    quote.status === "lost"
  ) {
    notFound();
  }

  const configRow = await getPricingConfig(quote.pricing_config_id);
  const config = configRow?.config;

  const calc = quote.calc;
  const tier = quote.tier && config?.tiers[quote.tier];

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl">
          {quote.project_name ?? `${quote.project_type} engagement`}
        </h1>
        <p className="mt-2 text-muted-foreground">
          Prepared for {client.company} ·{" "}
          <Badge variant="outline">{quote.status}</Badge>
        </p>
      </header>

      {calc ? (
        <Card>
          <CardHeader>
            <CardTitle>Investment</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              {tier ? (
                <Row
                  label={`${tier.name} retainer`}
                  value={`${formatCents(tier.monthlyRetainerCents)} / mo`}
                />
              ) : null}
              <Row
                label="Setup total"
                value={formatCents(calc.setupTotalCents)}
              />
              <Row
                label="Recurring monthly"
                value={formatCents(calc.monthlyTotalCents)}
              />
              {calc.oneTimeBaseCents > 0 ? (
                <Row
                  label="One-time add-ons"
                  value={formatCents(calc.oneTimeBaseCents)}
                />
              ) : null}
              {calc.familyDiscountAmountCents > 0 ? (
                <Row
                  label="Family courtesy discount"
                  value={`−${formatCents(calc.familyDiscountAmountCents)}`}
                  tone="amber"
                />
              ) : null}
              <hr className="my-3 border-border" />
              <Row
                label="First month"
                value={formatCents(calc.firstMonthTotalCents)}
                emphasize
              />
              <Row
                label="Year 1 estimate"
                value={formatCents(calc.year1TotalCents)}
              />
              <Row
                label="Deposit due to start"
                value={formatCents(calc.depositAmountCents)}
              />
            </dl>
          </CardContent>
        </Card>
      ) : null}

      <PortalActions
        token={token}
        quoteId={quote.id}
        canMoveForward={quote.status === "sent"}
      />

      <Card>
        <CardHeader>
          <CardTitle>What happens next</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            When you click <strong>Move forward</strong>, we will email you an
            Adobe Sign agreement to review and sign.
          </p>
          <p>
            After signing, you will be returned here to pay the deposit and
            confirm kickoff. Have a question first? Tap{" "}
            <strong>Ask a question</strong> and Fin will help — or hand you off
            to Jeremy directly.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({
  label,
  value,
  emphasize,
  tone,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
  tone?: "amber";
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={
          emphasize
            ? "font-mono text-base font-bold"
            : tone === "amber"
              ? "font-mono text-[var(--brand-amber-warm)]"
              : "font-mono"
        }
      >
        {value}
      </dd>
    </div>
  );
}
