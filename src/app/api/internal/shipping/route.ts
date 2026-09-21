import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  getConfiguredCorreosClient,
  getCorreosConfigurationStatus,
  type CorreosBoxEntryRequest,
  type CorreosLabelRequest,
  type CorreosPickupRequest,
} from "@/lib/shipping/correos";
import {
  fulfillFulfillment,
  getSpreeShippingConfigurationStatus,
  listOrderFulfillments,
  markFulfillmentDelivered,
  updateFulfillmentTracking,
} from "@/lib/shipping/spree-fulfillment";

function secureEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function authorized(request: Request): boolean {
  const expected = process.env.SHIPPING_OPERATIONS_TOKEN?.trim();
  if (!expected) return false;
  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return Boolean(provided && secureEqual(provided, expected));
}

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function requiredString(
  body: Record<string, unknown>,
  key: string,
): string {
  const value = typeof body[key] === "string" ? body[key].trim() : "";
  if (!value) throw new Error(`Falta ${key}`);
  return value;
}

export async function GET(request: Request) {
  if (!authorized(request)) return unauthorized();
  const correos = getCorreosConfigurationStatus(process.env);
  return NextResponse.json({
    ok: true,
    spree: getSpreeShippingConfigurationStatus(process.env),
    correos: {
      ...correos,
      correosIdTokenConfigured: Boolean(
        process.env.CORREOS_ID_ACCESS_TOKEN?.trim(),
      ),
    },
  });
}

export async function POST(request: Request) {
  if (!authorized(request)) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const action = requiredString(body, "action");

    if (action === "spree-list-fulfillments") {
      return NextResponse.json(
        await listOrderFulfillments(requiredString(body, "orderId")),
      );
    }

    if (action === "spree-save-tracking") {
      const result = await updateFulfillmentTracking(
        requiredString(body, "orderId"),
        requiredString(body, "fulfillmentId"),
        requiredString(body, "tracking"),
        typeof body.trackingCarrier === "string"
          ? body.trackingCarrier
          : undefined,
      );
      return NextResponse.json(result);
    }

    if (action === "spree-fulfill") {
      const result = await fulfillFulfillment(
        requiredString(body, "orderId"),
        requiredString(body, "fulfillmentId"),
        {
          ...(typeof body.tracking === "string" && body.tracking.trim()
            ? { tracking: body.tracking.trim() }
            : {}),
          ...(typeof body.trackingCarrier === "string" &&
          body.trackingCarrier.trim()
            ? { tracking_carrier: body.trackingCarrier.trim() }
            : {}),
          ...(Array.isArray(body.items)
            ? {
                items: body.items as Array<{
                  item_id: string;
                  quantity: number;
                }>,
              }
            : {}),
        },
      );
      return NextResponse.json(result);
    }

    if (action === "spree-mark-delivered") {
      const result = await markFulfillmentDelivered(
        requiredString(body, "orderId"),
        requiredString(body, "fulfillmentId"),
        typeof body.deliveredAt === "string" && body.deliveredAt.trim()
          ? body.deliveredAt.trim()
          : undefined,
      );
      return NextResponse.json(result);
    }

    const correos = getConfiguredCorreosClient();

    if (action === "correos-track") {
      const result = await correos.trackShipment(
        requiredString(body, "tracking"),
        typeof body.languageCode === "string"
          ? body.languageCode
          : "ES",
      );
      return NextResponse.json(result);
    }

    if (action === "correos-labels") {
      const requestBody = body.request as CorreosLabelRequest | undefined;
      if (!requestBody) throw new Error("Falta request");
      return NextResponse.json(await correos.printLabels(requestBody));
    }

    if (action === "correos-pickup") {
      const requestBody = body.request as CorreosPickupRequest | undefined;
      if (!requestBody) throw new Error("Falta request");
      return NextResponse.json(await correos.createPickup(requestBody));
    }

    if (action === "correos-box-entry") {
      const requestBody = body.request as CorreosBoxEntryRequest | undefined;
      if (!requestBody) throw new Error("Falta request");
      return NextResponse.json(await correos.registerBox(requestBody));
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("Shipping operation failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Shipping operation failed",
      },
      { status: 400 },
    );
  }
}
