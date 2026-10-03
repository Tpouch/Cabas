"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { ResponsiveDialog } from "@/components/common/responsive-dialog";
import { Button } from "@/components/ui/button";
import { formatSize } from "@/lib/format";
import { addPriceAction } from "@/server/actions/prices";
import { createStoreAction } from "@/server/actions/stores";
import type { ProductSummary } from "@/server/repositories/products";
import type { StoreSummary } from "@/server/repositories/stores";
import { PriceForm } from "./price-form";

export function AddPriceButton({ product, stores, today }: { product: ProductSummary; stores: StoreSummary[]; today: string }) {
  const [open, setOpen] = useState(false);
  const done = useCallback(() => {
    toast.success("Prix ajouté");
    setOpen(false);
  }, []);
  return (
    <>
      <Button
        variant="outline"
        className="h-11 w-full border-dashed border-primary text-primary"
        onClick={() => setOpen(true)}
      >
        + Ajouter un prix
      </Button>
      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        title="Ajouter un prix"
        description={[product.name, product.brand, formatSize(product.sizeValue, product.sizeUnit)].filter(Boolean).join(" · ")}
      >
        <PriceForm
          product={product}
          stores={stores}
          action={addPriceAction.bind(null, product.id)}
          createStore={createStoreAction}
          onDone={done}
          today={today}
        />
      </ResponsiveDialog>
    </>
  );
}
