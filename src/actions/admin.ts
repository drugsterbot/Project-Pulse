"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { actionUser } from "@/lib/auth";
import { AppError, forbidden, run, type ActionResult } from "@/lib/errors";
import { assignableRoles, canManageUsers, canModifyUser } from "@/lib/permissions";
import { ROLES, type Role } from "@/lib/constants";
import { formObject, teamSchema, userCreateSchema, userUpdateSchema, reqStr } from "@/lib/validators";

export async function createUserAction(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const actor = await actionUser();
    if (!canManageUsers(actor.role)) throw forbidden();
    const input = userCreateSchema.parse(formObject(fd));
    if (!assignableRoles(actor.role, ROLES).includes(input.role)) throw forbidden("You can’t create accounts with that role.");
    if (await db.user.findUnique({ where: { email: input.email } })) throw new AppError("An account with that email already exists.");
    if (input.departmentId && !(await db.department.findFirst({ where: { id: input.departmentId, orgId: actor.orgId } }))) throw new AppError("Unknown department.");
    await db.user.create({
      data: { orgId: actor.orgId, name: input.name, email: input.email, role: input.role, departmentId: input.departmentId ?? null, phone: input.phone, weeklyCapacityHours: input.weeklyCapacityHours ?? 40, passwordHash: await bcrypt.hash(input.password, 12) },
    });
    revalidatePath("/admin/users");
  }, "User created. Share the temporary password securely.");
}

export async function updateUserAction(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const actor = await actionUser();
    if (!canManageUsers(actor.role)) throw forbidden();
    const input = userUpdateSchema.parse(formObject(fd));
    const target = await db.user.findFirst({ where: { id: input.id, orgId: actor.orgId, deletedAt: null } });
    if (!target) throw new AppError("User not found.", 404);
    if (!canModifyUser(actor.role, target.role as Role)) throw forbidden("Admins can’t modify Super Admin accounts.");
    if (!assignableRoles(actor.role, ROLES).includes(input.role)) throw forbidden("You can’t assign that role.");
    if (target.id === actor.id && (input.status !== "ACTIVE" || input.role !== target.role)) throw new AppError("You can’t change your own role or status.");
    if (target.role === "SUPER_ADMIN" && (input.role !== "SUPER_ADMIN" || input.status !== "ACTIVE")) {
      const others = await db.user.count({ where: { orgId: actor.orgId, role: "SUPER_ADMIN", status: "ACTIVE", deletedAt: null, id: { not: target.id } } });
      if (!others) throw new AppError("At least one active Super Admin is required.");
    }
    await db.user.update({ where: { id: target.id }, data: { role: input.role, status: input.status, departmentId: input.departmentId ?? null, weeklyCapacityHours: input.weeklyCapacityHours ?? target.weeklyCapacityHours } });
    revalidatePath("/admin/users");
  }, "User updated.");
}

export async function saveTeamAction(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const actor = await actionUser();
    if (!canManageUsers(actor.role)) throw forbidden();
    const raw = formObject(fd);
    const input = teamSchema.parse(raw);
    const id = typeof raw.id === "string" && raw.id ? raw.id : null;
    const ids = [...new Set([...input.memberIds, ...(input.leadId ? [input.leadId] : [])])];
    const valid = await db.user.count({ where: { id: { in: ids }, orgId: actor.orgId, deletedAt: null } });
    if (valid !== ids.length) throw new AppError("One or more people could not be found.");
    if (input.departmentId && !(await db.department.findFirst({ where: { id: input.departmentId, orgId: actor.orgId } }))) throw new AppError("Unknown department.");
    await db.$transaction(async (tx) => {
      const team = id
        ? await tx.team.update({ where: { id, orgId: actor.orgId }, data: { name: input.name, departmentId: input.departmentId ?? null, leadId: input.leadId ?? null } })
        : await tx.team.create({ data: { orgId: actor.orgId, name: input.name, departmentId: input.departmentId ?? null, leadId: input.leadId ?? null } });
      await tx.teamMember.deleteMany({ where: { teamId: team.id } });
      if (ids.length) await tx.teamMember.createMany({ data: ids.map((userId) => ({ teamId: team.id, userId, isLead: userId === input.leadId })) });
    }).catch((e) => { if (e?.code === "P2002") throw new AppError("A team with that name already exists."); throw e; });
    revalidatePath("/admin/teams");
  }, "Team saved.");
}

export async function createDepartmentAction(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const actor = await actionUser();
    if (!canManageUsers(actor.role)) throw forbidden();
    const name = reqStr("Department name", 80).parse(fd.get("name"));
    await db.department.create({ data: { orgId: actor.orgId, name } }).catch((e) => { if (e?.code === "P2002") throw new AppError("That department already exists."); throw e; });
    revalidatePath("/admin/teams");
  }, "Department added.");
}
