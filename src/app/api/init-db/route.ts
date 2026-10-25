import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { initMigrationSql } from "@/lib/migration-sql";
import bcrypt from "bcryptjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const logs: string[] = [];
  try {
    logs.push("Checking database connection...");
    
    // 1. Check if tables exist by querying User count
    let tablesExist = false;
    try {
      await db.user.count();
      tablesExist = true;
      logs.push("Tables already exist.");
    } catch {
      logs.push("Tables not found. Applying migration schema...");
    }

    if (!tablesExist) {
      // Execute the bundled migration SQL directly
      await db.$executeRawUnsafe(initMigrationSql);
      logs.push("Successfully applied migration schema (created all 26 tables and enums).");
    }

    // 2. Check if users exist
    const userCount = await db.user.count();
    logs.push(`Current user count: ${userCount}`);

    if (userCount === 0) {
      logs.push("Database has 0 users. Seeding initial accounts...");
      const passwordHash = await bcrypt.hash("ProjectPulse#2026", 12);
      
      const org = await db.organization.create({
        data: {
          name: "Meridian Digital",
          slug: "meridian-digital",
          settings: { workWeekHours: 40 },
        },
      });

      const depts = ["Engineering", "Design", "Quality Assurance", "Delivery"];
      const deptMap: Record<string, string> = {};
      for (const d of depts) {
        const row = await db.department.create({ data: { orgId: org.id, name: d } });
        deptMap[d] = row.id;
      }

      // Create primary admin accounts
      await db.user.create({
        data: {
          orgId: org.id,
          name: "Banti Yadav",
          email: "superadmin@ppulse.dev",
          role: "SUPER_ADMIN",
          departmentId: deptMap["Delivery"],
          skills: ["Strategy", "Operations"],
          timezone: "UTC",
          passwordHash,
          status: "ACTIVE",
        },
      });

      await db.user.create({
        data: {
          orgId: org.id,
          name: "Banti Yadav",
          email: "admin@ppulse.dev",
          role: "ADMIN",
          departmentId: deptMap["Delivery"],
          skills: ["People ops", "Process"],
          timezone: "UTC",
          passwordHash,
          status: "ACTIVE",
        },
      });

      await db.user.create({
        data: {
          orgId: org.id,
          name: "Mumtaz Sheikh",
          email: "mumtaz.pm@ppulse.dev",
          role: "PROJECT_MANAGER",
          departmentId: deptMap["Delivery"],
          skills: ["Planning", "Stakeholders"],
          timezone: "UTC",
          passwordHash,
          status: "ACTIVE",
        },
      });

      await db.user.create({
        data: {
          orgId: org.id,
          name: "Banti Yadav",
          email: "ybanti.pm@ppulse.dev",
          role: "PROJECT_MANAGER",
          departmentId: deptMap["Delivery"],
          skills: ["Agile", "Risk management"],
          timezone: "UTC",
          passwordHash,
          status: "ACTIVE",
        },
      });

      logs.push("Successfully created initial Super Admin and Admin accounts!");
    }

    return NextResponse.json({
      ok: true,
      message: "Database initialized successfully! You can now sign in at /login with password ProjectPulse#2026",
      logs,
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error("[init-db error]", err);
    return NextResponse.json(
      {
        ok: false,
        error: err.message,
        stack: err.stack,
        logs,
      },
      { status: 500 }
    );
  }
}
