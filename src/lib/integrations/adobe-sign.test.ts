import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { vi } from "vitest";

vi.mock("server-only", () => ({}));

import { verifyAdobeSignWebhook } from "./adobe-sign";

const originalEnv = { ...process.env };

describe("verifyAdobeSignWebhook", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("rejects when client-id env is missing", () => {
    process.env = {} as NodeJS.ProcessEnv;
    expect(
      verifyAdobeSignWebhook({
        clientIdHeader: "client-id",
        hmacHeader: null,
        rawBody: "{}",
      }),
    ).toEqual({ ok: false, reason: "no_client_id_configured" });
  });

  it("rejects when client-id header mismatches", () => {
    process.env = {
      ADOBE_SIGN_WEBHOOK_CLIENT_ID: "expected-client-id",
    } as NodeJS.ProcessEnv;
    expect(
      verifyAdobeSignWebhook({
        clientIdHeader: "wrong",
        hmacHeader: null,
        rawBody: "{}",
      }),
    ).toEqual({ ok: false, reason: "client_id_mismatch" });
  });

  it("rejects when secret exists but hmac header is missing", () => {
    process.env = {
      ADOBE_SIGN_WEBHOOK_CLIENT_ID: "expected-client-id",
      ADOBE_SIGN_WEBHOOK_CLIENT_SECRET: "secret",
    } as NodeJS.ProcessEnv;
    expect(
      verifyAdobeSignWebhook({
        clientIdHeader: "expected-client-id",
        hmacHeader: null,
        rawBody: '{"event":"AGREEMENT_WORKFLOW_COMPLETED"}',
      }),
    ).toEqual({ ok: false, reason: "missing_hmac" });
  });

  it("rejects when hmac does not match raw body", () => {
    process.env = {
      ADOBE_SIGN_WEBHOOK_CLIENT_ID: "expected-client-id",
      ADOBE_SIGN_WEBHOOK_CLIENT_SECRET: "secret",
    } as NodeJS.ProcessEnv;
    expect(
      verifyAdobeSignWebhook({
        clientIdHeader: "expected-client-id",
        hmacHeader: "bad-signature",
        rawBody: '{"event":"AGREEMENT_WORKFLOW_COMPLETED"}',
      }),
    ).toEqual({ ok: false, reason: "hmac_mismatch" });
  });

  it("accepts when client-id and hmac are valid", () => {
    const rawBody = '{"event":"AGREEMENT_WORKFLOW_COMPLETED"}';
    const secret = "secret";
    const hmacHeader = createHmac("sha256", secret)
      .update(rawBody, "utf8")
      .digest("base64");

    process.env = {
      ADOBE_SIGN_WEBHOOK_CLIENT_ID: "expected-client-id",
      ADOBE_SIGN_WEBHOOK_CLIENT_SECRET: secret,
    } as NodeJS.ProcessEnv;

    expect(
      verifyAdobeSignWebhook({
        clientIdHeader: "expected-client-id",
        hmacHeader,
        rawBody,
      }),
    ).toEqual({ ok: true });
  });
});
