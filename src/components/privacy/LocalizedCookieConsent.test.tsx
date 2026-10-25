import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LocalizedCookieConsent } from "./LocalizedCookieConsent";

vi.mock("@next/third-parties/google", () => ({ GoogleTagManager: () => null }));

describe("cookie consent outside the storefront providers", () => {
  it("renders Spanish consent in an independent document shell", async () => {
    window.localStorage.clear();
    render(await LocalizedCookieConsent({ locale: "es", gtmId: "GTM-TEST" }));
    expect(
      await screen.findByRole("dialog", { name: "Privacidad y cookies" }),
    ).toBeVisible();
  });

  it("provides the default messages on non-storefront documents", async () => {
    window.localStorage.clear();
    render(
      await LocalizedCookieConsent({ locale: "unknown", gtmId: "GTM-TEST" }),
    );
    expect(
      await screen.findByRole("dialog", { name: "Privacy and cookies" }),
    ).toBeVisible();
  });
});
