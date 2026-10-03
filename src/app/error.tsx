"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <h1 className="text-2xl">Quelque chose s’est mal passé</h1>
      <p className="text-muted-foreground">
        Réessaie dans un instant. Si le problème continue, vérifie que la base de données est démarrée.
      </p>
      <Button onClick={reset}>Réessayer</Button>
    </div>
  );
}
