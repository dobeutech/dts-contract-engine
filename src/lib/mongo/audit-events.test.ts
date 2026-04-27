import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getMongoDb, insertOne } = vi.hoisted(() => ({
  getMongoDb: vi.fn(),
  insertOne: vi.fn(),
}));

vi.mock("./client", () => ({ getMongoDb }));

import { appendAuditEvent } from "./audit-events";

function mockDb() {
  const collection = vi.fn().mockReturnValue({ insertOne });
  getMongoDb.mockResolvedValue({ collection });
  return collection;
}

describe("appendAuditEvent", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("inserts a doc with the expected shape", async () => {
    const collection = mockDb();
    insertOne.mockResolvedValue({ insertedId: "x" });

    await appendAuditEvent({
      actorId: "user_1",
      action: "stripe.deposit.paid",
      entityType: "quote",
      entityId: "quote_1",
      diff: { amount: 4200 },
    });

    expect(collection).toHaveBeenCalledWith("audit_events");
    expect(insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_id: "user_1",
        action: "stripe.deposit.paid",
        entity_type: "quote",
        entity_id: "quote_1",
        diff: { amount: 4200 },
        ip: null,
        user_agent: null,
      }),
    );
  });

  it("never throws when the write fails", async () => {
    mockDb();
    insertOne.mockRejectedValue(new Error("conn refused"));

    await expect(
      appendAuditEvent({ actorId: null, action: "noop" }),
    ).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalled();
  });
});
