import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getMongoDb, insertOne } = vi.hoisted(() => ({
  getMongoDb: vi.fn(),
  insertOne: vi.fn(),
}));

vi.mock("./client", () => ({
  getMongoDb,
  withTimeout: <T>(p: Promise<T>) => p,
}));

// appendAuditEvent is detached (sync return; insert in background) so
// the ~14 recordAudit callsites can't stall on Mongo. Tests asserting
// on the underlying insertOne must drain microtasks first.
const flushMicrotasks = () =>
  new Promise<void>((resolve) => setImmediate(resolve));

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

    appendAuditEvent({
      actorId: "user_1",
      action: "stripe.deposit.paid",
      entityType: "quote",
      entityId: "quote_1",
      diff: { amount: 4200 },
    });
    await flushMicrotasks();

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

  it("returns synchronously even when the underlying insert hangs", () => {
    mockDb();
    insertOne.mockReturnValue(new Promise(() => {}));

    const before = Date.now();
    appendAuditEvent({ actorId: null, action: "stripe.webhook.foo" });
    const elapsed = Date.now() - before;

    // Sync return is the contract. Generous bound for CI noise.
    expect(elapsed).toBeLessThan(50);
  });

  it("does not throw when the write fails", async () => {
    mockDb();
    insertOne.mockRejectedValue(new Error("conn refused"));

    expect(() =>
      appendAuditEvent({ actorId: null, action: "noop" }),
    ).not.toThrow();
    await flushMicrotasks();
    expect(consoleSpy).toHaveBeenCalled();
  });
});
