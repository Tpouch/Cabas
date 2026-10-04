import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PurchaseActions } from "@/components/purchases/purchase-actions";
import { formatEuros } from "@/domain/money";
import { formatQuantity, lineSubtotal, sumOfLines } from "@/domain/purchase";
import { formatLongDate, formatSize } from "@/lib/format";
import { uploadUrl } from "@/lib/uploads";
import { getPurchase } from "@/server/repositories/purchases";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const purchase = await getPurchase((await params).id);
  return { title: purchase ? `Course chez ${purchase.store.name}` : "Course" };
}

export default async function PurchasePage({ params }: Props) {
  const purchase = await getPurchase((await params).id);
  if (!purchase) notFound();
  const sum = sumOfLines(purchase.items);
  const gap = purchase.totalCents - sum;

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/purchases" className="flex h-11 items-center gap-1 text-sm text-muted-foreground">
          <ChevronLeft className="size-4" aria-hidden /> Courses
        </Link>
        <PurchaseActions purchaseId={purchase.id} />
      </div>

      <div>
        <h1 className="text-2xl">{purchase.store.name}</h1>
        <p className="text-muted-foreground first-letter:uppercase">{formatLongDate(purchase.purchasedAt)}</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_16rem] lg:items-start">
        <section aria-labelledby="lines-title" className="grid gap-2">
          <h2 id="lines-title" className="font-sans text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Articles · {purchase.items.length}
          </h2>
          <ul className="receipt-edge divide-y divide-dashed rounded-md border bg-card">
            {purchase.items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <Link href={`/products/${item.product.id}`} className="font-medium hover:underline">
                    {item.product.name}
                  </Link>
                  <p className="font-mono text-xs text-muted-foreground">
                    {formatQuantity(item.quantity)} × {formatEuros(item.unitPriceCents)} ·{" "}
                    {formatSize(item.product.sizeValue, item.product.sizeUnit)}
                  </p>
                </div>
                <span className="font-mono font-bold">{formatEuros(lineSubtotal(item.quantity, item.unitPriceCents))}</span>
              </li>
            ))}
          </ul>
          <dl className="grid gap-1 rounded-md border bg-card p-3 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <dt>Somme des articles</dt>
              <dd className="font-mono">{formatEuros(sum)}</dd>
            </div>
            {gap !== 0 && (
              <div className="flex justify-between text-muted-foreground">
                <dt>Écart (remises, oublis)</dt>
                <dd className="font-mono">{formatEuros(gap)}</dd>
              </div>
            )}
            <div className="flex justify-between text-base font-bold">
              <dt>Total payé</dt>
              <dd className="font-mono">{formatEuros(purchase.totalCents)}</dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="receipt-title" className="grid gap-2">
          <h2 id="receipt-title" className="font-sans text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Ticket
          </h2>
          {purchase.receiptPath ? (
            <a href={uploadUrl(purchase.receiptPath)} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md border">
              <img src={uploadUrl(purchase.receiptPath, { thumb: true })} alt="Ticket de caisse (agrandir)" className="w-full object-cover" />
            </a>
          ) : (
            <p className="rounded-md border border-dashed bg-card p-4 text-sm text-muted-foreground">Pas de photo du ticket.</p>
          )}
        </section>
      </div>
    </div>
  );
}
