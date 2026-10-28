import { prisma } from "../../primitives/db.js";

const errLevel = "Error at resource level in access:";

export function createModelUsage(data, database = prisma) {
  try {
    return database.modelUsage.create({ data });
  } catch (error) {
    throw new Error(errLevel + error.message, { cause: error });
  }
}

export function listModelUsageByBillingSession(
  { billingSessionId, cursor, take = 25 },
  database = prisma,
) {
  try {
    return database.modelUsage.findMany({
      where: { billingSessionId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });
  } catch (error) {
    throw new Error(errLevel + error.message, { cause: error });
  }
}
