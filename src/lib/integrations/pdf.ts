import "server-only";

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  pdf,
} from "@react-pdf/renderer";
import { createElement } from "react";
import type { ClientRow, QuoteRow } from "@/lib/db/types";
import type { PricingConfig } from "@/lib/pricing/types";
import { formatCents } from "@/lib/pricing/engine";

const styles = StyleSheet.create({
  page: {
    padding: 48,
    fontFamily: "Helvetica",
    fontSize: 11,
    color: "#1A1A2E",
    lineHeight: 1.5,
  },
  brand: {
    fontSize: 18,
    fontWeight: 700,
    color: "#6B5CE7",
    marginBottom: 24,
  },
  h1: {
    fontSize: 22,
    fontWeight: 700,
    marginBottom: 8,
    color: "#4A3FA8",
  },
  h2: {
    fontSize: 14,
    fontWeight: 700,
    marginTop: 18,
    marginBottom: 6,
    color: "#4A3FA8",
  },
  subtle: { color: "#666" },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  hr: {
    borderBottomWidth: 1,
    borderBottomColor: "#E0DFF5",
    marginVertical: 10,
  },
  totalLabel: { fontSize: 12 },
  totalValue: { fontSize: 12, fontWeight: 700 },
  amber: { color: "#F4A261" },
  footer: { marginTop: 32, fontSize: 9, color: "#888" },
});

interface BuildPdfArgs {
  quote: QuoteRow;
  client: ClientRow;
  config: PricingConfig;
}

