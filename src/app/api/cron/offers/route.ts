import { timingSafeEqual } from "node:crypto";
import { runDailySocialPublication } from "@/lib/social/publication";

export const maxDuration = 300;
export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  const provided = request.headers.get("authorization") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected ? `Bearer ${expected}` : "");
  if (!expected || a.length !== b.length || !timingSafeEqual(a, b)) {
    return Response.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    return Response.json(await runDailySocialPublication(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      {
        error:
          "Daily offers task failed; check the private publication state before retrying.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
