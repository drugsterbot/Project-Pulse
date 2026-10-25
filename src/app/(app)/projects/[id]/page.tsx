import Link from "next/link";
import { Pencil, Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { pageProject } from "@/lib/page-access";
import { flat } from "@/lib/queries";
import { can } from "@/lib/permissions";
import { PROJECT_TABS } from "@/lib/constants";
import { Badge, LinkTabs, PageHeader } from "@/components/ui/primitives";
import { PriorityBadge, ProjectStatusBadge } from "@/components/ui/chips";
import { buttonClass } from "@/components/ui/button";
import { fmtDate } from "@/lib/utils";
import type { Ctx } from "./tabs/types";
import { OverviewTab } from "./tabs/overview";
import { TasksTab } from "./tabs/tasks";
import { BoardTab } from "./tabs/board";
import { TimelineTab } from "./tabs/timeline";
import { MilestonesTab } from "./tabs/milestones";
import { UpdatesTab } from "./tabs/updates";
import { FilesTab } from "./tabs/files";
import { TeamTab } from "./tabs/team";
import { ActivityTab } from "./tabs/activity";
import { RisksTab } from "./tabs/risks";
import { ReportsTab } from "./tabs/reports";
import { SettingsTab } from "./tabs/settings";

export const dynamic = "force-dynamic";
const CLIENT_TABS = ["overview", "tasks", "board", "timeline", "milestones", "files", "reports"];
const TABS = { overview: OverviewTab, tasks: TasksTab, board: BoardTab, timeline: TimelineTab, milestones: MilestonesTab, updates: UpdatesTab, files: FilesTab, team: TeamTab, activity: ActivityTab, risks: RisksTab, reports: ReportsTab, settings: SettingsTab };

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const { id } = await params;
  const sp = flat(await searchParams);
  const { project, level } = await pageProject(user, id);

  const allowed = PROJECT_TABS.filter(([key]) => (level === "client" ? CLIENT_TABS.includes(key) : key === "settings" ? can(level, "edit") : true));
  const tab = (allowed.some(([k]) => k === sp.tab) ? sp.tab : "overview") as keyof typeof TABS;
  const Tab = TABS[tab];
  const ctx: Ctx = { user, id, level, sp, project: { ...project, manager: project.manager } };

  return (
    <>
      <PageHeader back={{ href: "/projects", label: "Projects" }}
        title={<span className="flex flex-wrap items-center gap-3">{project.name}<ProjectStatusBadge status={project.status} /></span>}
        description={<span className="flex flex-wrap items-center gap-x-3 gap-y-1"><span className="font-medium text-slate-700">{project.code}</span><PriorityBadge priority={project.priority} />{project.manager && <span>Managed by {project.manager.name}</span>}<span>{fmtDate(project.startDate)} to {fmtDate(project.endDate)}</span>{project.archivedAt && <Badge tone="amber">Archived</Badge>}</span>}
        actions={<>
          {can(level, "createTask") && <Link href={`/tasks/new?projectId=${id}`} className={buttonClass("primary")}><Plus className="size-4" aria-hidden />Add task</Link>}
          {can(level, "edit") && <Link href={`/projects/${id}/edit`} className={buttonClass("secondary")}><Pencil className="size-4" aria-hidden />Edit</Link>}
        </>} />
      <LinkTabs tabs={allowed} active={tab} hrefFor={(k) => `/projects/${id}?tab=${k}`} />
      <Tab ctx={ctx} />
    </>
  );
}
