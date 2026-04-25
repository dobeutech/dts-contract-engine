import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
};

// Sentry build-time wrap. Source-map upload activates only when SENTRY_DSN
// and SENTRY_AUTH_TOKEN are both set (i.e. on Vercel production/preview);
// local builds without those vars will skip the upload step gracefully.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  sourcemaps: {
    disable: !process.env.SENTRY_DSN,
  },
});
