import Link from "next/link";
import { connection } from "next/server";
import { EditorSectionNav } from "@/components/puck/EditorSectionNav";
import { PRODUCT_CARD_FIELDS } from "@/lib/data/cached";
import { getProducts } from "@/lib/data/products";

interface Props { params: Promise<{ country: string; locale: string }> }

export default async function ProductsEditorPage({ params }: Props) {
  await connection();
  const { country, locale } = await params;
  const basePath = `/${country}/${locale}`;
  const response = await getProducts({ limit: 50, fields: PRODUCT_CARD_FIELDS }, "dtc");
  const products = response.data ?? [];

  return (
    <div className="min-h-screen bg-gray-50">
      <EditorSectionNav basePath={basePath} />
      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-3xl font-bold text-gray-900">Editar productos</h1>
        <p className="mt-2 text-gray-600">Selecciona un producto para abrir su editor visual.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {products.map((product) => (
            <Link key={product.id} href={`${basePath}/editor/product/${product.slug}`} className="overflow-hidden rounded-xl border bg-white transition hover:border-gray-400 hover:shadow-sm">
              <img src={product.thumbnail_url || "https://placehold.co/600x600"} alt={product.name} className="aspect-square w-full object-cover" />
              <div className="p-4">
                <h2 className="font-semibold text-gray-900">{product.name}</h2>
                <p className="mt-1 text-sm text-gray-500">{product.price?.display_amount ?? ""}</p>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
