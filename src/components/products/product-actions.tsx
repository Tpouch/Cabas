"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { ResponsiveDialog } from "@/components/common/responsive-dialog";
import { Button } from "@/components/ui/button";
import { deleteProductAction, updateProductAction } from "@/server/actions/products";
import type { ProductSummary } from "@/server/repositories/products";
import { ProductForm } from "./product-form";

export function ProductActions({ product }: { product: ProductSummary }) {
  const [editing, setEditing] = useState(false);
  const router = useRouter();
  const saved = useCallback(() => {
    toast.success("Produit enregistré");
    setEditing(false);
  }, []);

  async function remove() {
    if (!window.confirm(`Supprimer « ${product.name} » et ses prix ?`)) return;
    const result = await deleteProductAction(product.id);
    if (!result.ok) return toast.error(result.message ?? "Suppression impossible");
    toast.success("Produit supprimé");
    router.push("/products");
  }

  return (
    <div className="flex gap-1">
      <Button variant="outline" size="icon" className="size-11" aria-label="Modifier le produit" onClick={() => setEditing(true)}>
        <Pencil aria-hidden />
      </Button>
      <Button variant="outline" size="icon" className="size-11" aria-label="Supprimer le produit" onClick={remove}>
        <Trash2 aria-hidden />
      </Button>
      <ResponsiveDialog open={editing} onOpenChange={setEditing} title="Modifier le produit">
        <ProductForm action={updateProductAction.bind(null, product.id)} product={product} onDone={saved} />
      </ResponsiveDialog>
    </div>
  );
}
