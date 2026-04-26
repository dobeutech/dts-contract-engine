import "server-only";
import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
  _stripe = new Stripe(key, {
    // Pin to the Stripe API version the SDK (stripe@22.1.0) was built for so
    // behavior doesn't drift when Stripe changes their defaults.
    apiVersion: "2026-04-22.dahlia",
    appInfo: {
      name: "dts-contract-engine",
      version: "0.1.0",
    },
  });
  return _stripe;
}
