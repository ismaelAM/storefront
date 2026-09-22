"use client";

import type { Config, Slot } from "@puckeditor/core";
import { colorField } from "@/puck/fields";
import { ProductEditorialBlock } from "@/puck/ProductEditorialBlock";
import {
  ProductColumnsBlock,
  ProductLayoutBlock,
} from "@/puck/ProductLayoutBlocks";
import { DEFAULT_PALETTE_VALUES } from "@/puck/palette";

type ProductEditorialProps = {
  title: string;
  text: string;
  image: string;
  buttonText: string;
  buttonUrl: string;
  backgroundColor: string;
  titleColor: string;
  textColor: string;
  buttonColor: string;
  buttonTextColor: string;
  alignment: "left" | "center" | "right";
  width: "small" | "medium" | "large" | "full";
  position: "top" | "center" | "bottom";
  padding: "small" | "medium" | "large";
  imagePosition: "top" | "left" | "right" | "bottom";
  borderRadius: "none" | "small" | "medium" | "large";
};

type ProductSectionProps = {
  backgroundColor: string;
  width: "medium" | "large" | "full";
  alignment: "left" | "center" | "right";
  padding: "small" | "medium" | "large";
  content: Slot;
};

type ProductColumnsProps = {
  backgroundColor: string;
  gap: "small" | "medium" | "large";
  padding: "small" | "medium" | "large";
  left: Slot;
  right: Slot;
};

type ProductComponents = {
  ProductEditorial: ProductEditorialProps;
  ProductSection: ProductSectionProps;
  ProductColumns: ProductColumnsProps;
};

export const productConfig: Config<ProductComponents> = {
  categories: {
    content: {
      title: "Contenido del producto",
      components: ["ProductSection", "ProductColumns", "ProductEditorial"],
    },
  },
  components: {
    ProductSection: {
      label: "Sección de contenido",
      fields: {
        backgroundColor: colorField("Color de fondo"),
        width: {
          type: "select",
          label: "Ancho",
          options: [
            { label: "Mediano", value: "medium" },
            { label: "Grande", value: "large" },
            { label: "Completo", value: "full" },
          ],
        },
        alignment: {
          type: "select",
          label: "Posición horizontal",
          options: [
            { label: "Izquierda", value: "left" },
            { label: "Centro", value: "center" },
            { label: "Derecha", value: "right" },
          ],
        },
        padding: {
          type: "select",
          label: "Espaciado",
          options: [
            { label: "Pequeño", value: "small" },
            { label: "Mediano", value: "medium" },
            { label: "Grande", value: "large" },
          ],
        },
        content: { type: "slot" },
      },
      defaultProps: {
        backgroundColor: DEFAULT_PALETTE_VALUES.background,
        width: "large",
        alignment: "center",
        padding: "medium",
        content: [],
      },
      render: ({
        backgroundColor,
        width,
        alignment,
        padding,
        content: Content,
      }) => (
        <ProductLayoutBlock
          backgroundColor={backgroundColor}
          width={width}
          alignment={alignment}
          padding={padding}
          Content={Content}
        />
      ),
    },
    ProductColumns: {
      label: "Dos columnas",
      fields: {
        backgroundColor: colorField("Color de fondo"),
        gap: {
          type: "select",
          label: "Separación",
          options: [
            { label: "Pequeña", value: "small" },
            { label: "Mediana", value: "medium" },
            { label: "Grande", value: "large" },
          ],
        },
        padding: {
          type: "select",
          label: "Espaciado",
          options: [
            { label: "Pequeño", value: "small" },
            { label: "Mediano", value: "medium" },
            { label: "Grande", value: "large" },
          ],
        },
        left: { type: "slot" },
        right: { type: "slot" },
      },
      defaultProps: {
        backgroundColor: DEFAULT_PALETTE_VALUES.background,
        gap: "medium",
        padding: "medium",
        left: [],
        right: [],
      },
      render: ({ backgroundColor, gap, padding, left: Left, right: Right }) => (
        <ProductColumnsBlock
          backgroundColor={backgroundColor}
          gap={gap}
          padding={padding}
          Left={Left}
          Right={Right}
        />
      ),
    },
    ProductEditorial: {
      label: "Bloque de contenido",
      fields: {
        title: { type: "text", label: "Título" },
        text: { type: "textarea", label: "Texto" },
        image: { type: "text", label: "Imagen (URL)" },
        buttonText: { type: "text", label: "Texto del botón" },
        buttonUrl: { type: "text", label: "URL del botón" },
        backgroundColor: colorField("Color de fondo"),
        titleColor: colorField("Color del título"),
        textColor: colorField("Color del texto"),
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
        width: {
          type: "select",
          label: "Ancho del contenido",
          options: [
            { label: "Pequeño", value: "small" },
            { label: "Mediano", value: "medium" },
            { label: "Grande", value: "large" },
            { label: "Completo", value: "full" },
          ],
        },
        position: {
          type: "select",
          label: "Posición vertical",
          options: [
            { label: "Arriba", value: "top" },
            { label: "Centro", value: "center" },
            { label: "Abajo", value: "bottom" },
          ],
        },
        padding: {
          type: "select",
          label: "Espaciado",
          options: [
            { label: "Pequeño", value: "small" },
            { label: "Mediano", value: "medium" },
            { label: "Grande", value: "large" },
          ],
        },
        imagePosition: {
          type: "select",
          label: "Posición de la imagen",
          options: [
            { label: "Arriba", value: "top" },
            { label: "Izquierda", value: "left" },
            { label: "Derecha", value: "right" },
            { label: "Abajo", value: "bottom" },
          ],
        },
        borderRadius: {
          type: "select",
          label: "Bordes",
          options: [
            { label: "Sin redondeo", value: "none" },
            { label: "Pequeño", value: "small" },
            { label: "Mediano", value: "medium" },
            { label: "Grande", value: "large" },
          ],
        },
      },
      defaultProps: {
        title: "",
        text: "",
        image: "",
        buttonText: "",
        buttonUrl: "",
        backgroundColor: DEFAULT_PALETTE_VALUES.surface,
        titleColor: DEFAULT_PALETTE_VALUES.text,
        textColor: DEFAULT_PALETTE_VALUES.textMuted,
        buttonColor: DEFAULT_PALETTE_VALUES.primary,
        buttonTextColor: DEFAULT_PALETTE_VALUES.primaryText,
        alignment: "left",
        width: "large",
        position: "center",
        padding: "medium",
        imagePosition: "top",
        borderRadius: "medium",
      },
      render: (props) => <ProductEditorialBlock {...props} />,
    },
  },
};
