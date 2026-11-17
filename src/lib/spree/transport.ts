import { SpreeError } from "@spree/sdk";

// Bound both response headers and body reads. The SDK otherwise waits for the
// platform's 300-second timeout and can replay a failed request afterwards.
const REQUEST_TIMEOUT_MS = 30_000;

function timeoutError() {
  return new SpreeError(
    {
      error: {
        code: "backend_timeout",
        message: "The store service did not respond in time.",
      },
    },
    504,
  );
}

/** Preserve the SDK contract while handling platform errors outside its retry loop. */
export const spreeFetch: typeof fetch = async (input, init) => {
  const deadline = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const upstreamSignal =
    init?.signal ?? (input instanceof Request ? input.signal : undefined);
  const signal = upstreamSignal
    ? AbortSignal.any([upstreamSignal, deadline])
    : deadline;
  try {
    const response = await fetch(input, { ...init, signal });
    const contentType = response.headers.get("content-type") ?? "";
    if (
      !response.ok &&
      (response.headers.get("x-vercel-error") === "DEPLOYMENT_PAUSED" ||
        !/\bapplication\/(?:[\w.-]+\+)?json\b/i.test(contentType))
    ) {
      // Never read/log a platform HTML/text page as a commerce response. A
      // SpreeError retains the real status and bypasses the SDK's blind retry.
      void response.body?.cancel().catch(() => undefined);
      throw new SpreeError(
        {
          error: {
            code: "backend_unavailable",
            message: "The store service is temporarily unavailable.",
          },
        },
        response.status,
      );
    }

    const readJson = response.json.bind(response);
    response.json = async () => {
      try {
        return await readJson();
      } catch (error) {
        if (deadline.aborted) throw timeoutError();
        throw error;
      }
    };
    return response;
  } catch (error) {
    if (deadline.aborted) throw timeoutError();
    throw error;
  }
};
