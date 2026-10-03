import Link from "next/link";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <EmptyState
      title="Bienvenue dans cabas"
      description="Commence par ajouter tes magasins et tes produits pour comparer les prix."
      action={
        <Button asChild>
          <Link href="/products">Voir les produits</Link>
        </Button>
      }
    />
  );
}
