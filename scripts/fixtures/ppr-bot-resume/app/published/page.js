import { connection } from "next/server";
import { getSitePageData } from "../published-data";

export default async function PublishedPage({ searchParams }) {
  await connection();
  const { page = "home" } = await searchParams;
  const data = await getSitePageData(page, { content: [], root: {} });
  return <h1>{data.content[0]?.props.text ?? "No published content"}</h1>;
}
