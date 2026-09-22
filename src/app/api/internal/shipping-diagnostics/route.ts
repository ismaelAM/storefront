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
  const products = await client.products.list({ limit: 50 }, {
    locale: "es",
    country: "ES",
  });
  const product = products.data.find(
    (item) =>
      item.purchasable &&
      item.available &&
      typeof item.default_variant_id === "string",
  );
  if (!product?.default_variant_id) {
    throw new Error("No hay un producto físico disponible para la prueba");
  }

  const cart = await client.carts.create(
    {
      items: [{ variant_id: product.default_variant_id, quantity: 1 }],
    },
    { locale: "es", country: "es" },
  );

  try {
    const options = { spreeToken: cart.token };

    const madrid = await client.carts.update(
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
    const madridFresh = await client.carts.get(cart.id, options);

    const outsideMadrid = await client.carts.update(
      cart.id,
      {
        shipping_address: {
          first_name: "Prueba",
          last_name: "Checkout",
          address1: "Carrer de la Pau 1",
          city: "Valencia",
          postal_code: "46001",
          country_iso: "ES",
          state_name: "Valencia",
          phone: "600000000",
        },
      },
      options,
    );
    const outsideMadridFresh = await client.carts.get(cart.id, options);

    return {
      product: {
        id: product.id,
        name: product.name,
        variantId: product.default_variant_id,
      },
      madrid: {
        update: summarizeCart(madrid),
        fresh: summarizeCart(madridFresh),
      },
      outsideMadrid: {
        update: summarizeCart(outsideMadrid),
        fresh: summarizeCart(outsideMadridFresh),
      },
    };
  } finally {
    await client.carts.delete(cart.id, { spreeToken: cart.token }).catch(() => {});
  }
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
