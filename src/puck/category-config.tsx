"use client";

import type { Config } from "@puckeditor/core";
import { CategoryHeroBlock } from "@/puck/CategoryHeroBlock";
import { enhancedConfig } from "@/puck/enhanced-config";
import { colorField } from "@/puck/fields";
import { DEFAULT_PALETTE_VALUES } from "@/puck/palette";

type CategoryHeroProps = {
  title: string;
  description: string;
  backgroundImage: string;
  backgroundColor: string;
  titleColor: string;
  textColor: string;
  minHeight: "small" | "medium" | "large";
};

export const categoryConfig: Config = {
  ...enhancedConfig,
  categories: {
    ...(enhancedConfig.categories ?? {}),
    category: {
      title: "Categoría",
      components: ["CategoryHero", "ProductGrid", "RealProductShowcase"],
    },
  },
  components: {
    ...enhancedConfig.components,
    CategoryHero: {
      label: "Cabecera de categoría",
      fields: {
        title: { type: "text", label: "Título" },
        description: { type: "textarea", label: "Descripción" },
        backgroundImage: { type: "text", label: "Imagen de fondo" },
        backgroundColor: colorField("Color de fondo"),
        titleColor: colorField("Color del título"),
        textColor: colorField("Color de la descripción"),
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
        backgroundColor: DEFAULT_PALETTE_VALUES.surfaceAlt,
        titleColor: DEFAULT_PALETTE_VALUES.text,
        textColor: DEFAULT_PALETTE_VALUES.textMuted,
        minHeight: "medium",
      } satisfies CategoryHeroProps,
      render: (props) => (
        <CategoryHeroBlock {...(props as unknown as CategoryHeroProps)} />
      ),
    },
  },
};
