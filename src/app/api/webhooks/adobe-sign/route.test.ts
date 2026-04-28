import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  verifyWebhookClientId,
  downloadSignedPdf,
  createServiceClient,
  recordAudit,
  archiveWebhookPayload,
  updateWebhookPayloadStatus,
} = vi.hoisted(() => ({
  verifyWebhookClientId: vi.fn(),
  downloadSignedPdf: vi.fn(),
  createServiceClient: vi.fn(),
  recordAudit: vi.fn(),
  archiveWebhookPayload: vi.fn(),
  updateWebhookPayloadStatus: vi.fn(),
}));

vi.mock("@/lib/integrations/adobe-sign", () => ({
  verifyWebhookClientId,
  downloadSignedPdf,
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient,
}));

vi.mock("@/lib/db/audit", () => ({
  recordAudit,
}));

vi.mock("@/lib/mongo/webhook-payloads", () => ({
  archiveWebhookPayload,
  updateWebhookPayloadStatus,
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

describe("adobe-sign webhook route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    archiveWebhookPayload.mockResolvedValue("mock_archive_id");
    updateWebhookPayloadStatus.mockResolvedValue(undefined);
  });

  it("returns 400 for handshake GET without client id", async () => {
    const res = await GET(
      new Request("https://example.com/api/webhooks/adobe-sign", {
        method: "GET",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 401 when webhook client id validation fails", async () => {
    verifyWebhookClientId.mockReturnValue(false);
    const res = await POST(makeReq(JSON.stringify({ event: "unknown" })));
    expect(res.status).toBe(401);
    expect(archiveWebhookPayload).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "adobe-sign" }),
    );
    expect(updateWebhookPayloadStatus).toHaveBeenCalledWith(
      "mock_archive_id",
      expect.objectContaining({
        signatureVerified: false,
        processingStatus: "failed",
      }),
    );
  });

  it("records unmatched agreement ids and returns success", async () => {
    verifyWebhookClientId.mockReturnValue(true);
    const eq = vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
    });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const schema = vi.fn().mockReturnValue({ from });
    createServiceClient.mockReturnValue({ schema });

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

  it("stores signed contract PDF and updates quote status", async () => {
    verifyWebhookClientId.mockReturnValue(true);
    downloadSignedPdf.mockResolvedValue(Buffer.from("pdf"));

    const contractEq = vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: "contract_1", quote_id: "quote_1" },
      }),
    });
    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq: updateEq });
    const from = vi.fn((table: string) => {
      if (table === "contracts") {
        return {
          select: vi.fn().mockReturnValue({ eq: contractEq }),
          update,
        };
      }
      return { update };
    });
    const schema = vi.fn().mockReturnValue({ from });
    const storageFrom = vi.fn().mockReturnValue({
      upload: vi.fn().mockResolvedValue({ error: null }),
      getPublicUrl: vi.fn().mockReturnValue({
        data: { publicUrl: "https://cdn.example.com/contracts/1/signed.pdf" },
      }),
    });
    createServiceClient.mockReturnValue({
      schema,
      storage: { from: storageFrom },
    });

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
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "adobe_sign.webhook.signed" }),
    );
  });
});
