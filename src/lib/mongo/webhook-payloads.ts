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

export interface ArchiveInput {
  provider: WebhookProvider;
  headers: Headers | Record<string, string>;
  rawBody: string;
  eventId?: string | null;
  signatureVerified?: boolean | null;
  processingStatus?: WebhookProcessingStatus;
}

// Insert the raw payload before any processing. Fire-and-forget: never
// throws into the webhook hot path. Returns the inserted _id, or null if
// the write failed — callers can use the id to update status later, but
// must tolerate null.
export async function archiveWebhookPayload(
  input: ArchiveInput,
): Promise<ObjectId | null> {
  return withTimeout(_archive(input), FIRE_AND_FORGET_TIMEOUT_MS, null);
}

async function _archive(input: ArchiveInput): Promise<ObjectId | null> {
  try {
    const db = await getMongoDb();
    const now = new Date();
    const doc: Omit<WebhookPayloadDoc, "_id"> = {
      provider: input.provider,
      received_at: now,
      event_id: input.eventId ?? null,
      headers: redactHeaders(input.headers),
      raw_body: input.rawBody,
      parsed_body: safeParseJson(input.rawBody),
      signature_verified: input.signatureVerified ?? null,
      processing_status: input.processingStatus ?? "received",
      processing_error: null,
      created_at: now,
      updated_at: now,
    };
    const res = await db.collection<Omit<WebhookPayloadDoc, "_id">>(COLLECTION).insertOne(doc);
    return res.insertedId;
  } catch (e) {
    console.error(
      "[mongo:webhook_payloads] archive failed",
      e instanceof Error ? e.message : e,
      input.provider,
    );
    return null;
  }
}

export interface UpdateStatusInput {
  signatureVerified?: boolean | null;
  processingStatus?: WebhookProcessingStatus;
  processingError?: string | null;
  eventId?: string | null;
}

export async function updateWebhookPayloadStatus(
  id: ObjectId | null,
  patch: UpdateStatusInput,
): Promise<void> {
  if (!id) return;
  await withTimeout(
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
