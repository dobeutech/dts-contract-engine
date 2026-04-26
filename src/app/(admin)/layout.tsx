import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/clients", label: "Clients" },
  { href: "/admin/quotes", label: "Quotes" },
  { href: "/admin/pricing", label: "Pricing" },
];

export default async function AdminLayout({
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
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/admin" className="flex items-center gap-3">
            <span aria-hidden className="relative inline-block h-8 w-12">
              <span className="absolute left-0 top-0 h-8 w-8 rounded-full bg-[var(--brand-indigo-primary)] opacity-90" />
              <span className="absolute left-3 top-0 h-8 w-8 rounded-full bg-[var(--brand-indigo-deep)] opacity-90" />
              <span className="absolute left-4 top-2 h-4 w-4 rounded-full bg-[var(--brand-amber-warm)]" />
            </span>
            <span className="text-base font-bold tracking-tight">
              dobeu contracts
            </span>
          </Link>
          <nav className="flex items-center gap-6 text-sm">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                {n.label}
              </Link>
            ))}
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Sign out
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
    </div>
  );
}
