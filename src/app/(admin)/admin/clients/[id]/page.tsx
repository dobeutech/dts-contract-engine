import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { ClientForm } from "../client-form";
import { getClient } from "@/lib/db/clients";
import { listQuotes } from "@/lib/db/quotes";
import { updateClientAction, rotateTokenAction } from "../actions";
import { ClientPortalLink } from "./portal-link";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ClientDetailPage({ params }: Props) {
  const { id } = await params;
  const client = await getClient(id);
  if (!client) notFound();

  const quotes = await listQuotes({ clientId: id });

  async function update(formData: FormData) {
    "use server";
    return updateClientAction(id, formData);
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/admin/clients" className="text-sm text-muted-foreground">
            ← All clients
          </Link>
          <h1 className="mt-1 text-3xl">{client.company}</h1>
        </div>
        <Link
          href={`/admin/quotes/new?client=${client.id}`}
          className={buttonVariants()}
        >
          Build quote
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <ClientForm
              client={client}
              onSubmit={update}
              submitLabel="Save changes"
            />
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Portal link</CardTitle>
            </CardHeader>
            <CardContent>
              <ClientPortalLink
                clientId={client.id}
                token={client.portal_token}
                rotateAction={rotateTokenAction}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent quotes</CardTitle>
            </CardHeader>
            <CardContent>
              {quotes.length === 0 ? (
                <p className="text-sm text-muted-foreground">No quotes yet.</p>
              ) : (
                <ul className="space-y-2">
                  {quotes.slice(0, 5).map((q) => (
                    <li key={q.id}>
                      <Link
                        href={`/admin/quotes/${q.id}`}
                        className="flex items-center justify-between rounded-md border border-border p-2 text-sm hover:bg-muted"
                      >
                        <span>
                          {q.project_name ?? `${q.project_type} quote`}
                        </span>
                        <span className="text-xs uppercase text-muted-foreground">
                          {q.status}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
