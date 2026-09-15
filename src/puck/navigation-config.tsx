"use client";

import type { Category } from "@spree/sdk";
import type { Config } from "@puckeditor/core";

export type NavigationItem = {
  categoryPermalink: string;
  labelOverride: string;
  visible: boolean;
};

type NavigationProps = {
  items: NavigationItem[];
};

function flattenCategories(categories: Category[], output: Category[] = []) {
  for (const category of categories) {
    output.push(category);
    if (category.children?.length) flattenCategories(category.children, output);
  }
  return output;
}

export function createNavigationConfig(categories: Category[]): Config<{ Navigation: NavigationProps }> {
  const options = flattenCategories(categories).map((category) => ({
    label: category.name,
    value: category.permalink,
  }));

  return {
    categories: { content: { title: "Tienda", components: ["Navigation"] } },
    components: {
      Navigation: {
        label: "Navegación de categorías",
        fields: {
          items: {
            type: "array",
            arrayFields: {
              categoryPermalink: {
                type: "select",
                label: "Categoría",
                options,
              },
              labelOverride: { type: "text", label: "Nombre mostrado (opcional)" },
              visible: { type: "radio", label: "Visible", options: [{ label: "Sí", value: true }, { label: "No", value: false }] },
            },
            getItemSummary: (item) => item.labelOverride || item.categoryPermalink || "Categoría",
            defaultItemProps: { categoryPermalink: options[0]?.value ?? "", labelOverride: "", visible: true },
          },
        },
        defaultProps: {
          items: categories.map((category) => ({ categoryPermalink: category.permalink, labelOverride: "", visible: true })),
        },
        render: ({ items }) => (
          <nav className="rounded-xl border bg-white p-6">
            <h2 className="text-lg font-semibold">Navegación</h2>
            <p className="mt-1 text-sm text-gray-500">Arrastra para ordenar. Las categorías siguen siendo las reales de Spree.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {items.filter((item) => item.visible).map((item) => (
                <span key={item.categoryPermalink} className="rounded-full border px-3 py-1 text-sm">
                  {item.labelOverride || item.categoryPermalink}
                </span>
              ))}
            </div>
          </nav>
        ),
      },
    },
  };
}
