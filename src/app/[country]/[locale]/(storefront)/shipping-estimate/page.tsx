import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ShippingEstimateCalculator } from "@/components/shipping/ShippingEstimateCalculator";
import { validateMetadataRoute } from "@/lib/metadata/validate-route";

interface Props {
  params: Promise<{ country: string; locale: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { country, locale } = await params;
  validateMetadataRoute(country, locale);
  const t = await getTranslations({
    locale: locale as Locale,
    namespace: "shippingEstimate",
  });
  return {
    title: t("title"),
    description: t("intro"),
    robots: { index: false, follow: true },
  };
}

export default async function ShippingEstimatePage({ params }: Props) {
  const { country, locale } = await params;
  validateMetadataRoute(country, locale);
  const t = await getTranslations({ locale: locale as Locale });
  return (
    <div className="container mx-auto max-w-2xl px-4 py-10">
      <ShippingEstimateCalculator
        labels={t.raw("shippingEstimate")}
        locale={locale}
        headingLevel={1}
      />
    </div>
  );
}
