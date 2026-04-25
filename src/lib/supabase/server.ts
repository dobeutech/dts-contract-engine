import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Server-side Supabase client. Reads/writes the auth cookie via Next's
// cookies() API. Use this in Server Components, Server Actions, and
// route handlers.
//
// IMPORTANT: every project-table query must add `.schema('dts')`.
// We do NOT set db.schema globally here because auth flows hit the
// `auth.*` schema and would break.
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll is called from a Server Component — safe to ignore;
            // the middleware will refresh the session on the next request.
          }
        },
      },
    },
  );
}
