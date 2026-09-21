import { describe, expect, it } from "vitest";
import {
  mapTcgFactoryPublicAvailability,
  parseTcgFactoryAuthenticatedPrice,
  parseTcgFactoryListing,
  parseTcgFactoryPublicProduct,
  tcgFactoryAccessoryCategory,
} from "../../supabase/functions/_shared/tcgfactory-web";

describe("TcgFactory public web parser", () => {
  it("discovers official product detail URLs and pagination", () => {
    const html = `
      <a href="/es/distribucion/fundas-standard-negro.html">Fundas</a>
      <a href="https://tcgfactory.com/es/distribucion/caja-de-mazo.html">Caja</a>
      <a href="?page=31">31</a>
      <div>Mostrando 1-27 de 825 artículo(s)</div>
    `;
    const page = parseTcgFactoryListing(
      html,
      "https://tcgfactory.com/es/distribucion-accesorios?page=1",
    );
    expect(page.productUrls).toHaveLength(2);
    expect(page.totalPages).toBe(31);
    expect(page.totalItems).toBe(825);
  });

  it("maps the supplier accessory taxonomy to storefront categories", () => {
    expect(tcgFactoryAccessoryCategory("Fundas Standard Matte", "Fundas Standard"))
      .toBe("accesorios/fundas-standard");
    expect(tcgFactoryAccessoryCategory("Caja de mazo Charizard", "Caja de mazo"))
      .toBe("accesorios/cajas-mazo");
    expect(tcgFactoryAccessoryCategory("Tapete Pikachu", "Tapetes"))
      .toBe("accesorios/tapetes");
    expect(tcgFactoryAccessoryCategory("Set d20", "Dados"))
      .toBe("accesorios/dados");
  });

  it("treats replenishment as unavailable instead of inventing stock", () => {
    expect(mapTcgFactoryPublicAvailability("En reposición")).toBe("unavailable");
    expect(mapTcgFactoryPublicAvailability("Disponible")).toBe("available");
    expect(mapTcgFactoryPublicAvailability("Preventa")).toBe("preorder");
  });

  it("extracts identity and public reference data but not a purchase cost", () => {
    const html = `
      <h1>Tapete Extended Size Chainsaw Man 90x40 - ABYstyle</h1>
      <dl>
        <dt>Tipo de producto:</dt><dd>Tapete Extended Size</dd>
        <dt>Estado de producto:</dt><dd>En reposición</dd>
        <dt>Referencia:</dt><dd>ABYSTYLE-ABYACC621</dd>
        <dt>EAN:</dt><dd>3665361174776</dd>
        <dt>Fecha de lanzamiento:</dt><dd>28-08-2026</dd>
      </dl>
      <meta itemprop="price" content="20.6529">
      <meta property="og:image" content="https://tcgfactory.com/img/tapete.jpg">
    `;
    const product = parseTcgFactoryPublicProduct(
      html,
      "https://tcgfactory.com/es/distribucion/tapete-chainsaw-man.html",
    );
    expect(product.externalVariantId).toBe("3665361174776");
    expect(product.reference).toBe("ABYSTYLE-ABYACC621");
    expect(product.referencePriceNet).toBe(20.6529);
    expect(product.categoryKey).toBe("accesorios/tapetes");
    expect(product.availability).toBe("unavailable");
    expect(product.metadata.publicReferenceOnly).toBe(true);
  });

  it("extracts authenticated current-price markup separately", () => {
    expect(
      parseTcgFactoryAuthenticatedPrice(
        '<span class="current-price-value" content="12.34">12,34 €</span>',
      ),
    ).toBe(12.34);
  });
});
