import "dotenv/config";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { milestoneHealth, milestoneProgress } from "../src/lib/business";

const connectionString =
  process.env.DATABASE_URL ||
  process.env.projectpulse_PRISMA_DATABASE_URL ||
  process.env.projectpulse_DATABASE_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL;

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
export const DEMO_PASSWORD = "ProjectPulse#2026";
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR ?? "./uploads");

const DAY = 86_400_000;
const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
const day = (off: number) => new Date(today.getTime() + off * DAY);
const ago = (days: number, hour = 9) => new Date(today.getTime() - days * DAY + hour * 3_600_000);
const isWorkday = (d: Date) => ![0, 6].includes(d.getUTCDay());
let seed = 42;
const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)]!;

/* ---------- generated sample files (no binary assets needed in the repo) ---------- */
function crc32(buf: Buffer) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]!) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; }
  return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
/** A small "screen mock" PNG: gradient background, header bar and a few cards. */
function mockPng(w: number, h: number, hue: [number, number, number]) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      let [r, g, b] = [244 - y / 6, 247 - y / 8, 251 - y / 10];
      if (y < 18) [r, g, b] = [15, 27, 45];
      else if (x > 12 && x < w * 0.45 && y > 34 && y < h * 0.5) [r, g, b] = hue;
      else if (x > w * 0.5 && x < w - 12 && y > 34 && y < h * 0.5) [r, g, b] = [255, 255, 255];
      else if (x > 12 && x < w - 12 && y > h * 0.58 && y < h - 12) [r, g, b] = (Math.floor(y / 14) % 2 ? [255, 255, 255] : [236, 241, 247]);
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pngChunk("IHDR", ihdr), pngChunk("IDAT", zlib.deflateSync(raw)), pngChunk("IEND", Buffer.alloc(0))]);
}
const tinyPdf = (title: string) => Buffer.from(`%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 360 160]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n4 0 obj<</Length 60>>stream\nBT /F1 16 Tf 24 90 Td (${title}) Tj ET\nendstream\nendobj\n5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`);
function writeSeedFile(name: string, data: Buffer) {
  const key = `seed/${name}`;
  fs.mkdirSync(path.join(UPLOAD_DIR, "seed"), { recursive: true });
  fs.writeFileSync(path.join(UPLOAD_DIR, key), data);
  return { key, size: data.length };
}

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_SEED_IN_PRODUCTION !== "yes") {
    throw new Error("Refusing to seed: this script wipes every table and creates demo accounts with a known password. Set ALLOW_SEED_IN_PRODUCTION=yes only if you are sure.");
  }
  console.log("Resetting database…");
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Organization" CASCADE');
  fs.rmSync(path.join(UPLOAD_DIR, "seed"), { recursive: true, force: true });
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const org = await prisma.organization.create({ data: { name: "Meridian Digital", slug: "meridian-digital", settings: { workWeekHours: 40 } } });
  const dept: Record<string, string> = {};
  for (const name of ["Engineering", "Design", "Quality Assurance", "Delivery"]) dept[name] = (await prisma.department.create({ data: { orgId: org.id, name } })).id;

  /* ---------- users ---------- */
  const U: Record<string, { id: string; name: string }> = {};
  const people = [
    ["ybanti", "Banti Yadav", "superadmin@ppulse.dev", "SUPER_ADMIN", "Delivery", ["Strategy", "Operations"], "Nagpur"],
    ["ybanti", "Banti Yadav", "admin@ppulse.dev", "ADMIN", "Delivery", ["People ops", "Process"], "Nagpur"],

    ["mumtaz", "Mumtaz Sheikh", "mumtaz.pm@ppulse.dev", "PROJECT_MANAGER", "Delivery", ["Planning", "Stakeholders"], "Nagpur"],
    ["ybanti", "Banti Yadav", "ybanti.pm@ppulse.dev", "PROJECT_MANAGER", "Delivery", ["Agile", "Risk management"], "Nagpur"],

    ["mumtaz", "Mumtaz Sheikh", "mumtaz.lead@projectpulse.dev", "TEAM_LEAD", "Engineering", ["TypeScript", "Architecture", "Postgres"], "Nagpur"],
    ["ybanti", "Banti Yadav", "ybanti.lead@projectpulse.dev", "TEAM_LEAD", "Design", ["Design systems", "Figma"], "Nagpur"],

    ["ybanti", "Banti Yadav", "ybanti@ppulse.dev", "TEAM_MEMBER", "Engineering", ["React", "Node.js", "OAuth"], "Nagpur"],

    ["mumtaz", "Mumtaz Sheikh", "mumtaz@ppulse.dev", "TEAM_MEMBER", "Engineering", ["React", "Node.js", "OAuth"], "Nagpur"],

    ["ankit", "Ankit Deshmukh", "ankit@ppulse.dev", "TEAM_MEMBER", "Engineering", ["React", "Node.js", "OAuth"], "Nagpur"],

    ["nandini", "Nandini Dharme", "nandini@ppulse.dev", "TEAM_MEMBER", "Engineering", ["React", "Node.js", "OAuth"], "Nagpur"],

    ["abhishek", "Abhishek Thote", "abhishek@ppulse.dev", "TEAM_MEMBER", "Engineering", ["React", "Node.js", "OAuth"], "Nagpur"],

    // ["aisha", "Aisha Khan", "aisha@projectpulse.dev", "TEAM_MEMBER", "Engineering", ["React", "Node.js", "OAuth"], "Nagpur"],
    // ["ravi", "Ravi Patel", "ravi@projectpulse.dev", "TEAM_MEMBER", "Engineering", ["Kotlin", "Swift", "APIs"], "Nagpur"],
    // ["chloe", "Chloe Bennett", "chloe@projectpulse.dev", "TEAM_MEMBER", "Design", ["UI design", "Prototyping"], "Nagpur"],
    // ["marcus", "Marcus Reed", "marcus@projectpulse.dev", "TEAM_MEMBER", "Quality Assurance", ["Test automation", "Accessibility"], "Nagpur"],
    ["client", "client ", "client@ppulse.dev", "CLIENT_VIEWER", "Delivery", [], "Nagpur"],
    ["jordan", "Jordan Blake", "jordan@projectpulse.dev", "TEAM_MEMBER", "Engineering", ["Go"], "UTC"],
  ] as const;
  for (const [key, name, email, role, dep, skills, timezone] of people) {
    const u = await prisma.user.create({
      data: { orgId: org.id, name, email, role, departmentId: dept[dep], skills: [...skills], timezone, passwordHash, status: key === "jordan" ? "SUSPENDED" : "ACTIVE", phone: key === "ybanti" ? "+91 98765 43210" : null, lastLoginAt: key === "jordan" ? null : ago(Math.floor(rnd() * 3), 8), weeklyCapacityHours: key === "mumtaz" ? 32 : 40 },
    });
    U[key] = { id: u.id, name };
  }
  const uid = (k: string) => U[k]!.id;

  /* ---------- teams ---------- */
  for (const [name, d, lead, members] of [
    ["Platform Engineering", "Engineering", "mumtaz", ["mumtaz", "aisha", "ravi"]],
    ["Product Design", "Design", "ybanti", ["ybanti", "chloe"]],
    ["Quality & Release", "Quality Assurance", "marcus", ["marcus"]],
  ] as const) {
    const t = await prisma.team.create({ data: { orgId: org.id, name, departmentId: dept[d], leadId: uid(lead) } });
    await prisma.teamMember.createMany({ data: members.map((m) => ({ teamId: t.id, userId: uid(m), isLead: m === lead })) });
  }

  /* ---------- projects ---------- */
  type PDef = { code: string; name: string; status: "PLANNING" | "ACTIVE" | "ON_HOLD" | "COMPLETED"; priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"; pm: string; s: number; e: number; cat: string; client?: string; est: number; budget: number; members: string[]; clients?: string[]; desc: string; goals: string };
  const pdefs: PDef[] = [
    { code: "ATLAS", name: "Atlas Customer Portal", status: "ACTIVE", priority: "HIGH", pm: "sofia", s: -45, e: 40, cat: "Web platform", client: "Brightwave Retail", est: 900, budget: 185000, members: ["mumtaz", "aisha", "ravi", "chloe", "ybanti", "marcus"], clients: ["client"], desc: "A self-service portal where Brightwave’s customers manage accounts, orders and support requests.", goals: "Cut support tickets by 30%. Launch with SSO and WCAG AA accessibility." },
    { code: "HRZN", name: "Horizon Mobile App", status: "ACTIVE", priority: "CRITICAL", pm: "arjun", s: -30, e: 35, cat: "Mobile", client: "Horizon Logistics", est: 760, budget: 142000, members: ["mumtaz", "aisha", "ravi", "chloe", "ybanti", "marcus"], desc: "Offline-first driver app for Horizon Logistics with push alerts, biometric login and in-app purchases.", goals: "Ship a beta to 200 drivers and pass app-store review in one submission." },
    { code: "BCN", name: "Beacon Brand Refresh", status: "PLANNING", priority: "MEDIUM", pm: "sofia", s: 10, e: 90, cat: "Brand & design", est: 320, budget: 54000, members: ["ybanti", "chloe"], desc: "A refreshed visual identity and component library for Meridian’s own products.", goals: "Agree a brand direction and roll it into the design system." },
    { code: "LDGR", name: "Ledger Migration", status: "ON_HOLD", priority: "HIGH", pm: "arjun", s: -60, e: 30, cat: "Data & infrastructure", est: 540, budget: 98000, members: ["mumtaz", "ravi", "marcus"], desc: "Move the legacy billing ledger to PostgreSQL with zero downtime.", goals: "Dry-run migration with <0.1% reconciliation variance." },
    { code: "ORBT", name: "Orbit Analytics Dashboard", status: "COMPLETED", priority: "MEDIUM", pm: "sofia", s: -120, e: -20, cat: "Analytics", client: "Orbit Energy", est: 480, budget: 76000, members: ["aisha", "chloe", "mumtaz"], desc: "Operational analytics dashboard for Orbit Energy’s field teams.", goals: "Real-time dashboards for 12 KPIs." },
  ];
  const P: Record<string, { id: string; pm: string; name: string }> = {};
  for (const p of pdefs) {
    const row = await prisma.project.create({
      data: { orgId: org.id, name: p.name, code: p.code, description: p.desc, category: p.cat, status: p.status, priority: p.priority, startDate: day(p.s), endDate: day(p.e), managerId: uid(p.pm), budget: p.budget, estimatedHours: p.est, goals: p.goals, clientName: p.client },
    });
    P[p.code] = { id: row.id, pm: p.pm, name: p.name };
    await prisma.projectMember.createMany({ data: [...new Set([p.pm, ...p.members])].map((m) => ({ projectId: row.id, userId: uid(m), isClientAccess: false })).concat((p.clients ?? []).map((c) => ({ projectId: row.id, userId: uid(c), isClientAccess: true }))) });
  }

  /* ---------- milestones ---------- */
  const M: Record<string, { id: string; due: Date }> = {};
  const mdefs: [string, string, string, string, number, string, string][] = [
    ["atlas-1", "ATLAS", "Discovery & requirements", "sofia", -30, "Signed-off requirements specification", "Stakeholder interviews and requirements captured."],
    ["atlas-2", "ATLAS", "Design system & prototypes", "ybanti", -5, "Design tokens, component library, clickable prototype", "Everything needed to start portal build."],
    ["atlas-3", "ATLAS", "Core portal build", "mumtaz", 18, "Auth, account API, order history UI", "Feature-complete portal on staging."],
    ["atlas-4", "ATLAS", "UAT & launch", "sofia", 38, "UAT sign-off, launch runbook", "Client UAT and go-live."],
    ["hrzn-1", "HRZN", "MVP feature freeze", "arjun", 7, "Offline sync, push, onboarding, biometric login", "No new features after this date."],
    ["hrzn-2", "HRZN", "Beta release", "arjun", 18, "Beta build to 200 drivers", "TestFlight and Play beta."],
    ["hrzn-3", "HRZN", "Store submission", "arjun", 33, "Store listings and release checklist", "Submit to both stores."],
    ["bcn-1", "BCN", "Brand audit", "ybanti", 20, "Audit report and competitor matrix", "Current-state analysis."],
    ["ldgr-1", "LDGR", "Schema mapping", "mumtaz", -15, "Mapping document for all ledger tables", "Legacy → PostgreSQL mapping."],
    ["ldgr-2", "LDGR", "Dry-run migration", "arjun", 20, "Staging dry-run report", "Rehearsal in staging."],
    ["orbt-1", "ORBT", "Dashboard launch", "sofia", -20, "Production dashboard", "Launched and handed over."],
  ];
  for (const [key, proj, name, owner, due, deliverables, description] of mdefs) {
    const m = await prisma.milestone.create({ data: { projectId: P[proj]!.id, name, ownerId: uid(owner), dueDate: day(due), deliverables, description } });
    M[key] = { id: m.id, due: m.dueDate };
  }

  /* ---------- tasks ---------- */
  type S = "NOT_STARTED" | "IN_PROGRESS" | "WAITING_FOR_REVIEW" | "BLOCKED" | "COMPLETED" | "REOPENED";
  type Pr = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  type TDef = { k: string; p: string; m?: string; title: string; status: S; pr: Pr; s: number; d: number; est: number; prog: number; who: string[]; creator?: string; evidence?: boolean; blocker?: string; deps?: string[]; labels?: string[]; notes?: string; upd?: number; desc?: string };
  const tdefs: TDef[] = [
    { k: "a1", p: "ATLAS", m: "atlas-1", title: "Stakeholder interviews summary", status: "COMPLETED", pr: "HIGH", s: -44, d: -35, est: 16, prog: 100, who: ["mumtaz"], labels: ["research"], notes: "Eight interviews synthesised into one-page themes.", desc: "Interview six Brightwave stakeholders and summarise needs, pain points and success measures." },
    { k: "a2", p: "ATLAS", m: "atlas-1", title: "Requirements specification v1", status: "COMPLETED", pr: "HIGH", s: -40, d: -31, est: 24, prog: 100, who: ["aisha", "mumtaz"], labels: ["docs"], notes: "Spec signed off by client on the review call.", evidence: true, desc: "Write the functional and non-functional requirements and get client sign-off." },
    { k: "a3", p: "ATLAS", m: "atlas-2", title: "Design system tokens & components", status: "IN_PROGRESS", pr: "HIGH", s: -25, d: -3, est: 40, prog: 70, who: ["chloe", "ybanti"], labels: ["design"], upd: 7, desc: "Colour, type and spacing tokens plus core components in Figma and code." },
    { k: "a4", p: "ATLAS", m: "atlas-2", title: "Portal dashboard prototype", status: "WAITING_FOR_REVIEW", pr: "HIGH", s: -20, d: -2, est: 30, prog: 100, who: ["chloe"], evidence: true, labels: ["design", "prototype"], notes: "Clickable prototype covers account, orders and support flows. Screenshots attached.", upd: 4, desc: "High-fidelity clickable prototype of the customer dashboard." },
    { k: "a5", p: "ATLAS", m: "atlas-3", title: "Authentication & SSO integration", status: "IN_PROGRESS", pr: "CRITICAL", s: -10, d: 5, est: 36, prog: 55, who: ["aisha", "ravi"], labels: ["backend", "security"], desc: "OIDC login with Brightwave’s identity provider, session handling and logout." },
    { k: "a6", p: "ATLAS", m: "atlas-3", title: "Customer account API", status: "NOT_STARTED", pr: "HIGH", s: -2, d: 8, est: 30, prog: 0, who: ["ravi"], deps: ["a5"], labels: ["backend"], desc: "REST endpoints for profile, addresses and preferences." },
    { k: "a7", p: "ATLAS", m: "atlas-3", title: "Order history UI", status: "NOT_STARTED", pr: "MEDIUM", s: 2, d: 16, est: 24, prog: 0, who: ["chloe", "aisha"], deps: ["a3", "a6"], labels: ["frontend"] },
    { k: "a8", p: "ATLAS", m: "atlas-3", title: "Accessibility audit (WCAG AA)", status: "BLOCKED", pr: "HIGH", s: -2, d: 10, est: 16, prog: 20, who: ["marcus"], deps: ["a3"], evidence: true, blocker: "Waiting for the final colour tokens from the design system before contrast checks can finish.", labels: ["qa", "a11y"] },
    { k: "a9", p: "ATLAS", m: "atlas-4", title: "Load & performance testing plan", status: "NOT_STARTED", pr: "MEDIUM", s: 10, d: 25, est: 20, prog: 0, who: ["marcus"], labels: ["qa"] },
    { k: "a10", p: "ATLAS", m: "atlas-4", title: "UAT scripts with client", status: "NOT_STARTED", pr: "LOW", s: 20, d: 32, est: 12, prog: 0, who: ["marcus", "mumtaz"], labels: ["qa", "client"] },
    { k: "a11", p: "ATLAS", m: "atlas-4", title: "Launch runbook draft", status: "REOPENED", pr: "MEDIUM", s: -8, d: 15, est: 10, prog: 60, who: ["mumtaz"], labels: ["docs"], notes: "Draft runbook with rollback steps.", desc: "Step-by-step go-live and rollback plan." },

    { k: "h1", p: "HRZN", m: "hrzn-1", title: "Offline sync engine", status: "IN_PROGRESS", pr: "CRITICAL", s: -20, d: -4, est: 48, prog: 60, who: ["ravi", "mumtaz"], labels: ["mobile", "backend"], desc: "Queue writes locally and reconcile with the server, resolving conflicts deterministically." },
    { k: "h2", p: "HRZN", m: "hrzn-1", title: "Push notification service", status: "IN_PROGRESS", pr: "HIGH", s: -12, d: 4, est: 24, prog: 45, who: ["aisha"], labels: ["backend"] },
    { k: "h3", p: "HRZN", m: "hrzn-1", title: "Onboarding flow screens", status: "COMPLETED", pr: "MEDIUM", s: -25, d: -12, est: 20, prog: 100, who: ["chloe", "ybanti"], labels: ["design"], notes: "All five onboarding screens approved by Horizon." },
    { k: "h4", p: "HRZN", m: "hrzn-1", title: "Biometric login", status: "BLOCKED", pr: "HIGH", s: -6, d: 3, est: 16, prog: 30, who: ["ravi"], blocker: "App Store entitlement approval is still pending from Apple.", labels: ["mobile", "security"], creator: "arjun" },
    { k: "h5", p: "HRZN", m: "hrzn-2", title: "In-app purchase flow", status: "NOT_STARTED", pr: "HIGH", s: 1, d: 14, est: 32, prog: 0, who: ["aisha"], deps: ["h1"], labels: ["mobile"] },
    { k: "h6", p: "HRZN", m: "hrzn-2", title: "Crash reporting & analytics", status: "IN_PROGRESS", pr: "MEDIUM", s: -3, d: 9, est: 14, prog: 25, who: ["mumtaz"], labels: ["observability"], upd: 6 },
    { k: "h7", p: "HRZN", m: "hrzn-2", title: "Beta test plan & device matrix", status: "WAITING_FOR_REVIEW", pr: "MEDIUM", s: -6, d: -1, est: 12, prog: 100, who: ["marcus"], evidence: true, labels: ["qa"], notes: "Matrix covers 14 devices across iOS 17/18 and Android 13–15.", upd: 3 },
    { k: "h8", p: "HRZN", m: "hrzn-3", title: "App store assets & listing copy", status: "NOT_STARTED", pr: "LOW", s: 14, d: 28, est: 18, prog: 0, who: ["chloe", "ybanti"], labels: ["design", "marketing"] },
    { k: "h9", p: "HRZN", m: "hrzn-3", title: "Release checklist", status: "NOT_STARTED", pr: "MEDIUM", s: 25, d: 33, est: 8, prog: 0, who: ["mumtaz"], deps: ["h5"], labels: ["release"] },

    { k: "b1", p: "BCN", m: "bcn-1", title: "Competitor brand audit", status: "NOT_STARTED", pr: "MEDIUM", s: 10, d: 20, est: 24, prog: 0, who: ["ybanti"], labels: ["research"] },
    { k: "b2", p: "BCN", title: "Brand workshop agenda", status: "NOT_STARTED", pr: "LOW", s: 10, d: 14, est: 6, prog: 0, who: ["chloe"], labels: ["workshop"] },

    { k: "l1", p: "LDGR", m: "ldgr-1", title: "Legacy schema mapping", status: "IN_PROGRESS", pr: "HIGH", s: -40, d: -15, est: 40, prog: 65, who: ["ravi", "mumtaz"], labels: ["data"], upd: 12, desc: "Map every legacy ledger table and column to the new PostgreSQL model." },
    { k: "l2", p: "LDGR", m: "ldgr-2", title: "Data validation scripts", status: "NOT_STARTED", pr: "MEDIUM", s: 5, d: 15, est: 20, prog: 0, who: ["marcus"], labels: ["qa", "data"] },
    { k: "l3", p: "LDGR", m: "ldgr-2", title: "Dry-run migration in staging", status: "NOT_STARTED", pr: "HIGH", s: 10, d: 20, est: 28, prog: 0, who: ["ravi"], deps: ["l1"], labels: ["data"] },

    { k: "o1", p: "ORBT", m: "orbt-1", title: "Event ingestion pipeline", status: "COMPLETED", pr: "HIGH", s: -120, d: -70, est: 120, prog: 100, who: ["mumtaz", "aisha"], labels: ["backend"], notes: "Handles 5k events/sec in load tests." },
    { k: "o2", p: "ORBT", m: "orbt-1", title: "Dashboard widgets", status: "COMPLETED", pr: "MEDIUM", s: -90, d: -35, est: 90, prog: 100, who: ["aisha", "chloe"], labels: ["frontend"], notes: "All 12 KPI widgets shipped." },
    { k: "o3", p: "ORBT", m: "orbt-1", title: "Launch & handover", status: "COMPLETED", pr: "MEDIUM", s: -30, d: -20, est: 24, prog: 100, who: ["mumtaz"], labels: ["release"], notes: "Handover session recorded and docs delivered." },
  ];
  const T: Record<string, { id: string; def: TDef }> = {};
  for (const t of tdefs) {
    const created = await prisma.task.create({
      data: {
        projectId: P[t.p]!.id, milestoneId: t.m ? M[t.m]!.id : null, title: t.title, description: t.desc ?? null, creatorId: uid(t.creator ?? P[t.p]!.pm), status: t.status, priority: t.pr,
        approval: t.status === "WAITING_FOR_REVIEW" ? "PENDING" : t.status === "COMPLETED" ? "APPROVED" : t.status === "REOPENED" ? "REJECTED" : "NONE",
        startDate: day(t.s), dueDate: day(t.d), estimatedHours: t.est, progress: t.prog, labels: t.labels ?? [], blockerReason: t.blocker ?? null, completionNotes: t.notes ?? null,
        requiredEvidence: !!t.evidence, completedAt: t.status === "COMPLETED" ? day(Math.min(t.d, 0)) : null,
        createdAt: ago(Math.max(1, -t.s + 3)), updatedAt: ago(t.upd ?? (t.status === "COMPLETED" ? Math.max(0, -t.d) : 0), 15),
        assignees: { create: t.who.map((w) => ({ userId: uid(w) })) },
      },
    });
    T[t.k] = { id: created.id, def: t };
  }
  for (const t of tdefs) for (const dep of t.deps ?? []) await prisma.taskDependency.create({ data: { taskId: T[t.k]!.id, dependsOnId: T[dep]!.id } });

  const subs: Record<string, [string, boolean][]> = {
    a3: [["Colour & type tokens", true], ["Button & input components", true], ["Table & card patterns", false], ["Document in Storybook", false]],
    a5: [["Choose SSO provider", true], ["Implement OIDC flow", true], ["Session handling", true], ["Logout & token revoke", false], ["Security review", false]],
    h1: [["Local queue schema", true], ["Conflict resolution strategy", true], ["Background sync worker", true], ["Retry & backoff", false], ["Soak test on low-end devices", false]],
  };
  for (const [k, items] of Object.entries(subs)) await prisma.subtask.createMany({ data: items.map(([title, done], position) => ({ taskId: T[k]!.id, title, done, position })) });

  /* ---------- activity history (task + project) ---------- */
  const activity: { actorId: string; projectId: string; taskId?: string; action: string; summary: string; meta?: object; createdAt: Date }[] = [];
  for (const p of pdefs) activity.push({ actorId: uid(p.pm), projectId: P[p.code]!.id, action: "project_created", summary: `${U[p.pm]!.name} created the project`, createdAt: ago(Math.max(1, -p.s + 5)) });
  for (const t of tdefs) {
    const pm = P[t.p]!.pm;
    activity.push({ actorId: uid(t.creator ?? pm), projectId: P[t.p]!.id, taskId: T[t.k]!.id, action: "task_created", summary: `${U[t.creator ?? pm]!.name} created task “${t.title}”`, createdAt: ago(Math.max(1, -t.s + 3)) });
    const flow: [S, S][] = t.status === "NOT_STARTED" ? [] : [["NOT_STARTED", "IN_PROGRESS"], ...(t.status === "WAITING_FOR_REVIEW" ? [["IN_PROGRESS", "WAITING_FOR_REVIEW"] as [S, S]] : t.status === "COMPLETED" ? [["IN_PROGRESS", "WAITING_FOR_REVIEW"], ["WAITING_FOR_REVIEW", "COMPLETED"]] as [S, S][] : t.status === "BLOCKED" ? [["IN_PROGRESS", "BLOCKED"] as [S, S]] : t.status === "REOPENED" ? [["IN_PROGRESS", "WAITING_FOR_REVIEW"], ["WAITING_FOR_REVIEW", "REOPENED"]] as [S, S][] : [])];
    flow.forEach(([from, to], i) => {
      const actor = to === "COMPLETED" || to === "REOPENED" ? pm : t.who[0]!;
      activity.push({ actorId: uid(actor), projectId: P[t.p]!.id, taskId: T[t.k]!.id, action: "status_changed", summary: `${U[actor]!.name} moved “${t.title}” from ${from.replace(/_/g, " ").toLowerCase()} to ${to.replace(/_/g, " ").toLowerCase()}`, meta: { from, to }, createdAt: ago(Math.max(0, (t.upd ?? 1) + (flow.length - i - 1) * 2)) });
    });
  }
  await prisma.activityLog.createMany({ data: activity });

  /* ---------- sample files / evidence ---------- */
  const files: Record<string, string> = {};
  const addFile = async (key: string, projectCode: string, name: string, kind: "IMAGE" | "PDF" | "TEXT" | "LINK" | "COMMIT_LINK" | "VIDEO_LINK", category: string, uploader: string, data?: Buffer, mime?: string, opts: { url?: string; taskKey?: string; shared?: boolean; age?: number } = {}) => {
    const stored = data ? writeSeedFile(name.replace(/[^a-z0-9.\-_]/gi, "_"), data) : null;
    const f = await prisma.projectFile.create({
      data: { projectId: P[projectCode]!.id, taskId: opts.taskKey ? T[opts.taskKey]!.id : null, uploaderId: uid(uploader), name, kind, category: category as "DESIGN", mimeType: mime ?? null, sizeBytes: stored?.size ?? 0, storageKey: stored?.key ?? null, externalUrl: opts.url ?? null, sharedWithClient: !!opts.shared, createdAt: ago(opts.age ?? 1) },
    });
    await prisma.fileVersion.create({ data: { fileId: f.id, version: 1, storageKey: stored?.key ?? null, sizeBytes: stored?.size ?? 0, uploaderId: uid(uploader), note: "Initial upload" } });
    if (opts.taskKey) await prisma.taskAttachment.create({ data: { taskId: T[opts.taskKey]!.id, fileId: f.id, uploaderId: uid(uploader) } });
    files[key] = f.id;
    return f;
  };
  await addFile("brief", "ATLAS", "Atlas project brief.pdf", "PDF", "PROJECT_BRIEF", "sofia", tinyPdf("Atlas project brief"), "application/pdf", { shared: true, age: 44 });
  await addFile("spec", "ATLAS", "Requirements specification v1.pdf", "PDF", "REQUIREMENTS", "aisha", tinyPdf("Atlas requirements v1"), "application/pdf", { taskKey: "a2", shared: true, age: 31 });
  await addFile("proto1", "ATLAS", "dashboard-prototype-home.png", "IMAGE", "DESIGN", "chloe", mockPng(480, 300, [37, 99, 235]), "image/png", { taskKey: "a4", age: 4 });
  await addFile("proto2", "ATLAS", "dashboard-prototype-orders.png", "IMAGE", "DESIGN", "chloe", mockPng(480, 300, [22, 163, 74]), "image/png", { taskKey: "a4", age: 4 });
  await addFile("figma", "ATLAS", "Figma: Atlas design system", "LINK", "DESIGN", "ybanti", undefined, undefined, { url: "https://www.figma.com/file/atlas-design-system", age: 20 });
  await addFile("matrix", "HRZN", "beta-device-matrix.txt", "TEXT", "TESTING", "marcus", Buffer.from("Horizon beta device matrix\n==========================\niOS 17: iPhone 12, 13, 14, SE (3rd gen)\niOS 18: iPhone 15, 16\nAndroid 13: Pixel 6, Galaxy S22\nAndroid 14: Pixel 8, Galaxy S23, Xiaomi 13\nAndroid 15: Pixel 9\n"), "text/plain", { taskKey: "h7", age: 3 });
  await addFile("sync-pr", "HRZN", "PR #214: offline queue & retry", "COMMIT_LINK", "DEVELOPMENT", "ravi", undefined, undefined, { url: "https://github.com/meridian-digital/horizon-app/pull/214", taskKey: "h1", age: 2 });
  await addFile("demo", "HRZN", "Loom: sync engine walkthrough", "VIDEO_LINK", "DELIVERABLES", "mumtaz", undefined, undefined, { url: "https://www.loom.com/share/horizon-sync-engine-walkthrough", age: 5 });
  await addFile("sso-commit", "ATLAS", "Commit 9f3c2e1: OIDC callback handler", "COMMIT_LINK", "DEVELOPMENT", "aisha", undefined, undefined, { url: "https://github.com/meridian-digital/atlas-portal/commit/9f3c2e1", taskKey: "a5", age: 0 });
  await addFile("ldgr-map", "LDGR", "Ledger schema mapping draft.pdf", "PDF", "REQUIREMENTS", "mumtaz", tinyPdf("Ledger schema mapping (draft)"), "application/pdf", { taskKey: "l1", age: 14 });

  /* ---------- risks & announcements ---------- */
  await prisma.risk.createMany({
    data: [
      { projectId: P.ATLAS!.id, title: "SSO vendor API rate limits", description: "Brightwave’s IdP throttles token calls above 20/min.", severity: "HIGH", status: "MITIGATING", mitigation: "Cache discovery documents and batch token refresh.", ownerId: uid("mumtaz") },
      { projectId: P.ATLAS!.id, title: "Client content arrives late", description: "Support articles for the help centre are still being written by the client.", severity: "MEDIUM", status: "OPEN", ownerId: uid("sofia") },
      { projectId: P.HRZN!.id, title: "Apple entitlement approval delays beta", description: "Biometric entitlement has been pending for 6 days.", severity: "CRITICAL", status: "OPEN", mitigation: "Escalate through Horizon’s Apple developer contact; ship PIN fallback.", ownerId: uid("arjun") },
      { projectId: P.HRZN!.id, title: "Offline sync data conflicts", severity: "HIGH", status: "MITIGATING", mitigation: "Last-writer-wins with server vector clocks, soak test on low-end devices.", ownerId: uid("mumtaz") },
      { projectId: P.LDGR!.id, title: "Legacy data quality unknown", description: "No profiling has been run on 2009–2014 records.", severity: "HIGH", status: "OPEN", ownerId: uid("ravi") },
    ],
  });
  await prisma.announcement.createMany({
    data: [
      { projectId: P.ATLAS!.id, authorId: uid("sofia"), title: "UAT window confirmed", body: "Brightwave has confirmed UAT for the two weeks starting in 4 weeks’ time. Please keep your estimates current so we can protect it.", pinned: true, createdAt: ago(2) },
      { projectId: P.HRZN!.id, authorId: uid("arjun"), title: "Feature freeze moved to next Friday", body: "We’re holding the freeze date. Anything not in review by Wednesday moves to the post-beta backlog.", createdAt: ago(1) },
    ],
  });

  /* ---------- daily reports + time entries ---------- */
  const workdays: number[] = [];
  for (let off = 0; workdays.length < 10; off--) if (isWorkday(day(off))) workdays.push(off);
  const LATEST = workdays[0]!; // today, or the most recent workday when seeding on a weekend
  const PREV = workdays[1]!;
  const reporters = ["aisha", "ravi", "chloe", "marcus", "mumtaz", "ybanti"];
  const doneLines = ["Finished the {t} edge cases and merged the changes.", "Paired on {t}; resolved the open review comments.", "Moved {t} forward and updated the checklist.", "Wrote tests and documentation for {t}.", "Investigated a regression in {t} and shipped a fix."];
  const wipLines = ["Continuing {t}; waiting on feedback before the final pass.", "Starting the next slice of {t}.", "Reviewing {t} with the team."];
  const planLines = ["Wrap up {t} and request review.", "Pick up {t} and sync with design.", "Demo {t} at stand-up."];
  const entryRows: { userId: string; taskId: string; projectId: string; date: Date; hours: number; note: string; reportId?: string }[] = [];
  const reportIds: Record<string, string> = {};
  for (const off of workdays) {
    for (const who of reporters) {
      const date = day(off);
      const pool = tdefs.filter((t) => t.who.includes(who) && P[t.p] && pdefs.find((p) => p.code === t.p)!.status !== "PLANNING" && t.s <= off && (t.status !== "COMPLETED" || off <= t.d) && t.status !== "NOT_STARTED" || (t.who.includes(who) && t.k === "a6" && off > -3 && false));
      if (!pool.length) continue;
      const chosen = [pick(pool), ...(rnd() > 0.5 ? [pick(pool)] : [])].filter((t, i, a) => a.indexOf(t) === i);
      const missing = (off === LATEST && ["ravi", "marcus", "ybanti"].includes(who)) || (off === PREV && who === "ybanti") || (off < PREV && rnd() < 0.08);
      const hours = chosen.map(() => Math.round((1.5 + rnd() * 2.5) * 2) / 2);
      if (missing) {
        if (off !== LATEST || LATEST < 0) chosen.forEach((t, i) => entryRows.push({ userId: uid(who), taskId: T[t.k]!.id, projectId: P[t.p]!.id, date, hours: hours[i]!, note: "Logged manually" }));
        continue;
      }
      let status: "DRAFT" | "SUBMITTED" | "APPROVED" | "CHANGES_REQUESTED" = off < PREV ? "APPROVED" : "SUBMITTED";
      if (off === LATEST) status = who === "chloe" ? "DRAFT" : "SUBMITTED";
      if (off === PREV && who === "ravi") status = "CHANGES_REQUESTED";
      if (off === PREV && who === "marcus") status = "APPROVED";
      const first = chosen[0]!;
      const reviewer = who === "mumtaz" || who === "ybanti" ? P[first.p]!.pm : pick(["mumtaz", P[first.p]!.pm]);
      const need = who === "ravi" && off >= PREV;
      const report = await prisma.dailyReport.create({
        data: {
          authorId: uid(who), reportDate: date, status,
          completedToday: chosen.map((t) => pick(doneLines).replace("{t}", t.title)).join(" "), inProgress: pick(wipLines).replace("{t}", first.title),
          progressUpdate: `${first.title} is at ${Math.min(100, first.prog + 5)}%.`, planTomorrow: pick(planLines).replace("{t}", first.title),
          blockers: need ? "Still waiting on Apple’s entitlement approval for biometric login; need Arjun to escalate." : off === LATEST && who === "mumtaz" ? "Crash-reporting vendor needs a signed DPA before we can enable it in production." : null,
          mood: need ? "NEED_HELP" : rnd() > 0.7 ? "GOOD" : "NORMAL",
          submittedAt: status === "DRAFT" ? null : new Date(date.getTime() + 17.5 * 3_600_000 + Math.floor(rnd() * 3_000_000)),
          reviewerId: status === "APPROVED" || status === "CHANGES_REQUESTED" ? uid(reviewer) : null,
          reviewedAt: status === "APPROVED" || status === "CHANGES_REQUESTED" ? new Date(date.getTime() + 22 * 3_600_000) : null,
          reviewComment: status === "CHANGES_REQUESTED" ? "Please attach the entitlement request screenshot so I can chase Apple with evidence." : status === "APPROVED" && rnd() > 0.6 ? "Thanks — clear update." : null,
          createdAt: new Date(date.getTime() + 16 * 3_600_000),
          items: { create: chosen.map((t, i) => ({ projectId: P[t.p]!.id, taskId: T[t.k]!.id, hoursSpent: hours[i]!, notes: i === 0 ? "Main focus" : null })) },
        },
      });
      reportIds[`${who}:${off}`] = report.id;
      if (status !== "DRAFT") chosen.forEach((t, i) => entryRows.push({ userId: uid(who), taskId: T[t.k]!.id, projectId: P[t.p]!.id, date, hours: hours[i]!, note: "From daily report", reportId: report.id }));
    }
  }
  await prisma.timeEntry.createMany({ data: entryRows });
  const sums = new Map<string, number>();
  for (const e of entryRows) sums.set(e.taskId, (sums.get(e.taskId) ?? 0) + e.hours);
  for (const [taskId, hours] of sums) await prisma.task.update({ where: { id: taskId }, data: { loggedHours: Math.round(hours * 100) / 100 }, select: { id: true } });

  const rep = (k: string) => reportIds[k];
  if (rep(`aisha:${LATEST}`)) await prisma.dailyReportAttachment.createMany({ data: [{ reportId: rep(`aisha:${LATEST}`)!, fileId: files["sso-commit"]!, uploaderId: uid("aisha") }] });
  if (rep(`mumtaz:${LATEST}`)) await prisma.dailyReportAttachment.createMany({ data: [{ reportId: rep(`mumtaz:${LATEST}`)!, fileId: files["demo"]!, uploaderId: uid("mumtaz") }] });
  if (rep(`marcus:${PREV}`)) await prisma.dailyReportAttachment.createMany({ data: [{ reportId: rep(`marcus:${PREV}`)!, fileId: files["matrix"]!, uploaderId: uid("marcus") }] });
  if (rep(`ravi:${PREV}`)) {
    await prisma.taskComment.create({ data: { reportId: rep(`ravi:${PREV}`)!, authorId: uid("arjun"), body: "Please attach the entitlement request screenshot so I can chase Apple with evidence.", createdAt: ago(1, 22) } });
    await prisma.taskComment.create({ data: { reportId: rep(`ravi:${PREV}`)!, authorId: uid("ravi"), body: `Will add it first thing. @[Banti Yadav](${uid("arjun")}) the case number is in the Apple dev portal.`, mentions: [uid("arjun")], createdAt: ago(0, 8) } });
  }

  /* ---------- comments ---------- */
  const mention = (k: string) => `@[${U[k]!.name}](${uid(k)})`;
  await prisma.taskComment.createMany({
    data: [
      { taskId: T.a3!.id, authorId: uid("ybanti"), body: `${mention("chloe")} the table pattern is the last big piece. Can we get it in before the a11y audit starts?`, mentions: [uid("chloe")], createdAt: ago(8) },
      { taskId: T.a3!.id, authorId: uid("chloe"), body: "Yes — I’ll finish the table and card patterns this week and ping Marcus with the final tokens.", createdAt: ago(7) },
      { taskId: T.a8!.id, authorId: uid("marcus"), body: `${mention("ybanti")} I’m blocked until the colour tokens are final. Do you have an ETA?`, mentions: [uid("ybanti")], createdAt: ago(2) },
      { taskId: T.a4!.id, authorId: uid("sofia"), body: "Looks great. I’ll review properly after stand-up and share it with client.", createdAt: ago(3) },
      { taskId: T.a11!.id, authorId: uid("sofia"), body: "Rejected: the rollback section needs concrete steps and owners for each stage.", createdAt: ago(5) },
      { taskId: T.h4!.id, authorId: uid("ravi"), body: `${mention("arjun")} Apple still hasn’t approved the entitlement. I’ve prepared a PIN fallback if it slips past the freeze.`, mentions: [uid("arjun")], createdAt: ago(1) },
      { taskId: T.h1!.id, authorId: uid("mumtaz"), body: "Conflict resolution strategy is agreed. Soak tests on the low-end devices are next.", createdAt: ago(4) },
    ],
  });

  /* ---------- milestone progress/health from real task data ---------- */
  const now = new Date();
  for (const m of await prisma.milestone.findMany({ include: { tasks: true } })) {
    const progress = milestoneProgress(m.tasks);
    const blockedCount = m.tasks.filter((t) => t.status === "BLOCKED").length;
    const overdueTaskCount = m.tasks.filter((t) => t.status !== "COMPLETED" && t.dueDate && t.dueDate < now).length;
    const health = m.tasks.length ? milestoneHealth({ dueDate: m.dueDate, progress, blockedCount, overdueTaskCount, now }) : "HEALTHY";
    const status = m.tasks.length && progress >= 100 ? "COMPLETED" : m.tasks.some((t) => t.status !== "NOT_STARTED") ? "IN_PROGRESS" : "PENDING";
    await prisma.milestone.update({ where: { id: m.id }, data: { progress, health, status } });
  }

  /* ---------- notifications ---------- */
  const n = (user: string, type: string, title: string, body: string | null, href: string, hoursAgo: number, read = false) =>
    ({ userId: uid(user), type: type as "COMMENT", title, body, href, createdAt: new Date(Date.now() - hoursAgo * 3_600_000), readAt: read ? new Date(Date.now() - (hoursAgo - 1) * 3_600_000) : null });
  await prisma.notification.createMany({
    data: [
      n("sofia", "TASK_AWAITING_REVIEW", "Awaiting review: Portal dashboard prototype", "Chloe Bennett marked this task ready for review.", `/tasks/${T.a4!.id}`, 30),
      n("sofia", "BLOCKER_REPORTED", "Blocked: Accessibility audit (WCAG AA)", "Waiting for the final colour tokens.", `/tasks/${T.a8!.id}`, 26),
      n("sofia", "MILESTONE_AT_RISK", "Milestone delayed: Design system & prototypes", "Atlas Customer Portal is now behind on this milestone.", `/projects/${P.ATLAS!.id}?tab=milestones`, 50, true),
      n("arjun", "BLOCKER_REPORTED", "Ravi Patel reported a blocker", "Still waiting on Apple’s entitlement approval for biometric login.", `/daily-reports/${rep(`ravi:${PREV}`) ?? ""}`, 20),
      n("arjun", "TASK_AWAITING_REVIEW", "Awaiting review: Beta test plan & device matrix", "Marcus Reed marked this task ready for review.", `/tasks/${T.h7!.id}`, 72),
      n("arjun", "DAILY_REPORT_SUBMITTED", "Aisha Khan submitted a daily report", "6h logged", `/daily-reports/${rep(`aisha:${LATEST}`) ?? ""}`, 3),
      n("mumtaz", "DAILY_REPORT_SUBMITTED", "Aisha Khan submitted a daily report", "6h logged", `/daily-reports/${rep(`aisha:${LATEST}`) ?? ""}`, 3),
      n("mumtaz", "DEADLINE_APPROACHING", "Due soon: Push notification service", null, `/tasks/${T.h2!.id}`, 6),
      n("chloe", "MENTION", "Banti Yadav mentioned you on Design system tokens & components", "the table pattern is the last big piece…", `/tasks/${T.a3!.id}`, 190, true),
      n("chloe", "TASK_OVERDUE", "Overdue: Design system tokens & components", null, `/tasks/${T.a3!.id}`, 5),
      n("marcus", "MENTION", "Banti Yadav replied about colour tokens", null, `/tasks/${T.a8!.id}`, 10),
      n("marcus", "TASK_ASSIGNED", "Assigned to you: Load & performance testing plan", "Due in 25 days", `/tasks/${T.a9!.id}`, 90, true),
      n("ravi", "REPORT_REVIEWED", "Banti Yadav requested changes on your daily report", "Please attach the entitlement request screenshot…", `/daily-reports/${rep(`ravi:${PREV}`) ?? ""}`, 22),
      n("ravi", "TASK_OVERDUE", "Overdue: Offline sync engine", null, `/tasks/${T.h1!.id}`, 8),
      n("aisha", "TASK_ASSIGNED", "Assigned to you: In-app purchase flow", "Due in 14 days", `/tasks/${T.h5!.id}`, 100, true),
      n("aisha", "COMMENT", "New comment on Authentication & SSO integration", null, `/tasks/${T.a5!.id}`, 12),
      n("ybanti", "MENTION", "Marcus Reed mentioned you on Accessibility audit", "I’m blocked until the colour tokens are final…", `/tasks/${T.a8!.id}`, 10),
      n("daniel", "ANNOUNCEMENT", "Atlas Customer Portal: UAT window confirmed", null, `/projects/${P.ATLAS!.id}`, 48, true),
      n("client", "ANNOUNCEMENT", "Atlas Customer Portal: UAT window confirmed", "Brightwave has confirmed UAT…", `/projects/${P.ATLAS!.id}`, 48),
    ],
  });
  await prisma.loginAudit.createMany({ data: people.filter((p) => p[0] !== "jordan").map((p) => ({ userId: uid(p[0]), email: p[2], success: true, ip: "127.0.0.1", userAgent: "seed", createdAt: ago(1) })).concat([{ userId: uid("jordan"), email: "jordan@projectpulse.dev", success: false, ip: "127.0.0.1", userAgent: "seed", createdAt: ago(9) } as never]) });

  const counts = { users: await prisma.user.count(), projects: await prisma.project.count(), tasks: await prisma.task.count(), reports: await prisma.dailyReport.count(), time: await prisma.timeEntry.count(), files: await prisma.projectFile.count() };
  console.log("Seeded:", counts);
  console.log(`Demo password for every account: ${DEMO_PASSWORD}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
