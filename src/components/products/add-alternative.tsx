"use client";

import { useState } from "react";
import { EntityCombobox } from "@/components/common/entity-combobox";
import { ResponsiveDialog } from "@/components/common/responsive-dialog";
import { runAction } from "@/components/common/run-action";
import { Button } from "@/components/ui/button";
import { uploadUrl } from "@/lib/uploads";
import { addAlternativeAction } from "@/server/actions/alternatives";
import type { ProductSummary } from "@/server/repositories/products";

export function AddAlternative({ productId, candidates }: { productId: string; candidates: ProductSummary[] }) {
  const [open, setOpen] = useState(false);
  const [otherId, setOtherId] = useState<string | null>(null);

  async function add() {
    if (!otherId) return;
    if (!(await runAction(addAlternativeAction(productId, otherId), "Alternative ajoutée"))) return;
    setOtherId(null);
    setOpen(false);
  }

  return (
    <>
      <Button variant="ghost" className="h-11 text-primary" onClick={() => setOpen(true)}>
        + Ajouter une alternative
      </Button>
      <ResponsiveDialog open={open} onOpenChange={setOpen} title="Ajouter une alternative">
        <div className="grid gap-4">
          <EntityCombobox
            id="alternative"
            name="alternativeId"
            label="Produit"
            placeholder="Choisir un produit"
            options={candidates.map((p) => ({
              id: p.id,
              label: [p.name, p.brand].filter(Boolean).join(" · "),
              imageUrl: p.photoPath ? uploadUrl(p.photoPath, { thumb: true }) : null,
            }))}
            value={otherId}
            onChange={setOtherId}
          />
          <Button className="h-11" disabled={!otherId} onClick={add}>
            Ajouter
          </Button>
        </div>
      </ResponsiveDialog>
    </>
  );
}
