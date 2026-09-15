import type { Category, Product } from "@spree/sdk";
import { FieldLabel } from "@puckeditor/core";
import { useMemo, useState } from "react";
import { usePuckProducts } from "@/components/puck/PuckProductsContext";

interface ColorFieldRenderProps {
  field: { label?: string };
  value?: string;
  onChange: (value: string) => void;
}

interface MultiSelectFieldProps {
  label: string;
  value?: string[];
  onChange: (value: string[]) => void;
  items: Array<{ id: string; label: string; hint?: string }>;
  emptyLabel: string;
  searchLabel: string;
}

function MultiSelectField({ label, value = [], onChange, items, emptyLabel, searchLabel }: MultiSelectFieldProps) {
  const [query, setQuery] = useState("");
  const selected = new Set(Array.isArray(value) ? value : []);
  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return items;
    return items.filter((item) => `${item.label} ${item.hint ?? ""}`.toLocaleLowerCase().includes(normalizedQuery));
  }, [items, query]);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  };

  return (
    <FieldLabel label={label}>
      <input
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
        placeholder={searchLabel}
        className="mb-2 h-8 w-full rounded border border-gray-300 px-2 text-xs outline-none focus:border-gray-500"
      />
      <div className="max-h-56 overflow-y-auto rounded border border-gray-200 bg-white">
        {filteredItems.length === 0 ? (
          <div className="px-2 py-3 text-xs text-gray-500">{emptyLabel}</div>
        ) : (
          filteredItems.map((item) => (
            <label key={item.id} className="flex cursor-pointer items-start gap-2 border-b border-gray-100 px-2 py-1.5 text-xs last:border-b-0 hover:bg-gray-50">
              <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} className="mt-0.5 size-3.5 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-gray-800">{item.label}</span>
                {item.hint && <span className="block truncate text-[10px] text-gray-400">{item.hint}</span>}
              </span>
            </label>
          ))
        )}
      </div>
      <div className="mt-1 text-[10px] text-gray-400">{selected.size} seleccionado{selected.size === 1 ? "" : "s"}</div>
    </FieldLabel>
  );
}

function flattenCategories(categories: Category[], output: Array<{ id: string; label: string; hint?: string }> = [], level = 0) {
  for (const category of categories) {
    output.push({ id: category.id, label: `${"— ".repeat(level)}${category.name}`, hint: category.permalink });
    if (category.children?.length) flattenCategories(category.children, output, level + 1);
  }
  return output;
}

interface VariantOptionValue {
  id?: string;
  name?: string;
  option_type?: { name?: string };
}

function getVariantItems(products: Product[]) {
  const seen = new Set<string>();
  const items: Array<{ id: string; label: string; hint?: string }> = [];
  for (const product of products as Array<Product & { option_values?: VariantOptionValue[] }>) {
    for (const option of product.option_values ?? []) {
      const id = option.id ?? `${option.option_type?.name ?? "Variante"}:${option.name ?? ""}`;
      if (seen.has(id) || !option.name) continue;
      seen.add(id);
      items.push({ id, label: option.name, hint: option.option_type?.name });
    }
  }
  return items.sort((a, b) => a.label.localeCompare(b.label));
}

export function colorField(label: string) {
  return {
    type: "custom" as const,
    label,
    render: ({ field, value, onChange }: ColorFieldRenderProps) => {
      const normalizedValue = typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#ffffff";
      return (
        <FieldLabel label={field.label ?? label}>
          <div className="flex items-center gap-2">
            <input type="color" aria-label={field.label ?? label} value={normalizedValue} onChange={(event) => onChange(event.currentTarget.value)} className="h-9 w-12 cursor-pointer rounded border border-gray-300 bg-white p-1" />
            <span className="font-mono text-xs text-gray-500">{normalizedValue}</span>
          </div>
        </FieldLabel>
      );
    },
  };
}

export function productPickerField(label = "Productos concretos") {
  return {
    type: "custom" as const,
    label,
    render: ({ value, onChange }: { value?: string[]; onChange: (value: string[]) => void }) => {
      const { products } = usePuckProducts();
      const items = products.map((product) => ({ id: product.id, label: product.name, hint: product.slug }));
      return <MultiSelectField label={label} value={value} onChange={onChange} items={items} emptyLabel="No hay productos cargados." searchLabel="Buscar producto…" />;
    },
  };
}

export function categoryPickerField(label = "Categorías") {
  return {
    type: "custom" as const,
    label,
    render: ({ value, onChange }: { value?: string[]; onChange: (value: string[]) => void }) => {
      const { categories } = usePuckProducts();
      const items = flattenCategories(categories);
      return <MultiSelectField label={label} value={value} onChange={onChange} items={items} emptyLabel="No hay categorías cargadas." searchLabel="Buscar categoría…" />;
    },
  };
}

export function variantPickerField(label = "Variantes") {
  return {
    type: "custom" as const,
    label,
    render: ({ value, onChange }: { value?: string[]; onChange: (value: string[]) => void }) => {
      const { products } = usePuckProducts();
      const items = getVariantItems(products);
      return <MultiSelectField label={label} value={value} onChange={onChange} items={items} emptyLabel="No hay variantes cargadas." searchLabel="Buscar variante…" />;
    },
  };
}
