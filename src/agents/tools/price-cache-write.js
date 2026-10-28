/** Store a price found through web search into the cache. */
import { upsertPrice } from "../../access/resources/db/price-cache.js";

export const name = "price_cache_write";

export const description =
  "Store a price from a web search or external source into the price cache. Future price_lookup calls for the same part and region will return this cached value until it expires.";

export const parameters = {
  type: "object",
  properties: {
    partId: {
      type: "string",
      description: "Part identifier matching the one used in price_lookup.",
    },
    region: {
      type: "string",
      description: "Market region such as queretaro-mx or us-midwest.",
    },
    provider: {
      type: "string",
      description: "Source of the price such as home-depot-mx, mercadolibre, or madereria-higueras.",
    },
    unitPrice: {
      type: "number",
      description: "Price per unit.",
    },
    currency: {
      type: "string",
      description: "ISO 4217 currency code. Defaults to MXN.",
    },
    quantity: {
      type: "integer",
      description: "Reference quantity for this unit price.",
    },
    notes: {
      type: "string",
      description: "Extra context such as thickness, material grade, or sheet dimensions.",
    },
  },
  required: ["partId", "provider", "unitPrice"],
  additionalProperties: false,
};

export async function execute({
  partId,
  region = null,
  provider,
  unitPrice,
  currency = "MXN",
  quantity = 1,
  notes = null,
}) {
  const entry = await upsertPrice({
    partKey: partId,
    region,
    provider,
    unitPrice,
    currency,
    quantity,
    metadata: notes ? { notes } : null,
  });

  return JSON.stringify({
    cached: true,
    partId,
    provider: entry.provider,
    unitPrice: Number(entry.unitPrice),
    currency: entry.currency,
    region: entry.region || null,
    retrievedAt: entry.retrievedAt.toISOString(),
  });
}
