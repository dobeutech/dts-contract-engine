import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @react-pdf/renderer ships ESM with native deps that webpack tries to
  // tree-shake aggressively and trips a runtime TypeError during the
  // Sentry-wrapped build. Telling Next to keep it external on the server
  // sidesteps the bundler interaction without changing runtime behavior.
  serverExternalPackages: ["@react-pdf/renderer"],
};

const SENTRY_ENABLED =
  !!process.env.SENTRY_DSN &&
  !!process.env.SENTRY_AUTH_TOKEN &&
  !!process.env.SENTRY_ORG &&
  !!process.env.SENTRY_PROJECT;

// Sentry build-time wrap. Source-map upload activates only when the full set
// of Sentry env vars is present (i.e., on Vercel CI). Local builds with no
// Sentry credentials skip the wrap entirely to avoid build-time exceptions.
export default SENTRY_ENABLED
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: !process.env.CI,
      widenClientFileUpload: true,
      sourcemaps: { disable: false },
    })
  : nextConfig;
