import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

const BUCKET = "contracts";

// Default signed-URL TTL for portal renders. Short enough that a leaked URL
// expires before it propagates far; long enough for a normal page session.
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export async function uploadSignedContract(
  contractId: string,
  pdf: Buffer,
): Promise<{ path: string }> {
  const supabase = createServiceClient();
  const path = `contracts/${contractId}/signed.pdf`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, pdf, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (error) throw new Error(`storage_upload_failed: ${error.message}`);
  return { path };
}

// Returns a short-lived signed URL for a contract object. Callers must have
// already authorized the request (server actions on token-validated portal
// pages). NEVER expose this from a public route or include it in plain-text
// emails — emails should link back to the portal instead.
export async function getSignedContractUrl(
  path: string,
  ttlSeconds: number = SIGNED_URL_TTL_SECONDS,
): Promise<string | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, ttlSeconds);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
