"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { EntityCombobox } from "@/components/common/entity-combobox";
import { FieldError } from "@/components/common/field-error";
import { ResponsiveDialog } from "@/components/common/responsive-dialog";
import { SubmitButton } from "@/components/common/submit-button";
import { useFormAction } from "@/components/common/use-form-action";
import { ProductForm } from "@/components/products/product-form";
import { StoreForm } from "@/components/stores/store-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatEuros, formatEurosInput } from "@/domain/money";
import { formatQuantity, parseQuantity, stepQuantity, sumOfLines } from "@/domain/purchase";
import { formatSize } from "@/lib/format";
import {
  DRAFT_STORAGE_KEY,
  type DraftLine,
  draftLineAmounts,
  draftLinePayload,
  isEmptyDraft,
  parseDraft,
  type PurchaseDraft,
  serializeDraft,
} from "@/lib/purchase-draft";
import { uploadUrl } from "@/lib/uploads";
import type { ActionResult, ActionState } from "@/server/actions/result";
import type { ProductSummary } from "@/server/repositories/products";
import type { PriceIndex } from "@/server/repositories/purchases";
import type { StoreSummary } from "@/server/repositories/stores";
import { LinesSummary } from "./lines-summary";
import { PurchaseLines } from "./purchase-lines";
import { ReceiptField } from "./receipt-field";

type Props = {
  mode: "create" | "edit";
  stores: StoreSummary[];
  products: ProductSummary[];
  priceIndex: PriceIndex;
  today: string;
  initial?: PurchaseDraft;
  receiptPath?: string | null;
  action: (prev: ActionState<{ id: string }>, formData: FormData) => Promise<ActionResult<{ id: string }>>;
  createStore: (prev: ActionState<StoreSummary>, formData: FormData) => Promise<ActionResult<StoreSummary>>;
  createProduct: (prev: ActionState<ProductSummary>, formData: FormData) => Promise<ActionResult<ProductSummary>>;
};

const noSubscription = () => () => {};

/** The draft lives in localStorage, so the editor renders on the client only (no hydration mismatch). */
export function PurchaseForm(props: Props) {
  const isClient = useSyncExternalStore(noSubscription, () => true, () => false);
  if (!isClient) return <p className="py-10 text-center text-muted-foreground">Chargement…</p>;
  return <PurchaseEditor {...props} />;
}

