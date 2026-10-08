"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseEuros } from "@/domain/money";
import { inRange, parsePromoNumber, PROMO_LIMITS, type PromoKind } from "@/domain/promo";
import { type DraftPromo, emptyDraftPromo, readDraftPromo } from "@/lib/purchase-draft";
import { cn } from "@/lib/utils";
import { PromoStatus } from "./promo-status";

type Props = {
  lineKey: string;
  productName: string;
  promo: DraftPromo | undefined;
  quantity: number | null;
  unitPriceCents: number | null;
  /** After a refused save, empty values count as invalid too. */
  showMissing?: boolean;
  onChange: (promo: DraftPromo | undefined) => void;
};

const KINDS: { kind: PromoKind; label: string }[] = [
  { kind: "AMOUNT_OFF_PER_UNIT", label: "− € / article" },
  { kind: "PERCENT_OFF", label: "− %" },
  { kind: "NTH_PERCENT_OFF", label: "Le Ne à −%" },
  { kind: "BUY_GET_FREE", label: "Achetés / offerts" },
];

function countInvalid(value: string, range: { min: number; max: number }, showMissing: boolean): boolean {
  if (value.trim() === "") return showMissing;
  const parsed = parsePromoNumber(value);
  return parsed === null || !inRange(parsed, range);
}

function amountInvalid(value: string, unitPriceCents: number | null, showMissing: boolean): boolean {
  if (value.trim() === "") return showMissing;
  const parsed = parseEuros(value);
  return parsed === null || (unitPriceCents !== null && parsed > unitPriceCents);
}

type PromoInputProps = {
  id: string;
  label: string;
  value: string;
  invalid: boolean;
  decimal?: boolean;
  onValue: (value: string) => void;
};

function PromoInput({ id, label, value, invalid, decimal = false, onValue }: PromoInputProps) {
  return (
    <>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Input
        id={id}
        inputMode={decimal ? "decimal" : "numeric"}
        className={cn("font-mono", decimal ? "w-20" : "w-16")}
        value={value}
        aria-invalid={invalid ? true : undefined}
        onChange={(event) => onValue(event.target.value)}
      />
    </>
  );
}

export function PromoEditor({ lineKey, productName, promo, quantity, unitPriceCents, showMissing = false, onChange }: Props) {
  const [editing, setEditing] = useState(false);

  if (!promo) {
    return (
      <Button
        type="button"
        variant="ghost"
        className="h-11 justify-self-start px-2 text-primary"
        aria-label={`Ajouter une promo sur ${productName}`}
        onClick={() => {
          onChange(emptyDraftPromo());
          setEditing(true);
        }}
      >
        <Plus aria-hidden /> Promo
      </Button>
    );
  }

  const parsed = unitPriceCents === null ? null : readDraftPromo(promo, unitPriceCents);

  if (parsed && !editing && quantity !== null && unitPriceCents !== null) {
    return (
      <button type="button" className="min-h-11 justify-self-start text-left" onClick={() => setEditing(true)}>
        <PromoStatus promo={parsed} quantity={quantity} unitPriceCents={unitPriceCents} />
      </button>
    );
  }

  const set = (patch: Partial<DraftPromo>) => onChange({ ...promo, ...patch });
  const id = (name: string) => `promo-${name}-${lineKey}`;
  const percentInput = (
    <PromoInput
      id={id("percent")}
      label={`Pourcentage de remise pour ${productName}`}
      value={promo.percent}
      invalid={countInvalid(promo.percent, PROMO_LIMITS.percent, showMissing)}
      onValue={(percent) => set({ percent })}
    />
  );

  return (
    <div className="grid gap-2 rounded-md border border-dashed p-2">
      <div role="group" aria-label={`Type de promo pour ${productName}`} className="flex flex-wrap gap-1.5">
        {KINDS.map(({ kind, label }) => (
          <Button
            key={kind}
            type="button"
            size="sm"
            variant={promo.kind === kind ? "default" : "outline"}
            className="h-11 rounded-full"
            aria-pressed={promo.kind === kind}
            onClick={() => set({ kind })}
          >
            {label}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-sm">
        {promo.kind === "AMOUNT_OFF_PER_UNIT" && (
          <>
            <PromoInput
              id={id("amount")}
              label={`Remise par article pour ${productName}`}
              value={promo.amount}
              invalid={amountInvalid(promo.amount, unitPriceCents, showMissing)}
              decimal
              onValue={(amount) => set({ amount })}
            />
            <span>€ par article</span>
          </>
        )}
        {promo.kind === "PERCENT_OFF" && (
          <>
            <span>−</span>
            {percentInput}
            <span>%</span>
          </>
        )}
        {promo.kind === "NTH_PERCENT_OFF" && (
          <>
            <span>Le</span>
            <PromoInput
              id={id("nth")}
              label={`Rang de l’article remisé pour ${productName}`}
              value={promo.nth}
              invalid={countInvalid(promo.nth, PROMO_LIMITS.nth, showMissing)}
              onValue={(nth) => set({ nth })}
            />
            <span>e à −</span>
            {percentInput}
            <span>%</span>
          </>
        )}
        {promo.kind === "BUY_GET_FREE" && (
          <>
            <PromoInput
              id={id("buy")}
              label={`Articles achetés pour ${productName}`}
              value={promo.buy}
              invalid={countInvalid(promo.buy, PROMO_LIMITS.items, showMissing)}
              onValue={(buy) => set({ buy })}
            />
            <span>achetés =</span>
            <PromoInput
              id={id("free")}
              label={`Articles offerts pour ${productName}`}
              value={promo.free}
              invalid={countInvalid(promo.free, PROMO_LIMITS.items, showMissing)}
              onValue={(free) => set({ free })}
            />
            <span>offerts</span>
          </>
        )}
      </div>
      <div role="status">
        {parsed && quantity !== null && unitPriceCents !== null && (
          <PromoStatus promo={parsed} quantity={quantity} unitPriceCents={unitPriceCents} />
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          className="h-11"
          disabled={!parsed}
          aria-label={`Valider la promo sur ${productName}`}
          onClick={() => setEditing(false)}
        >
          OK
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-11"
          aria-label={`Retirer la promo sur ${productName}`}
          onClick={() => {
            onChange(undefined);
            setEditing(false);
          }}
        >
          <X aria-hidden /> Retirer la promo
        </Button>
      </div>
    </div>
  );
}
