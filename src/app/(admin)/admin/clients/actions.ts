"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ok, fail, type ActionResult } from "@/lib/actions/result";
import { ClientInput } from "@/lib/validation/schemas";
import { requireUser } from "@/lib/auth/current-user";
import { recordAudit } from "@/lib/db/audit";
import {
  createClientRow,
  rotatePortalToken,
  softDeleteClient,
  updateClientRow,
} from "@/lib/db/clients";

function fromForm(formData: FormData) {
  return {
    company: String(formData.get("company") ?? ""),
    contact_name: String(formData.get("contact_name") ?? ""),
    email: String(formData.get("email") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    address: String(formData.get("address") ?? ""),
    notes: String(formData.get("notes") ?? ""),
    relationship_tag: String(formData.get("relationship_tag") ?? "standard"),
  };
}

export async function createClientAction(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  let user;
  try {
    user = await requireUser();
  } catch {
    return fail("Sign in required.", "unauthorized");
  }

  const parsed = ClientInput.safeParse(fromForm(formData));
  if (!parsed.success) {
    return fail(
      "Validation failed",
      "validation_failed",
      parsed.error.flatten().fieldErrors as Record<string, string[]>,
    );
  }

  try {
    const row = await createClientRow(parsed.data);
    await recordAudit({
      actorId: user.id,
      action: "client.create",
      entityType: "client",
      entityId: row.id,
      diff: { company: row.company },
    });
    revalidatePath("/admin/clients");
    return ok({ id: row.id });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Failed to create client");
  }
}

export async function updateClientAction(
  id: string,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  let user;
  try {
    user = await requireUser();
  } catch {
    return fail("Sign in required.", "unauthorized");
  }

  const parsed = ClientInput.safeParse(fromForm(formData));
  if (!parsed.success) {
    return fail(
      "Validation failed",
      "validation_failed",
      parsed.error.flatten().fieldErrors as Record<string, string[]>,
    );
  }

  try {
    const row = await updateClientRow(id, parsed.data);
    await recordAudit({
      actorId: user.id,
      action: "client.update",
      entityType: "client",
      entityId: row.id,
    });
    revalidatePath("/admin/clients");
    revalidatePath(`/admin/clients/${id}`);
    return ok({ id: row.id });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Failed to update client");
  }
}

export async function deleteClientAction(
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
    await softDeleteClient(id);
    await recordAudit({
      actorId: user.id,
      action: "client.soft_delete",
      entityType: "client",
      entityId: id,
    });
    revalidatePath("/admin/clients");
    return ok(null);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Failed to delete");
  }
}

export async function rotateTokenAction(
  formData: FormData,
): Promise<ActionResult<{ token: string }>> {
  const id = String(formData.get("id") ?? "");
  if (!id) return fail("Missing id", "validation_failed");

  let user;
  try {
    user = await requireUser();
  } catch {
    return fail("Sign in required.", "unauthorized");
  }

  try {
    const token = await rotatePortalToken(id);
    await recordAudit({
      actorId: user.id,
      action: "client.portal_token.rotate",
      entityType: "client",
      entityId: id,
    });
    revalidatePath(`/admin/clients/${id}`);
    return ok({ token });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Failed to rotate");
  }
}

// Convenience action used by the new-client form
export async function createClientAndRedirect(formData: FormData) {
  const result = await createClientAction(formData);
  if (result.ok) redirect(`/admin/clients/${result.data.id}`);
  return result;
}
