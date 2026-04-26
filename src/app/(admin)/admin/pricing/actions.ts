"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ok, fail, type ActionResult } from "@/lib/actions/result";
import { requireUser } from "@/lib/auth/current-user";
import { recordAudit } from "@/lib/db/audit";
import {
  createPricingConfigDraft,
  listPricingConfigs,
  publishPricingConfig,
} from "@/lib/db/pricing-config";
import type { PricingConfig } from "@/lib/pricing/types";

const SaveDraftInput = z.object({
  configJson: z.string().min(2),
});

export async function saveDraftAction(
  formData: FormData,
): Promise<ActionResult<{ id: string; version: number }>> {
  let user;
  try {
    user = await requireUser();
  } catch {
    return fail("Sign in required.", "unauthorized");
  }

  const parsed = SaveDraftInput.safeParse({
    configJson: formData.get("configJson"),
  });
  if (!parsed.success) {
    return fail("Invalid input", "validation_failed");
  }

  let config: PricingConfig;
  try {
    config = JSON.parse(parsed.data.configJson);
  } catch {
    return fail("Pricing config is not valid JSON.", "validation_failed");
  }

  const all = await listPricingConfigs();
  const nextVersion = (all[0]?.version ?? 0) + 1;

  try {
    const row = await createPricingConfigDraft(nextVersion, config);
    await recordAudit({
      actorId: user.id,
      action: "pricing_config.draft.create",
      entityType: "pricing_config",
      entityId: row.id,
      diff: { version: row.version },
    });
    revalidatePath("/admin/pricing");
    return ok({ id: row.id, version: row.version });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Failed to save draft");
  }
}

const PublishInput = z.object({ id: z.string().uuid() });

export async function publishConfigAction(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  let user;
  try {
    user = await requireUser();
  } catch {
    return fail("Sign in required.", "unauthorized");
  }

  const parsed = PublishInput.safeParse({ id: formData.get("id") });
  if (!parsed.success) return fail("Invalid id", "validation_failed");

  try {
    const row = await publishPricingConfig(parsed.data.id);
    await recordAudit({
      actorId: user.id,
      action: "pricing_config.publish",
      entityType: "pricing_config",
      entityId: row.id,
      diff: { version: row.version },
    });
    revalidatePath("/admin/pricing");
    revalidatePath("/admin/quotes");
    return ok({ id: row.id });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Failed to publish");
  }
}
