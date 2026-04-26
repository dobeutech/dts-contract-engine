"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { BrandMark } from "./brand-mark";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/quotes/new", label: "New quote", match: /^\/quotes\/new/ },
  { href: "/quotes", label: "Saved quotes", match: /^\/quotes(\/[^n][^/]*)?$/ },
  { href: "/clients", label: "Clients", match: /^\/clients/ },
  {
    href: "/admin/pricing",
    label: "Pricing config",
    match: /^\/admin\/pricing/,
  },
] as const;

interface AppHeaderProps {
  userEmail: string | null;
}

export function AppHeader({ userEmail }: AppHeaderProps) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-6">
        <Link
          href="/quotes/new"
          className="flex items-center gap-3 outline-none focus-visible:ring-3 focus-visible:ring-ring rounded-md"
        >
          <BrandMark size={28} />
          <div className="leading-tight">
            <div className="text-[17px] font-extrabold tracking-tight text-foreground">
              Dobeu Tech Solutions
            </div>
            <div className="eyebrow mt-0.5">Quote &amp; contract engine</div>
          </div>
        </Link>

        <nav className="flex items-center gap-1" aria-label="Primary">
          {NAV_ITEMS.map((item) => {
            const isActive = item.match.test(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-md px-3 py-2 text-sm font-semibold transition-colors",
                  isActive
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
                )}
                aria-current={isActive ? "page" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          {userEmail && (
            <span
              className="hidden text-xs text-muted-foreground md:inline tabular"
              title={userEmail}
            >
              {userEmail}
            </span>
          )}
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-semibold text-foreground transition-colors hover:bg-secondary focus-visible:ring-3 focus-visible:ring-ring outline-none"
              aria-label="Sign out"
            >
              <LogOut className="size-3.5" aria-hidden="true" />
              Sign out
            </button>
          </form>
        </div>
      </div>
      <div className="brand-hairline h-px" aria-hidden="true" />
    </header>
  );
}
