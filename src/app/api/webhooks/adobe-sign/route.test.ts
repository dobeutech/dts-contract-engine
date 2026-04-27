import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  verifyAdobeSignWebhook,
  downloadSignedPdf,
  createServiceClient,
  recordAudit,
  uploadSignedContract,
} = vi.hoisted(() => ({
  verifyAdobeSignWebhook: vi.fn(),
  downloadSignedPdf: vi.fn(),
  createServiceClient: vi.fn(),
  recordAudit: vi.fn(),
  uploadSignedContract: vi.fn(),
}));

vi.mock("@/lib/integrations/adobe-sign", () => ({
  verifyAdobeSignWebhook,
  downloadSignedPdf,
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient,
}));

vi.mock("@/lib/db/audit", () => ({
  recordAudit,
}));

vi.mock("@/lib/storage/contracts", () => ({
  uploadSignedContract,
}));

import { GET, POST } from "./route";

function makeReq(body: string, clientId = "client-id"): Request {
  return new Request("https://example.com/api/webhooks/adobe-sign", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-adobesign-clientid": clientId,
    },
    body,
  });
}

// Builds a chainable supabase service-client mock. Each schema().from() returns
// the table-specific mock; storage.from() is independent.
function makeSupabase(opts: {
  adobeEventsInsertResult?: { data?: unknown; error?: { code?: string } };
  contract?: { id: string; quote_id: string; signed_at: string | null } | null;
}) {
  const insertResult = opts.adobeEventsInsertResult ?? {
    data: { event_key: "k" },
    error: null,
  };

  const adobeEventsInsert = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue(insertResult),
    }),
  });
  const adobeEventsUpdate = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  });
  const adobeEventsDelete = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  });

  const contractsSelect = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({
        data: opts.contract === undefined ? null : opts.contract,
      }),
    }),
  });
  const contractsUpdate = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      is: vi.fn().mockResolvedValue({ error: null }),
    }),
  });

  const quotesUpdate = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }),
  });

  const from = vi.fn((table: string) => {
    if (table === "adobe_sign_events") {
      return {
        insert: adobeEventsInsert,
        update: adobeEventsUpdate,
        delete: adobeEventsDelete,
      };
    }
    if (table === "contracts") {
      return { select: contractsSelect, update: contractsUpdate };
    }
    if (table === "quotes") {
      return { update: quotesUpdate };
    }
    return {};
  });

  return {
    schema: vi.fn().mockReturnValue({ from }),
    storage: { from: vi.fn() },
  };
}

describe("adobe-sign webhook route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 for handshake GET without client id", async () => {
    const res = await GET(
      new Request("https://example.com/api/webhooks/adobe-sign", {
        method: "GET",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 401 with no header echo when verification fails", async () => {
    verifyAdobeSignWebhook.mockReturnValue({
      ok: false,
      reason: "client_id_mismatch",
    });
    const res = await POST(makeReq(JSON.stringify({ event: "unknown" })));
    expect(res.status).toBe(401);
    // Crucial: do not echo X-AdobeSign-ClientId on auth failure responses.
    expect(res.headers.get("x-adobesign-clientid")).toBeNull();
  });

  it("dedupes replayed events via dts.adobe_sign_events unique violation", async () => {
    verifyAdobeSignWebhook.mockReturnValue({ ok: true });
    const supabase = makeSupabase({
      adobeEventsInsertResult: {
        data: null,
        error: { code: "23505" },
      },
    });
    createServiceClient.mockReturnValue(supabase);

    const res = await POST(
      makeReq(
        JSON.stringify({
          event: "AGREEMENT_WORKFLOW_COMPLETED",
          agreement: { id: "agr_1" },
          occurredAt: "2026-04-26T20:00:00Z",
        }),
      ),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, deduped: true });
    expect(downloadSignedPdf).not.toHaveBeenCalled();
  });

  it("records unmatched agreement ids and returns success", async () => {
    verifyAdobeSignWebhook.mockReturnValue({ ok: true });
    const supabase = makeSupabase({ contract: null });
    createServiceClient.mockReturnValue(supabase);

    const res = await POST(
      makeReq(
        JSON.stringify({
          event: "AGREEMENT_WORKFLOW_COMPLETED",
          agreement: { id: "agr_1" },
        }),
      ),
    );

    expect(res.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "adobe_sign.webhook.unmatched",
        diff: { event: "AGREEMENT_WORKFLOW_COMPLETED", agreementId: "agr_1" },
      }),
    );
  });

  it("stores signed contract via uploadSignedContract (private storage)", async () => {
    verifyAdobeSignWebhook.mockReturnValue({ ok: true });
    downloadSignedPdf.mockResolvedValue(Buffer.from("pdf"));
    uploadSignedContract.mockResolvedValue({
      path: "contracts/contract_1/signed.pdf",
    });

    const supabase = makeSupabase({
      contract: { id: "contract_1", quote_id: "quote_1", signed_at: null },
    });
    createServiceClient.mockReturnValue(supabase);

    const res = await POST(
      makeReq(
        JSON.stringify({
          event: "AGREEMENT_WORKFLOW_COMPLETED",
          agreement: { id: "agr_1" },
        }),
      ),
    );

    expect(res.status).toBe(200);
    expect(downloadSignedPdf).toHaveBeenCalledWith("agr_1");
    expect(uploadSignedContract).toHaveBeenCalledWith(
      "contract_1",
      expect.any(Buffer),
    );
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "adobe_sign.webhook.signed" }),
    );
  });

  it("skips re-processing when contract already signed (idempotent)", async () => {
    verifyAdobeSignWebhook.mockReturnValue({ ok: true });
    const supabase = makeSupabase({
      contract: {
        id: "contract_1",
        quote_id: "quote_1",
        signed_at: "2026-04-26T19:00:00Z",
      },
    });
    createServiceClient.mockReturnValue(supabase);

    const res = await POST(
      makeReq(
        JSON.stringify({
          event: "AGREEMENT_WORKFLOW_COMPLETED",
          agreement: { id: "agr_1" },
        }),
      ),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.alreadySigned).toBe(true);
    expect(downloadSignedPdf).not.toHaveBeenCalled();
    expect(uploadSignedContract).not.toHaveBeenCalled();
  });
});
