import "server-only";
import { MongoClient, type Db } from "mongodb";

// Singleton MongoClient. Reuses the same TCP pool across requests in
// production and survives Next.js HMR in development by stashing the
// promise on globalThis. Mirrors the discipline of
// src/lib/supabase/service.ts — one factory, no client-side import.
//
// IMPORTANT: the native mongodb driver is Node-only. Do not import this
// module from any route that pins `runtime = 'edge'`. Edge callers
// should fetch the internal Node-runtime API at
// /api/internal/webhook-payloads or call the Supabase Edge Function at
// supabase/functions/webhook-payloads-read.

const DEFAULT_DB_NAME = "dts_contract_engine";

interface MongoGlobal {
  promise: Promise<MongoClient> | undefined;
  indexesEnsured: boolean;
}

const globalForMongo = globalThis as unknown as { __dtsMongo?: MongoGlobal };

function state(): MongoGlobal {
  if (!globalForMongo.__dtsMongo) {
    globalForMongo.__dtsMongo = { promise: undefined, indexesEnsured: false };
  }
  return globalForMongo.__dtsMongo;
}

function connect(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set");
  }
  const client = new MongoClient(uri, {
    appName: "dts-contract-engine",
    // Keep the pool small; webhooks and audit writes are bursty but low qps.
    maxPoolSize: 10,
    minPoolSize: 0,
    serverSelectionTimeoutMS: 5_000,
  });
  return client.connect();
}

export async function getMongoClient(): Promise<MongoClient> {
  const s = state();
  if (!s.promise) {
    s.promise = connect().catch((err) => {
      // Reset so the next call retries instead of returning a poisoned promise.
      s.promise = undefined;
      throw err;
    });
  }
  return s.promise;
}

function dbName(): string {
  return process.env.MONGODB_DB_NAME?.trim() || DEFAULT_DB_NAME;
}

export async function getMongoDb(): Promise<Db> {
  const client = await getMongoClient();
  const db = client.db(dbName());
  await ensureIndexes(db);
  return db;
}

async function ensureIndexes(db: Db): Promise<void> {
  const s = state();
  if (s.indexesEnsured) return;
  // Mark before attempting so a persistent failure (e.g. IndexOptionsConflict
  // from a TTL spec mismatch on an existing index) does not retry on every
  // request. Mongo's createIndex is idempotent for matching specs, so the
  // first successful attempt is the only one that matters; if the attempt
  // fails, an operator should investigate via the logged error rather than
  // letting the hot path tight-loop.
  s.indexesEnsured = true;
  try {
    await Promise.all([
      db
        .collection("webhook_payloads")
        .createIndex({ provider: 1, received_at: -1 }),
      db
        .collection("webhook_payloads")
        .createIndex({ event_id: 1 }, { sparse: true }),
      db.collection("webhook_payloads").createIndex(
        { received_at: 1 },
        // 90-day TTL bounds storage; tune via env later if needed.
        { expireAfterSeconds: 60 * 60 * 24 * 90 },
      ),
      db
        .collection("audit_events")
        .createIndex({ entity_type: 1, entity_id: 1, occurred_at: -1 }),
      db
        .collection("audit_events")
        .createIndex({ action: 1, occurred_at: -1 }),
    ]);
  } catch (e) {
    console.error(
      "[mongo] index ensure failed (will not retry until process restart)",
      e instanceof Error ? e.message : e,
    );
  }
}
