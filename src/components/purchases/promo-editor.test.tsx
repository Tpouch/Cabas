import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { type DraftPromo, emptyDraftPromo } from "@/lib/purchase-draft";
import { PromoEditor } from "./promo-editor";

function Harness({ initial, quantity = 3 }: { initial?: DraftPromo; quantity?: number }) {
  const [promo, setPromo] = useState(initial);
  return <PromoEditor lineKey="a" productName="Penne" promo={promo} quantity={quantity} unitPriceCents={120} onChange={setPromo} />;
}

async function addTwoPlusOne() {
  await userEvent.click(screen.getByRole("button", { name: "Ajouter une promo sur Penne" }));
  await userEvent.click(screen.getByRole("button", { name: "Achetés / offerts" }));
  await userEvent.type(screen.getByLabelText("Articles achetés pour Penne"), "2");
  await userEvent.type(screen.getByLabelText("Articles offerts pour Penne"), "1");
}

describe("PromoEditor", () => {
  it("adds a promotion, shows its discount and folds it into a summary", async () => {
    render(<Harness />);
    await addTwoPlusOne();
    expect(screen.getByRole("status")).toHaveTextContent(/2 achetés = 1 offert · −1,20\s€/);
    await userEvent.click(screen.getByRole("button", { name: "Valider la promo sur Penne" }));
    expect(screen.queryByLabelText("Articles achetés pour Penne")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /2 achetés = 1 offert · −1,20\s€/ })).toBeInTheDocument();
  });

  it("explains how many items the promotion needs", async () => {
    render(<Harness quantity={2} />);
    await addTwoPlusOne();
    expect(screen.getByRole("status")).toHaveTextContent("il faut 3 articles");
  });

  it("marks an out-of-range value and cannot be folded until fixed", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Ajouter une promo sur Penne" }));
    await userEvent.click(screen.getByRole("button", { name: "− %" }));
    await userEvent.type(screen.getByLabelText("Pourcentage de remise pour Penne"), "150");
    expect(screen.getByLabelText("Pourcentage de remise pour Penne")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: "Valider la promo sur Penne" })).toBeDisabled();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("marks the selected kind as pressed", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Ajouter une promo sur Penne" }));
    await userEvent.click(screen.getByRole("button", { name: "Le Ne à −%" }));
    expect(screen.getByRole("button", { name: "Le Ne à −%" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Rang de l’article remisé pour Penne")).toHaveValue("2");
  });

  it("removes the promotion", async () => {
    render(<Harness />);
    await addTwoPlusOne();
    await userEvent.click(screen.getByRole("button", { name: "Retirer la promo sur Penne" }));
    expect(screen.getByRole("button", { name: "Ajouter une promo sur Penne" })).toBeInTheDocument();
  });

  it("reopens a saved promotion from its summary", async () => {
    render(<Harness initial={{ ...emptyDraftPromo(), kind: "PERCENT_OFF", percent: "30" }} />);
    await userEvent.click(screen.getByRole("button", { name: /−30\s%/ }));
    expect(screen.getByLabelText("Pourcentage de remise pour Penne")).toHaveValue("30");
  });
});
