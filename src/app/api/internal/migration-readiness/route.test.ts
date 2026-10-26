import { createHmac } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

const fetchMock = vi.fn();
const secret = "migration-signing-secret-with-sufficient-entropy";
function request(authorized = true) {
  return new Request(
    "https://www.bisontcg.com/api/internal/migration-readiness",
    {
      headers: authorized
        ? {
            authorization: `Bearer ${createHmac("sha256", secret).update("bison-migration-readiness-v1").digest("hex")}`,
          }
        : {},
    },
  );
}
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("SPREE_WEBHOOK_SECRET", secret);
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_private");
  vi.stubEnv("GMAIL_CLIENT_ID", "gmail-client");
  vi.stubEnv("GMAIL_CLIENT_SECRET", "gmail-private");
  vi.stubEnv("GMAIL_REFRESH_TOKEN", "gmail-refresh-private");
  vi.stubEnv("EMAIL_PROVIDER", "gmail");
  vi.stubEnv("EMAIL_FROM", "shop@example.com");
  vi.stubEnv("STRIPE_PUBLISHABLE_KEY", "pk_live_private");
});

it("connects existing credentials only to the fixed owned backend and returns no secrets", async () => {
  fetchMock.mockImplementation(async (url: string) =>
    Response.json(
      url.includes("stripe.com")
        ? { id: "acct_1UDiVZHU3Etzdhlg", charges_enabled: true }
        : {
            connected: true,
            account_matches: true,
            native_payment_method_id: "pm_native",
          },
    ),
  );
  const response = await POST(
    new Request(request(), { method: "POST", body: "{}" }),
  );
  expect(await response.json()).toEqual({
    connected: true,
    nativePaymentMethodId: "pm_native",
  });
  const [url, options] = fetchMock.mock.calls[1];
  expect(url).toBe(
    "https://project-7ck7q.vercel.app/internal/bison-payment/connect",
  );
  expect(JSON.parse(options.body)).toEqual({
    secret_key: "sk_live_private",
    publishable_key: "pk_live_private",
  });
});

it("rejects user-selected connection payloads and unauthenticated connection attempts", async () => {
  expect(
    (
      await POST(
        new Request(request(), {
          method: "POST",
          body: '{"url":"https://other.example"}',
        }),
      )
    ).status,
  ).toBe(400);
  expect(
    (await POST(new Request(request(false), { method: "POST", body: "{}" })))
      .status,
  ).toBe(401);
  expect(fetchMock).not.toHaveBeenCalled();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("rejects unauthenticated probes without contacting providers", async () => {
  expect((await GET(request(false))).status).toBe(401);
  expect(fetchMock).not.toHaveBeenCalled();
});

it("verifies the existing account and refresh grant without sending mail or creating payments", async () => {
  fetchMock.mockImplementation(async (url: string) =>
    Response.json(
      url.includes("stripe.com")
        ? {
            id: "acct_1UDiVZHU3Etzdhlg",
            charges_enabled: true,
            payouts_enabled: true,
          }
        : { access_token: "must-never-be-returned" },
    ),
  );
  const response = await GET(request());
  expect(response.status).toBe(200);
  const body = await response.text();
  expect(JSON.parse(body)).toEqual({
    stripe: { ready: true, accountMatches: true, chargesEnabled: true },
    email: { ready: true, provider: "gmail" },
  });
  for (const privateValue of [
    secret,
    "sk_live_private",
    "gmail-private",
    "gmail-refresh-private",
    "must-never-be-returned",
  ])
    expect(body).not.toContain(privateValue);
  expect(fetchMock.mock.calls.map(([url]) => url).sort()).toEqual(
    [
      "https://api.stripe.com/v1/account",
      "https://oauth2.googleapis.com/token",
    ].sort(),
  );
  expect(response.headers.get("cache-control")).toBe("no-store");
});

it("reports provider failures and a different Stripe account as unready without leaking errors", async () => {
  fetchMock.mockImplementation(async (url: string) =>
    url.includes("stripe.com")
      ? Response.json({ id: "acct_wrong", charges_enabled: true })
      : Response.json(
          { error_description: "private provider detail" },
          { status: 400 },
        ),
  );
  const body = await (await GET(request())).text();
  expect(JSON.parse(body)).toEqual({
    stripe: { ready: false, accountMatches: false, chargesEnabled: true },
    email: { ready: false, provider: "gmail" },
  });
  expect(body).not.toContain("private provider detail");
});
