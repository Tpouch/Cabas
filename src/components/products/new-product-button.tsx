"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ResponsiveDialog } from "@/components/common/responsive-dialog";
import { Button } from "@/components/ui/button";
import { createProductAction } from "@/server/actions/products";
import { ProductForm } from "./product-form";

export function NewProductButton() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <>
      <Button className="h-11" onClick={() => setOpen(true)}>
        <Plus aria-hidden /> Nouveau produit
      </Button>
      <ResponsiveDialog open={open} onOpenChange={setOpen} title="Nouveau produit">
        <ProductForm
          action={createProductAction}
          onDone={(product) => {
            toast.success("Produit créé");
            setOpen(false);
            router.push(`/products/${product.id}`);
          }}
        />
      </ResponsiveDialog>
    </>
  );
}
