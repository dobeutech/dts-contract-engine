import "server-only";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import type { QuoteRow } from "./types";
import type { QuoteInputT } from "@/lib/validation/schemas";
import type { CalcResult, QuoteStatus } from "@/lib/pricing/types";

const TABLE = "quotes";

export async function listQuotes(opts?: {
  clientId?: string;
  status?: QuoteStatus;
}): Promise<QuoteRow[]> {
  const supabase = await createServerSupabase();
  let q = supabase
    .schema("dts")
    .from(TABLE)
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (opts?.clientId) q = q.eq("client_id", opts.clientId);
  if (opts?.status) q = q.eq("status", opts.status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as QuoteRow[];
}

export async function getQuote(id: string): Promise<QuoteRow | null> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .schema("dts")
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as QuoteRow) ?? null;
}

export async function createQuoteDraft(
  input: QuoteInputT,
  pricingConfigId: string,
  calc: CalcResult,
): Promise<QuoteRow> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .schema("dts")
    .from(TABLE)
    .insert({
      client_id: input.client_id,
      pricing_config_id: pricingConfigId,
      project_name: input.project_name || null,
      project_type: input.project_type,
      tier: input.tier ?? null,
      scope: input.scope ?? {},
      multipliers: input.multipliers ?? {},
      term: input.term,
      custom_consulting: input.custom_consulting ?? null,
      calc,
      internal_notes: input.internal_notes || null,
      status: "draft",
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as QuoteRow;
}

export async function updateQuoteDraft(
  id: string,
  input: QuoteInputT,
  calc: CalcResult,
): Promise<QuoteRow> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .schema("dts")
    .from(TABLE)
    .update({
      client_id: input.client_id,
      project_name: input.project_name || null,
      project_type: input.project_type,
      tier: input.tier ?? null,
      scope: input.scope ?? {},
      multipliers: input.multipliers ?? {},
      term: input.term,
      custom_consulting: input.custom_consulting ?? null,
      calc,
      internal_notes: input.internal_notes || null,
    })
    .eq("id", id)
    .eq("status", "draft")
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as QuoteRow;
}

export async function transitionQuoteStatus(
  id: string,
  next: QuoteStatus,
): Promise<QuoteRow> {
  const supabase = await createServerSupabase();
  const updates: Record<string, unknown> = { status: next };
  if (next === "sent") updates.sent_at = new Date().toISOString();
  if (next === "signed") updates.signed_at = new Date().toISOString();
  const { data, error } = await supabase
    .schema("dts")
    .from(TABLE)
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as QuoteRow;
}

export async function softDeleteQuote(id: string): Promise<void> {
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .schema("dts")
    .from(TABLE)
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
