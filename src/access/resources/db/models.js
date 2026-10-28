import { prisma } from "../../primitives/db.js";

const errLevel = "Error at resource level in access:";

export function findActiveModelBySlug(slug, database = prisma) {
  try {
    return database.model.findFirst({
      where: { slug, active: true },
    });
  } catch (error) {
    throw new Error(errLevel + error.message, { cause: error });
  }
}

export function findActiveModelById(id, database = prisma) {
  try {
    return database.model.findFirst({
      where: { id, active: true },
    });
  } catch (error) {
    throw new Error(errLevel + error.message, { cause: error });
  }
}

export function upsertModel({ slug, provider, prices }, database = prisma) {
  try {
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
  } catch (error) {
    throw new Error(errLevel + error.message, { cause: error });
  }
}
