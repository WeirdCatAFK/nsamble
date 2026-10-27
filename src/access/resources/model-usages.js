import { prisma } from "../primitives/db.js";

export function createModelUsage(data, database = prisma) {
  return database.modelUsage.create({ data });
}

export function listModelUsageByBillingSession(
  { billingSessionId, cursor, take = 25 },
  database = prisma,
) {
  return database.modelUsage.findMany({
    where: { billingSessionId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
  });
}
