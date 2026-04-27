import "server-only";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import type { ClientRow } from "./types";
import type { ClientInputT } from "@/lib/validation/schemas";

const TABLE = "clients";

export async function listClients(): Promise<ClientRow[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .schema("dts")
    .from(TABLE)
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ClientRow[];
}

export async function getClient(id: string): Promise<ClientRow | null> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .schema("dts")
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ClientRow) ?? null;
}

export async function getClientByPortalToken(
  token: string,
): Promise<ClientRow | null> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .schema("dts")
    .from(TABLE)
    .select("*")
    .eq("portal_token", token)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ClientRow) ?? null;
}

function normalizeOptional<T extends Record<string, unknown>>(input: T) {
  const out: Record<string, unknown> = { ...input };
  for (const k of Object.keys(out)) {
    if (out[k] === "") out[k] = null;
  }
  return out;
}

export async function createClientRow(input: ClientInputT): Promise<ClientRow> {
  const supabase = await createServerSupabase();
  const payload = normalizeOptional(input);
  const { data, error } = await supabase
    .schema("dts")
    .from(TABLE)
    .insert(payload)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as ClientRow;
}

export async function updateClientRow(
  id: string,
  input: ClientInputT,
): Promise<ClientRow> {
  const supabase = await createServerSupabase();
  const payload = normalizeOptional(input);
  const { data, error } = await supabase
    .schema("dts")
    .from(TABLE)
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as ClientRow;
}

export async function softDeleteClient(id: string): Promise<void> {
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .schema("dts")
    .from(TABLE)
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// Capability-URL token. 90-day expiry by default — long enough for normal
// quote review cycles, short enough that long-tail leaks (browser history,
// screenshare recordings, mail-server logs) age out without intervention.
const PORTAL_TOKEN_TTL_DAYS = 90;

export async function rotatePortalToken(id: string): Promise<string> {
  // 256 bits of entropy. Two `crypto.randomUUID()` outputs concatenated, with
  // dashes stripped — 64 hex chars, ~256 bits. Bigger than UUID v4's 122 bits
  // and resistant to enumeration even at gigascale.
  const token = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");
  const expiresAt = new Date(
    Date.now() + PORTAL_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .schema("dts")
    .from(TABLE)
    .update({
      portal_token: token,
      portal_token_expires_at: expiresAt,
      portal_token_revoked_at: null,
      portal_token_last_used_at: null,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  return token;
}

export async function revokePortalToken(id: string): Promise<void> {
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .schema("dts")
    .from(TABLE)
    .update({ portal_token_revoked_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
