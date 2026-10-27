import { defineConfig } from "@prisma/prisma7/config";
import { env } from "./src/env.js";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env.database.url,
  },
});
