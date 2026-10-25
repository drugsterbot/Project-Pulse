import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function getConnectionString() {
  return (
    process.env.DATABASE_URL ||
    process.env.projectpulse_PRISMA_DATABASE_URL ||
    process.env.projectpulse_DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL
  );
}

function create() {
  const connectionString = getConnectionString();
  if (!connectionString) throw new Error("DATABASE_URL is not set. Copy .env.example to .env first.");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

export const db = globalForPrisma.prisma ?? create();
globalForPrisma.prisma = db;
export type { Prisma } from "@/generated/prisma/client";