function emptyDraft(today: string): PurchaseDraft {
  return { storeId: null, purchasedAt: today, lines: [], total: "", totalEdited: false };
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function writeDraft(draft: PurchaseDraft) {
  try {
    storage()?.setItem(DRAFT_STORAGE_KEY, serializeDraft(draft));
  } catch {
    // Storage full or blocked: the draft is a convenience, the form keeps working.
  }
}

function clearDraft() {
  try {
    storage()?.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // Same as above.
  }
}

/** crypto.randomUUID needs HTTPS; the app is served over plain HTTP on the private network. */
let keyCounter = 0;
function newLineKey(): string {
  keyCounter += 1;
  return `${Date.now().toString(36)}-${keyCounter}`;
}

function productLabel(product: ProductSummary): string {
  return [product.name, product.brand, formatSize(product.sizeValue, product.sizeUnit)].filter(Boolean).join(" · ");
}

function byName<T extends { name: string }>(a: T, b: T): number {
  return a.name.localeCompare(b.name, "fr");
}

function PurchaseEditor({
  mode,
  stores: initialStores,
  products: initialProducts,
  priceIndex,
  today,
  initial,
  receiptPath,
  action,
  createStore,
  createProduct,
}: Props) {
  const router = useRouter();
  const [stores, setStores] = useState(initialStores);
  const [products, setProducts] = useState(initialProducts);
  const [draft, setDraft] = useState<PurchaseDraft>(() => {
    if (initial) return initial;
    const restored = parseDraft(storage()?.getItem(DRAFT_STORAGE_KEY) ?? null, {
      storeIds: new Set(initialStores.map((store) => store.id)),
      productIds: new Set(initialProducts.map((product) => product.id)),
    });
    return restored && !isEmptyDraft(restored) ? restored : emptyDraft(today);
  });
  const [newStoreName, setNewStoreName] = useState<string | null>(null);
  const [newProductName, setNewProductName] = useState<string | null>(null);

  useEffect(() => {
    if (mode === "create") writeDraft(draft);
  }, [mode, draft]);

  const productsById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const store = stores.find((candidate) => candidate.id === draft.storeId) ?? null;
  const amounts = draft.lines.flatMap((line) => draftLineAmounts(line) ?? []);
  const sum = sumOfLines(amounts);
  const total = draft.totalEdited ? draft.total : sum > 0 ? formatEurosInput(sum) : "";

  const { state, errors, pending, onSubmit, formRef } = useFormAction(action, (saved) => {
    if (mode === "create") clearDraft();
    toast.success("Course enregistrée");
    router.push(`/purchases/${saved.id}`);
  });

  function currentPrice(storeId: string | null, productId: string): string {
    const cents = storeId ? priceIndex[storeId]?.[productId] : undefined;
    return cents ? formatEurosInput(cents) : "";
  }

  function chooseStore(storeId: string) {
    setDraft((current) => ({
      ...current,
      storeId,
      lines: current.lines.map((line) =>
        line.unitPrice.trim() ? line : { ...line, unitPrice: currentPrice(storeId, line.productId) },
      ),
    }));
  }

  function addProduct(productId: string, priceCents: number | null = null) {
    setDraft((current) => {
      const existing = current.lines.find((line) => line.productId === productId);
      if (existing) {
        const quantity = formatQuantity(stepQuantity(parseQuantity(existing.quantity) ?? 0, 1));
        return { ...current, lines: current.lines.map((line) => (line === existing ? { ...line, quantity } : line)) };
      }
      const unitPrice = priceCents ? formatEurosInput(priceCents) : currentPrice(current.storeId, productId);
      return { ...current, lines: [...current.lines, { key: newLineKey(), productId, quantity: "1", unitPrice }] };
    });
  }

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setDraft((current) => ({
      ...current,
      lines: current.lines.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    }));
  }

  function removeLine(key: string) {
    setDraft((current) => ({ ...current, lines: current.lines.filter((line) => line.key !== key) }));
  }

  return (
    <>
      <form
        ref={formRef}
        noValidate
        onSubmit={onSubmit}
        className="grid gap-5 pb-28 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:pb-0"
      >
        <div className="grid gap-4">
          <div className="grid grid-cols-[minmax(0,1fr)_9.5rem] gap-3">
            <EntityCombobox
              id="storeId"
              name="storeId"
              label="Magasin"
              placeholder="Choisir un magasin"
              options={stores.map((candidate) => ({
                id: candidate.id,
                label: candidate.name,
                imageUrl: candidate.logoPath ? uploadUrl(candidate.logoPath, { thumb: true }) : null,
              }))}
              value={draft.storeId}
              onChange={chooseStore}
              onCreate={setNewStoreName}
              errors={errors.storeId}
            />
            <div className="grid content-start gap-1.5">
              <Label htmlFor="purchasedAt">Date</Label>
              <Input
                id="purchasedAt"
                name="purchasedAt"
                type="date"
                className="font-mono"
                max={today}
                value={draft.purchasedAt}
                onChange={(event) => setDraft((current) => ({ ...current, purchasedAt: event.target.value }))}
                aria-invalid={errors.purchasedAt ? true : undefined}
                aria-describedby={errors.purchasedAt ? "purchasedAt-error" : undefined}
              />
              <FieldError id="purchasedAt-error" errors={errors.purchasedAt} />
            </div>
          </div>

          <section aria-labelledby="items-title" className="grid gap-2">
            <div className="flex items-center justify-between">
              <h2 id="items-title" className="font-sans text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Articles · {draft.lines.length}
              </h2>
              <span className="font-mono text-sm">{formatEuros(sum)}</span>
            </div>
            <PurchaseLines
              lines={draft.lines}
              productsById={productsById}
              onChange={updateLine}
              onRemove={removeLine}
              showMissing={Boolean(errors.lines)}
            />
            <EntityCombobox
              id="productPicker"
              name="productPicker"
              label="Ajouter un article"
              placeholder="Rechercher un produit…"
              options={products.map((product) => ({
                id: product.id,
                label: productLabel(product),
                imageUrl: product.photoPath ? uploadUrl(product.photoPath, { thumb: true }) : null,
              }))}
              value={null}
              onChange={(productId) => addProduct(productId)}
              onCreate={setNewProductName}
            />
            <FieldError id="lines-error" errors={errors.lines} />
            <input type="hidden" name="lines" value={JSON.stringify(draft.lines.map(draftLinePayload))} />
          </section>
        </div>

        <aside className="grid gap-4 rounded-md border bg-card p-4 lg:sticky lg:top-4">
          <dl className="grid gap-1 text-sm">
            <LinesSummary lines={amounts} />
          </dl>
          <div className="grid gap-1.5">
            <Label htmlFor="total">Total payé</Label>
            <Input
              id="total"
              name="total"
              inputMode="decimal"
              className="font-mono text-lg font-bold"
              value={total}
              placeholder={sum > 0 ? formatEurosInput(sum) : undefined}
              // Once touched, the total stays manual (even empty) so it can be cleared and retyped.
              onChange={(event) => setDraft((current) => ({ ...current, total: event.target.value, totalEdited: true }))}
              aria-invalid={errors.total ? true : undefined}
              aria-describedby={errors.total ? "total-error" : undefined}
            />
            <FieldError id="total-error" errors={errors.total} />
          </div>
          <ReceiptField name="receipt" currentPath={receiptPath} errors={errors.receipt} />
          {state && !state.ok && state.message && (
            <p role="alert" className="text-sm text-destructive">
              {state.message}
            </p>
          )}
          <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-card p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:static lg:border-0 lg:bg-transparent lg:p-0">
            {/* Stays disabled after a success: the detail page is still loading. */}
            <SubmitButton pending={pending || state?.ok === true}>
              {mode === "create" ? "Enregistrer la course" : "Enregistrer les modifications"}
            </SubmitButton>
          </div>
        </aside>
      </form>

      <ResponsiveDialog open={newStoreName !== null} onOpenChange={(open) => !open && setNewStoreName(null)} title="Nouveau magasin">
        {newStoreName !== null && (
          <StoreForm
            action={createStore}
            defaultName={newStoreName}
            onDone={(created) => {
              setStores((current) => [...current, created].sort(byName));
              chooseStore(created.id);
              setNewStoreName(null);
            }}
          />
        )}
      </ResponsiveDialog>

      <ResponsiveDialog open={newProductName !== null} onOpenChange={(open) => !open && setNewProductName(null)} title="Nouveau produit">
        {newProductName !== null && (
          <ProductForm
            action={createProduct}
            defaultName={newProductName}
            priceLabel={store ? `Prix chez ${store.name}` : "Prix"}
            onDone={(created, priceCents) => {
              setProducts((current) => [...current, created].sort(byName));
              addProduct(created.id, priceCents);
              setNewProductName(null);
            }}
          />
        )}
      </ResponsiveDialog>
    </>
  );
}
