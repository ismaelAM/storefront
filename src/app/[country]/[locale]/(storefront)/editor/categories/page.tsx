import Link from "next/link";
import { connection } from "next/server";
import { EditorSectionNav } from "@/components/puck/EditorSectionNav";
import { getCategories } from "@/lib/data/categories";

type CategoryNode = {
  id: string;
  name: string;
  permalink: string;
  children?: CategoryNode[];
};

function collectLeafCategories(categories: CategoryNode[], parents: string[] = []): Array<CategoryNode & { labelPath: string }> {
  return categories.flatMap((category) => {
    const path = [...parents, category.name];
    return category.children?.length
      ? collectLeafCategories(category.children, path)
      : [{ ...category, labelPath: path.join(" / ") }];
  });
}

interface Props { params: Promise<{ country: string; locale: string }> }

export default async function CategoriesEditorPage({ params }: Props) {
  await connection();
  const { country, locale } = await params;
  const basePath = `/${country}/${locale}`;
  const response = await getCategories({ depth_eq: 0, expand: ["children.children"] }, { country, locale });
  const categories = collectLeafCategories((response.data ?? []) as CategoryNode[]);

  return (
    <div className="min-h-screen bg-gray-50">
      <EditorSectionNav basePath={basePath} />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="text-3xl font-bold text-gray-900">Editar tags</h1>
        <p className="mt-2 text-gray-600">Selecciona un tag para abrir directamente su editor visual.</p>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((category) => (
            <Link key={category.id} href={`${basePath}/editor/category/${category.permalink}`} className="rounded-xl border bg-white p-5 transition hover:border-gray-400 hover:shadow-sm">
              <h2 className="font-semibold text-gray-900">{category.name}</h2>
              <p className="mt-1 text-sm text-gray-500">{category.labelPath}</p>
              <p className="mt-1 text-xs text-gray-400">/{category.permalink}</p>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
