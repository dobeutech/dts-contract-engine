import type { ObjectId } from "mongodb";

export type WebhookProvider = "stripe" | "adobe-sign";

export type WebhookProcessingStatus =
  | "received"
  | "verified"
  | "processed"
  | "failed";

export interface WebhookPayloadDoc {
  _id: ObjectId;
  provider: WebhookProvider;
  received_at: Date;
  event_id: string | null;
  headers: Record<string, string>;
  raw_body: string;
  parsed_body: unknown | null;
  signature_verified: boolean | null;
  processing_status: WebhookProcessingStatus;
  processing_error: string | null;
  created_at: Date;
  updated_at: Date;
}

// Mirrors columns of dts.audit_log (supabase/migrations/0001_init.sql:185-195)
// so recordAudit() is a literal field-rename swap.
export interface AuditEventDoc {
  _id: ObjectId;
  actor_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  diff: Record<string, unknown> | null;
  ip: string | null;
  user_agent: string | null;
  occurred_at: Date;
  created_at: Date;
}
