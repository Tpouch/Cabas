import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DRAFT_STORAGE_KEY, serializeDraft } from "@/lib/purchase-draft";
import { PurchaseForm } from "./purchase-form";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const stores = [{ id: "lidl", name: "Lidl", address: null, logoPath: null }];
const penne = { id: "penne", name: "Penne Rigate", brand: "Barilla", photoPath: null, sizeValue: 500, sizeUnit: "G" as const, bestPriceCents: 99 };
const riz = { id: "riz", name: "Riz", brand: null, photoPath: null, sizeValue: 1000, sizeUnit: "G" as const, bestPriceCents: null };
const priceIndex = { lidl: { penne: 99 } };

function renderForm(overrides: Partial<Parameters<typeof PurchaseForm>[0]> = {}) {
  const props = {
    mode: "create" as const,
    stores,
    products: [penne],
    priceIndex,
    today: "2026-10-03",
    action: vi.fn().mockResolvedValue({ ok: true, data: { id: "p1" } }),
    createStore: vi.fn(),
    createProduct: vi.fn(),
    ...overrides,
  };
  render(<PurchaseForm {...props} />);
  return props;
}

async function chooseStore() {
  await userEvent.click(screen.getByRole("combobox", { name: "Magasin" }));
  await userEvent.click(screen.getByRole("option", { name: "Lidl" }));
}

async function addPenne() {
  await userEvent.click(screen.getByRole("combobox", { name: "Ajouter un article" }));
  await userEvent.click(screen.getByRole("option", { name: "Penne Rigate · Barilla · 500 g" }));
}

describe("PurchaseForm", () => {
  afterEach(() => {
    window.localStorage.clear();
    push.mockReset();
  });

  it("prefills the store's current price and keeps a running sum", async () => {
    renderForm();
    await chooseStore();
    await addPenne();
    expect(screen.getByLabelText("Prix unitaire de Penne Rigate")).toHaveValue("0,99");
    await userEvent.click(screen.getByRole("button", { name: "Augmenter" }));
    expect(screen.getByLabelText("Quantité de Penne Rigate")).toHaveValue("2");
    expect(screen.getByLabelText("Total payé")).toHaveValue("1,98");
    expect(screen.getAllByText(/1,98\s€/).length).toBeGreaterThan(0);
  });

  it("keeps a total the user typed", async () => {
    renderForm();
    await chooseStore();
    await addPenne();
    await userEvent.clear(screen.getByLabelText("Total payé"));
    await userEvent.type(screen.getByLabelText("Total payé"), "0,50");
    await userEvent.click(screen.getByRole("button", { name: "Augmenter" }));
    expect(screen.getByLabelText("Total payé")).toHaveValue("0,50");
  });

  it("fills empty prices when the store is chosen after the items", async () => {
    renderForm();
    await addPenne();
    expect(screen.getByLabelText("Prix unitaire de Penne Rigate")).toHaveValue("");
    await chooseStore();
    expect(screen.getByLabelText("Prix unitaire de Penne Rigate")).toHaveValue("0,99");
  });

  it("adds one more to an item that is already listed", async () => {
    renderForm();
    await addPenne();
    await addPenne();
    expect(screen.getAllByLabelText("Quantité de Penne Rigate")).toHaveLength(1);
    expect(screen.getByLabelText("Quantité de Penne Rigate")).toHaveValue("2");
  });

  it("restores a draft and drops items whose product was deleted", async () => {
    window.localStorage.setItem(
      DRAFT_STORAGE_KEY,
      serializeDraft({
        storeId: "lidl",
        purchasedAt: "2026-10-02",
        lines: [
          { key: "a", productId: "penne", quantity: "3", unitPrice: "0,99" },
          { key: "b", productId: "deleted", quantity: "1", unitPrice: "1,00" },
        ],
        total: "",
        totalEdited: false,
      }),
    );
    renderForm();
    expect(await screen.findByRole("combobox", { name: "Magasin" })).toHaveTextContent("Lidl");
    expect(screen.getByLabelText("Quantité de Penne Rigate")).toHaveValue("3");
    expect(screen.getAllByRole("button", { name: /^Retirer/ })).toHaveLength(1);
    expect(screen.getByLabelText("Date")).toHaveValue("2026-10-02");
  });

  it("opens normally when the saved draft is unreadable", async () => {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, "{broken");
    renderForm();
    expect(await screen.findByText(/Aucun article pour l’instant/)).toBeInTheDocument();
  });

  it("sends the lines and clears the draft after saving", async () => {
    const props = renderForm();
    await chooseStore();
    await addPenne();
    await userEvent.click(screen.getByRole("button", { name: "Augmenter" }));
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer la course" }));

    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/purchases/p1"));
    const sent = (props.action as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as FormData;
    expect(sent.get("storeId")).toBe("lidl");
    expect(sent.get("purchasedAt")).toBe("2026-10-03");
    expect(sent.get("total")).toBe("1,98");
    expect(JSON.parse(sent.get("lines") as string)).toEqual([{ productId: "penne", quantity: 2, unitPriceCents: 99 }]);
    expect(window.localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
  });

  it("creates a missing product with its price in the chosen store", async () => {
    const original = window.matchMedia;
    // Use the desktop dialog in jsdom.
    window.matchMedia = ((query: string) => ({ ...original(query), matches: true })) as typeof window.matchMedia;
    try {
      const createProduct = vi.fn().mockResolvedValue({ ok: true, data: riz });
      renderForm({ createProduct });
      await chooseStore();
      await userEvent.click(screen.getByRole("combobox", { name: "Ajouter un article" }));
      await userEvent.type(screen.getByPlaceholderText("Rechercher…"), "Riz");
      await userEvent.click(screen.getByRole("option", { name: "Créer « Riz »" }));

      const dialog = await screen.findByRole("dialog", { name: "Nouveau produit" });
      await userEvent.type(within(dialog).getByLabelText("Contenance"), "1000");
      await userEvent.type(within(dialog).getByLabelText("Prix chez Lidl"), "2,79");
      await userEvent.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

      expect(await screen.findByLabelText("Prix unitaire de Riz")).toHaveValue("2,79");
    } finally {
      window.matchMedia = original;
    }
  });
});

describe("PurchaseForm after saving", () => {
  afterEach(() => window.localStorage.clear());

  it("cannot be submitted a second time while the detail page loads", async () => {
    const props = renderForm();
    await chooseStore();
    await addPenne();
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer la course" }));
    await vi.waitFor(() => expect(push).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Enregistrer la course" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer la course" }));
    expect(props.action).toHaveBeenCalledTimes(1);
  });
});

describe("PurchaseForm price field", () => {
  afterEach(() => window.localStorage.clear());

  it("does not flag an empty price as an error, only an unreadable one", async () => {
    renderForm();
    await addPenne();
    const price = screen.getByLabelText("Prix unitaire de Penne Rigate");
    expect(price).toHaveValue("");
    expect(price).not.toHaveAttribute("aria-invalid");
    await userEvent.type(price, "abc");
    expect(price).toHaveAttribute("aria-invalid", "true");
  });
});
