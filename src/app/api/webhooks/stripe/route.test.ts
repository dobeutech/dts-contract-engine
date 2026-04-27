import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const {
  constructEvent,
  getStripe,
  createServiceClient,
  recordAudit,
  sendKickoffNotification,
  archiveWebhookPayload,
  updateWebhookPayloadStatus,
} = vi.hoisted(() => {
  const constructEvent = vi.fn();
  return {
    constructEvent,
    getStripe: vi.fn(() => ({ webhooks: { constructEvent } })),
    createServiceClient: vi.fn(),
    recordAudit: vi.fn(),
    sendKickoffNotification: vi.fn(),
    archiveWebhookPayload: vi.fn(),
    updateWebhookPayloadStatus: vi.fn(),
  };
});

vi.mock("@/lib/integrations/stripe", () => ({
  getStripe,
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient,
}));

vi.mock("@/lib/db/audit", () => ({
  recordAudit,
}));

vi.mock("@/lib/integrations/email", () => ({
  sendKickoffNotification,
}));

vi.mock("@/lib/mongo/webhook-payloads", () => ({
  archiveWebhookPayload,
  updateWebhookPayloadStatus,
}));

import { POST } from "./route";

function requestWithBody(body: string, signature = "sig"): Request {
  return new Request("https://example.com/api/webhooks/stripe", {
    method: "POST",
    headers: {
      "stripe-signature": signature,
      "content-type": "application/json",
    },
    body,
  });
}

describe("stripe webhook route", () => {
  const previousSecret = process.env.STRIPE_WEBHOOK_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    archiveWebhookPayload.mockResolvedValue("mock_archive_id");
    updateWebhookPayloadStatus.mockResolvedValue(undefined);
  });

  it("returns 400 when signature config is missing", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const res = await POST(requestWithBody("{}"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when signature verification fails", async () => {
    constructEvent.mockImplementation(() => {
      throw new Error("invalid signature");
    });
    const res = await POST(requestWithBody("{}"));
    expect(res.status).toBe(400);
    expect(archiveWebhookPayload).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "stripe", rawBody: "{}" }),
    );
    expect(updateWebhookPayloadStatus).toHaveBeenCalledWith(
      "mock_archive_id",
      expect.objectContaining({
        signatureVerified: false,
        processingStatus: "failed",
      }),
    );
  });

  it("still returns 200 when archive write fails", async () => {
    archiveWebhookPayload.mockResolvedValue(null);
    constructEvent.mockReturnValue({
      id: "evt_x",
      type: "ping",
      data: { object: {} },
    });
    const res = await POST(requestWithBody('{"id":"evt"}'));
    expect(res.status).toBe(200);
  });

  it("handles checkout.session.completed and notifies team", async () => {
    constructEvent.mockReturnValue({
      id: "evt_1",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_1",
          amount_total: 4200,
          payment_intent: "pi_1",
          metadata: {
            quote_id: "quote_1",
            client_id: "client_1",
          },
        },
      },
    });

    const quoteUpdateEq = vi.fn().mockResolvedValue({ error: null });
    const quoteUpdate = vi.fn().mockReturnValue({ eq: quoteUpdateEq });
    const quoteSelectEq = vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({
        data: { project_name: "Portal Build", project_type: "web" },
      }),
    });
    const quoteSelect = vi.fn().mockReturnValue({ eq: quoteSelectEq });

    const clientSelectEq = vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          company: "Dobeu",
          email: "ops@example.com",
          contact_name: "Jeremy",
        },
      }),
    });
    const clientSelect = vi.fn().mockReturnValue({ eq: clientSelectEq });

    const from = vi.fn((table: string) => {
      if (table === "quotes")
        return { update: quoteUpdate, select: quoteSelect };
      return { select: clientSelect };
    });
    const schema = vi.fn().mockReturnValue({ from });
    createServiceClient.mockReturnValue({ schema });

    const res = await POST(requestWithBody('{"id":"evt"}'));
    expect(res.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "stripe.deposit.paid" }),
    );
    expect(sendKickoffNotification).toHaveBeenCalledWith(
      expect.objectContaining({ amountPaidCents: 4200 }),
    );
  });

  it("records non-checkout events as generic audit logs", async () => {
    constructEvent.mockReturnValue({
      id: "evt_2",
      type: "invoice.payment_succeeded",
      data: { object: {} },
    });
    const res = await POST(requestWithBody('{"id":"evt"}'));
    expect(res.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "stripe.webhook.invoice.payment_succeeded",
      }),
    );
  });

  afterAll(() => {
    if (previousSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = previousSecret;
  });
});
