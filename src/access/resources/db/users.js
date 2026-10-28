import { prisma } from "../../primitives/db.js";

const errLevel = "Error at resource level in access:";

export function findUserById(id, database = prisma) {
  try {
    return database.user.findUnique({
      where: { id },
      select: { id: true },
    });
  } catch (error) {
    throw new Error(errLevel + error.message, { cause: error });
  }
}
