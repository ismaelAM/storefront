import type { Category } from "@spree/sdk";
import Link from "next/link";
import { connection } from "next/server";
import { EditorSectionNav } from "@/components/puck/EditorSectionNav";
import { getCategories } from "@/lib/data/categories";
import { PRODUCT_CARD_FIELDS } from "@/lib/data/cached";
import { getProducts } from "@/lib/data/products";

interface Props { params: Promise<{ country: string; locale: string }> }

type CategoryLike = Pick<Category, "id" | "name" | "permalink">;

function flattenCategories(categories: Category[], output: CategoryLike[] = []) {
  for (const category of categories) {
    output.push(category);
    if (category.children?.length) flattenCategories(category.children, output);
  }
  return output;
}

export default async function ProductsEditorPage({ params }: Props) {
  await connection();
  const { country, locale } = await params;
  const basePath = `/${country}/${locale}`;

  const [productsResponse, categoriesResponse] = await Promise.all([
    getProducts({ limit: 50, fields: PRODUCT_CARD_FIELDS }, "dtc"),
    getCategories({ depth_eq: 0, expand: ["children.children"] }, { country, locale }),
  ]);

  const products = productsResponse.data ?? [];
  const categories = flattenCategories(categoriesResponse.data ?? []);

  const productsForCategory = (category: CategoryLike) =>
    products.filter((product) =>
      (product.categories ?? []).some((productCategory) => productCategory.id === category.id),
    );

  return (
    <div className="min-h-screen bg-gray-50">
      <EditorSectionNav basePath={basePath} />
      <main className="mx-auto max-w-7xl px-6 py-10">
        <h1 className="text-3xl font-bold text-gray-900">Editar productos</h1>
        <p className="mt-2 text-gray-600">Las categorías y subcategorías se muestran automáticamente.</p>

        <div className="mt-8 space-y-10">
          {categories.map((category) => {
            const categoryProducts = productsForCategory(category);
            return (
              <section key={category.id}>
                <div className="mb-4 flex items-end justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">{category.name}</h2>
                    <p className="mt-1 text-sm text-gray-500">/{category.permalink}</p>
                  </div>
                  <Link href={`${basePath}/c/${category.permalink}`} className="text-sm text-gray-500 hover:text-gray-900">
                    Ver categoría →
                  </Link>
                </div>

                {categoryProducts.length === 0 ? (
                  <div className="rounded-xl border border-dashed bg-white px-5 py-6 text-sm text-gray-500">
                    No hay productos cargados en esta categoría todavía.
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {categoryProducts.map((product) => (
                      <Link key={`${category.id}-${product.id}`} href={`${basePath}/editor/product/${product.slug}`} className="overflow-hidden rounded-xl border bg-white transition hover:border-gray-400 hover:shadow-sm">
                        <img src={product.thumbnail_url || "https://placehold.co/600x600"} alt={product.name} className="aspect-square w-full object-cover" />
                        <div className="p-4">
                          <h3 className="font-semibold text-gray-900">{product.name}</h3>
                          <p className="mt-1 text-sm text-gray-500">{product.price?.display_amount ?? ""}</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </section>
            );
          })}

          {products.some((product) => !(product.categories ?? []).length) && (
            <section>
              <h2 className="mb-4 text-xl font-semibold text-gray-900">Sin categoría</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {products.filter((product) => !(product.categories ?? []).length).map((product) => (
                  <Link key={product.id} href={`${basePath}/editor/product/${product.slug}`} className="overflow-hidden rounded-xl border bg-white transition hover:border-gray-400 hover:shadow-sm">
                    <img src={product.thumbnail_url || "https://placehold.co/600x600"} alt={product.name} className="aspect-square w-full object-cover" />
                    <div className="p-4"><h3 className="font-semibold text-gray-900">{product.name}</h3><p className="mt-1 text-sm text-gray-500">{product.price?.display_amount ?? ""}</p></div>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
