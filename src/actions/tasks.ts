"use server";

import { revalidatePath } from "next/cache";
import { db, type Prisma } from "@/lib/db";
import { actionUser, type SessionUser } from "@/lib/auth";
import { assertProject, assertReport, assertTask, projectReviewerIds } from "@/lib/access";
import { logActivity, notify, recalcMilestone } from "@/lib/activity";
import { createsCycle, extractMentions, unmetDependencies, validateCompletion } from "@/lib/business";
import { TASK_STATUS_LABEL, type TaskStatus } from "@/lib/constants";
import { AppError, forbidden, run, type ActionResult } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { commentSchema, completeTaskSchema, formObject, parseId, reviewTaskSchema, taskSchema } from "@/lib/validators";
import { parseDateOnly } from "@/lib/utils";

type Tx = Prisma.TransactionClient;
type LoadedTask = Awaited<ReturnType<typeof assertTask>>["task"];

const refresh = (projectId: string, taskId?: string) => {
  revalidatePath("/tasks"); revalidatePath("/board"); revalidatePath("/dashboard"); revalidatePath(`/projects/${projectId}`);
  if (taskId) revalidatePath(`/tasks/${taskId}`);
};

async function validateAssignees(projectId: string, ids: string[]) {
  if (!ids.length) return [];
  const members = await db.projectMember.findMany({ where: { projectId, isClientAccess: false, userId: { in: ids }, user: { status: "ACTIVE", deletedAt: null } }, select: { userId: true } });
  const project = await db.project.findUnique({ where: { id: projectId }, select: { managerId: true } });
  const ok = new Set([...members.map((m) => m.userId), ...(project?.managerId && ids.includes(project.managerId) ? [project.managerId] : [])]);
  if (ids.some((id) => !ok.has(id))) throw new AppError("Assignees must be active members of the project.");
  return [...new Set(ids)];
}

async function validateDependencies(projectId: string, taskId: string | null, ids: string[]) {
  if (!ids.length) return [];
  const found = await db.task.findMany({ where: { id: { in: ids }, projectId, deletedAt: null }, select: { id: true } });
  if (found.length !== new Set(ids).size) throw new AppError("Dependencies must be tasks in the same project.");
  if (taskId) {
    const edges = await db.taskDependency.findMany({ where: { task: { projectId } }, select: { taskId: true, dependsOnId: true } });
    for (const dep of ids) if (createsCycle(edges.filter((e) => e.taskId !== taskId), taskId, dep)) throw new AppError("That dependency would create a loop.");
  }
  return [...new Set(ids)];
}

export async function saveTaskAction(fd: FormData): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const user = await actionUser();
    const raw = formObject(fd);
    const input = taskSchema.parse(raw);
    const id = parseId(raw.id);
    let projectId = input.projectId;
    if (id) {
      const { task } = await assertTask(user, id, "review");
      projectId = task.projectId; // tasks never move between projects
    } else await assertProject(user, projectId, "createTask");

    if (input.milestoneId && !(await db.milestone.findFirst({ where: { id: input.milestoneId, projectId, deletedAt: null } }))) throw new AppError("That milestone is not in this project.");
    const assigneeIds = await validateAssignees(projectId, input.assigneeIds);
    const dependsOnIds = (await validateDependencies(projectId, id, input.dependsOnIds)).filter((d) => d !== id);

    const data = {
      title: input.title, description: input.description ?? null, milestoneId: input.milestoneId ?? null, priority: input.priority as "LOW",
      startDate: input.startDate ? parseDateOnly(input.startDate) : null, dueDate: input.dueDate ? parseDateOnly(input.dueDate) : null,
      estimatedHours: input.estimatedHours ?? null, labels: input.labels, requiredEvidence: input.requiredEvidence,
      ...(input.progress != null ? { progress: Math.round(input.progress) } : {}),
    };
    const saved = await db.$transaction(async (tx) => {
      let prevMilestone: string | null = null;
      let prevAssignees: string[] = [];
      if (id) {
        const prev = await tx.task.findUniqueOrThrow({ where: { id }, include: { assignees: true } });
        prevMilestone = prev.milestoneId; prevAssignees = prev.assignees.map((a) => a.userId);
      }
      const task = id ? await tx.task.update({ where: { id }, data }) : await tx.task.create({ data: { ...data, projectId, creatorId: user.id, status: "NOT_STARTED" } });
      await tx.taskAssignee.deleteMany({ where: { taskId: task.id, userId: { notIn: assigneeIds } } });
      const keep = new Set(prevAssignees);
      const added = assigneeIds.filter((a) => !keep.has(a));
      if (added.length) await tx.taskAssignee.createMany({ data: added.map((userId) => ({ taskId: task.id, userId })) });
      await tx.taskDependency.deleteMany({ where: { taskId: task.id } });
      if (dependsOnIds.length) await tx.taskDependency.createMany({ data: dependsOnIds.map((dependsOnId) => ({ taskId: task.id, dependsOnId })) });
      await logActivity(tx, { actorId: user.id, projectId, taskId: task.id, action: id ? "task_updated" : "task_created", summary: `${user.name} ${id ? "updated" : "created"} task “${task.title}”` });
      await notify(tx, added, { type: "TASK_ASSIGNED", title: `Assigned to you: ${task.title}`, body: task.dueDate ? `Due ${task.dueDate.toISOString().slice(0, 10)}` : undefined, href: `/tasks/${task.id}` }, user.id);
      await recalcMilestone(tx, task.milestoneId);
      if (prevMilestone && prevMilestone !== task.milestoneId) await recalcMilestone(tx, prevMilestone);
      return task;
    });
    refresh(projectId, saved.id);
    return { id: saved.id };
  }, "Task saved.");
}

