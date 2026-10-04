"use client";

import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatQuantity, parseQuantity, stepQuantity } from "@/domain/purchase";

type Props = { id: string; label: string; value: string; onChange: (value: string) => void };

export function QuantityStepper({ id, label, value, onChange }: Props) {
  const quantity = parseQuantity(value);

  function step(direction: 1 | -1) {
    onChange(formatQuantity(stepQuantity(quantity ?? 1, direction)));
  }

  return (
    <div className="flex h-11 items-center rounded-md border bg-card">
      <Button type="button" variant="ghost" size="icon" className="size-11 text-primary" aria-label="Diminuer" onClick={() => step(-1)}>
        <Minus aria-hidden />
      </Button>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={quantity === null ? true : undefined}
        className="h-full w-14 bg-transparent text-center font-mono text-base outline-none aria-invalid:text-destructive"
      />
      <Button type="button" variant="ghost" size="icon" className="size-11 text-primary" aria-label="Augmenter" onClick={() => step(1)}>
        <Plus aria-hidden />
      </Button>
    </div>
  );
}
