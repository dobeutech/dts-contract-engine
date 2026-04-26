"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { createDepositCheckoutAction } from "./actions";

export function DepositCheckoutButton({
  token,
  quoteId,
}: {
  token: string;
  quoteId: string;
}) {
  const [isPending, startTransition] = useTransition();

  function pay() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("token", token);
      fd.set("quoteId", quoteId);
      const result = await createDepositCheckoutAction(fd);
      if (result.ok) {
        window.location.href = result.data.url;
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Button onClick={pay} disabled={isPending}>
      {isPending ? "Redirecting…" : "Pay deposit with Stripe"}
    </Button>
  );
}
