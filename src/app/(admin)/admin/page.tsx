import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listQuotes } from "@/lib/db/quotes";
import { listClients } from "@/lib/db/clients";
import { getActivePricingConfig } from "@/lib/db/pricing-config";

export default async function AdminDashboardPage() {
  const [quotes, clients, activeConfig] = await Promise.all([
    listQuotes(),
    listClients(),
    getActivePricingConfig(),
  ]);

  const draftCount = quotes.filter((q) => q.status === "draft").length;
  const sentCount = quotes.filter((q) => q.status === "sent").length;
  const signedCount = quotes.filter(
    (q) => q.status === "signed" || q.status === "active",
  ).length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl">Welcome back, Jeremy.</h1>
        <p className="mt-2 text-muted-foreground">
          You have {draftCount} draft, {sentCount} sent, and {signedCount}{" "}
          signed
          {signedCount === 1 ? " quote" : " quotes"}.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Clients</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{clients.length}</p>
            <Link
              href="/admin/clients"
              className="mt-3 inline-block text-sm text-[var(--brand-amber-warm)]"
            >
              Manage clients →
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Quotes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{quotes.length}</p>
            <Link
              href="/admin/quotes"
              className="mt-3 inline-block text-sm text-[var(--brand-amber-warm)]"
            >
              Open quote builder →
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Active pricing</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {activeConfig ? `v${activeConfig.version}` : "none"}
            </p>
            <Link
              href="/admin/pricing"
              className="mt-3 inline-block text-sm text-[var(--brand-amber-warm)]"
            >
              {activeConfig ? "Edit pricing →" : "Publish v1 →"}
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
