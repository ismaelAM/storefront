import { NextResponse } from "next/server";
import {
  CorreosRateError,
  estimateCorreosShipping,
} from "@/lib/shipping/correos-rates";

export async function POST(request: Request) {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "invalidRequest" }, { status: 400 });
  }
  try {
    return NextResponse.json(estimateCorreosShipping(input), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (!(error instanceof CorreosRateError)) throw error;
    return NextResponse.json(
      { error: error.code },
      {
        status: error.code === "tariffExpired" ? 503 : 422,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
