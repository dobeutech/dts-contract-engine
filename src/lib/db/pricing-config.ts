import "server-only";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import type { PricingConfigRow } from "./types";
import type { PricingConfig } from "@/lib/pricing/types";

const TABLE = "pricing_config";

export async function getActivePricingConfig(): Promise<PricingConfigRow | null> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .schema("dts")
    .from(TABLE)
    .select("*")
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as PricingConfigRow) ?? null;
}

export async function listPricingConfigs(): Promise<PricingConfigRow[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .schema("dts")
    .from(TABLE)
    .select("*")
    .order("version", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as PricingConfigRow[];
}

export async function getPricingConfig(
  id: string,
): Promise<PricingConfigRow | null> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .schema("dts")
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as PricingConfigRow) ?? null;
}

export async function createPricingConfigDraft(
  version: number,
  config: PricingConfig,
): Promise<PricingConfigRow> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .schema("dts")
    .from(TABLE)
    .insert({ version, is_active: false, config })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as PricingConfigRow;
}

export async function publishPricingConfig(
  id: string,
): Promise<PricingConfigRow> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .schema("dts")
    .rpc("publish_pricing_config", { target_id: id });
  if (error) throw new Error(error.message);
  return data as unknown as PricingConfigRow;
}
