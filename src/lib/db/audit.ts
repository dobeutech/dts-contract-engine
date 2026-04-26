import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

export interface AuditEvent {
  actorId: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  diff?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

// Write an audit row using the service-role client. Failures are logged but
// never rethrown — they must not block the user's primary action.
export async function recordAudit(event: AuditEvent): Promise<void> {
  try {
    const supabase = createServiceClient();
    const { error } = await supabase
      .schema("dts")
      .from("audit_log")
      .insert({
        actor_id: event.actorId,
        action: event.action,
        entity_type: event.entityType ?? null,
        entity_id: event.entityId ?? null,
        diff: event.diff ?? null,
        ip: event.ip ?? null,
        user_agent: event.userAgent ?? null,
      });
    if (error) {
      console.error("[audit] write failed", error.message, event.action);
    }
  } catch (e) {
    console.error("[audit] threw", e instanceof Error ? e.message : e);
  }
}
