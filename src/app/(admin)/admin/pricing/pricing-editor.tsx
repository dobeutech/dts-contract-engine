"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { saveDraftAction, publishConfigAction } from "./actions";

interface HistoryRow {
  id: string;
  version: number;
  is_active: boolean;
  created_at: string;
}

interface Props {
  seedJson: string;
  activeId: string | null;
  history: HistoryRow[];
}

export function PricingEditor({ seedJson, activeId, history }: Props) {
  const [json, setJson] = useState(seedJson);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function validateJson(value: string) {
    setJson(value);
    try {
      JSON.parse(value);
      setParseError(null);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Invalid JSON");
    }
  }

  function onSaveDraft() {
    if (parseError) {
      toast.error("Fix JSON errors first.");
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.append("configJson", json);
      const result = await saveDraftAction(fd);
      if (result.ok) {
        toast.success(`Draft saved as v${result.data.version}`);
      } else {
        toast.error(result.error);
      }
    });
  }

  function onPublish(id: string) {
    startTransition(async () => {
      const fd = new FormData();
      fd.append("id", id);
      const result = await publishConfigAction(fd);
      if (result.ok) {
        toast.success("Published.");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Pricing config (JSON)</CardTitle>
        </CardHeader>
        <CardContent>
          <textarea
            value={json}
            onChange={(e) => validateJson(e.target.value)}
            rows={28}
            spellCheck={false}
            className="w-full rounded-md border border-border bg-[var(--brand-code-bg-dark)] p-3 font-mono text-xs text-foreground"
          />
          {parseError ? (
            <p className="mt-2 text-sm text-[color:var(--semantic-error)]">
              {parseError}
            </p>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              Saving creates a new draft version. Publishing flips the active
              flag atomically via the publish_pricing_config RPC.
            </p>
          )}
          <div className="mt-4 flex gap-3">
            <Button onClick={onSaveDraft} disabled={isPending || !!parseError}>
              {isPending ? "Saving…" : "Save as new draft"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Versions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No versions yet. Save your first draft to seed v1.
            </p>
          ) : (
            history.map((h) => (
              <div
                key={h.id}
                className="flex items-center justify-between rounded-md border border-border p-3"
              >
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    v{h.version}
                    {h.is_active ? <Badge>active</Badge> : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(h.created_at).toLocaleString()}
                  </p>
                </div>
                {!h.is_active ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onPublish(h.id)}
                    disabled={isPending}
                  >
                    Publish
                  </Button>
                ) : null}
              </div>
            ))
          )}
          <p className="pt-3 text-xs text-muted-foreground">
            Active id: <code className="font-mono">{activeId ?? "none"}</code>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
