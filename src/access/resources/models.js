import { prisma } from "../primitives/db.js";

export function findActiveModelBySlug(slug, database = prisma) {
  return database.model.findFirst({
    where: { slug, active: true },
  });
}

export function findActiveModelById(id, database = prisma) {
  return database.model.findFirst({
    where: { id, active: true },
  });
}

export function upsertModel({ slug, provider, prices }, database = prisma) {
  const data = {
    provider,
    inputPricePerMillion: String(prices.input_price),
    cachedInputPricePerMillion: String(prices.cache_price),
    outputPricePerMillion: String(prices.output_price),
  };

  return database.model.upsert({
    where: { slug },
    create: { slug, ...data },
    update: data,
  });
}
