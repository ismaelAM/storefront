import { createSupabaseClient } from "@/lib/supabase/server";
import type { PuckData } from "@puckeditor/core";

/**
 * POST /api/pages/home
 * Publish Home page data to Supabase
 *
 * Security: Validates PUCK_PUBLISH_SECRET header
 * Accepts: Puck Data structure (content[], root)
 * Returns: { success: true } or error
 */
export async function POST(request: Request) {
  try {
    // Security: Validate publish secret
    const authHeader = request.headers.get("authorization");
    const publishSecret = process.env.PUCK_PUBLISH_SECRET;

    if (!publishSecret) {
      console.error("PUCK_PUBLISH_SECRET not configured");
      return Response.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    if (authHeader !== `Bearer ${publishSecret}`) {
      return Response.json(
        { error: "Unauthorized: invalid publish secret" },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();
    const data = body as PuckData;

    // Validate data structure
    if (!data || typeof data !== "object") {
      return Response.json(
        { error: "Invalid data: must be a valid Puck data object" },
        { status: 400 }
      );
    }

    if (!Array.isArray(data.content)) {
      return Response.json(
        { error: "Invalid data: content must be an array" },
        { status: 400 }
      );
    }

    // Save to Supabase
    const supabase = createSupabaseClient();

    const { error } = await supabase
      .from("pages")
      .upsert(
        {
          page_id: "home",
          published_data: data,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "page_id",
        }
      );

    if (error) {
      console.error("Supabase error:", error);
      return Response.json(
        { error: "Failed to save page data" },
        { status: 500 }
      );
    }

    return Response.json({ success: true });
  } catch (err) {
    console.error("API error:", err);
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
