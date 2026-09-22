import type { Cart } from "@spree/sdk";
import { NextResponse } from "next/server";
import { getClient } from "@/lib/spree";
import {
  SpreeShippingApiError,
  spreeShippingRequest,
} from "@/lib/shipping/spree-fulfillment";

type DiagnosticResult =
  | { ok: true; data: unknown }
  | { ok: false; status?: number; error: string };

function summarizeCart(
  cart: Pick<Cart, "fulfillments" | "warnings" | "requirements">,
) {
  return {
    fulfillmentCount: cart.fulfillments?.length ?? 0,
    fulfillments:
      cart.fulfillments?.map((fulfillment) => ({
        id: fulfillment.id,
        rates:
          fulfillment.delivery_rates?.map((rate) => ({
            id: rate.id,
            name: rate.name ?? null,
            displayCost: rate.display_cost ?? null,
            selected: Boolean(rate.selected),
          })) ?? [],
      })) ?? [],
    warnings:
      cart.warnings?.map((warning) => ({
        code: warning.code,
        message: warning.message,
        lineItemId: warning.line_item_id,
        variantId: warning.variant_id,
      })) ?? [],
    requirements:
      cart.requirements?.map((requirement) => ({
        step: requirement.step,
        field: requirement.field,
        message: requirement.message,
      })) ?? [],
  };
}

async function probeCheckout() {
  const client = getClient();
  const products = await client.products.list(
    { limit: 20 },
    { locale: "es", country: "ES" },
  );
  const candidates = products.data
    .filter(
      (item) =>
        item.purchasable &&
        item.available &&
        typeof item.default_variant_id === "string",
    )
    .slice(0, 10);

  if (candidates.length === 0) {
    throw new Error("No hay productos físicos disponibles para la prueba");
  }

  const results = [];
  for (const product of candidates) {
    if (!product.default_variant_id) continue;

    const cart = await client.carts.create(
      {
        items: [{ variant_id: product.default_variant_id, quantity: 1 }],
      },
      { locale: "es", country: "es" },
    );

    try {
      const options = { spreeToken: cart.token };
      const updated = await client.carts.update(
        cart.id,
        {
          email: "shipping-probe@example.invalid",
          shipping_address: {
            first_name: "Prueba",
            last_name: "Checkout",
            address1: "Calle Mayor 1",
            city: "Madrid",
            postal_code: "28013",
            country_iso: "ES",
            state_name: "Madrid",
            phone: "600000000",
          },
        },
        options,
      );
      const fresh = await client.carts.get(cart.id, options);

      results.push({
        product: {
          id: product.id,
          name: product.name,
          variantId: product.default_variant_id,
        },
        update: summarizeCart(updated),
        fresh: summarizeCart(fresh),
      });
    } finally {
      await client.carts
        .delete(cart.id, { spreeToken: cart.token })
        .catch(() => {});
    }
  }

  return {
    tested: results.length,
    withRates: results.filter((result) => result.fresh.fulfillmentCount > 0)
      .length,
    results,
  };
}

async function inspect(path: string): Promise<DiagnosticResult> {
  try {
    const data = await spreeShippingRequest<unknown>("GET", path);
    return { ok: true, data };
  } catch (error) {
    if (error instanceof SpreeShippingApiError) {
      return { ok: false, status: error.status, error: error.message };
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function GET(request: Request) {
  if (process.env.VERCEL_ENV !== "preview") {
    return new NextResponse(null, { status: 404 });
  }

  const url = new URL(request.url);
  if (url.searchParams.get("probe") === "checkout") {
    try {
      return NextResponse.json({ ok: true, probe: await probeCheckout() });
    } catch (error) {
      return NextResponse.json(
        {
          ok: false,
          error: error instanceof Error ? error.message : "Probe failed",
        },
        { status: 500 },
      );
    }
  }

  const [shippingMethods, shippingCategories, zones] = await Promise.all([
    inspect("/shipping_methods?limit=100"),
    inspect("/shipping_categories?limit=100"),
    inspect("/zones?limit=100"),
  ]);

  return NextResponse.json({
    shippingMethods,
    shippingCategories,
    zones,
  });
}
