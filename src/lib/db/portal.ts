import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import type { ClientRow, QuoteRow } from "./types";

// Portal lookups bypass RLS via the service-role client. The token itself is
// the authorization material — we treat it as a capability URL and enforce
// expiry + revocation at the application layer.

export async function findClientByToken(
  token: string,
): Promise<ClientRow | null> {
  if (!token) return null;
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .schema("dts")
    .from("clients")
    .select("*")
    .eq("portal_token", token)
    .is("deleted_at", null)
    .is("portal_token_revoked_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const client = (data as ClientRow | null) ?? null;
  if (!client) return null;

  // Reject expired tokens. Tokens with no expiry (legacy) are treated as
  // active until the next rotation; the 0004 migration backfills 90-day
  // expiry on existing rows.
  if (client.portal_token_expires_at) {
    const expiresAt = new Date(client.portal_token_expires_at).getTime();
    if (Number.isFinite(expiresAt) && expiresAt < Date.now()) {
      return null;
    }
  }

  // Bump last-used timestamp opportunistically. Errors here don't affect the
  // request — they just mean the freshness signal is stale.
  void supabase
    .schema("dts")
    .from("clients")
    .update({ portal_token_last_used_at: new Date().toISOString() })
    .eq("id", client.id);

  return client;
}

export async function listClientQuotesForPortal(
  clientId: string,
): Promise<QuoteRow[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .schema("dts")
    .from("quotes")
    .select("*")
    .eq("client_id", clientId)
    .is("deleted_at", null)
    .in("status", ["sent", "signed", "active"])
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as QuoteRow[];
}

export async function getPortalQuote(
  clientId: string,
  quoteId: string,
): Promise<QuoteRow | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .schema("dts")
    .from("quotes")
    .select("*")
    .eq("client_id", clientId)
    .eq("id", quoteId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as QuoteRow) ?? null;
}
