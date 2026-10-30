import { NextResponse } from "next/server";
import { isShippingOperationsAuthorized } from "@/lib/shipping/operations-auth";
import { verifyInstagramAccount } from "@/lib/social/connection";
import { readInstagramConfig } from "@/lib/social/instagram";

export const maxDuration = 30;
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  if (!isShippingOperationsAuthorized(request))
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers },
    );
  const config = readInstagramConfig();
  if (!config.configured)
    return NextResponse.json(
      {
        status: "not_configured",
        message:
          "Falta configurar la cuenta, el token de Instagram y la versión de la API en el servidor.",
      },
      { headers },
    );
  try {
    const account = await verifyInstagramAccount(config);
    return NextResponse.json(
      {
        status: "connected",
        username: account.username,
        message: `Cuenta comprobada: @${account.username}. Esta prueba no verifica el permiso para publicar contenido.`,
      },
      { headers },
    );
  } catch {
    return NextResponse.json(
      {
        status: "connection_failed",
        error:
          "No se pudo verificar @bisontcg. Comprueba el ID de la cuenta, el token y su vigencia.",
      },
      { status: 503, headers },
    );
  }
}
