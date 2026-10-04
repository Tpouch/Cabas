import { X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PurchaseForm } from "@/components/purchases/purchase-form";
import { todayIso } from "@/lib/dates";
import { createProductAction } from "@/server/actions/products";
import { createPurchaseAction } from "@/server/actions/purchases";
import { createStoreAction } from "@/server/actions/stores";
import { listProducts } from "@/server/repositories/products";
import { latestPriceIndex } from "@/server/repositories/purchases";
import { listStores } from "@/server/repositories/stores";

export const metadata: Metadata = { title: "Nouvelle course" };

export default async function NewPurchasePage() {
  const [stores, products, priceIndex] = await Promise.all([listStores(), listProducts(), latestPriceIndex()]);

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl">Nouvelle course</h1>
        <Link href="/purchases" aria-label="Fermer" className="grid size-11 place-items-center rounded-md border bg-card">
          <X className="size-5" aria-hidden />
        </Link>
      </div>
      <PurchaseForm
        mode="create"
        stores={stores}
        products={products}
        priceIndex={priceIndex}
        today={todayIso()}
        action={createPurchaseAction}
        createStore={createStoreAction}
        createProduct={createProductAction}
      />
    </div>
  );
}
