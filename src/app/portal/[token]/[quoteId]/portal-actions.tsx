"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { startSigningAction } from "./actions";

interface Props {
  token: string;
  quoteId: string;
  canMoveForward: boolean;
}

declare global {
  interface Window {
    Intercom?: (...args: unknown[]) => void;
  }
}

export function PortalActions({ token, quoteId, canMoveForward }: Props) {
  const [isPending, startTransition] = useTransition();

  function moveForward() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("token", token);
      fd.set("quoteId", quoteId);
      const result = await startSigningAction(fd);
      if (result.ok) {
        window.location.href = result.data.signingUrl;
      } else {
        toast.error(result.error);
      }
    });
  }

  function askQuestion() {
    if (
      typeof window !== "undefined" &&
      typeof window.Intercom === "function"
    ) {
      window.Intercom(
        "showNewMessage",
        `Hi — I have a question about my dobeu quote (${quoteId.slice(0, 8)}).`,
      );
    } else {
      window.location.href = `mailto:hello@dobeu.dev?subject=Question about my dobeu quote ${quoteId.slice(0, 8)}`;
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button onClick={moveForward} disabled={!canMoveForward || isPending}>
        {isPending ? "Preparing…" : "Move forward"}
      </Button>
      <Button variant="outline" onClick={askQuestion}>
        Ask a question
      </Button>
      {!canMoveForward ? (
        <span className="text-xs text-muted-foreground">
          This quote is already in progress.
        </span>
      ) : null}
    </div>
  );
}
