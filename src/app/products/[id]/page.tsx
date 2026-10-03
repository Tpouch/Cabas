import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddPriceButton } from "@/components/products/add-price-button";
import { PriceTable } from "@/components/products/price-table";
import { ProductActions } from "@/components/products/product-actions";
import { todayIso } from "@/lib/dates";
import { formatSize } from "@/lib/format";
import { uploadUrl } from "@/lib/uploads";
import { listStorePrices } from "@/server/repositories/prices";
import { getProduct } from "@/server/repositories/products";
import { listStores } from "@/server/repositories/stores";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await getProduct((await params).id);
  return { title: product?.name ?? "Produit" };
}

export default async function ProductPage({ params }: Props) {
  const { id } = await params;
  const [product, prices, stores] = await Promise.all([getProduct(id), listStorePrices(id), listStores()]);
  if (!product) notFound();
  const now = new Date();

  return (
    <div className="grid gap-5">
      <div className="flex items-center justify-between">
        <Link href="/products" className="flex h-11 items-center gap-1 text-sm text-muted-foreground">
          <ChevronLeft className="size-4" aria-hidden /> Produits
        </Link>
        <ProductActions product={product} />
      </div>
      <div className="grid gap-5 lg:grid-cols-[16rem_1fr] lg:items-start">
        <div className="grid gap-2">
          <div className="aspect-[4/3] overflow-hidden rounded-md bg-[repeating-linear-gradient(45deg,#f5ebdd_0_8px,#efe3d1_8px_16px)] lg:aspect-square">
            {product.photoPath && (
              <img src={uploadUrl(product.photoPath)} alt={product.name} className="size-full object-cover" />
            )}
          </div>
          <h1 className="text-2xl leading-tight">{product.name}</h1>
          <p className="text-muted-foreground">
            {[product.brand, formatSize(product.sizeValue, product.sizeUnit)].filter(Boolean).join(" · ")}
          </p>
        </div>
        <section aria-labelledby="prices-title" className="grid gap-2">
          <h2 id="prices-title" className="font-sans text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Prix par magasin
          </h2>
          <PriceTable product={product} rows={prices} now={now} />
          <AddPriceButton product={product} stores={stores} today={todayIso(now)} />
        </section>
      </div>
    </div>
  );
}
