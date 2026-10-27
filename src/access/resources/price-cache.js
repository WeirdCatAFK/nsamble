import { prisma } from "../primitives/db.js";

const STALE_AFTER_DAYS = 30;

export function findFreshPrice(
  { partKey, region = null },
  database = prisma,
) {
  const cutoff = new Date(Date.now() - STALE_AFTER_DAYS * 86_400_000);

  return database.priceCacheEntry.findFirst({
    where: {
      partKey,
      ...(region && { region }),
      retrievedAt: { gte: cutoff },
    },
    orderBy: { retrievedAt: "desc" },
  });
}

export function upsertPrice(
  { partKey, region, provider, unitPrice, currency = "USD", quantity = 1, metadata = null },
  database = prisma,
) {
  const now = new Date();
  return database.priceCacheEntry.upsert({
    where: {
      partKey_region_provider: { partKey, region: region ?? "", provider },
    },
    create: {
      partKey,
      region: region ?? "",
      provider,
      unitPrice,
      currency,
      quantity,
      metadata,
      retrievedAt: now,
    },
    update: {
      unitPrice,
      currency,
      quantity,
      metadata,
      retrievedAt: now,
    },
  });
}
