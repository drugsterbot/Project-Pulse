import "dotenv/config";
import { defineConfig } from "prisma/config";

const dbUrl =
  process.env.DATABASE_URL ||
  process.env.projectpulse_PRISMA_DATABASE_URL ||
  process.env.projectpulse_DATABASE_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL ||
  "postgresql://pulse:pulse@localhost:5432/projectpulse";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
  datasource: { url: dbUrl },
});
