"use client";

import { Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { runAction } from "@/components/common/run-action";
import { Button } from "@/components/ui/button";
import { deletePurchaseAction } from "@/server/actions/purchases";

export function PurchaseActions({ purchaseId }: { purchaseId: string }) {
  const router = useRouter();

  async function remove() {
    if (!window.confirm("Supprimer cette course ? Ses prix seront aussi retirés des produits.")) return;
    if (await runAction(deletePurchaseAction(purchaseId), "Course supprimée")) router.push("/purchases");
  }

  return (
    <div className="flex gap-2">
      <Button variant="outline" className="h-11" asChild>
        <Link href={`/purchases/${purchaseId}/edit`}>
          <Pencil aria-hidden /> Modifier
        </Link>
      </Button>
      <Button variant="outline" className="h-11 text-destructive" onClick={remove}>
        <Trash2 aria-hidden /> Supprimer
      </Button>
    </div>
  );
}
