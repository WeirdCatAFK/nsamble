import { prisma } from "../primitives/db.js";

export function findUserById(id, database = prisma) {
  return database.user.findUnique({
    where: { id },
    select: { id: true },
  });
}
