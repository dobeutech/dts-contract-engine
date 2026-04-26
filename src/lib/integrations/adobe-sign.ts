import "server-only";

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

// Verify Adobe Sign webhook by checking the X-AdobeSign-ClientId header.
// Adobe Sign uses a static client id (from your integration registration) as
// the webhook authenticity check, plus an HMAC for advanced setups. We support
// the simple client-id check by default and fall back to compare-and-store.
export function verifyWebhookClientId(headerValue: string | null): boolean {
  const expected = process.env.ADOBE_SIGN_WEBHOOK_CLIENT_ID;
  if (!expected) return false;
  return !!headerValue && headerValue === expected;
}
