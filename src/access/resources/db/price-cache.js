import { prisma } from "../../primitives/db.js";

const errLevel = "Error at resource level in access:";

const STALE_AFTER_DAYS = 30;

export function findFreshPrice({ partKey, region = null }, database = prisma) {
  try {
    const cutoff = new Date(Date.now() - STALE_AFTER_DAYS * 86_400_000);

    return database.priceCacheEntry.findFirst({
      where: {
        partKey,
        ...(region && { region }),
        retrievedAt: { gte: cutoff },
      },
      orderBy: { retrievedAt: "desc" },
    });
  } catch (error) {
    throw new Error(errLevel + error.message, { cause: error });
  }
}

export function findFreshPrices({ partKeys, region = null }, database = prisma) {
  try {
    const cutoff = new Date(Date.now() - STALE_AFTER_DAYS * 86_400_000);

    return database.priceCacheEntry.findMany({
      where: {
        partKey: { in: partKeys },
        ...(region && { region }),
        retrievedAt: { gte: cutoff },
      },
      orderBy: { retrievedAt: "desc" },
      distinct: ["partKey"],
    });
  } catch (error) {
    throw new Error(errLevel + error.message, { cause: error });
  }
}

export function upsertPrice(
  {
    partKey,
    region,
    provider,
    unitPrice,
    currency = "USD",
    quantity = 1,
    metadata = null,
  },
  database = prisma,
) {
  try {
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
  } catch (error) {
    throw new Error(errLevel + error.message, { cause: error });
  }
}
