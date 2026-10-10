import { cookies } from "next/headers";
import { connection } from "next/server";

export async function generateMetadata() {
  await connection();
  return {
    title: "Resumed product title",
    description: "Resumed product description",
    alternates: { canonical: "https://example.com/dynamic" },
  };
}

export default async function Page() {
  // The segment and its adjacent metadata slot must be in the postponed hole.
  const store = await cookies();
  return (
    <main>
      <h1>Resumed product content</h1>
      <p>Cookies: {store.size}</p>
    </main>
  );
}
