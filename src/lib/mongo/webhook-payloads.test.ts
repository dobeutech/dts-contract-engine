import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getMongoDb, insertOne, updateOne, find } = vi.hoisted(() => ({
  getMongoDb: vi.fn(),
  insertOne: vi.fn(),
  updateOne: vi.fn(),
  find: vi.fn(),
}));

// withTimeout is passed-through in tests so mocked promises run synchronously.
vi.mock("./client", () => ({
  getMongoDb,
  withTimeout: <T>(p: Promise<T>) => p,
}));

// archiveWebhookPayload / updateWebhookPayloadStatus are intentionally
// detached (fire-and-forget) — the public function returns synchronously
// while the Mongo insert/update runs in the background. Tests that
// assert on the underlying insertOne/updateOne must drain microtasks
// before checking. setImmediate runs after the microtask queue.
const flushMicrotasks = () =>
  new Promise<void>((resolve) => setImmediate(resolve));

import { ObjectId } from "mongodb";
import {
  archiveWebhookPayload,
  findWebhookPayloads,
  updateWebhookPayloadStatus,
} from "./webhook-payloads";

function mockDb() {
  const collection = vi.fn().mockReturnValue({
    insertOne,
    updateOne,
    find,
  });
  getMongoDb.mockResolvedValue({ collection });
  return collection;
}

describe("archiveWebhookPayload", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("returns the pre-allocated _id synchronously and inserts with that id", async () => {
    mockDb();
    insertOne.mockResolvedValue({ insertedId: new ObjectId() });

    const result = archiveWebhookPayload({
      provider: "stripe",
      headers: new Headers({ "content-type": "application/json" }),
      rawBody: '{"x":1}',
    });
    // Synchronous return is the contract: the webhook hot path must not
    // wait on Mongo. Background insert continues after the function
    // returns.
    expect(result).toBeInstanceOf(ObjectId);

    await flushMicrotasks();

    const doc = insertOne.mock.calls[0][0] as { _id: ObjectId };
    // The id passed to the insert must equal the id returned to the caller —
    // that's how status updates can target docs even if the insert is slow.
    expect(doc._id.equals(result)).toBe(true);
    expect(insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "stripe",
        raw_body: '{"x":1}',
        raw_body_truncated: false,
        parsed_body: { x: 1 },
        processing_status: "received",
        signature_verified: null,
      }),
    );
  });

  it("returns immediately even when the underlying insert hangs", async () => {
    mockDb();
    // Insert never resolves — but archiveWebhookPayload must not wait.
    insertOne.mockReturnValue(new Promise(() => {}));

    const before = Date.now();
    const result = archiveWebhookPayload({
      provider: "stripe",
      headers: {},
      rawBody: "{}",
    });
    const elapsed = Date.now() - before;

    expect(result).toBeInstanceOf(ObjectId);
    // Sync return: should be sub-millisecond. Generous bound for CI noise.
    expect(elapsed).toBeLessThan(50);
  });

  it("redacts credential headers", async () => {
    mockDb();
    insertOne.mockResolvedValue({ insertedId: new ObjectId() });

    archiveWebhookPayload({
      provider: "stripe",
      headers: new Headers({
        "stripe-signature": "t=123,v1=abc",
        authorization: "Bearer secret",
        cookie: "sb-access-token=...",
        "content-type": "application/json",
      }),
      rawBody: "{}",
    });
    await flushMicrotasks();

    const doc = insertOne.mock.calls[0][0] as {
      headers: Record<string, string>;
    };
    expect(doc.headers).not.toHaveProperty("stripe-signature");
    expect(doc.headers).not.toHaveProperty("authorization");
    expect(doc.headers).not.toHaveProperty("cookie");
    expect(doc.headers).toHaveProperty("content-type", "application/json");
  });

  it("stores parsed_body as null on invalid JSON", async () => {
    mockDb();
    insertOne.mockResolvedValue({ insertedId: new ObjectId() });

    archiveWebhookPayload({
      provider: "adobe-sign",
      headers: {},
      rawBody: "<not json>",
    });
    await flushMicrotasks();

    const doc = insertOne.mock.calls[0][0] as { parsed_body: unknown };
    expect(doc.parsed_body).toBeNull();
  });

  it("still returns the pre-allocated id and logs when the insert throws", async () => {
    mockDb();
    insertOne.mockRejectedValue(new Error("mongo down"));

    const result = archiveWebhookPayload({
      provider: "stripe",
      headers: {},
      rawBody: "{}",
    });
    await flushMicrotasks();

    // Even on failure we return the pre-allocated id so callers'
    // updateWebhookPayloadStatus calls remain best-effort no-ops rather
    // than being skipped entirely.
    expect(result).toBeInstanceOf(ObjectId);
    expect(consoleSpy).toHaveBeenCalled();
  });

  it("truncates oversized ASCII bodies and skips JSON parse", async () => {
    mockDb();
    insertOne.mockResolvedValue({ insertedId: new ObjectId() });

    const oversized = "x".repeat(1_048_577);
    archiveWebhookPayload({
      provider: "stripe",
      headers: {},
      rawBody: oversized,
    });
    await flushMicrotasks();

    const doc = insertOne.mock.calls[0][0] as {
      raw_body: string;
      raw_body_truncated: boolean;
      parsed_body: unknown;
    };
    expect(doc.raw_body_truncated).toBe(true);
    expect(Buffer.byteLength(doc.raw_body, "utf8")).toBeLessThanOrEqual(
      1_048_576,
    );
    expect(doc.parsed_body).toBeNull();
  });

  it("truncates by bytes, not chars, for multi-byte payloads", async () => {
    mockDb();
    insertOne.mockResolvedValue({ insertedId: new ObjectId() });

    // 4 bytes/char × 300_000 chars = 1.2 MiB raw — character-slice would
    // happily return all 300_000 chars and bust the cap.
    const fire = "🔥".repeat(300_000);
    archiveWebhookPayload({
      provider: "stripe",
      headers: {},
      rawBody: fire,
    });
    await flushMicrotasks();

    const doc = insertOne.mock.calls[0][0] as {
      raw_body: string;
      raw_body_truncated: boolean;
    };
    expect(doc.raw_body_truncated).toBe(true);
    expect(Buffer.byteLength(doc.raw_body, "utf8")).toBeLessThanOrEqual(
      1_048_576,
    );
  });
});

