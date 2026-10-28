/** Look up a part price from the cache or parts library. */
import { findFreshPrice } from "../../access/resources/db/price-cache.js";

export const name = "price_lookup";

export const description =
  "Look up the reference price of a part from the price cache or parts library. Returns the price, its provider, retrieval date, and a staleness flag. When stale is true, use web_search to find a current price, then call price_cache_write to store it.";

export const parameters = {
  type: "object",
  properties: {
    partId: {
      type: "string",
      description: "Part identifier such as M3x12-socket-head or mdf-plate-40x40cm.",
    },
    quantity: {
      type: "integer",
      description: "Number of units.",
    },
    region: {
      type: "string",
      description: "Market region such as queretaro-mx or us-midwest.",
    },
  },
  required: ["partId"],
  additionalProperties: false,
};

const STALE_AFTER_DAYS = 30;

export async function execute({ partId, quantity = 1, region = null }) {
  const cached = await findFreshPrice({ partKey: partId, region });

  if (cached) {
    return JSON.stringify({
      partId,
      quantity,
      unitPrice: Number(cached.unitPrice),
      currency: cached.currency,
      provider: cached.provider,
      region: cached.region || null,
      retrievedAt: cached.retrievedAt.toISOString(),
      stale: false,
      staleAfterDays: STALE_AFTER_DAYS,
    });
  }

  return JSON.stringify({
    partId,
    quantity,
    unitPrice: null,
    currency: "USD",
    provider: null,
    region: region || null,
    retrievedAt: new Date().toISOString(),
    stale: true,
    staleAfterDays: STALE_AFTER_DAYS,
    note: "No cached price found. Use web_search for current prices, then call price_cache_write to store the result.",
  });
}
