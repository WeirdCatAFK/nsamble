/** Look up part prices from the cache or parts library (batch). */
import {
  findFreshPrice,
  findFreshPrices,
} from "../../access/resources/db/price-cache.js";

export const name = "price_lookup";

export const description =
  "Look up reference prices for one or more parts from the price cache. " +
  "Pass several partIds at once for efficient batch lookup. " +
  "Returns each part's price, provider, retrieval date, and a staleness flag. " +
  "When stale is true, use web_search to find a current price, then call price_cache_write to store it.";

export const parameters = {
  type: "object",
  properties: {
    partIds: {
      type: "array",
      items: { type: "string" },
      description:
        "Part identifiers to look up, e.g. ['M3x12-socket-head', 'mdf-plate-40x40cm'].",
    },
    partId: {
      type: "string",
      description: "Single part identifier (shorthand when looking up one part).",
    },
    quantity: {
      type: "integer",
      description: "Number of units (applied to every part in the batch).",
    },
    region: {
      type: "string",
      description: "Market region such as queretaro-mx or us-midwest.",
    },
  },
  required: [],
  additionalProperties: false,
};

const STALE_AFTER_DAYS = 30;

function formatResult(partId, quantity, cached, region) {
  if (cached) {
    return {
      partId,
      quantity,
      unitPrice: Number(cached.unitPrice),
      currency: cached.currency,
      provider: cached.provider,
      region: cached.region || null,
      retrievedAt: cached.retrievedAt.toISOString(),
      stale: false,
      staleAfterDays: STALE_AFTER_DAYS,
    };
  }
  return {
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
  };
}

export async function execute({ partIds, partId, quantity = 1, region = null }) {
  const keys = partIds ?? (partId ? [partId] : []);
  if (keys.length === 0) {
    return JSON.stringify({ error: "Provide partIds (array) or partId (string)." });
  }

  if (keys.length === 1) {
    const cached = await findFreshPrice({ partKey: keys[0], region });
    return JSON.stringify(formatResult(keys[0], quantity, cached, region));
  }

  const rows = await findFreshPrices({ partKeys: keys, region });
  const byKey = Object.fromEntries(rows.map((r) => [r.partKey, r]));

  const results = keys.map((k) => formatResult(k, quantity, byKey[k] ?? null, region));
  return JSON.stringify(results);
}
