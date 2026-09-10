"use client";

import { Puck } from "@puckeditor/core";
import type { Product } from "@spree/sdk";
import { PuckProductsProvider } from "@/components/puck/PuckProductsContext";
import { config } from "@/puck/config";

interface EditorClientProps {
  products: Product[];
  country: string;
  locale: string;
}

const initialHomeData = {
  content: [
    {
      type: "Hero",
      props: {
        id: "home-hero",
        title: "Bienvenido a nuestra tienda",
        text: "Descubre nuestros productos.",
        backgroundColor: "#ffffff",
        titleColor: "#111827",
        textColor: "#4b5563",
        backgroundImage: "",
        buttonText: "Comprar ahora",
        buttonUrl: "/products",
        contentPosition: "center",
        height: "medium",
        overlay: "rgba(0,0,0,0.25)",
      },
    },
    {
      type: "ProductGrid",
      props: {
        id: "home-products",
        title: "Nuestros productos",
        subtitle: "Descubre nuestra selección.",
        columns: "4",
        imageAspect: "square",
        cardRadius: "medium",
        backgroundColor: "#ffffff",
        cardBackgroundColor: "#ffffff",
        titleColor: "#111827",
        textColor: "#6b7280",
        priceColor: "#111827",
      },
    },
    {
      type: "Banner",
      props: {
        id: "home-banner",
        title: "Descubre nuestras novedades",
        text: "Encuentra tus productos favoritos.",
        buttonText: "Ver productos",
        buttonUrl: "/products",
        backgroundColor: "#111827",
        textColor: "#ffffff",
        buttonColor: "#ffffff",
        buttonTextColor: "#111827",
        alignment: "center",
      },
    },
  ],
  root: {},
};

export function EditorClient({ products, country, locale }: EditorClientProps) {
  return (
    <PuckProductsProvider
      products={products}
      basePath={`/${country}/${locale}`}
    >
      <Puck config={config} data={initialHomeData} />
    </PuckProductsProvider>
  );
}
