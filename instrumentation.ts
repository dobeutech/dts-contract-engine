import * as Sentry from "@sentry/nextjs";
import { validateStartupEnv } from "@/lib/env/startup";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    validateStartupEnv();
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
