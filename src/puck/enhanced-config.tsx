"use client";

import { FieldLabel, type Config } from "@puckeditor/core";
import { PuckProductGrid, type PuckProductGridProps } from "@/components/puck/PuckProductGrid";
import { config as baseConfig } from "@/puck/config";
import { RealProductShowcase, type RealProductShowcaseProps } from "@/puck/RealProductBlocks";

const colorField = (label: string) => ({
  type: "custom" as const,
  label,
  render: ({ field, value, onChange }: { field: { label?: string }; value?: string; onChange: (value: string) => void }) => (
    <FieldLabel label={field.label ?? label}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={field.label ?? label}
          value={typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#ffffff"}
          onChange={(event) => onChange(event.currentTarget.value)}
          className="h-9 w-12 cursor-pointer rounded border border-gray-300 bg-white p-1"
        />
        <span className="font-mono text-xs text-gray-500">{typeof value === "string" ? value : "#ffffff"}</span>
      </div>
    </FieldLabel>
  ),
});

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
        productCount: {
          type: "select",
          label: "Cantidad",
          options: [
            { label: "4 productos", value: "4" },
            { label: "6 productos", value: "6" },
            { label: "8 productos", value: "8" },
          ],
        },
        productFilter: {
          type: "select",
          label: "Mostrar",
          options: [
            { label: "Todos", value: "all" },
            { label: "Disponibles", value: "available" },
            { label: "En oferta", value: "sale" },
          ],
        },
        variantFilter: {
          type: "text",
          label: "Filtrar por variante",
        },
        columns: {
          type: "select",
          label: "Columnas",
          options: [
            { label: "2", value: "2" },
            { label: "3", value: "3" },
            { label: "4", value: "4" },
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
        productCount: "8",
        productFilter: "all",
        variantFilter: "",
        columns: "4",
        imageAspect: "square",
        cardRadius: "medium",
        backgroundColor: "#ffffff",
        cardBackgroundColor: "#ffffff",
        titleColor: "#111827",
        textColor: "#6b7280",
        priceColor: "#111827",
      } satisfies PuckProductGridProps,
      render: (props) => <PuckProductGrid {...(props as unknown as PuckProductGridProps)} />,
    },
    RealProductShowcase: {
      label: "Producto destacado real",
      fields: {
        productPosition: { type: "number", label: "Producto de la lista", min: 1, max: 8 },
        backgroundColor: colorField("Color del bloque"),
        titleColor: colorField("Color del título"),
        textColor: colorField("Color del texto"),
        priceColor: colorField("Color del precio"),
        buttonColor: colorField("Color del botón"),
        buttonTextColor: colorField("Color del texto del botón"),
        alignment: { type: "select", label: "Alineación", options: [{ label: "Izquierda", value: "left" }, { label: "Centro", value: "center" }, { label: "Derecha", value: "right" }] },
        imagePosition: { type: "select", label: "Imagen", options: [{ label: "Izquierda", value: "left" }, { label: "Derecha", value: "right" }] },
        imageAspect: { type: "select", label: "Proporción de imagen", options: [{ label: "Cuadrada", value: "square" }, { label: "4:3", value: "4/3" }, { label: "16:9", value: "16/9" }] },
        padding: { type: "select", label: "Espaciado", options: [{ label: "Pequeño", value: "small" }, { label: "Medio", value: "medium" }, { label: "Grande", value: "large" }] },
      },
      defaultProps: {
        productPosition: 1,
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
      render: (props) => <RealProductShowcase {...(props as unknown as RealProductShowcaseProps)} />,
    },
  },
};
