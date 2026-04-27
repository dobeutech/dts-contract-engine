import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Minimal Adobe Acrobat Sign REST API v6 client.
// Auth model: integration key (long-lived) passed as `Bearer` to api.<region>.adobesign.com.
// We support the typical "send for signing with redirect" + webhook flow.
//
// NOTE: Adobe Sign requires the *base URL* to come from the account. Use the
// returned base URI from /baseUris when an integration key is first issued and
// store it in env. We expose ADOBE_SIGN_BASE_URI for that.

const ENDPOINT_TIMEOUT_MS = 20_000;

export interface AdobeSignAgreementCreated {
  agreementId: string;
  signingUrl: string | null; // null if signing is by email only
}

interface CreateAgreementArgs {
  pdf: Buffer;
  pdfFileName: string;
  agreementName: string;
  signerEmail: string;
  signerName?: string;
  redirectUrl: string; // post-signing return URL
  webhookEnabled: boolean;
}

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env ${name}`);
  return value;
}

async function adobeFetch(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const baseUri = env("ADOBE_SIGN_BASE_URI").replace(/\/$/, "");
  const token = env("ADOBE_SIGN_INTEGRATION_KEY");
  const ctrl = new AbortController();
  const timer = setTimeout(
    () => ctrl.abort(),
    init.timeoutMs ?? ENDPOINT_TIMEOUT_MS,
  );
  try {
    const res = await fetch(`${baseUri}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.headers ?? {}),
      },
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// Step 1: upload the PDF as a transient document.
async function uploadTransientDocument(
  pdf: Buffer,
  fileName: string,
): Promise<string> {
  const form = new FormData();
  form.append(
    "File",
    new Blob([new Uint8Array(pdf)], { type: "application/pdf" }),
    fileName,
  );
  form.append("File-Name", fileName);
  form.append("Mime-Type", "application/pdf");

  const res = await adobeFetch("/api/rest/v6/transientDocuments", {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    throw new Error(
      `adobe_sign.transient_upload_failed: ${res.status} ${await res.text()}`,
    );
  }
  const json = (await res.json()) as { transientDocumentId: string };
  return json.transientDocumentId;
}

// Step 2: create the agreement with EMAIL signature flow + redirect.
export async function createAgreement(
  args: CreateAgreementArgs,
): Promise<AdobeSignAgreementCreated> {
  const transientId = await uploadTransientDocument(args.pdf, args.pdfFileName);

  const body = {
    fileInfos: [{ transientDocumentId: transientId }],
    name: args.agreementName,
    participantSetsInfo: [
      {
        memberInfos: [{ email: args.signerEmail, name: args.signerName }],
        order: 1,
        role: "SIGNER",
      },
    ],
    signatureType: "ESIGN",
    state: "IN_PROCESS",
    postSignOption: { redirectUrl: args.redirectUrl, redirectDelay: 0 },
  };

  const res = await adobeFetch("/api/rest/v6/agreements", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(
      `adobe_sign.create_agreement_failed: ${res.status} ${await res.text()}`,
    );
  }
  const json = (await res.json()) as { id: string };

  // Get signing URL for embedded redirect (optional — falls back to email).
  let signingUrl: string | null = null;
  try {
    const sUrl = await adobeFetch(
      `/api/rest/v6/agreements/${json.id}/signingUrls`,
    );
    if (sUrl.ok) {
      const sJson = (await sUrl.json()) as {
        signingUrlSetInfos?: Array<{
          signingUrls?: Array<{ esignUrl?: string }>;
        }>;
      };
      signingUrl =
        sJson.signingUrlSetInfos?.[0]?.signingUrls?.[0]?.esignUrl ?? null;
    }
  } catch {
    // signingUrls is not always immediately available — that's fine, the
    // signer will receive an email.
  }

  return { agreementId: json.id, signingUrl };
}

// Fetch the current signing URL for an existing agreement (e.g. when the
// client clicks "sign" a second time and we already have a contract row).
export async function getSigningUrlForAgreement(
  agreementId: string,
): Promise<string | null> {
  const sUrl = await adobeFetch(
    `/api/rest/v6/agreements/${agreementId}/signingUrls`,
  );
  if (!sUrl.ok) return null;
  const sJson = (await sUrl.json()) as {
    signingUrlSetInfos?: Array<{
      signingUrls?: Array<{ esignUrl?: string }>;
    }>;
  };
  return sJson.signingUrlSetInfos?.[0]?.signingUrls?.[0]?.esignUrl ?? null;
}

// Download the signed PDF after webhook fires AGREEMENT_WORKFLOW_COMPLETED.
export async function downloadSignedPdf(agreementId: string): Promise<Buffer> {
  const res = await adobeFetch(
    `/api/rest/v6/agreements/${agreementId}/combinedDocument`,
  );
  if (!res.ok) {
    throw new Error(
      `adobe_sign.download_failed: ${res.status} ${await res.text()}`,
    );
  }
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

// Constant-time string equality. Returns false on length mismatch or empty
// inputs without ever short-circuiting on prefix.
function constantTimeEquals(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const A = Buffer.from(a, "utf8");
  const B = Buffer.from(b, "utf8");
  if (A.length !== B.length) return false;
  return timingSafeEqual(A, B);
}

// Verify Adobe Sign webhook authenticity. Adobe Sign sends three signatures:
//
//   X-AdobeSign-ClientId             — static client id (registration handshake)
//   X-AdobeSign-ClientSecret-Sha256  — HMAC-SHA256(rawBody, clientSecret)
//   X-AdobeSign-AccountSecret-Sha256 — HMAC-SHA256(rawBody, accountSecret)
//
// We require client-id match AND, when ADOBE_SIGN_WEBHOOK_CLIENT_SECRET is
// set, a valid HMAC against the raw body. The HMAC is what binds the request
// payload to the secret — without it, an attacker who learns the (static)
// client id can replay or forge events.
export function verifyAdobeSignWebhook(args: {
  clientIdHeader: string | null;
  hmacHeader: string | null;
  rawBody: string;
}): { ok: boolean; reason?: string } {
  const expectedClientId = process.env.ADOBE_SIGN_WEBHOOK_CLIENT_ID;
  if (!expectedClientId)
    return { ok: false, reason: "no_client_id_configured" };
  if (!constantTimeEquals(args.clientIdHeader, expectedClientId)) {
    return { ok: false, reason: "client_id_mismatch" };
  }
  const expectedSecret = process.env.ADOBE_SIGN_WEBHOOK_CLIENT_SECRET;
  if (expectedSecret) {
    if (!args.hmacHeader) return { ok: false, reason: "missing_hmac" };
    const computed = createHmac("sha256", expectedSecret)
      .update(args.rawBody, "utf8")
      .digest("base64");
    if (!constantTimeEquals(args.hmacHeader, computed)) {
      return { ok: false, reason: "hmac_mismatch" };
    }
  }
  return { ok: true };
}

// Backwards-compatible thin wrapper. Prefer verifyAdobeSignWebhook above.
export function verifyWebhookClientId(headerValue: string | null): boolean {
  return verifyAdobeSignWebhook({
    clientIdHeader: headerValue,
    hmacHeader: null,
    rawBody: "",
  }).ok;
}
