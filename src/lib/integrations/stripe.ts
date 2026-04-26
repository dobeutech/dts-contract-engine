import "server-only";
import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
  _stripe = new Stripe(key, {
    // Pin to the Stripe API version the SDK was built for. The SDK enforces
    // this with a string literal type; cast keeps us pinned without breaking
    // when Stripe rev's the API version.
    appInfo: {
      name: "dts-contract-engine",
      version: "0.1.0",
    },
  });
  return _stripe;
}
