import { NextResponse } from "next/server";

export async function POST() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  if (!secretKey || !siteUrl) {
    return NextResponse.json(
      { error: "Stripe Checkout is not configured" },
      { status: 500 },
    );
  }

  const params = new URLSearchParams();
  params.set("ui_mode", "hosted_page");
  params.set("mode", "payment");
  params.set("billing_address_collection", "auto");
  params.set("phone_number_collection[enabled]", "false");
  params.set("automatic_tax[enabled]", "false");
  params.set("allow_promotion_codes", "false");
  params.set("submit_type", "auto");
  params.set("consent_collection[promotions]", "auto");
  params.set("saved_payment_method_options[payment_method_save]", "enabled");
  params.set("integration_identifier", "hosted_web_0002");
  params.set("origin_context", "web");
  params.set(
    "success_url",
    `${siteUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
  );
  params.set("cancel_url", `${siteUrl}`);
  params.set("line_items[0][price]", "price_...");
  params.set("line_items[0][quantity]", "1");

  try {
    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
      cache: "no-store",
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: data?.error?.message ?? "Unable to create Stripe Checkout Session" },
        { status: response.status },
      );
    }

    return NextResponse.json({ id: data.id, url: data.url });
  } catch {
    return NextResponse.json(
      { error: "Unable to reach Stripe" },
      { status: 502 },
    );
  }
}