export async function deleteTaskAction(taskId: string): Promise<ActionResult> {
  return run(async () => {
    const user = await actionUser();
    const { task } = await assertTask(user, taskId, "review");
    await db.$transaction(async (tx) => {
      await tx.task.update({ where: { id: taskId }, data: { deletedAt: new Date() } });
      await logActivity(tx, { actorId: user.id, projectId: task.projectId, action: "task_deleted", summary: `${user.name} deleted task “${task.title}”` });
      await recalcMilestone(tx, task.milestoneId);
    });
    refresh(task.projectId);
  }, "Task deleted.");
}

async function transition(tx: Tx, user: SessionUser, task: LoadedTask, to: TaskStatus, data: Prisma.TaskUpdateInput = {}) {
  await tx.task.update({ where: { id: task.id }, data: { status: to, ...data } });
  await logActivity(tx, {
    actorId: user.id, projectId: task.projectId, taskId: task.id, action: "status_changed",
    summary: `${user.name} moved “${task.title}” from ${TASK_STATUS_LABEL[task.status as TaskStatus]} to ${TASK_STATUS_LABEL[to]}`, meta: { from: task.status, to },
  });
  await recalcMilestone(tx, task.milestoneId);
}

async function requestReview(user: SessionUser, task: LoadedTask, notes: string | null | undefined) {
  const evidenceCount = await db.taskAttachment.count({ where: { taskId: task.id, file: { deletedAt: null } } });
  const problem = validateCompletion({ notes, requiredEvidence: task.requiredEvidence, evidenceCount });
  if (problem) throw new AppError(problem);
  const reviewers = await projectReviewerIds(task.projectId, user.id);
  await db.$transaction(async (tx) => {
    await transition(tx, user, task, "WAITING_FOR_REVIEW", { approval: "PENDING", completionNotes: notes!.trim(), progress: 100, blockerReason: null });
    await notify(tx, reviewers, { type: "TASK_AWAITING_REVIEW", title: `Awaiting review: ${task.title}`, body: `${user.name} marked this task ready for review.`, href: `/tasks/${task.id}` });
  });
}

export async function completeTaskAction(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const user = await actionUser();
    const input = completeTaskSchema.parse(formObject(fd));
    const { task } = await assertTask(user, input.taskId, "update");
    if (task.status === "COMPLETED" || task.status === "WAITING_FOR_REVIEW") throw new AppError("This task is already complete or in review.");
    const deps = await db.taskDependency.findMany({ where: { taskId: task.id }, include: { dependsOn: { select: { title: true, status: true } } } });
    const unmet = unmetDependencies(deps.map((d) => d.dependsOn));
    if (unmet.length) throw new AppError(`Finish these first: ${unmet.map((u) => u.title).join(", ")}.`);
    await requestReview(user, task, input.notes);
    refresh(task.projectId, task.id);
  }, "Sent for review.");
}

