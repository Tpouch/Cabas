import Link from "next/link";
import { LogoMark } from "@/components/brand/logo-mark";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <div className="grid gap-5">
      <div className="flex items-center gap-3">
        <LogoMark className="size-12" />
        <h1 className="text-3xl">cabas</h1>
      </div>
      <EmptyState
        title="Bienvenue dans cabas"
        description="Commence par ajouter tes magasins et tes produits pour comparer les prix."
        action={
          <Button asChild>
            <Link href="/products">Voir les produits</Link>
          </Button>
        }
      />
    </div>
  );
}
