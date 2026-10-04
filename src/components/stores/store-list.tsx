"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/common/empty-state";
import { runAction } from "@/components/common/run-action";
import { ResponsiveDialog } from "@/components/common/responsive-dialog";
import { Button } from "@/components/ui/button";
import { uploadUrl } from "@/lib/uploads";
import { createStoreAction, deleteStoreAction, updateStoreAction } from "@/server/actions/stores";
import type { StoreSummary } from "@/server/repositories/stores";
import { StoreForm } from "./store-form";

type Editing = { mode: "create" } | { mode: "edit"; store: StoreSummary };

export function StoreList({ stores }: { stores: StoreSummary[] }) {
  const [open, setOpen] = useState(false);
  // Kept after closing so the dialog keeps its title and form during the exit animation.
  const [editing, setEditing] = useState<Editing>({ mode: "create" });

  function openWith(next: Editing) {
    setEditing(next);
    setOpen(true);
  }

  async function remove(store: StoreSummary) {
    if (!window.confirm(`Supprimer « ${store.name} » ?`)) return;
    await runAction(deleteStoreAction(store.id), "Magasin supprimé");
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl">Magasins</h1>
        <Button onClick={() => openWith({ mode: "create" })} className="h-11">
          <Plus aria-hidden /> Nouveau magasin
        </Button>
      </div>

      {stores.length === 0 ? (
        <EmptyState title="Aucun magasin" description="Ajoute les magasins où tu fais tes courses." />
      ) : (
        <ul className="divide-y divide-dashed rounded-md border bg-card">
          {stores.map((store) => (
            <li key={store.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-md bg-secondary font-bold text-primary">
                {store.logoPath ? (
                  <img src={uploadUrl(store.logoPath, { thumb: true })} alt="" className="size-full object-cover" />
                ) : (
                  store.name[0]
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{store.name}</p>
                {store.address && <p className="truncate text-sm text-muted-foreground">{store.address}</p>}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-11"
                aria-label={`Modifier ${store.name}`}
                onClick={() => openWith({ mode: "edit", store })}
              >
                <Pencil aria-hidden />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-11"
                aria-label={`Supprimer ${store.name}`}
                onClick={() => remove(store)}
              >
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        title={editing.mode === "edit" ? "Modifier le magasin" : "Nouveau magasin"}
      >
        <StoreForm
          key={editing.mode === "edit" ? editing.store.id : "new"}
          action={editing.mode === "edit" ? updateStoreAction.bind(null, editing.store.id) : createStoreAction}
          store={editing.mode === "edit" ? editing.store : undefined}
          onDone={() => {
            toast.success("Magasin enregistré");
            setOpen(false);
          }}
        />
      </ResponsiveDialog>
    </div>
  );
}
