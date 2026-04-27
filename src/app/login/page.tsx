import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "./login-form";
import { BrandMark } from "@/components/app/brand-mark";

export default async function LoginPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/");

  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          <BrandMark size={48} />
          <div>
            <h1 className="text-[28px] font-extrabold leading-tight tracking-tight">
              Dobeu Tech Solutions
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Quote &amp; contract engine — sign in to continue
            </p>
          </div>
        </div>
        <div className="rounded-[20px] border border-border bg-card p-6 shadow-sm">
          <LoginForm />
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Internal tool. Access by invitation only.
        </p>
      </div>
    </main>
  );
}
