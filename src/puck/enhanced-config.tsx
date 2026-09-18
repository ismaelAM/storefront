"use client";

import type { Config } from "@puckeditor/core";
import {
  PuckProductGrid,
  type PuckProductGridProps,
} from "@/components/puck/PuckProductGrid";
import { config as baseConfig } from "@/puck/config";
import {
  RealProductShowcase,
  type RealProductShowcaseProps,
} from "@/puck/RealProductBlocks";
import {
  categoryPickerField,
  colorField,
  productPickerField,
  variantPickerField,
} from "@/puck/fields";
import { DEFAULT_PALETTE_VALUES } from "@/puck/palette";

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
      title: "Productos",
      components: ["ProductGrid", "RealProductShowcase"],
    },
  },
  components: {
    ...baseComponents,
    ProductGrid: {
      label: "Productos",
      fields: {
        title: { type: "text", label: "Título" },
        subtitle: { type: "textarea", label: "Subtítulo" },
        selectedProductIds: productPickerField("Productos concretos"),
        selectedCategoryIds: categoryPickerField("Categorías"),
        selectedVariantIds: variantPickerField("Variantes"),
        productCount: {
          type: "select",
          label: "Cantidad máxima",
          options: ["4", "6", "8", "12", "16", "20"].map((value) => ({
            label: value,
            value,
          })),
        },
        productFilter: {
          type: "select",
          label: "Disponibilidad",
          options: [
            { label: "Todos", value: "all" },
            { label: "Disponibles", value: "available" },
            { label: "En oferta", value: "sale" },
          ],
        },
        variantFilter: { type: "text", label: "Texto de variante" },
        columns: {
          type: "select",
          label: "Columnas",
          options: ["2", "3", "4"].map((value) => ({ label: value, value })),
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
        cardRadius: {
          type: "select",
          label: "Bordes de tarjeta",
          options: [
            { label: "Sin redondeo", value: "none" },
            { label: "Pequeño", value: "small" },
            { label: "Medio", value: "medium" },
            { label: "Grande", value: "large" },
          ],
        },
        backgroundColor: colorField("Fondo"),
        cardBackgroundColor: colorField("Fondo de tarjeta"),
        titleColor: colorField("Color del título"),
        textColor: colorField("Color del texto"),
        priceColor: colorField("Color del precio"),
      },
      defaultProps: {
        title: "Nuestros productos",
        subtitle: "Descubre nuestra selección.",
        selectedProductIds: [],
        selectedCategoryIds: [],
        selectedVariantIds: [],
        productCount: "8",
        productFilter: "all",
        variantFilter: "",
        columns: "4",
        imageAspect: "square",
        cardRadius: "medium",
        backgroundColor: DEFAULT_PALETTE_VALUES.background,
        cardBackgroundColor: DEFAULT_PALETTE_VALUES.surface,
        titleColor: DEFAULT_PALETTE_VALUES.text,
        textColor: DEFAULT_PALETTE_VALUES.textMuted,
        priceColor: DEFAULT_PALETTE_VALUES.text,
      } satisfies PuckProductGridProps,
      render: (props) => (
        <PuckProductGrid {...(props as unknown as PuckProductGridProps)} />
      ),
    },
    RealProductShowcase: {
      label: "Producto destacado real",
      fields: {
        productPosition: {
          type: "number",
          label: "Producto de la lista",
          min: 1,
          max: 8,
        },
        description: { type: "textarea", label: "Descripción" },
        badge: { type: "text", label: "Etiqueta" },
        buttonText: { type: "text", label: "Texto del botón" },
        backgroundColor: colorField("Color del bloque"),
        titleColor: colorField("Color del título"),
        textColor: colorField("Color del texto"),
        priceColor: colorField("Color del precio"),
        buttonColor: colorField("Color del botón"),
        buttonTextColor: colorField("Color del texto del botón"),
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
        backgroundColor: DEFAULT_PALETTE_VALUES.surfaceAlt,
        titleColor: DEFAULT_PALETTE_VALUES.text,
        textColor: DEFAULT_PALETTE_VALUES.textMuted,
        priceColor: DEFAULT_PALETTE_VALUES.text,
        buttonColor: DEFAULT_PALETTE_VALUES.primary,
        buttonTextColor: DEFAULT_PALETTE_VALUES.primaryText,
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
