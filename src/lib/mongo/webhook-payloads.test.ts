import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getMongoDb, insertOne, updateOne, find } = vi.hoisted(() => ({
  getMongoDb: vi.fn(),
  insertOne: vi.fn(),
  updateOne: vi.fn(),
  find: vi.fn(),
}));

vi.mock("./client", () => ({ getMongoDb }));

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

  it("inserts the raw body and returns the new id", async () => {
    mockDb();
    const id = new ObjectId();
    insertOne.mockResolvedValue({ insertedId: id });

    const result = await archiveWebhookPayload({
      provider: "stripe",
      headers: new Headers({ "content-type": "application/json" }),
      rawBody: '{"x":1}',
    });

    expect(result).toBe(id);
    expect(insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "stripe",
        raw_body: '{"x":1}',
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

  it("returns null and logs when the insert throws", async () => {
    mockDb();
    insertOne.mockRejectedValue(new Error("mongo down"));

    const result = await archiveWebhookPayload({
      provider: "stripe",
      headers: {},
      rawBody: "{}",
    });

    expect(result).toBeNull();
    expect(consoleSpy).toHaveBeenCalled();
  });
});

describe("updateWebhookPayloadStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
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

  it("swallows errors silently", async () => {
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
