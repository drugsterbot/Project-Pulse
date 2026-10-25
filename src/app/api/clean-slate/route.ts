import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // 1. Delete all time entries and reports
    await db.timeEntry.deleteMany();
    await db.dailyReportAttachment.deleteMany();
    await db.dailyReportItem.deleteMany();
    await db.dailyReport.deleteMany();

    // 2. Delete all tasks and task-dependent items
    await db.taskAttachment.deleteMany();
    await db.taskComment.deleteMany();
    await db.taskDependency.deleteMany();
    await db.taskAssignee.deleteMany();
    await db.subtask.deleteMany();
    await db.task.deleteMany();

    // 3. Delete milestones, files, risks, announcements
    await db.milestone.deleteMany();
    await db.fileVersion.deleteMany();
    await db.projectFile.deleteMany();
    await db.risk.deleteMany();
    await db.announcement.deleteMany();

    // 4. Delete activities, notifications and projects
    await db.activityLog.deleteMany();
    await db.notification.deleteMany();
    await db.projectMember.deleteMany();
    await db.project.deleteMany();

    const counts = {
      usersRemaining: await db.user.count(),
      teamsRemaining: await db.team.count(),
      projectsRemaining: await db.project.count(),
      tasksRemaining: await db.task.count(),
      activitiesRemaining: await db.activityLog.count(),
      reportsRemaining: await db.dailyReport.count(),
    };

    return NextResponse.json({
      ok: true,
      message: "Database cleared! All sample projects, tasks, daily reports, time entries, and activities have been completely cleared. Your user accounts, departments, and teams remain 100% intact.",
      counts,
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error("[clean-slate error]", err);
    return NextResponse.json(
      {
        ok: false,
        error: err.message,
      },
      { status: 500 }
    );
  }
}
