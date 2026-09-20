import type { Product } from "@spree/sdk";

type HomeProduct = Product & {
  preorder_ships_at?: string | null;
  tags?: string[];
};

const ROTATION_WINDOW_MS = 6 * 60 * 60 * 1000;
const MAX_FEATURED_PRICE_EUR = 600;
const PREORDER_LOOKAHEAD_MS = 180 * 24 * 60 * 60 * 1000;

function numericAmount(product: HomeProduct): number {
  const raw = product.price?.amount;
  const value = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

function hasBlockedReviewTag(product: HomeProduct): boolean {
  const tags = product.tags ?? [];
  return tags.some((tag) => {
    const normalized = tag.toLocaleLowerCase();
    return normalized === "revision-humana" || normalized === "devir-review";
  });
}

function isLandingSafe(product: HomeProduct): boolean {
  const amount = numericAmount(product);
  return (
    product.purchasable !== false &&
    Boolean(product.thumbnail_url) &&
    amount > 0 &&
    amount <= MAX_FEATURED_PRICE_EUR &&
    !hasBlockedReviewTag(product)
  );
}

function isActualSale(product: HomeProduct): boolean {
  const current = product.price?.amount_in_cents;
  const compare = product.price?.compare_at_amount_in_cents;
  if (current != null && compare != null) return compare > current;

  const currentAmount = numericAmount(product);
  const compareAmount = Number(product.price?.compare_at_amount);
  return (
    Number.isFinite(currentAmount) &&
    Number.isFinite(compareAmount) &&
    compareAmount > currentAmount
  );
}

function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function rotateStable<T extends { id: string }>(items: T[], seed: number): T[] {
  return [...items].sort(
    (left, right) =>
      hash(`${seed}:${left.id}`) - hash(`${seed}:${right.id}`),
  );
}

function dedupe(products: HomeProduct[]): HomeProduct[] {
  const seen = new Set<string>();
  return products.filter((product) => {
    if (seen.has(product.id)) return false;
    seen.add(product.id);
    return true;
  });
}

function currentPreorders(products: HomeProduct[], now: Date): HomeProduct[] {
  const minDate = now.getTime();
  const maxDate = now.getTime() + PREORDER_LOOKAHEAD_MS;

  return products.filter((product) => {
    if (!product.preorder || !isLandingSafe(product)) return false;
    if (!product.preorder_ships_at) return true;

    const shipsAt = new Date(product.preorder_ships_at).getTime();
    return !Number.isFinite(shipsAt) || (shipsAt > minDate && shipsAt <= maxDate);
  });
}

/**
 * Builds the product pool consumed by the Puck home blocks.
 *
 * The first item is intentionally the strongest physical-stock offer when one
 * exists, so a RealProductShowcase at position 1 stays useful. Remaining
 * positions contain two independent rotating lanes: genuine offers and
 * genuinely upcoming preorders. A product never becomes a "new release" just
 * because it is featured or discounted. The order changes every six hours,
 * but remains stable during each window so SSR and client rendering never
 * disagree.
 */
export function buildHomeMerchandisingProducts(
  saleProducts: Product[],
  preorderProducts: Product[],
  now = new Date(),
): Product[] {
  const seed = Math.floor(now.getTime() / ROTATION_WINDOW_MS);

  const sales = dedupe(
    (saleProducts as HomeProduct[]).filter(
      (product) =>
        isLandingSafe(product) &&
        isActualSale(product) &&
        !product.preorder,
    ),
  );
  const preorders = dedupe(
    currentPreorders(preorderProducts as HomeProduct[], now),
  ).filter((product) => !sales.some((sale) => sale.id === product.id));

  const stockSale = sales.find((product) => product.in_stock);
  const rotatingSales = rotateStable(
    sales.filter((product) => product.id !== stockSale?.id),
    seed,
  );
  const rotatingPreorders = rotateStable(preorders, seed + 1);

  const result: HomeProduct[] = [];
  if (stockSale) result.push(stockSale);

  const maxLength = Math.max(rotatingSales.length, rotatingPreorders.length);
  for (let index = 0; index < maxLength; index += 1) {
    if (rotatingPreorders[index]) result.push(rotatingPreorders[index]);
    if (rotatingSales[index]) result.push(rotatingSales[index]);
  }

  return dedupe(result).slice(0, 20);
}
