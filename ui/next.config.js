const dotenv = require("dotenv");
const dotenvExpand = require("dotenv-expand");
dotenvExpand.expand(dotenv.config({ path: "../.env", quiet: true }));
const { withSentryConfig } = require("@sentry/nextjs");

/** @type {import('next').NextConfig} */

// HTTP Security Headers
// 'unsafe-eval' is configured under `script-src` because it is required by NextJS for development mode.
//
// The JSON config island is inert (no nonce needed). A runtime Sentry DSN must
// be in `connect-src` below — `*.sentry.io` covers Sentry Cloud, but a
// self-hosted/region host is blocked until per-request CSP (middleware) lands.
const getCspHeader = () => {
  const featurebaseEnabled =
    process.env.UI_CLOUD_ENABLED === "true" &&
    process.env.UI_FEATUREBASE_ENABLED === "true" &&
    Boolean(process.env.UI_FEATUREBASE_APP_ID);
  const featurebase = featurebaseEnabled
    ? {
        script: " https://do.featurebase.app",
        connect: " https://*.featurebase.app wss://*.featurebase.app",
        image:
          " https://*.featurebase.app https://*.featurebase-attachments.com https://fb-usercontent.fra1.cdn.digitaloceanspaces.com",
        style: " https://do.featurebase.app",
        frame: " https://*.featurebase.app",
        media:
          "  media-src 'self' https://*.featurebase.app https://*.featurebase-attachments.com;",
      }
    : {
        script: "",
        connect: "",
        image: "",
        style: "",
        frame: "",
        media: "",
      };

  return `
  default-src 'self';
  script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://www.googletagmanager.com https://browser.sentry-cdn.com${featurebase.script};
  connect-src 'self' https://api.iconify.design https://api.simplesvg.com https://api.unisvg.com https://js.stripe.com https://www.googletagmanager.com https://*.sentry.io https://*.ingest.sentry.io${featurebase.connect};
  img-src 'self' https://www.google-analytics.com https://www.googletagmanager.com${featurebase.image};
  font-src 'self';
  style-src 'self' 'unsafe-inline'${featurebase.style};
  frame-src 'self' https://js.stripe.com https://www.googletagmanager.com${featurebase.frame};
${featurebase.media}
  frame-ancestors 'none';
`;
};

const nextConfig = {
  poweredByHeader: false,
  // Use standalone only in production deployments, not for CI/testing
  ...(process.env.NODE_ENV === "production" &&
    !process.env.CI && {
      output: "standalone",
      outputFileTracingRoot: __dirname,
    }),
  // React Compiler is now stable in Next.js 16
  reactCompiler: true,
  turbopack: {
    root: __dirname,
  },
  async headers() {
    const headers = [
      {
        key: "Content-Security-Policy",
        value: getCspHeader().replace(/\n/g, ""),
      },
      {
        key: "X-Content-Type-Options",
        value: "nosniff",
      },
      {
        key: "Referrer-Policy",
        value: "strict-origin-when-cross-origin",
      },
    ];

    return [
      {
        source: "/(.*)",
        headers,
      },
    ];
  },
};

// Sentry configuration options
const sentryWebpackPluginOptions = {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true, // Suppresses all logs
  hideSourceMaps: true, // Hides source maps from generated client bundles
  disableLogger: true, // Automatically tree-shake Sentry logger statements to reduce bundle size
  widenClientFileUpload: true, // Upload a larger set of source maps for prettier stack traces
};

// Export with Sentry only if configuration is available
const hasSentryBuildCredentials = Boolean(
  process.env.SENTRY_AUTH_TOKEN &&
    process.env.SENTRY_ORG &&
    process.env.SENTRY_PROJECT,
);

module.exports = hasSentryBuildCredentials
  ? withSentryConfig(nextConfig, sentryWebpackPluginOptions)
  : nextConfig;
