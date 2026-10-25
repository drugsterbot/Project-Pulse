import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function getConnectionString(): string {
  const isCloudPostgres = (val?: string): val is string =>
    typeof val === "string" &&
    (val.startsWith("postgresql://") || val.startsWith("postgres://")) &&
    !val.includes("localhost") &&
    !val.includes("127.0.0.1");

  // 1. Check known variables in priority order
  const candidates = [
    process.env.projectpulse_PRISMA_DATABASE_URL,
    process.env.projectpulse_DATABASE_URL,
    process.env.projectpulse_POSTGRES_URL,
    process.env.projectpulse_POSTGRES_PRISMA_URL,
    process.env.POSTGRES_PRISMA_URL,
    process.env.POSTGRES_URL,
    process.env.DATABASE_URL,
  ];

  for (const c of candidates) {
    if (isCloudPostgres(c)) return c;
  }

  // 2. Scan ALL environment variables for any cloud postgres connection string
  for (const [key, val] of Object.entries(process.env)) {
    if (isCloudPostgres(val)) {
      return val;
    }
  }

  // 3. Fallback to local DATABASE_URL or default
  return process.env.DATABASE_URL || "postgresql://pulse:pulse@localhost:5432/projectpulse";
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
