import type { Metadata } from "next";

interface ProductsMetadataParams {
  country: string;
  locale: string;
}

export async function generateProductsMetadata({
  country,
  locale,
}: ProductsMetadataParams): Promise<Metadata> {
  void country;
  void locale;

  return {
    title: "Products",
    description: "Browse our full collection of products.",
    robots: {
      index: false,
      follow: true,
    },
    openGraph: {
      title: "Products",
      description: "Browse our full collection of products.",
      type: "website",
    },
  };
}
