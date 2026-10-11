import { NextResponse } from "next/server";
import {
  getShippingOperationsSessionValue,
  hasShippingOperationsToken,
  SHIPPING_OPERATIONS_SESSION_COOKIE,
  shippingOperationsTokenMatches,
} from "@/lib/shipping/operations-auth";

const SESSION_MAX_AGE = 60 * 60 * 8;

export async function POST(request: Request) {
  if (!hasShippingOperationsToken()) {
    return new NextResponse("Shipping operations are not configured", {
      status: 503,
    });
  }

  const formData = await request.formData();
  const action = formData.get("action");
  // Exact allowlist: never treat a submitted path or URL as a redirect target.
  const returnTo =
    formData.get("returnTo") === "/ops/offers"
      ? "/ops/offers"
      : "/ops/shipping";

  if (action === "logout") {
    const response = NextResponse.redirect(new URL(returnTo, request.url), 303);
    response.cookies.set(SHIPPING_OPERATIONS_SESSION_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: -1,
    });
    return response;
  }

  const token =
    typeof formData.get("token") === "string"
      ? String(formData.get("token")).trim()
      : "";

  if (!shippingOperationsTokenMatches(token)) {
    return NextResponse.redirect(
      new URL(`${returnTo}?error=1`, request.url),
      303,
    );
  }

  const session = getShippingOperationsSessionValue();
  if (!session) {
    return new NextResponse("Shipping operations are not configured", {
      status: 503,
    });
  }

  const response = NextResponse.redirect(new URL(returnTo, request.url), 303);
  response.cookies.set(SHIPPING_OPERATIONS_SESSION_COOKIE, session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return response;
}
