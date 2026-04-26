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

export async function rotatePortalToken(id: string): Promise<string> {
  const token = crypto.randomUUID().replace(/-/g, "");
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .schema("dts")
    .from(TABLE)
    .update({ portal_token: token })
    .eq("id", id);
  if (error) throw new Error(error.message);
  return token;
}
