import { createRequire } from "node:module";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const config = require("./next.config.js") as {
  headers: () => Promise<
    Array<{ headers: Array<{ key: string; value: string }> }>
  >;
};

const BASELINE_CSP = {
  "default-src": ["'self'"],
  "script-src": [
    "'self'",
    "'unsafe-inline'",
    "'unsafe-eval'",
    "https://js.stripe.com",
    "https://www.googletagmanager.com",
    "https://browser.sentry-cdn.com",
  ],
  "connect-src": [
    "'self'",
    "https://api.iconify.design",
    "https://api.simplesvg.com",
    "https://api.unisvg.com",
    "https://js.stripe.com",
    "https://www.googletagmanager.com",
    "https://*.sentry.io",
    "https://*.ingest.sentry.io",
  ],
  "img-src": [
    "'self'",
    "https://www.google-analytics.com",
    "https://www.googletagmanager.com",
  ],
  "font-src": ["'self'"],
  "style-src": ["'self'", "'unsafe-inline'"],
  "frame-src": [
    "'self'",
    "https://js.stripe.com",
    "https://www.googletagmanager.com",
  ],
  "frame-ancestors": ["'none'"],
} as const;

const FEATUREBASE_CSP_ADDITIONS = {
  "script-src": ["https://do.featurebase.app"],
  "connect-src": ["https://*.featurebase.app", "wss://*.featurebase.app"],
  "img-src": [
    "https://*.featurebase.app",
    "https://*.featurebase-attachments.com",
    "https://fb-usercontent.fra1.cdn.digitaloceanspaces.com",
  ],
  "style-src": ["https://do.featurebase.app"],
  "frame-src": ["https://*.featurebase.app"],
  "media-src": [
    "'self'",
    "https://*.featurebase.app",
    "https://*.featurebase-attachments.com",
  ],
} as const;

const getCsp = async () => {
  const rules = await config.headers();
  const value = rules[0]?.headers.find(
    ({ key }) => key === "Content-Security-Policy",
  )?.value;
  if (!value) throw new Error("CSP header is missing");
  return Object.fromEntries(
    value
      .split(";")
      .map((entry) => entry.trim().split(/\s+/))
      .filter(([name]) => name)
      .map(([name, ...sources]) => [name, sources]),
  ) as Record<string, string[]>;
};

describe("Featurebase Content Security Policy", () => {
  beforeEach(() => {
    vi.stubEnv("UI_CLOUD_ENABLED", undefined);
    vi.stubEnv("UI_FEATUREBASE_ENABLED", undefined);
    vi.stubEnv("UI_FEATUREBASE_APP_ID", undefined);
  });

  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ["non-Cloud deployment", "false", "true", "app-id"],
    ["disabled integration", "true", "false", "app-id"],
    ["missing App ID", "true", "true", ""],
  ])(
    "keeps the exact baseline CSP for %s",
    async (_case, cloud, enabled, appId) => {
      // Given
      vi.stubEnv("UI_CLOUD_ENABLED", cloud);
      vi.stubEnv("UI_FEATUREBASE_ENABLED", enabled);
      vi.stubEnv("UI_FEATUREBASE_APP_ID", appId);

      // When / Then
      expect(await getCsp()).toEqual(BASELINE_CSP);
    },
  );

  it("adds exactly the required Featurebase sources when fully enabled", async () => {
    // Given
    vi.stubEnv("UI_CLOUD_ENABLED", "true");
    vi.stubEnv("UI_FEATUREBASE_ENABLED", "true");
    vi.stubEnv("UI_FEATUREBASE_APP_ID", "app-id");

    // When
    const csp = await getCsp();

    // Then
    expect(csp).toEqual({
      ...BASELINE_CSP,
      "script-src": [
        ...BASELINE_CSP["script-src"],
        ...FEATUREBASE_CSP_ADDITIONS["script-src"],
      ],
      "connect-src": [
        ...BASELINE_CSP["connect-src"],
        ...FEATUREBASE_CSP_ADDITIONS["connect-src"],
      ],
      "img-src": [
        ...BASELINE_CSP["img-src"],
        ...FEATUREBASE_CSP_ADDITIONS["img-src"],
      ],
      "style-src": [
        ...BASELINE_CSP["style-src"],
        ...FEATUREBASE_CSP_ADDITIONS["style-src"],
      ],
      "frame-src": [
        ...BASELINE_CSP["frame-src"],
        ...FEATUREBASE_CSP_ADDITIONS["frame-src"],
      ],
      "media-src": FEATUREBASE_CSP_ADDITIONS["media-src"],
    });
  });
});
