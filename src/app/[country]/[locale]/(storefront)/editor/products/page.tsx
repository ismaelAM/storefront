import type { Data } from "@puckeditor/core";
import type { Category, Product } from "@spree/sdk";
import { connection } from "next/server";
import { EditorSectionNav } from "@/components/puck/EditorSectionNav";
import { PRODUCT_CARD_FIELDS } from "@/lib/data/cached";
import { getCategories } from "@/lib/data/categories";
import { getProducts } from "@/lib/data/products";
import { getSitePageData } from "@/lib/puck/get-site-page-data";
import { ProductsEditorClient } from "./ProductsEditorClient";

interface Props {
  params: Promise<{ country: string; locale: string }>;
  searchParams: Promise<{ category?: string }>;
}

type CategoryLike = Category & { children?: CategoryLike[] };

function flattenCategories(categories: Category[], output: CategoryLike[] = [], depth = 0) {
  for (const category of categories) {
    const item = { ...category, children: category.children?.map((child) => child) } as CategoryLike;
    (item as CategoryLike & { editorDepth?: number }).editorDepth = depth;
    output.push(item);
    if (category.children?.length) flattenCategories(category.children, output, depth + 1);
  }
  return output;
}

function collectCategoryIds(category: CategoryLike): string[] {
  return [category.id, ...(category.children ?? []).flatMap(collectCategoryIds)];
}

function fallbackData(): Data {
  return {
    content: [
      {
        type: "ProductGrid",
        props: {
          id: "products-grid",
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
        },
      },
    ],
    root: {},
  };
}

export default async function ProductsEditorPage({ params, searchParams }: Props) {
  await connection();
  const { country, locale } = await params;
  const { category: requestedCategory } = await searchParams;
  const basePath = `/${country}/${locale}`;

  const [categoriesResponse, productsResponse] = await Promise.all([
    getCategories({ depth_eq: 0, expand: ["children.children"] }, { country, locale }),
    getProducts({ limit: 50, fields: PRODUCT_CARD_FIELDS }, "dtc"),
  ]);

  const rootCategories = (categoriesResponse.data ?? []) as CategoryLike[];
  const categories = flattenCategories(rootCategories);
  const selectedCategory = categories.find((category) => category.permalink === requestedCategory) ?? categories[0];

  if (!selectedCategory) {
    return (
      <div className="flex h-screen flex-col overflow-hidden">
        <EditorSectionNav basePath={basePath} />
        <main className="flex flex-1 items-center justify-center px-6">
          <p className="text-gray-600">No hay categorías disponibles.</p>
        </main>
      </div>
    );
  }

  const selectedCategoryIds = new Set(collectCategoryIds(selectedCategory));
  const products = (productsResponse.data ?? []).filter((product) =>
    (product.categories ?? []).some((productCategory) => selectedCategoryIds.has(productCategory.id)),
  );

  const pageId = `products:${selectedCategory.permalink}`;
  const initialData = await getSitePageData(pageId, fallbackData());

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <EditorSectionNav basePath={basePath} />
      <div className="flex shrink-0 items-center gap-3 border-b bg-gray-50 px-4 py-3">
        <label htmlFor="products-category" className="text-sm font-medium text-gray-700">Categoría</label>
        <form method="get" className="flex items-center gap-3">
          <select
            id="products-category"
            name="category"
            defaultValue={selectedCategory.permalink}
            className="min-w-72 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm"
          >
            {categories.map((category) => {
              const depth = (category as CategoryLike & { editorDepth?: number }).editorDepth ?? 0;
              return (
                <option key={category.id} value={category.permalink}>
                  {`${"— ".repeat(depth)}${category.name}`}
                </option>
              );
            })}
          </select>
          <button type="submit" className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white">Abrir</button>
        </form>
        <span className="text-sm text-gray-500">Solo presentación visual de la cuadrícula de productos.</span>
      </div>
      <ProductsEditorClient products={products as Product[]} basePath={basePath} pageId={pageId} initialData={initialData} />
    </div>
  );
}
