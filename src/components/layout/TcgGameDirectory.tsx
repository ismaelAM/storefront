import type { Category } from "@spree/sdk";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { tcgGameForPath } from "../../../supabase/functions/_shared/tcg-shop";

export async function TcgGameDirectory({ games, basePath, locale }: {
  games: Category[];
  basePath: string;
  locale: Locale;
}) {
  const t = await getTranslations({ locale, namespace: "tcgShop" });
  if (games.length === 0) return null;

  return (
    <section id="juegos" aria-labelledby="tcg-games-title" className="container mx-auto scroll-mt-6 px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-end justify-between gap-4">
        <h2 id="tcg-games-title" className="text-2xl font-bold tracking-tight sm:text-3xl">{t("games")}</h2>
        <Link href={`${basePath}/products`} prefetch={false} className="shrink-0 text-sm font-medium underline underline-offset-4">{t("allProducts")}</Link>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {games.map((game) => (
          <Link
            key={game.id}
            href={`${basePath}/c/${game.permalink}`}
            prefetch={false}
            className="group flex min-h-28 flex-col justify-between gap-4 rounded-lg border bg-card p-4 text-card-foreground transition-colors hover:border-primary hover:bg-secondary/50"
          >
            <span className="flex items-center justify-between gap-2">
              <span aria-hidden="true" className="rounded bg-primary px-2 py-1 text-xs font-bold tracking-wider text-primary-foreground">{tcgGameForPath(game.permalink)?.[2]}</span>
              <ArrowUpRight aria-hidden="true" className="size-4 opacity-70 group-hover:opacity-100" />
            </span>
            <span className="font-semibold leading-tight">{game.name}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
