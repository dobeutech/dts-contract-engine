import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import type { ClientRow, QuoteRow } from "./types";

// Portal lookups bypass RLS via the service-role client. The token itself is
// the authorization material — we treat it as a capability URL.

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
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ClientRow) ?? null;
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
