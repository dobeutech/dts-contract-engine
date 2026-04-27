import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const {
  constructEvent,
  getStripe,
  createServiceClient,
  recordAudit,
  sendKickoffNotification,
} = vi.hoisted(() => {
  const constructEvent = vi.fn();
  return {
    constructEvent,
    getStripe: vi.fn(() => ({ webhooks: { constructEvent } })),
    createServiceClient: vi.fn(),
    recordAudit: vi.fn(),
    sendKickoffNotification: vi.fn(),
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

// Builds a chainable supabase service-client mock with stripe_events dedup
// and the quotes/clients tables wired up.
function makeSupabase(opts: {
  stripeEventsInsertResult?: { error: { code?: string } | null };
  quoteRow?: { project_name?: string; project_type?: string } | null;
  clientRow?: {
    company?: string;
    email?: string | null;
    contact_name?: string | null;
  } | null;
}) {
  const insertResult = opts.stripeEventsInsertResult ?? { error: null };

  const stripeEventsInsert = vi.fn().mockResolvedValue(insertResult);
  const stripeEventsUpdate = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  });
  const stripeEventsDelete = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  });

  const quoteUpdateEqEq = vi.fn().mockResolvedValue({ error: null });
  const quoteUpdateEq = vi.fn().mockReturnValue({ eq: quoteUpdateEqEq });
  const quoteUpdate = vi.fn().mockReturnValue({ eq: quoteUpdateEq });

  const quoteSelectEq = vi.fn().mockReturnValue({
    maybeSingle: vi.fn().mockResolvedValue({
      data: opts.quoteRow ?? null,
    }),
  });
  const quoteSelect = vi.fn().mockReturnValue({ eq: quoteSelectEq });

  const clientSelectEq = vi.fn().mockReturnValue({
    maybeSingle: vi.fn().mockResolvedValue({
      data: opts.clientRow ?? null,
    }),
  });
  const clientSelect = vi.fn().mockReturnValue({ eq: clientSelectEq });

  const from = vi.fn((table: string) => {
    if (table === "stripe_events") {
      return {
        insert: stripeEventsInsert,
        update: stripeEventsUpdate,
        delete: stripeEventsDelete,
      };
    }
    if (table === "quotes") return { update: quoteUpdate, select: quoteSelect };
    if (table === "clients") return { select: clientSelect };
    return {};
  });

  return { schema: vi.fn().mockReturnValue({ from }) };
}

describe("stripe webhook route", () => {
  const previousSecret = process.env.STRIPE_WEBHOOK_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  });

  it("returns 400 when signature config is missing", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const res = await POST(requestWithBody("{}"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when signature verification fails (no error leak)", async () => {
    constructEvent.mockImplementation(() => {
      throw new Error("invalid signature: secret mismatch on payload");
    });
    const res = await POST(requestWithBody("{}"));
    expect(res.status).toBe(400);
    const body = await res.json();
    // The library's error message should not be reflected back.
    expect(body.error).toBe("verification_failed");
    expect(JSON.stringify(body)).not.toContain("secret mismatch");
  });

  it("dedupes replayed events via dts.stripe_events unique violation", async () => {
    constructEvent.mockReturnValue({
      id: "evt_1",
      type: "checkout.session.completed",
      data: { object: {} },
    });
    createServiceClient.mockReturnValue(
      makeSupabase({ stripeEventsInsertResult: { error: { code: "23505" } } }),
    );

    const res = await POST(requestWithBody('{"id":"evt"}'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, deduped: true });
    expect(recordAudit).not.toHaveBeenCalled();
    expect(sendKickoffNotification).not.toHaveBeenCalled();
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
          payment_status: "paid",
          metadata: {
            quote_id: "quote_1",
            client_id: "client_1",
            kind: "dts.deposit",
          },
        },
      },
    });

    createServiceClient.mockReturnValue(
      makeSupabase({
        quoteRow: { project_name: "Portal Build", project_type: "web" },
        clientRow: {
          company: "Dobeu",
          email: "ops@example.com",
          contact_name: "Jeremy",
        },
      }),
    );

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
    createServiceClient.mockReturnValue(makeSupabase({}));
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
