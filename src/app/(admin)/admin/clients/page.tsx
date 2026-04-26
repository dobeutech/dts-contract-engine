import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { listClients } from "@/lib/db/clients";

export default async function ClientsListPage() {
  const clients = await listClients();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl">Clients</h1>
        <Link href="/admin/clients/new" className={buttonVariants()}>
          New client
        </Link>
      </div>

      {clients.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-muted-foreground">No clients yet.</p>
            <Link
              href="/admin/clients/new"
              className={buttonVariants({ className: "mt-4" })}
            >
              Add your first client
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3">Tag</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-border last:border-0 text-sm"
                  >
                    <td className="px-4 py-3 font-semibold">{c.company}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {c.contact_name ?? "—"}
                      <br />
                      <span className="text-xs">{c.email ?? ""}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          c.relationship_tag === "family"
                            ? "default"
                            : "secondary"
                        }
                      >
                        {c.relationship_tag}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(c.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/clients/${c.id}`}
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
