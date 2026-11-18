import { timingSafeEqual } from "node:crypto";

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
  // Vercel cron is UTC. Two UTC slots cover DST; only Madrid's 05h runs.
  const now = new Date();
  const hour = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    hour: "2-digit",
    hourCycle: "h23",
  }).format(now);
  // Keep recovery later in the day if a supplier or Meta is unavailable at 05h.
  const minute = now.getUTCMinutes();
  const recovery =
    [8, 12, 16, 20].includes(now.getUTCHours()) && minute >= 15 && minute < 20;
  if (hour !== "05" && !recovery)
    return Response.json(
      { status: "outside_window" },
      { headers: { "Cache-Control": "no-store" } },
    );
  try {
    const { runDailySocialPublication } = await import("@/lib/social/publication");
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
