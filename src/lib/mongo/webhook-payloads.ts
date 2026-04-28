import "server-only";
import { ObjectId, type Filter } from "mongodb";
import { getMongoDb, withTimeout } from "./client";
import type {
  WebhookPayloadDoc,
  WebhookProcessingStatus,
  WebhookProvider,
} from "./types";

// Cap on how long a fire-and-forget write may block the webhook hot
// path. Pairs with the 2s serverSelectionTimeoutMS in the client.
const FIRE_AND_FORGET_TIMEOUT_MS = 1_500;

// Hard cap on persisted body size. The /api/webhooks/* namespace is
// public, so without a cap an attacker could send oversized bodies and
// drive Mongo storage/egress (TTL doesn't prevent the spike). 1 MiB is
// well above any legitimate Stripe / Adobe Sign event.
const MAX_RAW_BODY_BYTES = 1_048_576;

// Headers we never persist — credentials or signatures whose value once
// verified is dead weight at best, attacker bait at worst.
const REDACTED_HEADER_PREFIXES = [
  "authorization",
  "cookie",
  "stripe-signature",
  "x-adobesign-clientid",
  "x-adobesign-signature",
];

const COLLECTION = "webhook_payloads";

function redactHeaders(input: Headers | Record<string, string>): Record<
  string,
  string
> {
  const out: Record<string, string> = {};
  const entries =
    input instanceof Headers ? Array.from(input.entries()) : Object.entries(input);
  for (const [key, value] of entries) {
    const lower = key.toLowerCase();
    if (REDACTED_HEADER_PREFIXES.some((p) => lower === p || lower.startsWith(p))) {
      continue;
    }
    out[lower] = value;
  }
  return out;
}

function safeParseJson(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function maybeTruncate(raw: string): { body: string; truncated: boolean } {
  const buf = Buffer.from(raw, "utf8");
  if (buf.byteLength <= MAX_RAW_BODY_BYTES) {
    return { body: raw, truncated: false };
  }
  // Byte-safe truncation: a character slice would let multi-byte content
  // (e.g. emoji at 4 B/char) blow well past the cap. toString("utf8")
  // substitutes a replacement char for any partial code point at the
  // boundary, which is fine for forensic storage.
  return {
    body: buf.subarray(0, MAX_RAW_BODY_BYTES).toString("utf8"),
    truncated: true,
  };
}

export interface ArchiveInput {
  provider: WebhookProvider;
  headers: Headers | Record<string, string>;
  rawBody: string;
  eventId?: string | null;
  signatureVerified?: boolean | null;
  processingStatus?: WebhookProcessingStatus;
}

// Insert the raw payload before any processing. Fully fire-and-forget:
// the caller does not block on Mongo at all. The actual write runs in
// the background with a bounded timeout for log noise; even when Mongo
// is fully unreachable, the webhook hot path returns instantly.
//
// The _id is allocated on the client side and returned synchronously,
// even if the insert is still in flight or fails. That means subsequent
// updateWebhookPayloadStatus() calls always have a valid target — if
// the insert eventually lands (slow connect, transient outage), the
// status updates find the doc; if the insert never lands, the updates
// are no-ops via updateOne's natural no-match behavior.
export function archiveWebhookPayload(input: ArchiveInput): ObjectId {
  const id = new ObjectId();
  void withTimeout(_archive(input, id), FIRE_AND_FORGET_TIMEOUT_MS, undefined);
  return id;
}

async function _archive(input: ArchiveInput, id: ObjectId): Promise<void> {
  try {
    const db = await getMongoDb();
    const now = new Date();
    const { body, truncated } = maybeTruncate(input.rawBody);
    const doc: WebhookPayloadDoc = {
      _id: id,
      provider: input.provider,
      received_at: now,
      event_id: input.eventId ?? null,
      headers: redactHeaders(input.headers),
      raw_body: body,
      raw_body_truncated: truncated,
      // Skip JSON.parse on truncated payloads — the slice almost certainly
      // breaks the structure and we'd produce a misleading parsed_body.
      parsed_body: truncated ? null : safeParseJson(body),
      signature_verified: input.signatureVerified ?? null,
      processing_status: input.processingStatus ?? "received",
      processing_error: null,
      created_at: now,
      updated_at: now,
    };
    await db.collection<WebhookPayloadDoc>(COLLECTION).insertOne(doc);
  } catch (e) {
    console.error(
      "[mongo:webhook_payloads] archive failed",
      e instanceof Error ? e.message : e,
      input.provider,
    );
  }
}

export interface UpdateStatusInput {
  signatureVerified?: boolean | null;
  processingStatus?: WebhookProcessingStatus;
  processingError?: string | null;
  eventId?: string | null;
}

export function updateWebhookPayloadStatus(
  id: ObjectId | null,
  patch: UpdateStatusInput,
): void {
  if (!id) return;
  void withTimeout(
    _updateStatus(id, patch),
    FIRE_AND_FORGET_TIMEOUT_MS,
    undefined,
  );
}

async function _updateStatus(
  id: ObjectId,
  patch: UpdateStatusInput,
): Promise<void> {
  try {
    const db = await getMongoDb();
    const update: Record<string, unknown> = { updated_at: new Date() };
    if (patch.signatureVerified !== undefined) {
      update.signature_verified = patch.signatureVerified;
    }
    if (patch.processingStatus !== undefined) {
      update.processing_status = patch.processingStatus;
    }
    if (patch.processingError !== undefined) {
      update.processing_error = patch.processingError;
    }
    if (patch.eventId !== undefined) {
      update.event_id = patch.eventId;
    }
    await db.collection(COLLECTION).updateOne({ _id: id }, { $set: update });
  } catch (e) {
    console.error(
      "[mongo:webhook_payloads] update failed",
      e instanceof Error ? e.message : e,
    );
  }
}

export interface FindWebhookPayloadsArgs {
  provider?: WebhookProvider;
  eventId?: string;
  since?: Date;
  limit?: number;
}

export async function findWebhookPayloads(
  args: FindWebhookPayloadsArgs,
): Promise<WebhookPayloadDoc[]> {
  const db = await getMongoDb();
  const filter: Filter<WebhookPayloadDoc> = {};
  if (args.provider) filter.provider = args.provider;
  if (args.eventId) filter.event_id = args.eventId;
  if (args.since) filter.received_at = { $gte: args.since };
  // Defense-in-depth: if a non-finite value (e.g., NaN from parseInt)
  // sneaks past the route's validation, fall back to the default
  // rather than passing NaN to the driver.
  const requestedLimit =
    typeof args.limit === "number" && Number.isFinite(args.limit)
      ? args.limit
      : 25;
  const limit = Math.min(Math.max(requestedLimit, 1), 200);
  const docs = await db
    .collection<WebhookPayloadDoc>(COLLECTION)
    .find(filter)
    .sort({ received_at: -1 })
    .limit(limit)
    .toArray();
  return docs;
}
