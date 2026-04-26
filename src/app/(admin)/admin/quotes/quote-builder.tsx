"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { calculate, formatCents } from "@/lib/pricing/engine";
import type { PricingConfig, ProjectType, Term } from "@/lib/pricing/types";
import type { ActionResult } from "@/lib/actions/result";
import type { ClientRow, QuoteRow } from "@/lib/db/types";
import type { QuoteInputT } from "@/lib/validation/schemas";

interface Props {
  config: PricingConfig;
  clients: ClientRow[];
  initialClientId?: string;
  existing?: QuoteRow;
  onSave: (input: QuoteInputT) => Promise<ActionResult<{ id: string }>>;
  saveLabel: string;
}

type ScopeSelection = Record<string, { enabled: boolean; qty?: number }>;

export function QuoteBuilder({
  config,
  clients,
  initialClientId,
  existing,
  onSave,
  saveLabel,
}: Props) {
  const [clientId, setClientId] = useState(
    existing?.client_id ?? initialClientId ?? "",
  );
  const [projectName, setProjectName] = useState(existing?.project_name ?? "");
  const [projectType, setProjectType] = useState<ProjectType>(
    existing?.project_type ?? "marketing",
  );
  const [tier, setTier] = useState<string>(existing?.tier ?? "growth");
  const [term, setTerm] = useState<Term>(existing?.term ?? "monthly");
  const [setupSel, setSetupSel] = useState<ScopeSelection>(
    existing?.scope.setup ?? {},
  );
  const [recurringSel, setRecurringSel] = useState<ScopeSelection>(
    existing?.scope.recurring ?? {},
  );
  const [oneTimeSel, setOneTimeSel] = useState<ScopeSelection>(
    existing?.scope.oneTime ?? {},
  );
  const [websiteSel, setWebsiteSel] = useState<ScopeSelection>(
    existing?.scope.website ?? {},
  );
  const [rush, setRush] = useState(existing?.multipliers.rush ?? 0);
  const [highTouch, setHighTouch] = useState(
    existing?.multipliers.highTouch ?? 0,
  );
  const [familyCourtesy, setFamilyCourtesy] = useState(
    existing?.multipliers.familyCourtesy ?? 0,
  );
  const [consultingHours, setConsultingHours] = useState(
    existing?.custom_consulting?.hours ?? 10,
  );
  const [consultingRate, setConsultingRate] = useState(
    (existing?.custom_consulting?.rateCents ?? 25000) / 100,
  );
  const [consultingDesc, setConsultingDesc] = useState(
    existing?.custom_consulting?.description ?? "",
  );
  const [internalNotes, setInternalNotes] = useState(
    existing?.internal_notes ?? "",
  );

  const [isPending, startTransition] = useTransition();

  const calc = useMemo(() => {
    if (!clientId) return null;
    try {
      return calculate(
        {
          projectType,
          tier: projectType === "marketing" ? tier : undefined,
          scope: {
            setup: setupSel,
            recurring: recurringSel,
            oneTime: oneTimeSel,
            website: websiteSel,
          },
          multipliers: { rush, highTouch, familyCourtesy },
          term,
          customConsulting:
            projectType === "consulting"
              ? {
                  hours: consultingHours,
                  rateCents: Math.round(consultingRate * 100),
                  description: consultingDesc,
                }
              : undefined,
        },
        config,
      );
    } catch {
      return null;
    }
  }, [
    clientId,
    projectType,
    tier,
    setupSel,
    recurringSel,
    oneTimeSel,
    websiteSel,
    rush,
    highTouch,
    familyCourtesy,
    term,
    consultingHours,
    consultingRate,
    consultingDesc,
    config,
  ]);

  function buildInput(): QuoteInputT {
    return {
      client_id: clientId,
      project_name: projectName || "",
      project_type: projectType,
      tier: projectType === "marketing" ? tier : null,
      scope: {
        setup: setupSel,
        recurring: recurringSel,
        oneTime: oneTimeSel,
        website: websiteSel,
      },
      multipliers: { rush, highTouch, familyCourtesy },
      term,
      custom_consulting:
        projectType === "consulting"
          ? {
              hours: consultingHours,
              rateCents: Math.round(consultingRate * 100),
              description: consultingDesc || undefined,
            }
          : null,
      internal_notes: internalNotes || "",
    };
  }

  function save() {
    if (!clientId) {
      toast.error("Pick a client first.");
      return;
    }
    startTransition(async () => {
      const result = await onSave(buildInput());
      if (result.ok) toast.success("Saved.");
      else toast.error(result.error);
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Client &amp; project</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Client</Label>
              <Select
                value={clientId}
                onValueChange={(v) => setClientId(v ?? "")}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Pick a client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.company}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="project_name">Project name</Label>
              <Input
                id="project_name"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="mt-1.5"
              />
            </div>
            <Tabs
              value={projectType}
              onValueChange={(v) => v && setProjectType(v as ProjectType)}
            >
              <TabsList>
                <TabsTrigger value="marketing">Marketing</TabsTrigger>
                <TabsTrigger value="website">Website</TabsTrigger>
                <TabsTrigger value="consulting">Consulting</TabsTrigger>
              </TabsList>
              <TabsContent value="marketing" className="mt-4">
                <Label>Tier</Label>
                <Select value={tier} onValueChange={(v) => setTier(v ?? "")}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(config.tiers).map(([id, t]) => (
                      <SelectItem key={id} value={id}>
                        {t.name} — {formatCents(t.monthlyRetainerCents)}/mo
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TabsContent>
              <TabsContent value="website" className="mt-4">
                <ScopeChecklist
                  title="Website templates"
                  items={config.websiteTemplates}
                  selection={websiteSel}
                  onChange={setWebsiteSel}
                />
              </TabsContent>
              <TabsContent value="consulting" className="mt-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Hours</Label>
                    <Input
                      type="number"
                      min={1}
                      step={0.5}
                      value={consultingHours}
                      onChange={(e) =>
                        setConsultingHours(Number(e.target.value))
                      }
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label>Rate (USD/hr)</Label>
                    <Input
                      type="number"
                      min={50}
                      value={consultingRate}
                      onChange={(e) =>
                        setConsultingRate(Number(e.target.value))
                      }
                      className="mt-1.5"
                    />
                  </div>
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea
                    rows={2}
                    value={consultingDesc}
                    onChange={(e) => setConsultingDesc(e.target.value)}
                    className="mt-1.5"
                  />
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Setup &amp; recurring scope</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <ScopeChecklist
              title="Setup items"
              items={config.setupItems}
              selection={setupSel}
              onChange={setSetupSel}
            />
            <ScopeChecklist
              title="Recurring add-ons"
              items={config.recurringAddOns}
              selection={recurringSel}
              onChange={setRecurringSel}
            />
            <ScopeChecklist
              title="One-time add-ons"
              items={config.oneTimeAddOns}
              selection={oneTimeSel}
              onChange={setOneTimeSel}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Adjustments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <SliderRow
              label={`Rush premium ${rush}%`}
              value={rush}
              max={config.multipliers.rush.max * 100}
              onChange={setRush}
            />
            <SliderRow
              label={`High-touch retainer buffer ${highTouch}%`}
              value={highTouch}
              max={config.multipliers.highTouch.max * 100}
              onChange={setHighTouch}
            />
            <SliderRow
              label={`Family courtesy discount ${familyCourtesy}%`}
              value={familyCourtesy}
              max={config.multipliers.familyCourtesy.max * 100}
              onChange={setFamilyCourtesy}
            />
            <div>
              <Label>Term commitment</Label>
              <Select
                value={term}
                onValueChange={(v) => v && setTerm(v as Term)}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {config.termOptions.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Internal notes</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              rows={3}
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
            />
          </CardContent>
        </Card>
      </div>

      <div className="lg:sticky lg:top-6 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle>Live total</CardTitle>
          </CardHeader>
          <CardContent>
            {calc ? (
              <dl className="space-y-2 text-sm">
                <Row
                  label="Setup total"
                  value={formatCents(calc.setupTotalCents)}
                />
                <Row
                  label="Monthly retainer"
                  value={formatCents(calc.monthlyTotalCents)}
                />
                <Row
                  label="One-time add-ons"
                  value={formatCents(calc.oneTimeBaseCents)}
                />
                {calc.familyDiscountAmountCents > 0 ? (
                  <Row
                    label="Family discount"
                    value={`−${formatCents(calc.familyDiscountAmountCents)}`}
                    tone="amber"
                  />
                ) : null}
                <hr className="my-2 border-border" />
                <Row
                  label="First month"
                  value={formatCents(calc.firstMonthTotalCents)}
                  emphasize
                />
                <Row
                  label="Year 1 estimate"
                  value={formatCents(calc.year1TotalCents)}
                />
                <Row
                  label="Deposit"
                  value={formatCents(calc.depositAmountCents)}
                />
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">
                Pick a client and configure the project to see live pricing.
              </p>
            )}
            <Button onClick={save} className="mt-5 w-full" disabled={isPending}>
              {isPending ? "Saving…" : saveLabel}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ScopeChecklist({
  title,
  items,
  selection,
  onChange,
}: {
  title: string;
  items: PricingConfig["setupItems"];
  selection: ScopeSelection;
  onChange: (s: ScopeSelection) => void;
}) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <h4 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      <ul className="space-y-2">
        {items.map((it) => {
          const sel = selection[it.id];
          const enabled = !!sel?.enabled;
          return (
            <li
              key={it.id}
              className="flex items-start justify-between gap-3 rounded-md border border-border p-3"
            >
              <label className="flex items-start gap-3">
                <Checkbox
                  checked={enabled}
                  onCheckedChange={(v) =>
                    onChange({
                      ...selection,
                      [it.id]: { enabled: !!v, qty: sel?.qty },
                    })
                  }
                />
                <span>
                  <span className="block text-sm font-semibold">{it.name}</span>
                  {it.scope ? (
                    <span className="block text-xs text-muted-foreground">
                      {it.scope}
                    </span>
                  ) : null}
                </span>
              </label>
              <span className="font-mono text-sm">
                {formatCents(it.priceCents)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SliderRow({
  label,
  value,
  max,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Slider
        className="mt-2"
        value={[value]}
        max={max}
        step={1}
        onValueChange={(v) => onChange(Array.isArray(v) ? (v[0] ?? 0) : v)}
      />
    </div>
  );
}

function Row({
  label,
  value,
  emphasize,
  tone,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
  tone?: "amber";
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={
          emphasize
            ? "font-mono text-base font-bold"
            : tone === "amber"
              ? "font-mono text-[var(--brand-amber-warm)]"
              : "font-mono"
        }
      >
        {value}
      </dd>
    </div>
  );
}
