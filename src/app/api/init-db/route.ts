import { NextResponse } from "next/server";
import { db, getConnectionString } from "@/lib/db";
import { initMigrationSql } from "@/lib/migration-sql";
import bcrypt from "bcryptjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const logs: string[] = [];
  try {
    const rawUrl = getConnectionString() || "";
    // Mask password in logs
    const masked = rawUrl.replace(/:([^:@]+)@/, ":****@");
    logs.push(`Connecting to database: ${masked}`);
    
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

      // Create all predefined roles and users
      const allUsers = [
        { name: "Banti Yadav", email: "superadmin@ppulse.dev", role: "SUPER_ADMIN" as const, dept: "Delivery" },
        { name: "Banti Yadav", email: "admin@ppulse.dev", role: "ADMIN" as const, dept: "Delivery" },
        { name: "Mumtaz Sheikh", email: "mumtaz.pm@ppulse.dev", role: "PROJECT_MANAGER" as const, dept: "Delivery" },
        { name: "Banti Yadav", email: "ybanti.pm@ppulse.dev", role: "PROJECT_MANAGER" as const, dept: "Delivery" },
        { name: "Mumtaz Sheikh", email: "mumtaz.lead@projectpulse.dev", role: "TEAM_LEAD" as const, dept: "Engineering" },
        { name: "Banti Yadav", email: "ybanti.lead@projectpulse.dev", role: "TEAM_LEAD" as const, dept: "Design" },
        { name: "Banti Yadav", email: "ybanti@ppulse.dev", role: "TEAM_MEMBER" as const, dept: "Engineering" },
        { name: "Mumtaz Sheikh", email: "mumtaz@ppulse.dev", role: "TEAM_MEMBER" as const, dept: "Engineering" },
        { name: "Ankit Deshmukh", email: "ankit@ppulse.dev", role: "TEAM_MEMBER" as const, dept: "Engineering" },
        { name: "Nandini Dharme", email: "nandini@ppulse.dev", role: "TEAM_MEMBER" as const, dept: "Engineering" },
        { name: "Abhishek Thote", email: "abhishek@ppulse.dev", role: "TEAM_MEMBER" as const, dept: "Engineering" },
        { name: "Client Partner", email: "client@ppulse.dev", role: "CLIENT_VIEWER" as const, dept: "Delivery" },
        { name: "Jordan Blake", email: "jordan@projectpulse.dev", role: "TEAM_MEMBER" as const, dept: "Engineering", status: "SUSPENDED" as const },
      ];

      for (const u of allUsers) {
        await db.user.create({
          data: {
            orgId: org.id,
            name: u.name,
            email: u.email,
            role: u.role,
            departmentId: deptMap[u.dept],
            skills: ["Full Stack", "Product Management"],
            timezone: "UTC",
            passwordHash,
            status: u.status ?? "ACTIVE",
          },
        });
      }

      logs.push("Successfully created all user accounts across all roles!");
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
