const REQUIRED_PRODUCTION_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ADOBE_SIGN_BASE_URI",
  "ADOBE_SIGN_INTEGRATION_KEY",
  "ADOBE_SIGN_WEBHOOK_CLIENT_ID",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_INTERCOM_APP_ID",
  "INTERCOM_ACCESS_TOKEN",
  "CLIENT_PORTAL_JWT_SECRET",
  "RESEND_API_KEY",
  "MONGODB_URI",
  "INTERNAL_API_BEARER_TOKEN",
] as const;

function normalize(value: string | undefined): string {
  return (value ?? "").trim();
}

export function validateStartupEnv(): void {
  if (process.env.NODE_ENV !== "production") return;

  const missing = REQUIRED_PRODUCTION_ENV.filter(
    (name) => normalize(process.env[name]).length === 0,
  );

  if (missing.length > 0) {
    throw new Error(
      `Missing required production environment variables: ${missing.join(", ")}`,
    );
  }
}
