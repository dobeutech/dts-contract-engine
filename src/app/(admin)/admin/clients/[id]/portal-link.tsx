"use client";

import { useState, useEffect, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/actions/result";

interface Props {
  clientId: string;
  token: string | null;
  rotateAction: (
    formData: FormData,
  ) => Promise<ActionResult<{ token: string }>>;
}

export function ClientPortalLink({ clientId, token, rotateAction }: Props) {
  const [current, setCurrent] = useState(token);
  const [isPending, startTransition] = useTransition();

  const [origin, setOrigin] = useState("");

  // Compute origin client-side only to avoid SSR/hydration mismatch.
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const url = current && origin ? `${origin}/portal/${current}` : null;

  function copy() {
    if (!url) return;
    navigator.clipboard.writeText(url);
    toast.success("Copied to clipboard.");
  }

  function rotate() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", clientId);
      const result = await rotateAction(fd);
      if (result.ok) {
        setCurrent(result.data.token);
        toast.success("New token issued.");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="space-y-3">
      {url ? (
        <code className="block break-all rounded-md bg-[var(--brand-code-bg-dark)] p-2 text-xs">
          {url}
        </code>
      ) : (
        <p className="text-sm text-muted-foreground">
          No portal token yet. Generate one to share a quote link.
        </p>
      )}
      <div className="flex gap-2">
        {url ? (
          <Button size="sm" variant="outline" onClick={copy}>
            Copy
          </Button>
        ) : null}
        <Button size="sm" onClick={rotate} disabled={isPending}>
          {isPending ? "Rotating…" : current ? "Rotate" : "Generate"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Rotating immediately invalidates the previous link.
      </p>
    </div>
  );
}
