"use client";

import type { Config } from "@puckeditor/core";
import { ProductEditorialBlock } from "@/puck/ProductEditorialBlock";

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

type ProductComponents = {
  ProductEditorial: ProductEditorialProps;
};

export const productConfig: Config<ProductComponents> = {
  categories: {
    content: {
      title: "Contenido del producto",
      components: ["ProductEditorial"],
    },
  },
  components: {
    ProductEditorial: {
      label: "Bloque de contenido",
      fields: {
        title: {
          type: "text",
          label: "Título",
        },
        text: {
          type: "textarea",
          label: "Texto",
        },
        image: {
          type: "text",
          label: "Imagen (URL)",
        },
        buttonText: {
          type: "text",
          label: "Texto del botón",
        },
        buttonUrl: {
          type: "text",
          label: "URL del botón",
        },
        backgroundColor: {
          type: "text",
          label: "Color de fondo",
        },
        titleColor: {
          type: "text",
          label: "Color del título",
        },
        textColor: {
          type: "text",
          label: "Color del texto",
        },
        buttonColor: {
          type: "text",
          label: "Color del botón",
        },
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
          label: "Redondeado",
          options: [
            { label: "Sin redondeado", value: "none" },
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
        buttonUrl: "#",
        backgroundColor: "#ffffff",
        titleColor: "#111827",
        textColor: "#4b5563",
        buttonColor: "#111827",
        buttonTextColor: "#ffffff",
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
