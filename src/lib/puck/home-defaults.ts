import type { Data } from "@puckeditor/core";

export const DEFAULT_HOME_DATA: Data = {
  content: [
    {
      type: "HeroHome",
      props: {
        id: "hero-home",
        title: "Bison TCG Storefront",
        text: "Un storefront de código abierto listo para producción, construido con Next.js, React y el SDK TypeScript de Spree. Alójalo tú mismo. Tu stack. Sin dependencia de proveedores. Sin comisiones de plataforma.",
        primaryButtonText: "Ver todo",
        primaryButtonUrl: "/products",
        secondaryButtonText: "Fork en GitHub",
        secondaryButtonUrl: "https://github.com/spree/storefront",
        tertiaryButtonText: "Guía de inicio rápido",
        tertiaryButtonUrl:
          "https://spreecommerce.org/docs/developer/getting-started/quickstart",
        titleColor: "#111827",
        textColor: "#4B5563",
        backgroundColor: "#FFFFFF",
      },
    },
    {
      type: "FeaturedProductsHome",
      props: {
        id: "featured-products-home",
        title: "Productos destacados",
        viewAllText: "Ver todo",
        viewAllUrl: "/products",
        columns: "4",
      },
    },
    {
      type: "WholesaleHome",
      props: {
        id: "wholesale-home",
        badge: "Comercio y venta al por mayor",
        title: "¿Compras para tu empresa?",
        description:
          "Los compradores mayoristas aprobados obtienen precios al por mayor en todo el catálogo, pedidos rápidos por lotes mediante SKU y su propio historial de pedidos. Solicítalo una vez: lo revisaremos y activaremos tu cuenta.",
        primaryButtonText: "Entrar al portal mayorista",
        primaryButtonUrl: "/wholesale",
        secondaryButtonText: "Solicitar una cuenta",
        secondaryButtonUrl: "/wholesale/apply",
        pricingTitle: "Precios comerciales",
        pricingDescription:
          "Tus tarifas negociadas se aplican automáticamente en todo el catálogo.",
        quickOrderTitle: "Pedido rápido por lotes",
        quickOrderDescription:
          "Introduce SKUs y cantidades para crear un pedido grande en segundos.",
        ordersTitle: "Historial de pedidos",
        ordersDescription:
          "Consulta pedidos anteriores y vuelve a pedir tus líneas habituales con un par de clics.",
      },
    },
  ],
  root: {},
};
