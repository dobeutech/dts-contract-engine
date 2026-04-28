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

  it("returns the pre-allocated _id and inserts with that id", async () => {
    mockDb();
    insertOne.mockResolvedValue({ insertedId: new ObjectId() });

    const result = await archiveWebhookPayload({
      provider: "stripe",
      headers: new Headers({ "content-type": "application/json" }),
      rawBody: '{"x":1}',
    });

    expect(result).toBeInstanceOf(ObjectId);
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

  it("redacts credential headers", async () => {
    mockDb();
    insertOne.mockResolvedValue({ insertedId: new ObjectId() });

    await archiveWebhookPayload({
      provider: "stripe",
      headers: new Headers({
        "stripe-signature": "t=123,v1=abc",
        authorization: "Bearer secret",
        cookie: "sb-access-token=...",
        "content-type": "application/json",
      }),
      rawBody: "{}",
    });

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

    await archiveWebhookPayload({
      provider: "adobe-sign",
      headers: {},
      rawBody: "<not json>",
    });

    const doc = insertOne.mock.calls[0][0] as { parsed_body: unknown };
    expect(doc.parsed_body).toBeNull();
  });

  it("still returns the pre-allocated id and logs when the insert throws", async () => {
    mockDb();
    insertOne.mockRejectedValue(new Error("mongo down"));

    const result = await archiveWebhookPayload({
      provider: "stripe",
      headers: {},
      rawBody: "{}",
    });

    // Even on failure we return the pre-allocated id so callers'
    // updateWebhookPayloadStatus calls remain best-effort no-ops rather
    // than being skipped entirely.
    expect(result).toBeInstanceOf(ObjectId);
    expect(consoleSpy).toHaveBeenCalled();
  });

  it("truncates oversized bodies and skips JSON parse", async () => {
    mockDb();
    insertOne.mockResolvedValue({ insertedId: new ObjectId() });

    const oversized = "x".repeat(1_048_577);
    await archiveWebhookPayload({
      provider: "stripe",
      headers: {},
      rawBody: oversized,
    });

    const doc = insertOne.mock.calls[0][0] as {
      raw_body: string;
      raw_body_truncated: boolean;
      parsed_body: unknown;
    };
    expect(doc.raw_body_truncated).toBe(true);
    expect(doc.raw_body.length).toBe(1_048_576);
    expect(doc.parsed_body).toBeNull();
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
    await updateWebhookPayloadStatus(null, { processingStatus: "processed" });
    expect(getMongoDb).not.toHaveBeenCalled();
  });

  it("translates camelCase patch to mongo $set", async () => {
    mockDb();
    updateOne.mockResolvedValue({ modifiedCount: 1 });
    const id = new ObjectId();

    await updateWebhookPayloadStatus(id, {
      signatureVerified: true,
      processingStatus: "processed",
      eventId: "evt_1",
    });

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
    await expect(
      updateWebhookPayloadStatus(new ObjectId(), {
        processingStatus: "failed",
      }),
    ).resolves.toBeUndefined();
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
