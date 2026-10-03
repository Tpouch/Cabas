import Link from "next/link";
import { formatEuros } from "@/domain/money";
import { formatSize } from "@/lib/format";
import { uploadUrl } from "@/lib/uploads";
import type { ProductSummary } from "@/server/repositories/products";

export function ProductCard({ product }: { product: ProductSummary }) {
  return (
    <Link
      href={`/products/${product.id}`}
      className="flex flex-col gap-1 rounded-md border bg-card p-2 transition-transform active:scale-[0.98]"
    >
      <div className="aspect-square overflow-hidden rounded-sm bg-[repeating-linear-gradient(45deg,#f5ebdd_0_8px,#efe3d1_8px_16px)]">
        {product.photoPath && (
          <img
            src={uploadUrl(product.photoPath, { thumb: true })}
            alt={product.name}
            loading="lazy"
            width={300}
            height={300}
            className="size-full object-cover"
          />
        )}
      </div>
      <p className="text-sm leading-tight font-semibold">{product.name}</p>
      <p className="text-xs text-muted-foreground">
        {[product.brand, formatSize(product.sizeValue, product.sizeUnit)].filter(Boolean).join(" · ")}
      </p>
      <p className="font-mono text-sm font-bold text-savings">
        {product.bestPriceCents === null ? (
          <span className="font-sans font-normal text-muted-foreground">Pas encore de prix</span>
        ) : (
          `dès ${formatEuros(product.bestPriceCents)}`
        )}
      </p>
    </Link>
  );
}
