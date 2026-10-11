import "server-only";

import { createHash } from "node:crypto";

export type InstagramConfig =
  | { configured: false }
  | {
      configured: true;
      accountId: string;
      accessToken: string;
      apiVersion: string;
    };

/** Credentials stay in server code; API versions are deliberately explicit. */
export function readInstagramConfig(
  env: Record<string, string | undefined> = process.env,
): InstagramConfig {
  const accountId = env.INSTAGRAM_ACCOUNT_ID?.trim();
  const accessToken = env.INSTAGRAM_ACCESS_TOKEN?.trim();
  const apiVersion = env.INSTAGRAM_API_VERSION?.trim();
  if (
    !accountId ||
    !/^\d+$/.test(accountId) ||
    !accessToken ||
    accessToken === "[SENSITIVE]" ||
    !apiVersion ||
    !/^v\d+\.0$/.test(apiVersion)
  )
    return { configured: false };
  return { configured: true, accountId, accessToken, apiVersion };
}

export type InstagramCheckpoint = {
  inputHash: string;
  childContainerIds: string[];
  carouselContainerId?: string;
  publishAttempted?: boolean;
  publishedMediaId?: string;
};

export type InstagramCarouselInput = { imageUrls: string[]; caption: string };
export type InstagramPublishResult = {
  mediaId: string;
  carouselContainerId: string;
};

type ErrorCode =
  | "not_configured"
  | "invalid_input"
  | "invalid_checkpoint"
  | "checkpoint_mismatch"
  | "checkpoint_failed"
  | "api_rejected"
  | "transport_failed"
  | "invalid_response"
  | "container_failed"
  | "container_expired"
  | "processing_timeout"
  | "publish_uncertain";

/** No remote messages, request bodies, tokens or original causes are retained. */
export class InstagramPublishError extends Error {
  constructor(public readonly code: ErrorCode) {
    super(`Instagram publishing: ${code}`);
    this.name = "InstagramPublishError";
  }
}

export class InstagramPublishUncertainError extends InstagramPublishError {
  constructor(
    public readonly carouselContainerId: string,
    public readonly publishedMediaId?: string,
  ) {
    super("publish_uncertain");
    this.name = "InstagramPublishUncertainError";
  }
}

export type InstagramPublishOptions = {
  fetch?: typeof fetch;
  wait?: (milliseconds: number) => Promise<void>;
  checkpoint?: InstagramCheckpoint;
  /** Persist each container and final media ID before resolving this callback. */
  onCheckpoint: (checkpoint: InstagramCheckpoint) => Promise<void>;
  /** Atomically verify ownership and persist publishAttempted=true before resolving. */
  beforePublish: (checkpoint: InstagramCheckpoint) => Promise<void>;
  maxPollAttempts?: number;
  pollIntervalMs?: number;
  requestTimeoutMs?: number;
};

function validId(value: unknown): value is string {
  return typeof value === "string" && /^\d+$/.test(value);
}

function publicHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.hash &&
      url.hostname.includes(".") &&
      !/^[\d.]+$/.test(url.hostname) &&
      !url.hostname.endsWith(".localhost") &&
      !url.hostname.endsWith(".local")
    );
  } catch {
    return false;
  }
}

function copyCheckpoint(value: InstagramCheckpoint): InstagramCheckpoint {
  return { ...value, childContainerIds: [...value.childContainerIds] };
}

/**
 * Four deterministic category JPEGs form one carousel. The caller owns the
 * durable lease and checkpoint record. A publish attempt is never retried here.
 */
