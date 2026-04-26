import Link from "next/link";
import { IntercomMessenger } from "@/components/intercom-messenger";

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-3" aria-label="dobeu">
            <span aria-hidden className="relative inline-block h-8 w-12">
              <span className="absolute left-0 top-0 h-8 w-8 rounded-full bg-[var(--brand-indigo-primary)] opacity-90" />
              <span className="absolute left-3 top-0 h-8 w-8 rounded-full bg-[var(--brand-indigo-deep)] opacity-90" />
              <span className="absolute left-4 top-2 h-4 w-4 rounded-full bg-[var(--brand-amber-warm)]" />
            </span>
            <span className="text-base font-bold tracking-tight">dobeu</span>
          </Link>
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            Quote portal
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-10">{children}</main>
      <IntercomMessenger appId={process.env.NEXT_PUBLIC_INTERCOM_APP_ID} />
      <footer className="mx-auto max-w-4xl px-6 py-10 text-xs text-muted-foreground">
        <p>
          Need help? Use the chat in the bottom right or email{" "}
          <a
            href="mailto:hello@dobeu.dev"
            className="text-[var(--brand-amber-warm)]"
          >
            hello@dobeu.dev
          </a>
          .
        </p>
      </footer>
    </div>
  );
}
