import "dotenv/config";
import { defineConfig } from "prisma/config";

const isLocal = (url?: string) => !url || url.includes("localhost") || url.includes("127.0.0.1");

function getDbUrl() {
  if (process.env.VERCEL || process.env.NODE_ENV === "production") {
    if (process.env.DATABASE_URL && !isLocal(process.env.DATABASE_URL)) {
      return process.env.DATABASE_URL;
    }
    return (
      process.env.projectpulse_PRISMA_DATABASE_URL ||
      process.env.projectpulse_DATABASE_URL ||
      process.env.POSTGRES_PRISMA_URL ||
      process.env.POSTGRES_URL ||
      process.env.DATABASE_URL ||
      "postgresql://pulse:pulse@localhost:5432/projectpulse"
    );
  }
  return (
    process.env.DATABASE_URL ||
    process.env.projectpulse_PRISMA_DATABASE_URL ||
    process.env.projectpulse_DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL ||
    "postgresql://pulse:pulse@localhost:5432/projectpulse"
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
  datasource: { url: getDbUrl() },
});
