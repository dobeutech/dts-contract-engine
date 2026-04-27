import "server-only";
import { getMongoDb } from "./client";
import type { AuditEventDoc } from "./types";

const COLLECTION = "audit_events";

export interface AppendAuditEventInput {
  actorId: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  diff?: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
}

// Fire-and-forget audit write. Mirrors the discipline of the previous
// Postgres-backed recordAudit() — failures are logged, never thrown,
// must never block the user's primary action.
export async function appendAuditEvent(
  input: AppendAuditEventInput,
): Promise<void> {
  try {
    const db = await getMongoDb();
    const now = new Date();
    const doc: Omit<AuditEventDoc, "_id"> = {
      actor_id: input.actorId,
      action: input.action,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      diff: input.diff ?? null,
      ip: input.ip ?? null,
      user_agent: input.userAgent ?? null,
      occurred_at: now,
      created_at: now,
    };
    await db
      .collection<Omit<AuditEventDoc, "_id">>(COLLECTION)
      .insertOne(doc);
  } catch (e) {
    console.error(
      "[mongo:audit_events] write failed",
      e instanceof Error ? e.message : e,
      input.action,
    );
  }
}
