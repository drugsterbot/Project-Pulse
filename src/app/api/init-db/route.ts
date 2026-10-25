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
    const masked = rawUrl.replace(/:([^:@]+)@/, ":****@");
    const detectedKeys = Object.keys(process.env).filter((k) =>
      k.toLowerCase().includes("postgres") || k.toLowerCase().includes("database") || k.toLowerCase().includes("url")
    );
    logs.push(`Available database env keys in runtime: ${detectedKeys.join(", ") || "none"}`);
    logs.push(`Resolved database URL: ${masked}`);

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

    // 2. Ensure Organization exists
    let org = await db.organization.findFirst();
    if (!org) {
      org = await db.organization.create({
        data: {
          name: "Meridian Digital",
          slug: "meridian-digital",
          settings: { workWeekHours: 40 },
        },
      });
      logs.push("Created organization 'Meridian Digital'.");
    }

    // 3. Ensure Departments exist
    const depts = ["Engineering", "Design", "Quality Assurance", "Delivery"];
    const deptMap: Record<string, string> = {};
    for (const d of depts) {
      const existing = await db.department.findUnique({
        where: { orgId_name: { orgId: org.id, name: d } },
      });
      if (existing) {
        deptMap[d] = existing.id;
      } else {
        const created = await db.department.create({ data: { orgId: org.id, name: d } });
        deptMap[d] = created.id;
      }
    }

    // 4. Upsert all 13 users so every account exists with ProjectPulse#2026
    const passwordHash = await bcrypt.hash("ProjectPulse#2026", 12);

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

    const userMap: Record<string, string> = {};
    for (const u of allUsers) {
      const user = await db.user.upsert({
        where: { email: u.email },
        update: {
          name: u.name,
          role: u.role,
          passwordHash,
          status: u.status ?? "ACTIVE",
          departmentId: deptMap[u.dept],
        },
        create: {
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
      userMap[u.email] = user.id;
    }
    logs.push(`Successfully synced ${allUsers.length} user accounts with password 'ProjectPulse#2026'.`);

    // 5. Ensure Teams exist
    const teamDefs = [
      { name: "Platform Engineering", dept: "Engineering", lead: "mumtaz.lead@projectpulse.dev", members: ["mumtaz@ppulse.dev", "nandini@ppulse.dev", "ankit@ppulse.dev"] },
      { name: "Product Design", dept: "Design", lead: "ybanti.lead@projectpulse.dev", members: ["ybanti@ppulse.dev", "abhishek@ppulse.dev"] },
      { name: "Quality & Release", dept: "Quality Assurance", lead: "mumtaz.lead@projectpulse.dev", members: ["abhishek@ppulse.dev"] },
    ];

    for (const td of teamDefs) {
      let team = await db.team.findFirst({ where: { orgId: org.id, name: td.name } });
      if (!team) {
        team = await db.team.create({
          data: {
            orgId: org.id,
            name: td.name,
            departmentId: deptMap[td.dept],
            leadId: userMap[td.lead],
          },
        });
        for (const mEmail of td.members) {
          if (userMap[mEmail]) {
            await db.teamMember.create({
              data: {
                teamId: team.id,
                userId: userMap[mEmail],
                isLead: mEmail === td.lead,
              },
            });
          }
        }
      }
    }
    logs.push("Ensured teams exist.");

    // 6. Ensure Projects and Sample Tasks exist if empty
    const projCount = await db.project.count();
    if (projCount === 0) {
      const pmMumtaz = userMap["mumtaz.pm@ppulse.dev"];
      const pmBanti = userMap["ybanti.pm@ppulse.dev"];

      // Project 1: Atlas Customer Portal
      const pAtlas = await db.project.create({
        data: {
          orgId: org.id,
          name: "Atlas Customer Portal",
          code: "ATLAS",
          description: "Self-service customer portal with billing and account management.",
          category: "Web platform",
          status: "ACTIVE",
          priority: "HIGH",
          startDate: new Date(Date.now() - 30 * 86400000),
          endDate: new Date(Date.now() + 45 * 86400000),
          managerId: pmMumtaz,
          budget: 185000,
          estimatedHours: 900,
          goals: "Cut support tickets by 30%. Launch with SSO.",
          clientName: "Brightwave Retail",
        },
      });

      // Project 2: Horizon Mobile App
      const pHorizon = await db.project.create({
        data: {
          orgId: org.id,
          name: "Horizon Mobile App",
          code: "HRZN",
          description: "Offline-first driver app with push alerts and biometric login.",
          category: "Mobile",
          status: "ACTIVE",
          priority: "CRITICAL",
          startDate: new Date(Date.now() - 20 * 86400000),
          endDate: new Date(Date.now() + 40 * 86400000),
          managerId: pmBanti,
          budget: 142000,
          estimatedHours: 760,
          goals: "Ship beta to 200 drivers.",
        },
      });

      // Add Project Members
      for (const email of Object.keys(userMap)) {
        if (email !== "jordan@projectpulse.dev") {
          const isClient = email === "client@ppulse.dev";
          await db.projectMember.create({
            data: {
              projectId: pAtlas.id,
              userId: userMap[email]!,
              isClientAccess: isClient,
            },
          });
          if (!isClient) {
            await db.projectMember.create({
              data: {
                projectId: pHorizon.id,
                userId: userMap[email]!,
                isClientAccess: false,
              },
            });
          }
        }
      }

      // Milestones for Atlas
      const m1 = await db.milestone.create({
        data: {
          projectId: pAtlas.id,
          name: "Core portal build",
          dueDate: new Date(Date.now() + 15 * 86400000),
          status: "IN_PROGRESS",
          health: "HEALTHY",
          progress: 60,
        },
      });

      // Sample Tasks for Atlas
      const t1 = await db.task.create({
        data: {
          projectId: pAtlas.id,
          milestoneId: m1.id,
          title: "Authentication & SSO integration",
          description: "OIDC login with Brightwave identity provider.",
          creatorId: pmMumtaz!,
          status: "IN_PROGRESS",
          priority: "CRITICAL",
          startDate: new Date(Date.now() - 10 * 86400000),
          dueDate: new Date(Date.now() + 5 * 86400000),
          estimatedHours: 36,
          loggedHours: 20,
          progress: 55,
          labels: ["backend", "security"],
        },
      });
      await db.taskAssignee.create({ data: { taskId: t1.id, userId: userMap["ankit@ppulse.dev"]! } });
      await db.taskAssignee.create({ data: { taskId: t1.id, userId: userMap["nandini@ppulse.dev"]! } });

      const t2 = await db.task.create({
        data: {
          projectId: pAtlas.id,
          milestoneId: m1.id,
          title: "Portal dashboard prototype",
          description: "High-fidelity prototype of customer dashboard.",
          creatorId: pmMumtaz!,
          status: "WAITING_FOR_REVIEW",
          priority: "HIGH",
          startDate: new Date(Date.now() - 15 * 86400000),
          dueDate: new Date(Date.now() - 2 * 86400000),
          estimatedHours: 30,
          loggedHours: 30,
          progress: 100,
          labels: ["design", "prototype"],
          requiredEvidence: true,
          completionNotes: "Prototype completed and ready for review.",
        },
      });
      await db.taskAssignee.create({ data: { taskId: t2.id, userId: userMap["ybanti@ppulse.dev"]! } });

      const t3 = await db.task.create({
        data: {
          projectId: pAtlas.id,
          milestoneId: m1.id,
          title: "Accessibility audit (WCAG AA)",
          description: "Colour tokens and contrast check.",
          creatorId: pmMumtaz!,
          status: "BLOCKED",
          priority: "HIGH",
          blockerReason: "Waiting on final colour tokens from design system.",
          startDate: new Date(Date.now() - 5 * 86400000),
          dueDate: new Date(Date.now() + 10 * 86400000),
          estimatedHours: 16,
          loggedHours: 4,
          progress: 25,
          labels: ["qa", "a11y"],
        },
      });
      await db.taskAssignee.create({ data: { taskId: t3.id, userId: userMap["abhishek@ppulse.dev"]! } });

      logs.push("Created sample projects (Atlas Customer Portal, Horizon Mobile App) and tasks.");
    }

    const currentCounts = {
      users: await db.user.count(),
      projects: await db.project.count(),
      tasks: await db.task.count(),
      teams: await db.team.count(),
    };

    return NextResponse.json({
      ok: true,
      message: "Database fully synced! All 13 accounts and projects are ready. Password for all: ProjectPulse#2026",
      counts: currentCounts,
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