describe("updateWebhookPayloadStatus", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("does nothing when id is null", async () => {
    updateWebhookPayloadStatus(null, { processingStatus: "processed" });
    await flushMicrotasks();
    expect(getMongoDb).not.toHaveBeenCalled();
  });

  it("translates camelCase patch to mongo $set", async () => {
    mockDb();
    updateOne.mockResolvedValue({ modifiedCount: 1 });
    const id = new ObjectId();

    updateWebhookPayloadStatus(id, {
      signatureVerified: true,
      processingStatus: "processed",
      eventId: "evt_1",
    });
    await flushMicrotasks();

    expect(updateOne).toHaveBeenCalledWith(
      { _id: id },
      {
        $set: expect.objectContaining({
          signature_verified: true,
          processing_status: "processed",
          event_id: "evt_1",
        }),
      },
    );
  });

  it("does not throw when the update fails", async () => {
    mockDb();
    updateOne.mockRejectedValue(new Error("nope"));
    expect(() =>
      updateWebhookPayloadStatus(new ObjectId(), {
        processingStatus: "failed",
      }),
    ).not.toThrow();
    await flushMicrotasks();
  });
});

describe("findWebhookPayloads", () => {
  beforeEach(() => vi.clearAllMocks());

  it("clamps the limit and applies filters", async () => {
    mockDb();
    const toArray = vi.fn().mockResolvedValue([]);
    const limit = vi.fn().mockReturnValue({ toArray });
    const sort = vi.fn().mockReturnValue({ limit });
    find.mockReturnValue({ sort });

    await findWebhookPayloads({
      provider: "stripe",
      eventId: "evt_1",
      limit: 9999,
    });

    expect(find).toHaveBeenCalledWith({
      provider: "stripe",
      event_id: "evt_1",
    });
    expect(sort).toHaveBeenCalledWith({ received_at: -1 });
    expect(limit).toHaveBeenCalledWith(200);
  });
});