export async function publishInstagramCarousel(
  config: InstagramConfig,
  input: InstagramCarouselInput,
  options: InstagramPublishOptions,
): Promise<InstagramPublishResult> {
  if (!config.configured) throw new InstagramPublishError("not_configured");
  if (
    !/^\d+$/.test(config.accountId) ||
    !/^v\d+\.0$/.test(config.apiVersion) ||
    !config.accessToken ||
    config.accessToken === "[SENSITIVE]" ||
    input.imageUrls.length !== 4 ||
    !input.imageUrls.every(publicHttpsUrl) ||
    !input.caption.trim() ||
    [...input.caption].length > 2200 ||
    typeof options.onCheckpoint !== "function" ||
    typeof options.beforePublish !== "function"
  )
    throw new InstagramPublishError("invalid_input");

  const maxPollAttempts = options.maxPollAttempts ?? 5;
  const pollIntervalMs = options.pollIntervalMs ?? 60_000;
  const requestTimeoutMs = options.requestTimeoutMs ?? 15_000;
  if (
    !Number.isInteger(maxPollAttempts) ||
    maxPollAttempts < 1 ||
    maxPollAttempts > 5 ||
    !Number.isFinite(pollIntervalMs) ||
    pollIntervalMs < 0 ||
    pollIntervalMs > 60_000 ||
    !Number.isInteger(requestTimeoutMs) ||
    requestTimeoutMs < 1 ||
    requestTimeoutMs > 30_000
  )
    throw new InstagramPublishError("invalid_input");

  const inputHash = createHash("sha256")
    .update(JSON.stringify([config.accountId, input.imageUrls, input.caption]))
    .digest("hex");
  const checkpoint = options.checkpoint
    ? copyCheckpoint(options.checkpoint)
    : { inputHash, childContainerIds: [] };
  if (checkpoint.inputHash !== inputHash)
    throw new InstagramPublishError("checkpoint_mismatch");
  if (
    checkpoint.childContainerIds.length > 4 ||
    !checkpoint.childContainerIds.every(validId) ||
    new Set(checkpoint.childContainerIds).size !==
      checkpoint.childContainerIds.length ||
    (checkpoint.carouselContainerId !== undefined &&
      !validId(checkpoint.carouselContainerId)) ||
    (checkpoint.publishedMediaId !== undefined &&
      !validId(checkpoint.publishedMediaId)) ||
    ((checkpoint.publishAttempted || checkpoint.publishedMediaId) &&
      !checkpoint.carouselContainerId) ||
    (checkpoint.carouselContainerId &&
      checkpoint.childContainerIds.length !== 4)
  )
    throw new InstagramPublishError("invalid_checkpoint");
  if (checkpoint.publishedMediaId && checkpoint.carouselContainerId) {
    return {
      mediaId: checkpoint.publishedMediaId,
      carouselContainerId: checkpoint.carouselContainerId,
    };
  }
  if (checkpoint.publishAttempted && checkpoint.carouselContainerId) {
    throw new InstagramPublishUncertainError(checkpoint.carouselContainerId);
  }

  const fetcher = options.fetch ?? fetch;
  const wait =
    options.wait ??
    ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const base = `https://graph.instagram.com/${config.apiVersion}`;
  async function request(
    path: string,
    body?: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await fetcher(`${base}/${path}`, {
        method: body ? "POST" : "GET",
        headers: {
          Authorization: `Bearer ${config.configured ? config.accessToken : ""}`,
          ...(body
            ? { "Content-Type": "application/x-www-form-urlencoded" }
            : {}),
        },
        body: body ? new URLSearchParams(body).toString() : undefined,
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
    } catch {
      throw new InstagramPublishError("transport_failed");
    }
    if (!response.ok) throw new InstagramPublishError("api_rejected");
    let value: unknown;
    try {
      value = await response.json();
    } catch {
      throw new InstagramPublishError("invalid_response");
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new InstagramPublishError("invalid_response");
    }
    const result = value as Record<string, unknown>;
    if (result.error) throw new InstagramPublishError("api_rejected");
    return result;
  }
  async function persist() {
    try {
      await options.onCheckpoint(copyCheckpoint(checkpoint));
    } catch {
      throw new InstagramPublishError("checkpoint_failed");
    }
  }
  async function create(body: Record<string, string>) {
    const result = await request(
      `${config.configured ? config.accountId : ""}/media`,
      body,
    );
    if (!validId(result.id))
      throw new InstagramPublishError("invalid_response");
    return result.id;
  }
  async function ready(id: string) {
    for (let attempt = 0; attempt < maxPollAttempts; attempt++) {
      const result = await request(`${id}?fields=status_code`);
      if (result.status_code === "FINISHED") return;
      if (result.status_code === "ERROR")
        throw new InstagramPublishError("container_failed");
      if (result.status_code === "EXPIRED")
        throw new InstagramPublishError("container_expired");
      if (
        result.status_code === "PUBLISHED" &&
        id === checkpoint.carouselContainerId
      ) {
        throw new InstagramPublishUncertainError(id);
      }
      if (result.status_code !== "IN_PROGRESS")
        throw new InstagramPublishError("invalid_response");
      if (attempt + 1 < maxPollAttempts) {
        try {
          await wait(pollIntervalMs);
        } catch {
          throw new InstagramPublishError("transport_failed");
        }
      }
    }
    throw new InstagramPublishError("processing_timeout");
  }

  if (!options.checkpoint) await persist();
  if (!checkpoint.carouselContainerId) {
    for (let index = 0; index < 4; index++) {
      if (!checkpoint.childContainerIds[index]) {
        checkpoint.childContainerIds.push(
          await create({
            image_url: input.imageUrls[index],
            is_carousel_item: "true",
          }),
        );
        await persist();
      }
      await ready(checkpoint.childContainerIds[index]);
    }
    checkpoint.carouselContainerId = await create({
      media_type: "CAROUSEL",
      children: checkpoint.childContainerIds.join(","),
      caption: input.caption,
    });
    await persist();
  }
  await ready(checkpoint.carouselContainerId);
  checkpoint.publishAttempted = true;
  try {
    await options.beforePublish(copyCheckpoint(checkpoint));
  } catch {
    throw new InstagramPublishError("checkpoint_failed");
  }
  let publishedMediaId: string | undefined;
  try {
    const result = await request(`${config.accountId}/media_publish`, {
      creation_id: checkpoint.carouselContainerId,
    });
    if (!validId(result.id))
      throw new InstagramPublishError("invalid_response");
    publishedMediaId = result.id;
    checkpoint.publishedMediaId = publishedMediaId;
    await persist();
  } catch {
    throw new InstagramPublishUncertainError(
      checkpoint.carouselContainerId,
      publishedMediaId,
    );
  }
  return {
    mediaId: publishedMediaId,
    carouselContainerId: checkpoint.carouselContainerId,
  };
}
