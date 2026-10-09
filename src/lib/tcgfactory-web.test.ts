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
  it.each([
    ["accessories", "Fundas Magic", "accesorios/fundas-standard"],
    ["board_games", "Magic Innistrad juego de mesa", "juegos-de-mesa/general"],
    ["merchandising", "Figura One Piece", "merchandising"],
    ["tcg", "Disney Lorcana", "tcg/lorcana"],
  ])("uses the %s section when breadcrumbs are generic and ignores global menu labels", (section, title, key) => {
    const html = `<nav><div>Juegos de mesa</div></nav><nav class="breadcrumb">Inicio > Distribución</nav><h1>${title}</h1><dl><dt>Juego:</dt><dd>Disney Lorcana</dd></dl>`;
    expect(parseTcgFactoryPublicProduct(html, "https://tcgfactory.com/es/distribucion/item.html", section).categoryKey).toBe(key);
  });
  it.each(["Restock", "RESTOCK", "Restock 30/10/2026"])("excludes the explicit product status %s", (status) => {
    const product = parseTcgFactoryPublicProduct(`<h1>Fundas</h1><dl><dt>Estado de producto:</dt><dd>${status}</dd></dl><aside>Disponible</aside>`, "https://tcgfactory.com/es/distribucion/fundas.html");
    expect(product.availability).toBe("unavailable");
    expect(mapTcgFactoryPublicAvailability(status)).toBe("unavailable");
  });
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
      <img src="https://tcgfactory.com/img/cms/caja-de-mazo-ashen-white-blanco-dragon-shield.jpg">
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

  it("classifies TCG from its own technical sheet and preserves edition and language", () => {
    const product = parseTcgFactoryPublicProduct(`
      <main><h1>Play Booster Display Lorwyn Eclipsado</h1>
      <dl><dt>Juego:</dt><dd>Magic the Gathering</dd>
      <dt>Tipo de producto:</dt><dd>Play Booster Display</dd>
      <dt>Edición:</dt><dd>Lorwyn Eclipsado</dd>
      <dt>Idioma:</dt><dd>Inglés</dd>
      <dt>Estado de producto:</dt><dd>Disponible</dd></dl></main>`,
      "https://tcgfactory.com/es/distribucion/lorwyn.html");
    expect(product.categoryKey).toBe("tcg/mtg");
    expect(product.options).toMatchObject({ edicion: "Lorwyn Eclipsado", idioma: "Inglés" });
  });

  it.each([
    ["Juegos de mesa", "Catan", "juegos-de-mesa/general"],
    ["Merchandising", "Figura One Piece", "merchandising"],
    ["Pinturas", "Warpaints Fanatic Azul", "pinturas"],
    ["Trading Card Games", "Caja One Piece", "tcg/one-piece"],
  ])("maps the product breadcrumb %s instead of treating everything as an accessory", (section, name, category) => {
    const product = parseTcgFactoryPublicProduct(`
      <nav class="breadcrumb"><span itemprop="name">Inicio</span><span itemprop="name">${section}</span></nav>
      <h1>${name}</h1><dl><dt>Juego:</dt><dd>One Piece Card Game</dd><dt>Estado de producto:</dt><dd>Disponible</dd></dl>`,
      "https://tcgfactory.com/es/distribucion/product.html");
    expect(product.categoryKey).toBe(category);
  });

  it("ignores prices from recommended products outside the current product", () => {
    const html = `<article class="product-miniature"><span class="current-price-value" content="2.00">2,00 €</span></article>
      <h1>Producto actual</h1><span class="current-price-value" content="12.00">12,00 €</span>`;
    expect(parseTcgFactoryAuthenticatedPrice(html)).toBe(12);
  });

  it("uses the highest unit price across authenticated quantity tiers, excluding the public RRP", () => {
    const html = `<h1>Display</h1><div class="current-price"><span itemprop="price" content="9.00">9,00 €</span></div>
      <table class="table-product-discounts"><tbody><tr><td>A partir de 1 uds.</td><td>A partir de 6 uds.</td></tr>
      <tr data-discount-type="percentage" data-discount-quantity="6"><td rel="1" dis="0">12,00€</td><td rel="6" dis="20">8,00€</td></tr></tbody></table>
      <div class="product-prices"><span class="regular-price">25,00 € PVP</span></div>`;
    expect(parseTcgFactoryAuthenticatedPrice(html)).toBe(12);
  });

  it("does not count recommendation links as listing products or pagination", () => {
    const html = `<div id="js-product-list"><article class="product-miniature"><a href="/es/distribucion/current.html">Actual</a></article></div>
      <nav class="pagination"><a href="https://tcgfactory.com/es/trading-card-games?page=2">2</a></nav>
      <aside><a href="/es/distribucion/recommended.html">Recomendado</a><a href="https://tcgfactory.com/es/ofertas?page=99">99</a></aside>`;
    const page = parseTcgFactoryListing(html, "https://tcgfactory.com/es/trading-card-games");
    expect(page.productUrls).toEqual(["https://tcgfactory.com/es/distribucion/current.html"]);
    expect(page.totalPages).toBe(2);
  });
});
