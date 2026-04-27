import Link from "next/link";

// NOTE: Intercom is intentionally NOT mounted in the portal layout. The portal
// URL embeds a long-lived bearer token in its path; any third-party script
// that captures `window.location` (Intercom, analytics, etc.) ships that
// token to a third party and into conversation history.
//
// To re-enable: move the token out of the URL into an HTTP-only cookie set
// by a one-shot landing route, then redirect to a tokenless path. Until that
// refactor lands, support is via the email link in the footer.

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
      <footer className="mx-auto max-w-4xl px-6 py-10 text-xs text-muted-foreground">
        <p>
          Need help? Email{" "}
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
