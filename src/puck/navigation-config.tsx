"use client";

import type { Config } from "@puckeditor/core";
import type { Category } from "@spree/sdk";

export type NavigationItem = {
  categoryPermalink: string;
  labelOverride: string;
  visible: boolean;
};

export type NavigationAppearance = {
  backgroundColor: string;
  textColor: string;
  hoverBackgroundColor: string;
  hoverTextColor: string;
  width: "small" | "medium" | "large";
  itemRadius: "none" | "small" | "medium" | "large";
  itemSpacing: "compact" | "normal" | "large";
};

type NavigationProps = NavigationAppearance & { items: NavigationItem[] };

function flattenCategories(categories: Category[], output: Category[] = []) {
  for (const category of categories) {
    output.push(category);
    if (category.children?.length) flattenCategories(category.children, output);
  }
  return output;
}

export function createNavigationConfig(
  categories: Category[],
): Config<{ Navigation: NavigationProps }> {
  const options = flattenCategories(categories).map((category) => ({
    label: category.name,
    value: category.permalink,
  }));

  return {
    categories: {
      content: { title: "Barra lateral", components: ["Navigation"] },
    },
    components: {
      Navigation: {
        label: "Barra lateral",
        fields: {
          backgroundColor: { type: "text", label: "Fondo" },
          textColor: { type: "text", label: "Texto" },
          hoverBackgroundColor: { type: "text", label: "Fondo al pasar" },
          hoverTextColor: { type: "text", label: "Texto al pasar" },
          width: {
            type: "select",
            label: "Ancho",
            options: [
              { label: "Pequeña", value: "small" },
              { label: "Mediana", value: "medium" },
              { label: "Grande", value: "large" },
            ],
          },
          itemRadius: {
            type: "select",
            label: "Redondeado de enlaces",
            options: [
              { label: "Ninguno", value: "none" },
              { label: "Pequeño", value: "small" },
              { label: "Medio", value: "medium" },
              { label: "Grande", value: "large" },
            ],
          },
          itemSpacing: {
            type: "select",
            label: "Espaciado",
            options: [
              { label: "Compacto", value: "compact" },
              { label: "Normal", value: "normal" },
              { label: "Amplio", value: "large" },
            ],
          },
          items: {
            type: "array",
            arrayFields: {
              categoryPermalink: {
                type: "select",
                label: "Categoría",
                options,
              },
              labelOverride: {
                type: "text",
                label: "Nombre mostrado (opcional)",
              },
              visible: {
                type: "radio",
                label: "Visible",
                options: [
                  { label: "Sí", value: true },
                  { label: "No", value: false },
                ],
              },
            },
            getItemSummary: (item) =>
              item.labelOverride || item.categoryPermalink || "Categoría",
            defaultItemProps: {
              categoryPermalink: options[0]?.value ?? "",
              labelOverride: "",
              visible: true,
            },
          },
        },
        defaultProps: {
          backgroundColor: "#ffffff",
          textColor: "#374151",
          hoverBackgroundColor: "#f3f4f6",
          hoverTextColor: "#111827",
          width: "medium",
          itemRadius: "medium",
          itemSpacing: "normal",
          items: categories.map((category) => ({
            categoryPermalink: category.permalink,
            labelOverride: "",
            visible: true,
          })),
        },
        render: ({
          items,
          backgroundColor,
          textColor,
          hoverBackgroundColor,
          hoverTextColor,
          width,
          itemRadius,
          itemSpacing,
        }) => {
          const widthClass =
            width === "small"
              ? "max-w-xs"
              : width === "large"
                ? "max-w-lg"
                : "max-w-md";
          const radiusClass =
            itemRadius === "none"
              ? "rounded-none"
              : itemRadius === "small"
                ? "rounded-sm"
                : itemRadius === "large"
                  ? "rounded-xl"
                  : "rounded-md";
          const spacingClass =
            itemSpacing === "compact"
              ? "gap-0.5"
              : itemSpacing === "large"
                ? "gap-3"
                : "gap-1.5";
          return (
            <nav className={`${widthClass} rounded-xl border bg-white p-4`}>
              <div className={`flex flex-col ${spacingClass}`}>
                {items
                  .filter((item) => item.visible)
                  .map((item) => (
                    <div
                      key={item.categoryPermalink}
                      className={`${radiusClass} px-3 py-2 text-sm`}
                      style={{
                        color: textColor,
                        backgroundColor: hoverBackgroundColor,
                      }}
                    >
                      {item.labelOverride || item.categoryPermalink}
                    </div>
                  ))}
              </div>
            </nav>
          );
        },
      },
    },
  };
}
