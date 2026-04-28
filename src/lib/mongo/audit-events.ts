import "server-only";
import { getMongoDb, withTimeout } from "./client";
import type { AuditEventDoc } from "./types";

const COLLECTION = "audit_events";

// Bounds blocking on the webhook hot path when Mongo is slow/unreachable.
// Pairs with the 2s serverSelectionTimeoutMS in the client.
const FIRE_AND_FORGET_TIMEOUT_MS = 1_500;

export interface AppendAuditEventInput {
  actorId: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  diff?: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
}

// Fully detached audit write. Returns synchronously; the actual Mongo
// insert runs in the background with a bounded timeout for log noise.
// This is critical for the webhook hot path: we have ~14 recordAudit
// callsites across webhooks and admin actions, and `await`ing each
// would stack into a multi-second delay if Mongo is unreachable.
//
// Mirrors the previous Postgres-backed recordAudit() discipline:
// failures are logged, never thrown, must never block the user's
// primary action.
export function appendAuditEvent(input: AppendAuditEventInput): void {
  void withTimeout(_append(input), FIRE_AND_FORGET_TIMEOUT_MS, undefined);
}

async function _append(input: AppendAuditEventInput): Promise<void> {
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
