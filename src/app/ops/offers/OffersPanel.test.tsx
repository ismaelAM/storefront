import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OffersPanel } from "./OffersPanel";

afterEach(() => vi.unstubAllGlobals());
describe("Instagram connection check in offers panel", () => {
  it("checks the account and displays the result without requesting publication", async () => {
    const fetcher = vi.fn<typeof fetch>(
      async (url) =>
        new Response(
          JSON.stringify(
            String(url).endsWith("/instagram")
              ? {
                  status: "connected",
                  username: "bisontcg",
                  message: "Cuenta comprobada: @bisontcg.",
                }
              : {
                  snapshot: { dayKey: "2026-10-15", offers: [] },
                  caption: "",
                  instagramConfigured: false,
                },
          ),
        ),
    );
    vi.stubGlobal("fetch", fetcher);
    render(<OffersPanel />);
    fireEvent.click(
      screen.getByRole("button", { name: "Comprobar conexión con Instagram" }),
    );
    await waitFor(() =>
      expect(
        screen.getByText("Cuenta comprobada: @bisontcg."),
      ).toBeInTheDocument(),
    );
    expect(
      fetcher.mock.calls.some(([url]) => String(url).endsWith("/instagram")),
    ).toBe(true);
    expect(
      fetcher.mock.calls.every(
        ([, options]) => !options?.method || options.method === "GET",
      ),
    ).toBe(true);
  });
});
