import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// OAuth code-exchange endpoint. Supabase redirects providers (Google, etc.)
// back here with `?code=...`; we exchange it for a session and forward to the
// originally-requested route or to `/admin`.
//
// `next` is allow-listed to a small set of known-safe path prefixes — defends
// against open redirects via tampered query strings AND against landing
// authenticated users on attacker-controlled routes (e.g. /portal/<theirs>).

const ALLOWED_NEXT_PREFIXES = ["/admin", "/"];

function pickSafeNext(next: string | null, origin: string): string {
  if (!next) return "/admin";
  // Reject anything that doesn't start with a single forward slash, contains
  // a backslash (some browsers normalize), or that resolves to a different
  // origin when interpreted as a relative URL.
  if (
    !next.startsWith("/") ||
    next.startsWith("//") ||
    /[\\\r\n\t]/.test(next)
  ) {
    return "/admin";
  }
  try {
    const resolved = new URL(next, origin);
    if (resolved.origin !== origin) return "/admin";
  } catch {
    return "/admin";
  }
  // Allow-list specific path prefixes only.
  const matchesAllowed = ALLOWED_NEXT_PREFIXES.some(
    (prefix) =>
      next === prefix ||
      next.startsWith(prefix + "/") ||
      next.startsWith(prefix + "?"),
  );
  return matchesAllowed ? next : "/admin";
}

// Map raw provider error messages to a fixed set so the login page never
// reflects attacker-shaped strings into the rendered alert.
function classifyAuthError(message: string | undefined): string {
  if (!message) return "oauth_failed";
  const lower = message.toLowerCase();
  if (lower.includes("expired")) return "code_expired";
  if (lower.includes("invalid")) return "invalid_code";
  if (lower.includes("denied") || lower.includes("cancel"))
    return "user_cancelled";
  return "oauth_failed";
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");
  const safeNext = pickSafeNext(next, origin);

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${classifyAuthError(error.message)}`,
    );
  }

  return NextResponse.redirect(`${origin}${safeNext}`);
}
