import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { findClientByToken, listClientQuotesForPortal } from "@/lib/db/portal";
import { formatCents } from "@/lib/pricing/engine";

interface Props {
  params: Promise<{ token: string }>;
}

export default async function PortalIndexPage({ params }: Props) {
  const { token } = await params;
  const client = await findClientByToken(token);
  if (!client) notFound();

  const quotes = await listClientQuotesForPortal(client.id);

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm text-muted-foreground">Hello,</p>
        <h1 className="text-3xl">{client.company}</h1>
        <p className="mt-2 text-muted-foreground">
          Below are the quotes we have prepared for you. Open one to review the
          scope, ask a question, or move forward.
        </p>
      </header>

      {quotes.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-muted-foreground">
              No quotes have been shared with you yet. We will let you know when
              one is ready.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {quotes.map((q) => (
            <li key={q.id}>
              <Link
                href={`/portal/${token}/${q.id}`}
                className="block rounded-lg border border-border bg-card p-5 transition-colors hover:border-[var(--brand-amber-warm)]"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-lg font-bold">
                      {q.project_name ?? `${q.project_type} engagement`}
                    </p>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      {q.project_type}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-lg">
                      {q.calc ? formatCents(q.calc.firstMonthTotalCents) : "—"}
                    </p>
                    <Badge variant="outline">{q.status}</Badge>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
