import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client.ts";
import { env, requireEnvironment } from "../../env.js";

requireEnvironment("DATABASE_URL");

const createPrismaClient = () => {
  const adapter = new PrismaPg({ connectionString: env.database.url });

  return new PrismaClient({
    adapter,
    log: ["warn", "error"],
  });
};

const globalForPrisma = globalThis;

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (env.nodeEnv !== "production") {
  globalForPrisma.prisma = prisma;
}
