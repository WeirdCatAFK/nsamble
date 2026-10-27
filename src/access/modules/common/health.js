import { prisma } from "../../primitives/db.js";
import { pingStorage } from "../../primitives/minio.js";

export async function checkHealth() {
  const checks = { database: "ok", storage: "ok" };

  await Promise.all([
    prisma.$queryRaw`SELECT 1`.catch(() => {
      checks.database = "error";
    }),
    pingStorage().catch(() => {
      checks.storage = "error";
    }),
  ]);

  const healthy = Object.values(checks).every((status) => status === "ok");
  return { healthy, checks };
}
