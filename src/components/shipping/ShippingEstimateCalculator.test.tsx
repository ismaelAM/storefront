import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShippingEstimateCalculator } from "./ShippingEstimateCalculator";

const labels = {
  title: "Calcular envío",
  intro: "Tarifa publicada",
  postalCode: "Código postal",
  weightKg: "Peso (kg)",
  lengthCm: "Largo (cm)",
  widthCm: "Ancho (cm)",
  heightCm: "Alto (cm)",
  calculate: "Calcular",
  busy: "Calculando",
  result: "Coste estimado",
  net: "Base",
  tax: "IVA",
  billableWeight: "Peso facturable",
  volumetricWeight: "Peso volumétrico",
  source: "Fuente",
  scope: "Desde Península a España",
  notice: "El checkout usa las tarifas de Spree",
  limitations: "Sin extras",
  zonePeninsula: "Península",
  zoneBaleares: "Baleares",
  zoneCanarias: "Canarias",
  zoneCeutaMelilla: "Ceuta y Melilla",
  invalidPostalCode: "Código postal inválido",
  invalidWeight: "Peso inválido",
  invalidDimensions: "Dimensiones inválidas",
  oversized: "Caja demasiado grande",
  undersized: "Caja demasiado pequeña",
  tariffExpired: "Tarifa caducada",
  invalidRequest: "Solicitud inválida",
  networkError: "No se pudo calcular",
};
const response = {
  kind: "published_tariff_estimate",
  totalCents: 1365,
  netCents: 1128,
  taxCents: 237,
  billableWeightKg: 1,
  volumetricWeightKg: 0.5,
  zone: "peninsula",
  rateYear: 2026,
};
function fillParcel() {
  for (const [label, value] of [
    ["Código postal", "28001"],
    ["Peso (kg)", "1"],
    ["Largo (cm)", "20"],
    ["Ancho (cm)", "15"],
    ["Alto (cm)", "10"],
  ]) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
}
afterEach(() => vi.unstubAllGlobals());
describe("Shipping estimate form", () => {
  it("shows the returned amount and clears it when the parcel changes", async () => {
    vi.stubGlobal(
      "fetch",
      async () => new Response(JSON.stringify(response), { status: 200 }),
    );
    render(<ShippingEstimateCalculator labels={labels} locale="es" />);
    fillParcel();
    fireEvent.click(screen.getByRole("button", { name: "Calcular" }));
    await screen.findByText(/13,65/);
    expect(
      screen.getByText("El checkout usa las tarifas de Spree"),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Peso (kg)"), {
      target: { value: "5" },
    });
    expect(screen.queryByText(/13,65/)).not.toBeInTheDocument();
  });
  it("shows a localized validation error instead of a quote", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(JSON.stringify({ error: "tariffExpired" }), {
          status: 503,
        }),
    );
    render(<ShippingEstimateCalculator labels={labels} locale="es" />);
    fillParcel();
    fireEvent.click(screen.getByRole("button", { name: "Calcular" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Tarifa caducada"),
    );
    expect(screen.queryByText(/13,65/)).not.toBeInTheDocument();
  });
});
