import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { useFormAction } from "./use-form-action";

function Form({ onDone }: { onDone: (data: string) => void }) {
  const action = async () => ({ ok: true as const, data: "saved" });
  const { onSubmit } = useFormAction(action, onDone);
  return (
    <form onSubmit={onSubmit}>
      <button type="submit">Envoyer</button>
    </form>
  );
}

function Parent({ spy }: { spy: (data: string) => void }) {
  const [count, setCount] = useState(0);
  return (
    <>
      <span>rendus {count}</span>
      {/* An inline callback that re-renders the parent, like closing a dialog. */}
      <Form
        onDone={(data) => {
          spy(data);
          setCount((c) => c + 1);
        }}
      />
    </>
  );
}

describe("useFormAction", () => {
  it("calls onDone once per successful submission even when the parent re-renders", async () => {
    const spy = vi.fn();
    render(<Parent spy={spy} />);
    await userEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    await screen.findByText("rendus 1");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("useFormAction inside another form", () => {
  it("does not submit the surrounding form", async () => {
    const { createPortal } = await import("react-dom");
    const outer = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    function Inner() {
      const { onSubmit } = useFormAction(async () => ({ ok: true as const, data: null }), () => {});
      return (
        <form onSubmit={onSubmit}>
          <button type="submit">Créer le magasin</button>
        </form>
      );
    }
    render(
      <form onSubmit={outer}>
        {createPortal(<Inner />, document.body)}
      </form>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Créer le magasin" }));
    expect(outer).not.toHaveBeenCalled();
  });
});
