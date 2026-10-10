import { HTML_LIMITED_BOT_UA_RE } from "next/dist/shared/lib/router/utils/html-bots";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl/plugin", () => ({
  default: () => (config: unknown) => config,
}));
vi.mock("@sentry/nextjs", () => ({
  withSentryConfig: (config: unknown) => config,
}));

import nextConfig from "../../../next.config";

// Next writes htmlLimitedBots to the PPR manifest's user-agent cache bypass.
// Without Googlebot here, Vercel resumes the streaming shell using blocking
// metadata, discarding the product's server-rendered title and content.
const cacheBypass = nextConfig.htmlLimitedBots ?? HTML_LIMITED_BOT_UA_RE;

describe("crawler PPR cache bypass", () => {
  it("bypasses the postponed shell for Google Search crawlers", () => {
    expect(
      cacheBypass.test(
        "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      ),
    ).toBe(true);
    expect(cacheBypass.test("Mozilla/5.0 Googlebot Smartphone")).toBe(true);
  });

  it("preserves blocking renders for the official HTML-limited bots", () => {
    for (const crawler of [
      "Twitterbot/1.0",
      "Bingbot/2.0",
      "Google-InspectionTool/1.0",
      "facebookexternalhit/1.1",
      "Slackbot-LinkExpanding 1.0",
      "Discordbot/2.0",
      "WhatsApp/2.0",
    ]) {
      expect(cacheBypass.test(crawler), crawler).toBe(true);
    }
  });

  it("keeps ordinary browser requests eligible for PPR caching", () => {
    expect(nextConfig.cacheComponents).toBe(true);
    expect(
      cacheBypass.test(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
      ),
    ).toBe(false);
  });
});
