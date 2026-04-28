import "server-only";
import { appendAuditEvent } from "@/lib/mongo/audit-events";

export interface AuditEvent {
  actorId: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  diff?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

// Append-only audit write. Routed to MongoDB (collection: audit_events)
// because the table is write-only in app code and Mongo is the
// cost-preferred store. Failures are logged but never rethrown — the
// user's primary action must not depend on audit succeeding.
//
// The Promise<void> signature is preserved for backward compatibility
// with the ~14 existing `await recordAudit(...)` call sites, but the
// actual Mongo write is detached: this function resolves on the next
// microtask and never blocks on the database. Hot paths (webhooks,
// server actions) cannot stall on a slow or unreachable Mongo.
//
// Known seam: supabase/migrations/0002_publish_pricing_config_rpc.sql
// still INSERTs into the legacy Postgres dts.audit_log table from the
// publish_pricing_config() RPC. New writes from app code go to Mongo;
// reconcile later.
export async function recordAudit(event: AuditEvent): Promise<void> {
  appendAuditEvent({
    actorId: event.actorId,
    action: event.action,
    entityType: event.entityType ?? null,
    entityId: event.entityId ?? null,
    diff: event.diff ?? null,
    ip: event.ip ?? null,
    userAgent: event.userAgent ?? null,
  });
}
