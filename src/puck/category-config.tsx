"use client";

import type { Config } from "@puckeditor/core";
import { CategoryHeroBlock } from "@/puck/CategoryHeroBlock";
import { CategoryProductGridBlock } from "@/puck/CategoryProductGridBlock";

type CategoryHeroProps = {
  title: string;
  description: string;
  backgroundImage: string;
  backgroundColor: string;
  titleColor: string;
  textColor: string;
  minHeight: "small" | "medium" | "large";
};

type CategoryProductGridProps = {
  title: string;
  subtitle: string;
  columns: "2" | "3" | "4";
  imageAspect: "square" | "4/3" | "16/9";
  alignment: "left" | "center" | "right";
  backgroundColor: string;
  titleColor: string;
  textColor: string;
  priceColor: string;
  cardBackgroundColor: string;
};

type Components = {
  CategoryHero: CategoryHeroProps;
  CategoryProductGrid: CategoryProductGridProps;
};

export const categoryConfig: Config<Components> = {
  categories: {
    content: {
      title: "Categoría",
      components: ["CategoryHero", "CategoryProductGrid"],
    },
  },
  components: {
    CategoryHero: {
      label: "Cabecera de categoría",
      fields: {
        title: { type: "text", label: "Título" },
        description: { type: "textarea", label: "Descripción" },
        backgroundImage: { type: "text", label: "Imagen de fondo" },
        backgroundColor: { type: "text", label: "Color de fondo" },
        titleColor: { type: "text", label: "Color del título" },
        textColor: { type: "text", label: "Color de la descripción" },
        minHeight: {
          type: "select",
          label: "Altura",
          options: [
            { label: "Pequeña", value: "small" },
            { label: "Mediana", value: "medium" },
            { label: "Grande", value: "large" },
          ],
        },
      },
      defaultProps: {
        title: "",
        description: "",
        backgroundImage: "",
        backgroundColor: "#f9fafb",
        titleColor: "#111827",
        textColor: "#4b5563",
        minHeight: "medium",
      },
      render: (props) => <CategoryHeroBlock {...props} />,
    },
    CategoryProductGrid: {
      label: "Productos de esta categoría",
      fields: {
        title: { type: "text", label: "Título" },
        subtitle: { type: "textarea", label: "Subtítulo" },
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
        alignment: {
          type: "select",
          label: "Alineación",
          options: [
            { label: "Izquierda", value: "left" },
            { label: "Centro", value: "center" },
            { label: "Derecha", value: "right" },
          ],
        },
        backgroundColor: { type: "text", label: "Color de fondo" },
        titleColor: { type: "text", label: "Color del título" },
        textColor: { type: "text", label: "Color del texto" },
        priceColor: { type: "text", label: "Color del precio" },
        cardBackgroundColor: { type: "text", label: "Color de tarjeta" },
      },
      defaultProps: {
        title: "Productos",
        subtitle: "",
        columns: "4",
        imageAspect: "square",
        alignment: "center",
        backgroundColor: "#ffffff",
        titleColor: "#111827",
        textColor: "#6b7280",
        priceColor: "#111827",
        cardBackgroundColor: "#ffffff",
      },
      render: (props) => <CategoryProductGridBlock {...props} />,
    },
  },
};
