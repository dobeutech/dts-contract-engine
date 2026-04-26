import {
  listPricingConfigs,
  getActivePricingConfig,
} from "@/lib/db/pricing-config";
import { DEFAULT_CONFIG } from "@/lib/pricing/config";
import { PricingEditor } from "./pricing-editor";

export default async function PricingAdminPage() {
  const [active, all] = await Promise.all([
    getActivePricingConfig(),
    listPricingConfigs(),
  ]);

  const seedJson = JSON.stringify(active?.config ?? DEFAULT_CONFIG, null, 2);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl">Pricing</h1>
        <p className="mt-2 text-muted-foreground">
          Edit the JSON config, save a new version, and publish to make it the
          active pricing for new quotes.
        </p>
      </header>

      <PricingEditor
        seedJson={seedJson}
        activeId={active?.id ?? null}
        history={all.map((c) => ({
          id: c.id,
          version: c.version,
          is_active: c.is_active,
          created_at: c.created_at,
        }))}
      />
    </div>
  );
}
