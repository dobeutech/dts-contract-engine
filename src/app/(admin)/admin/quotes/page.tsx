import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { listQuotes } from "@/lib/db/quotes";
import { listClients } from "@/lib/db/clients";
import { formatCents } from "@/lib/pricing/engine";

const STATUS_TONE: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  draft: "outline",
  sent: "default",
  signed: "secondary",
  active: "secondary",
  lost: "destructive",
  void: "destructive",
};

export default async function QuotesListPage() {
  const [quotes, clients] = await Promise.all([listQuotes(), listClients()]);
  const clientMap = new Map(clients.map((c) => [c.id, c]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl">Quotes</h1>
        <Link href="/admin/quotes/new" className={buttonVariants()}>
          New quote
        </Link>
      </div>

      {quotes.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-muted-foreground">No quotes yet.</p>
            <Link
              href="/admin/quotes/new"
              className={buttonVariants({ className: "mt-4" })}
            >
              Build your first quote
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Project</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">First month</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((q) => (
                  <tr
                    key={q.id}
                    className="border-b border-border last:border-0 text-sm"
                  >
                    <td className="px-4 py-3 font-semibold">
                      {clientMap.get(q.client_id)?.company ?? "Unknown"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {q.project_name ?? "—"}
                    </td>
                    <td className="px-4 py-3 capitalize">{q.project_type}</td>
                    <td className="px-4 py-3 font-mono">
                      {q.calc ? formatCents(q.calc.firstMonthTotalCents) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_TONE[q.status] ?? "outline"}>
                        {q.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/quotes/${q.id}`}
                        className="text-sm text-[var(--brand-amber-warm)]"
                      >
                        Open →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
