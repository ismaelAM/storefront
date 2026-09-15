"use client";

import type { Config } from "@puckeditor/core";
import { config as baseConfig } from "@/puck/config";
import {
  RealProductShowcase,
  type RealProductShowcaseProps,
} from "@/puck/RealProductBlocks";

const {
  Carousel: _Carousel,
  FeaturedProductsHome: _FeaturedProductsHome,
  ProductShowcase: _ProductShowcase,
  ...baseComponents
} = baseConfig.components;

export const enhancedConfig: Config = {
  ...baseConfig,
  categories: {
    ...(baseConfig.categories ?? {}),
    products: {
      title: "Productos reales de Spree",
      components: ["RealProductShowcase"],
    },
  },
  components: {
    ...baseComponents,
    RealProductShowcase: {
      label: "Producto destacado real",
      fields: {
        productPosition: {
          type: "number",
          label: "Producto de la lista",
          min: 1,
          max: 8,
        },
        description: { type: "textarea", label: "Texto introductorio" },
        badge: { type: "text", label: "Etiqueta" },
        buttonText: { type: "text", label: "Texto del botón" },
        backgroundColor: { type: "text", label: "Color del bloque" },
        titleColor: { type: "text", label: "Color del título" },
        textColor: { type: "text", label: "Color del texto" },
        priceColor: { type: "text", label: "Color del precio" },
        buttonColor: { type: "text", label: "Color del botón" },
        buttonTextColor: {
          type: "text",
          label: "Color del texto del botón",
        },
        alignment: {
          type: "select",
          label: "Alineación",
          options: [
            { label: "Izquierda", value: "left" },
            { label: "Centro", value: "center" },
            { label: "Derecha", value: "right" },
          ],
        },
        imagePosition: {
          type: "select",
          label: "Imagen",
          options: [
            { label: "Izquierda", value: "left" },
            { label: "Derecha", value: "right" },
          ],
        },
        imageAspect: {
          type: "select",
          label: "Proporción de imagen",
          options: [
            { label: "Cuadrada", value: "square" },
            { label: "4:3", value: "4/3" },
            { label: "16:9", value: "16/9" },
          ],
        },
        padding: {
          type: "select",
          label: "Espaciado",
          options: [
            { label: "Pequeño", value: "small" },
            { label: "Medio", value: "medium" },
            { label: "Grande", value: "large" },
          ],
        },
      },
      defaultProps: {
        productPosition: 1,
        description: "",
        badge: "",
        buttonText: "Ver producto",
        backgroundColor: "#f3f4f6",
        titleColor: "#111827",
        textColor: "#4b5563",
        priceColor: "#111827",
        buttonColor: "#111827",
        buttonTextColor: "#ffffff",
        alignment: "left",
        imagePosition: "left",
        imageAspect: "square",
        padding: "large",
      } satisfies RealProductShowcaseProps,
      render: (props) => (
        <RealProductShowcase
          {...(props as unknown as RealProductShowcaseProps)}
        />
      ),
    },
  },
};
