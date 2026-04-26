"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ok, fail, type ActionResult } from "@/lib/actions/result";
import { QuoteInput, type QuoteInputT } from "@/lib/validation/schemas";
import { requireUser } from "@/lib/auth/current-user";
import { recordAudit } from "@/lib/db/audit";
import { calculate } from "@/lib/pricing/engine";
import { getActivePricingConfig } from "@/lib/db/pricing-config";
import {
  createQuoteDraft,
  softDeleteQuote,
  transitionQuoteStatus,
  updateQuoteDraft,
} from "@/lib/db/quotes";
import type { CalcResult, QuoteStatus } from "@/lib/pricing/types";

function calcOrNull(
  input: QuoteInputT,
  configJson: unknown,
): CalcResult | null {
  try {
    return calculate(
      {
        projectType: input.project_type,
        tier: input.tier ?? undefined,
        scope: input.scope,
        multipliers: input.multipliers,
        term: input.term,
        customConsulting: input.custom_consulting ?? undefined,
      },
      configJson as never,
    );
  } catch {
    return null;
  }
}

export async function createQuoteAction(
  input: QuoteInputT,
): Promise<ActionResult<{ id: string }>> {
  let user;
  try {
    user = await requireUser();
  } catch {
    return fail("Sign in required.", "unauthorized");
  }

  const parsed = QuoteInput.safeParse(input);
  if (!parsed.success) {
    return fail(
      "Validation failed",
      "validation_failed",
      parsed.error.flatten().fieldErrors as Record<string, string[]>,
    );
  }

  const active = await getActivePricingConfig();
  if (!active)
    return fail("No active pricing config. Publish one first.", "conflict");

  const calc = calcOrNull(parsed.data, active.config);
  if (!calc) return fail("Pricing calculation failed.", "internal_error");

  try {
    const row = await createQuoteDraft(parsed.data, active.id, calc);
    await recordAudit({
      actorId: user.id,
      action: "quote.draft.create",
      entityType: "quote",
      entityId: row.id,
      diff: {
        client_id: row.client_id,
        first_month_cents: calc.firstMonthTotalCents,
      },
    });
    revalidatePath("/admin/quotes");
    return ok({ id: row.id });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Failed to create quote");
  }
}

export async function updateQuoteAction(
  id: string,
  input: QuoteInputT,
): Promise<ActionResult<{ id: string }>> {
  let user;
  try {
    user = await requireUser();
  } catch {
    return fail("Sign in required.", "unauthorized");
  }

  const parsed = QuoteInput.safeParse(input);
  if (!parsed.success) {
    return fail(
      "Validation failed",
      "validation_failed",
      parsed.error.flatten().fieldErrors as Record<string, string[]>,
    );
  }

  const active = await getActivePricingConfig();
  if (!active) return fail("No active pricing config.", "conflict");

  const calc = calcOrNull(parsed.data, active.config);
  if (!calc) return fail("Pricing calculation failed.", "internal_error");

  try {
    const row = await updateQuoteDraft(id, parsed.data, calc);
    await recordAudit({
      actorId: user.id,
      action: "quote.draft.update",
      entityType: "quote",
      entityId: row.id,
    });
    revalidatePath(`/admin/quotes/${id}`);
    return ok({ id: row.id });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Failed to update quote");
  }
}

export async function transitionQuoteAction(
  formData: FormData,
): Promise<ActionResult<null>> {
  const id = String(formData.get("id") ?? "");
  const next = String(formData.get("status") ?? "") as QuoteStatus;
  if (!id || !next) return fail("Missing id/status", "validation_failed");

  let user;
  try {
    user = await requireUser();
  } catch {
    return fail("Sign in required.", "unauthorized");
  }

  const allowed: QuoteStatus[] = ["sent", "lost", "void"];
  if (!allowed.includes(next)) {
    return fail(
      "Status transition not allowed from admin.",
      "validation_failed",
    );
  }

  try {
    const row = await transitionQuoteStatus(id, next);
    await recordAudit({
      actorId: user.id,
      action: `quote.status.${next}`,
      entityType: "quote",
      entityId: row.id,
      diff: { status: next },
    });
    revalidatePath(`/admin/quotes/${id}`);
    revalidatePath("/admin/quotes");
    return ok(null);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Failed to update status");
  }
}

export async function deleteQuoteAction(
  formData: FormData,
): Promise<ActionResult<null>> {
  const id = String(formData.get("id") ?? "");
  if (!id) return fail("Missing id", "validation_failed");

  let user;
  try {
    user = await requireUser();
  } catch {
    return fail("Sign in required.", "unauthorized");
  }

  try {
    await softDeleteQuote(id);
    await recordAudit({
      actorId: user.id,
      action: "quote.soft_delete",
      entityType: "quote",
      entityId: id,
    });
    revalidatePath("/admin/quotes");
    return ok(null);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Failed to delete");
  }
}

export async function createQuoteAndRedirect(input: QuoteInputT) {
  const result = await createQuoteAction(input);
  if (result.ok) redirect(`/admin/quotes/${result.data.id}`);
  return result;
}
