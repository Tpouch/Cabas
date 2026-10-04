import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/common/empty-state";
import { PurchaseHistory } from "@/components/purchases/purchase-history";
import { Button } from "@/components/ui/button";
import { groupByMonth } from "@/lib/purchase-months";
import { listPurchases } from "@/server/repositories/purchases";

export const metadata: Metadata = { title: "Courses" };

export default async function PurchasesPage() {
  const groups = groupByMonth(await listPurchases());

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-3xl">Courses</h1>
        <Button asChild className="h-11">
          <Link href="/purchases/new">Nouvelle course</Link>
        </Button>
      </div>
      {groups.length === 0 ? (
        <EmptyState
          title="Aucune course"
          description="Enregistre ta première course en rentrant du magasin."
          action={
            <Button asChild>
              <Link href="/purchases/new">Enregistrer une course</Link>
            </Button>
          }
        />
      ) : (
        <PurchaseHistory groups={groups} />
      )}
    </div>
  );
}
