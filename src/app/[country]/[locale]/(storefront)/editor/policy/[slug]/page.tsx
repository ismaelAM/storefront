import type { Data } from "@puckeditor/core";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getPolicy } from "@/lib/data/policies";
import { getSitePageData } from "@/lib/puck/get-site-page-data";
import { PolicyEditorClient } from "./PolicyEditorClient";

interface Props {
  params: Promise<{ country: string; locale: string; slug: string }>;
}

export default async function PolicyEditorPage({ params }: Props) {
  await connection();
  const { country, locale, slug } = await params;
  const policy = await getPolicy(slug, { country, locale });
  if (!policy) notFound();
  const fallbackData: Data = {
    content: [{ type: "PolicyChrome", props: { id: "policy-chrome", title: policy.name, intro: "" } }],
    root: {},
  };
  const initialData = await getSitePageData(`policy:${slug}`, fallbackData);
  return <PolicyEditorClient slug={slug} initialData={initialData} />;
}
