import { readFile } from "node:fs/promises";
import { prisma } from "../src/access/primitives/db.js";
import { upsertModel } from "../src/access/resources/db/models.js";

const models = JSON.parse(
  await readFile(new URL("../models.json", import.meta.url), "utf8"),
);

try {
  await prisma.$transaction(async (database) => {
    for (const [slug, prices] of Object.entries(models)) {
      await upsertModel({ slug, provider: "meta", prices }, database);
    }
  });
} finally {
  await prisma.$disconnect();
}
