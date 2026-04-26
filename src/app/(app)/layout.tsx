import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/app/app-header";
import { Toaster } from "@/components/ui/sonner";

// All routes under (app) inherit the auth gate from middleware.ts plus
// this server-side check (defense in depth). The header renders the
// signed-in user's email; the sign-out POST routes via /auth/signout.

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <AppHeader userEmail={user.email ?? null} />
      <main className="flex-1">{children}</main>
      <Toaster richColors />
    </div>
  );
}