export async function moveTaskAction(taskId: string, to: TaskStatus, extra?: { reason?: string; notes?: string }): Promise<ActionResult> {
  return run(async () => {
    const user = await actionUser();
    const { task, level } = await assertTask(user, taskId, "update");
    if (task.status === to) return;
    const reviewer = can(level, "review");
    if (task.status === "COMPLETED" && !reviewer) throw forbidden("Only a reviewer can change a completed task.");
    if (to === "REOPENED" && !reviewer) throw forbidden("Only a reviewer can reopen a task.");

    if (["IN_PROGRESS", "WAITING_FOR_REVIEW", "COMPLETED"].includes(to)) {
      const deps = await db.taskDependency.findMany({ where: { taskId }, include: { dependsOn: { select: { title: true, status: true } } } });
      const unmet = unmetDependencies(deps.map((d) => d.dependsOn));
      if (unmet.length) throw new AppError(`Blocked by unfinished dependencies: ${unmet.map((u) => u.title).join(", ")}.`);
    }
    if (to === "WAITING_FOR_REVIEW" || (to === "COMPLETED" && !reviewer)) {
      await requestReview(user, task, extra?.notes ?? task.completionNotes);
    } else if (to === "COMPLETED") {
      const evidence = await db.taskAttachment.count({ where: { taskId, file: { deletedAt: null } } });
      if (task.requiredEvidence && evidence < 1) throw new AppError("This task requires evidence. Attach a file or link first.");
      await db.$transaction((tx) => transition(tx, user, task, "COMPLETED", { approval: "APPROVED", completedAt: new Date(), progress: 100, blockerReason: null, ...(extra?.notes ? { completionNotes: extra.notes } : {}) }));
    } else if (to === "BLOCKED") {
      const reason = extra?.reason?.trim();
      if (!reason || reason.length < 3) throw new AppError("Describe what is blocking this task.");
      const reviewers = await projectReviewerIds(task.projectId, user.id);
      await db.$transaction(async (tx) => {
        await transition(tx, user, task, "BLOCKED", { blockerReason: reason });
        await notify(tx, reviewers, { type: "BLOCKER_REPORTED", title: `Blocked: ${task.title}`, body: reason.slice(0, 160), href: `/tasks/${task.id}` });
      });
    } else {
      await db.$transaction((tx) => transition(tx, user, task, to, { blockerReason: null, completedAt: null, approval: task.status === "WAITING_FOR_REVIEW" ? "NONE" : task.approval, ...(to === "NOT_STARTED" ? { progress: 0 } : {}) }));
    }
    refresh(task.projectId, taskId);
  }, "Task updated.");
}

export async function reviewTaskAction(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const user = await actionUser();
    const input = reviewTaskSchema.parse(formObject(fd));
    const { task } = await assertTask(user, input.taskId, "review");
    const comment = input.comment?.trim();
    if (input.decision === "REJECT" && (!comment || comment.length < 3)) throw new AppError("A comment is required when rejecting a task.");
    if ((input.decision === "APPROVE" || input.decision === "REJECT") && task.status !== "WAITING_FOR_REVIEW") throw new AppError("Only tasks waiting for review can be approved or rejected.");
    if (input.decision === "REOPEN" && task.status !== "COMPLETED") throw new AppError("Only completed tasks can be reopened.");
    const assignees = task.assignees.map((a) => a.userId);
    await db.$transaction(async (tx) => {
      if (input.decision === "APPROVE") {
        await transition(tx, user, task, "COMPLETED", { approval: "APPROVED", completedAt: new Date(), progress: 100 });
        await notify(tx, assignees, { type: "TASK_APPROVED", title: `Approved: ${task.title}`, body: comment, href: `/tasks/${task.id}` }, user.id);
      } else {
        await transition(tx, user, task, "REOPENED", { approval: input.decision === "REJECT" ? "REJECTED" : "NONE", completedAt: null, progress: Math.min(task.progress, 90) });
        await notify(tx, assignees, { type: "TASK_REJECTED", title: `${input.decision === "REJECT" ? "Rejected" : "Reopened"}: ${task.title}`, body: comment, href: `/tasks/${task.id}` }, user.id);
      }
      if (comment) await tx.taskComment.create({ data: { taskId: task.id, authorId: user.id, body: `${input.decision === "APPROVE" ? "Approved" : input.decision === "REJECT" ? "Rejected" : "Reopened"}: ${comment}` } });
    });
    refresh(task.projectId, task.id);
  }, "Review saved.");
}

export async function setProgressAction(taskId: string, progress: number): Promise<ActionResult> {
  return run(async () => {
    const user = await actionUser();
    const { task } = await assertTask(user, taskId, "update");
    if (task.status === "COMPLETED" || task.status === "WAITING_FOR_REVIEW") throw new AppError("Progress is locked once a task is sent for review.");
    const value = Math.min(100, Math.max(0, Math.round(Number(progress))));
    await db.$transaction(async (tx) => {
      await tx.task.update({ where: { id: taskId }, data: { progress: value, ...(task.status === "NOT_STARTED" && value > 0 ? { status: "IN_PROGRESS" } : {}) } });
      await logActivity(tx, { actorId: user.id, projectId: task.projectId, taskId, action: "progress", summary: `${user.name} set progress on “${task.title}” to ${value}%` });
      await recalcMilestone(tx, task.milestoneId);
    });
    refresh(task.projectId, taskId);
  });
}

