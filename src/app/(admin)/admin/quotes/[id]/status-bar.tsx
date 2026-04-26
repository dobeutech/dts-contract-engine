"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { transitionQuoteAction } from "../actions";

interface Props {
  quoteId: string;
  status: string;
  portalUrl: string | null;
  clientHasToken: boolean;
}

export function QuoteStatusBar({
  quoteId,
  status,
  portalUrl,
  clientHasToken,
}: Props) {
  const [isPending, startTransition] = useTransition();

  function transition(next: "sent" | "lost" | "void") {
    if (next === "void" && !confirm("Void this quote? This cannot be undone."))
      return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", quoteId);
      fd.set("status", next);
      const result = await transitionQuoteAction(fd);
      if (result.ok) toast.success(`Marked ${next}.`);
      else toast.error(result.error);
    });
  }

  function copy() {
    if (!portalUrl) return;
    const full = `${window.location.origin}${portalUrl}`;
    navigator.clipboard.writeText(full);
    toast.success("Share link copied.");
  }

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div className="text-sm text-muted-foreground">
          {status === "draft" ? (
            "Draft. Save and send when ready."
          ) : status === "sent" ? (
            "Sent. Awaiting client acceptance."
          ) : (
            <>Status: {status}</>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {portalUrl ? (
            <Button size="sm" variant="outline" onClick={copy}>
              Copy share link
            </Button>
          ) : null}
          {!clientHasToken ? (
            <span className="text-xs text-muted-foreground">
              Generate a portal token on the client to share.
            </span>
          ) : null}
          {status === "draft" ? (
            <Button
              size="sm"
              onClick={() => transition("sent")}
              disabled={isPending}
            >
              Mark sent
            </Button>
          ) : null}
          {status !== "void" && status !== "lost" ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => transition("lost")}
              disabled={isPending}
            >
              Mark lost
            </Button>
          ) : null}
          {status !== "void" ? (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => transition("void")}
              disabled={isPending}
            >
              Void
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
