import type { Data } from "@puckeditor/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { cachedGetPolicy, getPolicy } from "@/lib/data/policies";
import {
  getSpanishLegalPolicy,
  type LocalLegalPolicy,
} from "@/lib/legal/spain";
import {
  buildLocalizedAlternates,
  translationFingerprint,
} from "@/lib/metadata/alternates";
import { getSitePageData } from "@/lib/puck/get-site-page-data";
import { getStoreName, getStoreUrl } from "@/lib/store";

interface PolicyPageProps {
  params: Promise<{ country: string; locale: string; slug: string }>;
}

type ResolvedPolicy = Awaited<ReturnType<typeof getPolicy>> | LocalLegalPolicy;

async function resolvePolicy(
  slug: string,
  country: string,
  locale: string,
): Promise<ResolvedPolicy> {
  if (locale.toLowerCase().startsWith("es")) {
    const localPolicy = getSpanishLegalPolicy(slug);
    if (localPolicy) return localPolicy;
  }
  return getPolicy(slug, { country, locale });
}

function isLocalPolicy(
  policy: NonNullable<ResolvedPolicy>,
): policy is LocalLegalPolicy {
  return "local" in policy && policy.local === true;
}

type PolicyVisualConfig = {
  title: string;
  intro: string;
  backgroundColor: string;
  titleColor: string;
  textColor: string;
  contentWidth: "medium" | "large" | "full";
  alignment: "left" | "center";
  spacing: "compact" | "normal" | "large";
};

export async function generateMetadata({
  params,
}: PolicyPageProps): Promise<Metadata> {
  const { country, locale, slug } = await params;
  const policy = await resolvePolicy(slug, country, locale);
  const storeName = getStoreName();
  if (!policy) {
    const t = await getTranslations({
      locale: locale as Locale,
      namespace: "policies",
    });
    return { title: t("policyNotFound"), description: t("noContent") };
  }
  const description = `${policy.name} — ${storeName}`;
  const storeUrl = getStoreUrl();
  const localizedAlternates =
    storeUrl && !isLocalPolicy(policy)
      ? await buildLocalizedAlternates({
          storeUrl,
          country,
          locale,
          path: `/policies/${policy.slug}`,
          currentResourceFingerprint: policyTranslationFingerprint(policy),
          resolvePath: async (target) => {
            const localizedPolicy = await cachedGetPolicy(policy.id, target);
            return localizedPolicy
              ? {
                  path: `/policies/${localizedPolicy.slug}`,
                  fingerprint: policyTranslationFingerprint(localizedPolicy),
                }
              : undefined;
          },
        })
      : undefined;
  return {
    title: policy.name,
    description,
    ...(localizedAlternates
      ? {
          alternates: {
            canonical: localizedAlternates.canonical,
            languages: localizedAlternates.languages,
          },
        }
      : {}),
    openGraph: {
      title: policy.name,
      description,
      ...(localizedAlternates ? { url: localizedAlternates.canonical } : {}),
    },
  };
}

export default async function PolicyPage({
  params,
}: PolicyPageProps): Promise<React.JSX.Element> {
  await connection();
  const { country, slug, locale } = await params;
  const [policy, t] = await Promise.all([
    resolvePolicy(slug, country, locale),
    getTranslations({ locale: locale as Locale, namespace: "policies" }),
  ]);
  if (!policy) notFound();

  const fallbackData: Data = {
    content: [
      {
        type: "PolicyChrome",
        props: { id: "policy-chrome", title: policy.name, intro: "" },
      },
    ],
    root: {},
  };
  const data = await getSitePageData(`policy:${slug}`, fallbackData);
  const rawProps = data.content.find((item) => item.type === "PolicyChrome")
    ?.props as Partial<PolicyVisualConfig> | undefined;
  const config: PolicyVisualConfig = {
    title: rawProps?.title ?? policy.name,
    intro: rawProps?.intro ?? "",
    backgroundColor: rawProps?.backgroundColor ?? "#ffffff",
    titleColor: rawProps?.titleColor ?? "#111827",
    textColor: rawProps?.textColor ?? "#374151",
    contentWidth: rawProps?.contentWidth ?? "large",
    alignment: rawProps?.alignment ?? "left",
    spacing: rawProps?.spacing ?? "large",
  };

  const widthClass =
    config.contentWidth === "medium"
      ? "max-w-3xl"
      : config.contentWidth === "full"
        ? "max-w-none"
        : "max-w-7xl";
  const spacingClass =
    config.spacing === "compact"
      ? "py-6"
      : config.spacing === "normal"
        ? "py-10"
        : "py-16";

  return (
    <div
      className={`mx-auto w-full px-4 sm:px-6 lg:px-8 ${spacingClass}`}
      style={{
        backgroundColor: config.backgroundColor,
        color: config.textColor,
      }}
    >
      <div className={`${widthClass} mx-auto`}>
        <header style={{ textAlign: config.alignment }}>
          <h1
            className="text-3xl font-bold"
            style={{ color: config.titleColor }}
          >
            {config.title}
          </h1>
          {config.intro && <p className="mt-3">{config.intro}</p>}
        </header>
        {policy.body_html ? (
          <div
            className="prose prose-gray mt-8 max-w-none"
            dangerouslySetInnerHTML={{ __html: policy.body_html }}
          />
        ) : policy.body ? (
          <div className="prose prose-gray mt-8 max-w-none whitespace-pre-wrap">
            {policy.body}
          </div>
        ) : (
          <p className="mt-8 text-gray-500">{t("noContent")}</p>
        )}
      </div>
    </div>
  );
}

function policyTranslationFingerprint(policy: {
  name: string;
  slug: string;
  body: string | null;
  body_html: string | null;
}): string {
  return translationFingerprint(
    policy.name,
    policy.slug,
    policy.body,
    policy.body_html,
  );
}
