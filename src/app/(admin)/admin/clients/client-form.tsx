"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/actions/result";
import type { ClientRow } from "@/lib/db/types";

type FieldErrors = Record<string, string[]>;

interface Props {
  client?: ClientRow;
  onSubmit: (
    formData: FormData,
  ) => Promise<ActionResult<{ id: string }> | void>;
  submitLabel: string;
}

const TAGS = ["standard", "family", "partner", "high_touch", "priority"];

export function ClientForm({ client, onSubmit, submitLabel }: Props) {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [tag, setTag] = useState(client?.relationship_tag ?? "standard");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    formData.set("relationship_tag", tag);
    startTransition(async () => {
      const result = await onSubmit(formData);
      if (result && !result.ok) {
        setErrors((result.fieldErrors as FieldErrors) ?? {});
        toast.error(result.error);
      } else {
        setErrors({});
        toast.success("Saved.");
      }
    });
  }

  return (
    <form action={handleSubmit} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <Field
          label="Company *"
          name="company"
          defaultValue={client?.company}
          errors={errors.company}
        />
        <Field
          label="Contact name"
          name="contact_name"
          defaultValue={client?.contact_name ?? ""}
          errors={errors.contact_name}
        />
        <Field
          label="Email"
          name="email"
          type="email"
          defaultValue={client?.email ?? ""}
          errors={errors.email}
        />
        <Field
          label="Phone"
          name="phone"
          defaultValue={client?.phone ?? ""}
          errors={errors.phone}
        />
      </div>

      <div>
        <Label>Relationship tag</Label>
        <Select value={tag} onValueChange={(v) => setTag(v ?? "standard")}>
          <SelectTrigger className="mt-1.5">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TAGS.map((t) => (
              <SelectItem key={t} value={t}>
                {t.replace("_", " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="address">Address</Label>
        <Textarea
          id="address"
          name="address"
          rows={2}
          defaultValue={client?.address ?? ""}
          className="mt-1.5"
        />
      </div>

      <div>
        <Label htmlFor="notes">Internal notes</Label>
        <Textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={client?.notes ?? ""}
          className="mt-1.5"
        />
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  defaultValue,
  errors,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  errors?: string[];
}) {
  return (
    <div>
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        className="mt-1.5"
      />
      {errors && errors.length > 0 ? (
        <p className="mt-1 text-xs text-[color:var(--semantic-error)]">
          {errors[0]}
        </p>
      ) : null}
    </div>
  );
}