async function subtaskTask(user: SessionUser, subtaskId: string) {
  const sub = await db.subtask.findUnique({ where: { id: subtaskId } });
  if (!sub) throw new AppError("Subtask not found.", 404);
  return { sub, ...(await assertTask(user, sub.taskId, "update")) };
}
async function syncSubtaskProgress(tx: Tx, taskId: string) {
  const subs = await tx.subtask.findMany({ where: { taskId } });
  const t = await tx.task.findUniqueOrThrow({ where: { id: taskId } });
  if (!subs.length || ["COMPLETED", "WAITING_FOR_REVIEW"].includes(t.status)) return;
  const progress = Math.round((subs.filter((s) => s.done).length / subs.length) * 100);
  await tx.task.update({ where: { id: taskId }, data: { progress: Math.min(progress, 95), ...(t.status === "NOT_STARTED" && progress > 0 ? { status: "IN_PROGRESS" } : {}) } });
  await recalcMilestone(tx, t.milestoneId);
}

export async function addSubtaskAction(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const user = await actionUser();
    const taskId = parseId(fd.get("taskId")) ?? "";
    const title = String(fd.get("title") ?? "").trim();
    if (!title) throw new AppError("Write the checklist item first.");
    if (title.length > 200) throw new AppError("Keep checklist items under 200 characters.");
    const { task } = await assertTask(user, taskId, "update");
    await db.$transaction(async (tx) => {
      const count = await tx.subtask.count({ where: { taskId } });
      await tx.subtask.create({ data: { taskId, title, position: count } });
      await syncSubtaskProgress(tx, taskId);
    });
    refresh(task.projectId, taskId);
  });
}
export async function toggleSubtaskAction(subtaskId: string): Promise<ActionResult> {
  return run(async () => {
    const user = await actionUser();
    const { sub, task } = await subtaskTask(user, subtaskId);
    await db.$transaction(async (tx) => {
      await tx.subtask.update({ where: { id: sub.id }, data: { done: !sub.done } });
      await syncSubtaskProgress(tx, sub.taskId);
    });
    refresh(task.projectId, sub.taskId);
  });
}
export async function deleteSubtaskAction(subtaskId: string): Promise<ActionResult> {
  return run(async () => {
    const user = await actionUser();
    const { sub, task } = await subtaskTask(user, subtaskId);
    await db.$transaction(async (tx) => { await tx.subtask.delete({ where: { id: sub.id } }); await syncSubtaskProgress(tx, sub.taskId); });
    refresh(task.projectId, sub.taskId);
  });
}

export async function addCommentAction(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const user = await actionUser();
    const input = commentSchema.parse(formObject(fd));
    if (!!input.taskId === !!input.reportId) throw new AppError("Comment on a task or a report.");
    const mentionIds = extractMentions(input.body);
    const mentioned = mentionIds.length ? await db.user.findMany({ where: { id: { in: mentionIds }, orgId: user.orgId, status: "ACTIVE", deletedAt: null }, select: { id: true } }) : [];
    const mentions = mentioned.map((m) => m.id);

    if (input.taskId) {
      const { task } = await assertTask(user, input.taskId, "comment");
      await db.$transaction(async (tx) => {
        await tx.taskComment.create({ data: { taskId: task.id, authorId: user.id, body: input.body, mentions } });
        const watchers = [task.creatorId, ...task.assignees.map((a) => a.userId)].filter((id) => !mentions.includes(id));
        await notify(tx, mentions, { type: "MENTION", title: `${user.name} mentioned you on ${task.title}`, body: input.body.replace(/@\[([^\]]+)\]\([a-z0-9]+\)/gi, "@$1").slice(0, 140), href: `/tasks/${task.id}` }, user.id);
        await notify(tx, watchers, { type: "COMMENT", title: `New comment on ${task.title}`, body: `${user.name}: ${input.body.replace(/@\[([^\]]+)\]\([a-z0-9]+\)/gi, "@$1").slice(0, 120)}`, href: `/tasks/${task.id}` }, user.id);
        await logActivity(tx, { actorId: user.id, projectId: task.projectId, taskId: task.id, action: "commented", summary: `${user.name} commented on “${task.title}”` });
      });
      revalidatePath(`/tasks/${task.id}`);
    } else {
      const { report } = await assertReport(user, input.reportId!, "view");
      await db.$transaction(async (tx) => {
        await tx.taskComment.create({ data: { reportId: report.id, authorId: user.id, body: input.body, mentions } });
        const plain = input.body.replace(/@\[([^\]]+)\]\([a-z0-9]+\)/gi, "@$1");
        await notify(tx, mentions, { type: "MENTION", title: `${user.name} mentioned you on a daily report`, body: plain.slice(0, 140), href: `/daily-reports/${report.id}` }, user.id);
        if (!mentions.includes(report.authorId)) await notify(tx, [report.authorId], { type: "COMMENT", title: `${user.name} commented on your daily report`, body: plain.slice(0, 140), href: `/daily-reports/${report.id}` }, user.id);
      });
      revalidatePath(`/daily-reports/${report.id}`);
    }
  }, "Comment posted.");
}
