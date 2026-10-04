import { X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PurchaseForm } from "@/components/purchases/purchase-form";
import { todayIso } from "@/lib/dates";
import { purchaseToDraft } from "@/lib/purchase-draft";
import { createProductAction } from "@/server/actions/products";
import { updatePurchaseAction } from "@/server/actions/purchases";
import { createStoreAction } from "@/server/actions/stores";
import { listProducts } from "@/server/repositories/products";
import { getPurchase, latestPriceIndex } from "@/server/repositories/purchases";
import { listStores } from "@/server/repositories/stores";

export const metadata: Metadata = { title: "Modifier la course" };

export default async function EditPurchasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [purchase, stores, products, priceIndex] = await Promise.all([
    getPurchase(id),
    listStores(),
    listProducts(),
    latestPriceIndex(),
  ]);
  if (!purchase) notFound();

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl">Modifier la course</h1>
        <Link href={`/purchases/${id}`} aria-label="Fermer" className="grid size-11 place-items-center rounded-md border bg-card">
          <X className="size-5" aria-hidden />
        </Link>
      </div>
      <PurchaseForm
        mode="edit"
        stores={stores}
        products={products}
        priceIndex={priceIndex}
        today={todayIso()}
        initial={purchaseToDraft(purchase)}
        receiptPath={purchase.receiptPath}
        action={updatePurchaseAction.bind(null, id)}
        createStore={createStoreAction}
        createProduct={createProductAction}
      />
    </div>
  );
}
