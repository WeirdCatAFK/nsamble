import { prisma } from "../../primitives/db.js";

const errLevel = "Error at resource level in access:";

export function findProject({ id, ownerId }, database = prisma) {
  try {
    return database.project.findFirst({
      where: { id, ownerId },
    });
  } catch (error) {
    throw new Error(errLevel + error.message, { cause: error });
  }
}
