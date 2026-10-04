import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImageField } from "./image-field";

describe("ImageField", () => {
  afterEach(() => vi.restoreAllMocks());

  it("releases previews it no longer shows", async () => {
    let n = 0;
    const create = vi.fn(() => `blob:preview-${++n}`);
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });

    const { unmount } = render(<ImageField name="photo" label="Photo" />);
    const input = screen.getByLabelText("Photo");
    await userEvent.upload(input, new File(["a"], "a.jpg", { type: "image/jpeg" }));
    await userEvent.upload(input, new File(["b"], "b.jpg", { type: "image/jpeg" }));
    expect(revoke).toHaveBeenCalledWith("blob:preview-1");
    unmount();
    expect(revoke).toHaveBeenCalledWith("blob:preview-2");
  });
});
