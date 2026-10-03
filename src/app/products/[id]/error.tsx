"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ProductError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <h1 className="text-2xl">Impossible d’afficher ce produit</h1>
      <div className="flex gap-2">
        <Button onClick={reset}>Réessayer</Button>
        <Button variant="outline" asChild>
          <Link href="/products">Tous les produits</Link>
        </Button>
      </div>
    </div>
  );
}
