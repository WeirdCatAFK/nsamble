import { prisma } from "../primitives/db.js";

export function findProject({ id, ownerId }, database = prisma) {
  return database.project.findFirst({
    where: { id, ownerId },
  });
}
