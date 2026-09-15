"use client";

import type { Config } from "@puckeditor/core";
import { CategoryHeroBlock } from "@/puck/CategoryHeroBlock";

type CategoryHeroProps = {
  title: string;
  description: string;
  backgroundImage: string;
  backgroundColor: string;
  titleColor: string;
  textColor: string;
  minHeight: "small" | "medium" | "large";
};

type Components = {
  CategoryHero: CategoryHeroProps;
};

export const categoryConfig: Config<Components> = {
  components: {
    CategoryHero: {
      label: "Cabecera de categoría",
      fields: {
        title: {
          type: "text",
          label: "Título",
        },
        description: {
          type: "textarea",
          label: "Descripción",
        },
        backgroundImage: {
          type: "text",
          label: "Imagen de fondo",
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
          label: "Color de la descripción",
        },
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
  },
};
