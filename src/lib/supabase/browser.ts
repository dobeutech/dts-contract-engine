import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client. Use only inside `'use client'` components.
// Same schema rule applies: every project-table query must add `.schema('dts')`.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
