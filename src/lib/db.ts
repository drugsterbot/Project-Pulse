import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function getConnectionString() {
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
  
  const isCloud =
    connectionString.includes(".neon.tech") ||
    connectionString.includes(".supabase.co") ||
    connectionString.includes("sslmode=require") ||
    process.env.NODE_ENV === "production";

  const pool = new Pool({
    connectionString,
    ssl: isCloud ? { rejectUnauthorized: false } : undefined,
    max: 10,
  });

  return new PrismaClient({ adapter: new PrismaPg(pool) });
}

export const db = globalForPrisma.prisma ?? create();
globalForPrisma.prisma = db;
export type { Prisma } from "@/generated/prisma/client";
