"use client";

import type { Config } from "@puckeditor/core";
import { config as baseConfig } from "@/puck/config";
import {
  RealProductCarousel,
  RealProductShowcase,
  type RealProductCarouselProps,
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
      components: ["RealProductShowcase", "RealProductCarousel"],
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
        backgroundColor: { type: "text", label: "Color de fondo" },
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
    RealProductCarousel: {
      label: "Carrusel de productos reales",
      fields: {
        productCount: {
          type: "number",
          label: "Número de productos",
          min: 1,
          max: 8,
        },
        columns: {
          type: "select",
          label: "Columnas",
          options: [
            { label: "1", value: "1" },
            { label: "2", value: "2" },
            { label: "3", value: "3" },
            { label: "4", value: "4" },
          ],
        },
        title: { type: "text", label: "Título" },
        subtitle: { type: "textarea", label: "Subtítulo" },
        backgroundColor: { type: "text", label: "Color de fondo" },
        titleColor: { type: "text", label: "Color del título" },
        textColor: { type: "text", label: "Color del texto" },
        priceColor: { type: "text", label: "Color del precio" },
        cardBackgroundColor: { type: "text", label: "Color de tarjeta" },
        alignment: {
          type: "select",
          label: "Alineación",
          options: [
            { label: "Izquierda", value: "left" },
            { label: "Centro", value: "center" },
            { label: "Derecha", value: "right" },
          ],
        },
      },
      defaultProps: {
        productCount: 4,
        columns: "4",
        title: "Productos destacados",
        subtitle: "Una selección de productos reales de tu catálogo.",
        backgroundColor: "#ffffff",
        titleColor: "#111827",
        textColor: "#6b7280",
        priceColor: "#111827",
        cardBackgroundColor: "#ffffff",
        alignment: "center",
      } satisfies RealProductCarouselProps,
      render: (props) => (
        <RealProductCarousel
          {...(props as unknown as RealProductCarouselProps)}
        />
      ),
    },
  },
};
