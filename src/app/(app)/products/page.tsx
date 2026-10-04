import { Search } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/common/empty-state";
import { NewProductButton } from "@/components/products/new-product-button";
import { ProductCard } from "@/components/products/product-card";
import { Input } from "@/components/ui/input";
import { firstParam } from "@/lib/search-params";
import { listProducts } from "@/server/repositories/products";

export const metadata: Metadata = { title: "Produits" };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const q = firstParam((await searchParams).q);
  const products = await listProducts(q);

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-3xl">Produits</h1>
        <NewProductButton />
      </div>
      <form role="search" className="relative max-w-md">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          name="q"
          type="search"
          defaultValue={q}
          placeholder="Rechercher un produit"
          aria-label="Rechercher un produit"
          className="h-11 pl-9"
        />
      </form>
      {products.length === 0 ? (
        <EmptyState
          title={q ? "Aucun résultat" : "Aucun produit"}
          description={q ? `Aucun produit ne correspond à « ${q} ».` : "Crée ton premier produit pour suivre son prix."}
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}
