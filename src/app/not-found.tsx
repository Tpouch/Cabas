import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <h1 className="text-2xl">Page introuvable</h1>
      <p className="text-muted-foreground">Cette page n’existe pas ou a été supprimée.</p>
      <Button asChild>
        <Link href="/">Retour à l’accueil</Link>
      </Button>
    </div>
  );
}