export async function buildContractPdf({
  quote,
  client,
  config,
}: BuildPdfArgs): Promise<Buffer> {
  const calc = quote.calc;
  const tier = quote.tier ? config.tiers[quote.tier] : null;

  const Doc = createElement(
    Document,
    {},
    createElement(
      Page,
      { size: "LETTER", style: styles.page },
      createElement(
        Text,
        { style: styles.brand },
        "dobeu — services agreement",
      ),

      createElement(
        Text,
        { style: styles.h1 },
        quote.project_name ?? `${quote.project_type} engagement`,
      ),
      createElement(
        Text,
        { style: styles.subtle },
        `Prepared ${new Date(quote.created_at).toLocaleDateString()}`,
      ),

      createElement(Text, { style: styles.h2 }, "Parties"),
      createElement(
        Text,
        {},
        `${config.agency.legalName}, ${config.agency.address ?? ""}`,
      ),
      createElement(
        Text,
        {},
        `Contact: ${config.agency.contactName} <${config.agency.contactEmail}>`,
      ),
      createElement(
        Text,
        { style: { marginTop: 6 } },
        `Client: ${client.company}`,
      ),
      client.address ? createElement(Text, {}, client.address) : null,
      client.contact_name || client.email
        ? createElement(
            Text,
            {},
            `Contact: ${client.contact_name ?? ""} ${client.email ? `<${client.email}>` : ""}`,
          )
        : null,

      createElement(Text, { style: styles.h2 }, "Scope"),
      ...renderScopeLines(quote, config),

      tier
        ? createElement(View, {}, [
            createElement(Text, { style: styles.h2, key: "t-h" }, "Retainer"),
            createElement(
              Text,
              { key: "t-b" },
              `${tier.name} tier — ${tier.tagline}`,
            ),
            createElement(
              Text,
              { style: styles.subtle, key: "t-s" },
              `Strategy calls: ${tier.sla.strategyCalls.count} × ${tier.sla.strategyCalls.durationMin}min · Email response: ${tier.sla.emailResponseHrs}h · Consulting hrs: ${tier.sla.consultingHrs}/mo · Reporting: ${tier.sla.reportingCadence}`,
            ),
          ])
        : null,

      createElement(View, { style: styles.hr }),

      calc
        ? createElement(View, {}, [
            createElement(Text, { style: styles.h2, key: "i-h" }, "Investment"),
            calc.setupTotalCents > 0
              ? row("Setup total", formatCents(calc.setupTotalCents), "rs")
              : null,
            calc.monthlyTotalCents > 0
              ? row(
                  "Monthly retainer",
                  `${formatCents(calc.monthlyTotalCents)} / mo`,
                  "rm",
                )
              : null,
            calc.oneTimeBaseCents > 0
              ? row(
                  "One-time add-ons",
                  formatCents(calc.oneTimeBaseCents),
                  "ro",
                )
              : null,
            calc.familyDiscountAmountCents > 0
              ? row(
                  "Family courtesy discount",
                  `−${formatCents(calc.familyDiscountAmountCents)}`,
                  "rfd",
                  true,
                )
              : null,
            createElement(View, { style: styles.hr, key: "i-hr" }),
            row(
              "First month invoice",
              formatCents(calc.firstMonthTotalCents),
              "rfm",
              false,
              true,
            ),
            row("Year 1 estimate", formatCents(calc.year1TotalCents), "ry"),
            row(
              "Deposit due to start",
              formatCents(calc.depositAmountCents),
              "rd",
              false,
              true,
            ),
          ])
        : null,

      createElement(Text, { style: styles.h2 }, "Payment terms"),
      createElement(
        Text,
        {},
        `Deposit ${(config.paymentTerms.deposit * 100).toFixed(0)}% due upon signature via Stripe. Net ${config.paymentTerms.netDays} days on monthly invoices. Late fees ${config.paymentTerms.lateFeePctMonth}% per month.`,
      ),

      createElement(Text, { style: styles.h2 }, "Acceptance"),
      createElement(
        Text,
        {},
        "Client accepts the scope and payment terms above by signing the Adobe Sign agreement issued with this document.",
      ),

      createElement(
        Text,
        { style: styles.footer },
        `dobeu · ${config.agency.website} · This document is part of a quote prepared by the Dobeu Tech Solutions contract engine.`,
      ),
    ),
  );

  const blob = await pdf(Doc).toBlob();
  const arrayBuffer = await blob.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function row(
  label: string,
  value: string,
  key: string,
  amber = false,
  emphasize = false,
) {
  return createElement(
    View,
    { style: styles.row, key },
    createElement(
      Text,
      { style: emphasize ? styles.totalLabel : undefined },
      label,
    ),
    createElement(
      Text,
      {
        // react-pdf accepts a Style or array of Styles; the typings narrow to
        // SVG-only when an array is detected. We know we're in <Text> here.
        style: [
          emphasize ? styles.totalValue : null,
          amber ? styles.amber : null,
        ].filter(Boolean) as never,
      },
      value,
    ),
  );
}

function renderScopeLines(quote: QuoteRow, config: PricingConfig) {
  const out: ReturnType<typeof createElement>[] = [];
  const groups: Array<
    [
      string,
      PricingConfig["setupItems"],
      Record<string, { enabled: boolean; qty?: number }> | undefined,
    ]
  > = [
    ["Setup", config.setupItems, quote.scope.setup],
    ["Recurring", config.recurringAddOns, quote.scope.recurring],
    ["One-time", config.oneTimeAddOns, quote.scope.oneTime],
    ["Website", config.websiteTemplates, quote.scope.website],
  ];
  for (const [title, items, sel] of groups) {
    if (!sel) continue;
    const lines = items.filter((it) => sel[it.id]?.enabled);
    if (lines.length === 0) continue;
    out.push(
      createElement(
        Text,
        { key: `g-${title}`, style: { fontWeight: 700, marginTop: 6 } },
        title,
      ),
    );
    for (const it of lines) {
      const qty = sel[it.id]?.qty ?? 1;
      out.push(
        createElement(
          View,
          { key: `g-${title}-${it.id}`, style: styles.row },
          createElement(Text, {}, `• ${it.name}${qty > 1 ? ` × ${qty}` : ""}`),
          createElement(Text, {}, formatCents(it.priceCents * qty)),
        ),
      );
    }
  }
  return out;
}
