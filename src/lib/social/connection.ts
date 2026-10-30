import "server-only";
import type { InstagramConfig } from "./instagram";

type ConnectionErrorCode =
  | "not_configured"
  | "invalid_config"
  | "transport_failed"
  | "api_rejected"
  | "invalid_response"
  | "account_mismatch";

export class InstagramConnectionError extends Error {
  constructor(public readonly code: ConnectionErrorCode) {
    super(`Instagram connection: ${code}`);
    this.name = "InstagramConnectionError";
  }
}

/** Read-only identity check. This does not prove content-publishing permission. */
export async function verifyInstagramAccount(
  config: InstagramConfig,
  fetcher: typeof fetch = fetch,
): Promise<{ accountId: string; username: string }> {
  if (!config.configured) throw new InstagramConnectionError("not_configured");
  if (
    !/^\d+$/.test(config.accountId) ||
    !/^v\d+\.0$/.test(config.apiVersion) ||
    !config.accessToken ||
    config.accessToken === "[SENSITIVE]"
  )
    throw new InstagramConnectionError("invalid_config");
  const url = new URL(`https://graph.instagram.com/${config.apiVersion}/me`);
  url.searchParams.set("fields", "user_id,username");
  let response: Response;
  try {
    response = await fetcher(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${config.accessToken}` },
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new InstagramConnectionError("transport_failed");
  }
  if (!response.ok) throw new InstagramConnectionError("api_rejected");
  let profile: { user_id?: unknown; username?: unknown };
  try {
    profile = await response.json();
  } catch {
    throw new InstagramConnectionError("invalid_response");
  }
  if (
    !profile ||
    typeof profile.user_id !== "string" ||
    !/^\d+$/.test(profile.user_id) ||
    typeof profile.username !== "string" ||
    !profile.username
  )
    throw new InstagramConnectionError("invalid_response");
  // Both values are pinned: the Meta application ID cannot substitute for an
  // Instagram user ID, and a token for another business must never publish.
  if (
    profile.user_id !== config.accountId ||
    profile.username.toLowerCase() !== "bisontcg"
  )
    throw new InstagramConnectionError("account_mismatch");
  return { accountId: profile.user_id, username: profile.username };
}
