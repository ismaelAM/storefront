import { describe, expect, it } from "vitest";
import {
  isTcgFactoryKnownPollutionMediaReference,
  mapTcgFactoryPublicAvailability,
  parseTcgFactoryAuthenticatedPrice,
  parseTcgFactoryListing,
  parseTcgFactoryMinimumOrderQuantity,
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
    expect(
      tcgFactoryAccessoryCategory("Fundas Standard Matte", "Fundas Standard"),
    ).toBe("accesorios/fundas-standard");
    expect(
      tcgFactoryAccessoryCategory("Caja de mazo Charizard", "Caja de mazo"),
    ).toBe("accesorios/cajas-mazo");
    expect(tcgFactoryAccessoryCategory("Tapete Pikachu", "Tapetes")).toBe(
      "accesorios/tapetes",
    );
    expect(tcgFactoryAccessoryCategory("Set d20", "Dados")).toBe(
      "accesorios/dados",
    );
  });

  it("treats replenishment as unavailable instead of inventing stock", () => {
    expect(mapTcgFactoryPublicAvailability("En reposición")).toBe(
      "unavailable",
    );
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

  it("keeps only images that belong to the current product", () => {
    const html = `
      <h1>Caja de mazo Ashen White Blanco Dragon Shield</h1>
      <meta property="og:image" content="https://tcgfactory.com/34773-thickbox_default/caja-de-mazo-ashen-white-blanco-dragon-shield.jpg">
      <img src="https://tcgfactory.com/img/cms/juego-cartas.png">
      <img src="https://tcgfactory.com/34773-home_default/caja-de-mazo-ashen-white-blanco-dragon-shield.jpg">
      <img src="https://tcgfactory.com/34774-home_default/caja-de-mazo-ashen-white-blanco-dragon-shield.jpg">
      <img src="https://tcgfactory.com/img/m/4.jpg">
      <img src="https://tcgfactory.com/99999-home_default/otro-producto.jpg">
    `;
    const product = parseTcgFactoryPublicProduct(
      html,
      "https://tcgfactory.com/es/distribucion/caja-de-mazo-ashen-white-blanco-dragon-shield.html",
    );

    expect(product.imageUrls).toEqual([
      "https://tcgfactory.com/34773-thickbox_default/caja-de-mazo-ashen-white-blanco-dragon-shield.jpg",
      "https://tcgfactory.com/34774-home_default/caja-de-mazo-ashen-white-blanco-dragon-shield.jpg",
    ]);
  });

  it("normalizes a leading dash in legacy TCG Factory product slugs", () => {
    const html = `
      <h1>Fundas Small Japanese Matte Negro</h1>
      <meta property="og:image" content="https://tcgfactory.com/12345-thickbox_default/fundas-small-59mm-x-86mm-japanese-matte-negro-60-fundas-dragon-shield.jpg">
      <img src="https://tcgfactory.com/img/cms/contacto.png">
    `;
    const product = parseTcgFactoryPublicProduct(
      html,
      "https://tcgfactory.com/es/distribucion/-fundas-small-59mm-x-86mm-japanese-matte-negro-60-fundas-dragon-shield.html",
    );

    expect(product.imageUrls).toEqual([
      "https://tcgfactory.com/12345-thickbox_default/fundas-small-59mm-x-86mm-japanese-matte-negro-60-fundas-dragon-shield.jpg",
    ]);
  });

  it("recognizes legacy TCG Factory site-chrome media without matching product photos", () => {
    for (const url of [
      "https://console.spree.sh/blob/juego-cartas.png",
      "https://console.spree.sh/blob/juego-de-mesa.png",
      "https://console.spree.sh/blob/accesorios.png",
      "https://console.spree.sh/blob/merchandising.png",
      "https://console.spree.sh/blob/marcas.png",
      "https://console.spree.sh/blob/nuestros-productos_2.png",
      "https://console.spree.sh/blob/ofertas.png",
      "https://console.spree.sh/blob/contacto.png",
      "https://console.spree.sh/blob/compra.png",
      "https://console.spree.sh/blob/envio.png",
      "https://console.spree.sh/blob/177.jpg",
    ]) {
      expect(isTcgFactoryKnownPollutionMediaReference(url)).toBe(true);
    }
    expect(
      isTcgFactoryKnownPollutionMediaReference(
        "https://console.spree.sh/blob/dados-runic-shimmering-negro-y-magenta-7-unidades-q-workshop.jpg",
      ),
    ).toBe(false);
    expect(
      isTcgFactoryKnownPollutionMediaReference(
        "https://console.spree.sh/blob/manual-shop-photo.jpg",
      ),
    ).toBe(false);
  });

  it("parses only explicit per-product minimum quantities", () => {
    expect(parseTcgFactoryMinimumOrderQuantity('"minimal_quantity": 6')).toBe(
      6,
    );
    expect(parseTcgFactoryMinimumOrderQuantity("Cantidad mínima: 4")).toBe(4);
    expect(
      parseTcgFactoryMinimumOrderQuantity(
        "La cantidad mínima en el pedido de compra para el producto es 6",
      ),
    ).toBe(6);
    expect(
      parseTcgFactoryMinimumOrderQuantity(
        "<span>Cantidad mínima</span><strong>6</strong>",
      ),
    ).toBe(6);
    expect(parseTcgFactoryMinimumOrderQuantity("Múltiplo de compra: 12")).toBe(
      12,
    );
    expect(
      parseTcgFactoryMinimumOrderQuantity('"minimalPurchase": 150'),
    ).toBeNull();
    expect(
      parseTcgFactoryMinimumOrderQuantity("Pack de 100 fundas"),
    ).toBeNull();
  });

  it("extracts authenticated current-price markup separately", () => {
    expect(
      parseTcgFactoryAuthenticatedPrice(
        '<span class="current-price-value" content="12.34">12,34 €</span>',
      ),
    ).toBe(12.34);
  });
});
