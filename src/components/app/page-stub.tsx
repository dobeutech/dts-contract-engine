interface PageStubProps {
  eyebrow: string;
  title: string;
  description: string;
}

// Used while a route is scaffolded but not yet implemented. Keeps the
// app shell navigable end-to-end without committing the unbuilt UI.
export function PageStub({ eyebrow, title, description }: PageStubProps) {
  return (
    <div className="mx-auto max-w-[1400px] px-6 py-12">
      <div className="rounded-[20px] border border-border bg-card p-10 shadow-sm">
        <div className="eyebrow mb-2">{eyebrow}</div>
        <h1 className="mb-3 text-[28px] font-extrabold leading-tight tracking-tight">
          {title}
        </h1>
        <p className="max-w-prose text-sm text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}
