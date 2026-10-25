import Link from "next/link";
import { AtSign, Bell, CalendarClock, CheckCircle2, ClipboardCheck, FileText, Flag, MessageSquare, Megaphone, OctagonAlert, UserPlus, XCircle } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ensureDeadlineNotifications } from "@/lib/activity";
import { renderMentions } from "@/lib/business";
import { flat, qs } from "@/lib/queries";
import { NOTIFICATION_TYPES } from "@/lib/constants";
import { ActionButton } from "@/components/action-form";
import { Card, EmptyState, PageHeader, Pagination } from "@/components/ui/primitives";
import { Select } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";
import { cn, timeAgo } from "@/lib/utils";
import { markAllNotificationsReadAction, markNotificationReadAction } from "@/actions/notifications";

export const metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";
const PAGE = 25;

const META: Record<string, { label: string; icon: typeof Bell; tone: string }> = {
  TASK_ASSIGNED: { label: "Task assigned", icon: UserPlus, tone: "bg-blue-50 text-blue-600" }, MENTION: { label: "Mention", icon: AtSign, tone: "bg-violet-50 text-violet-600" },
  COMMENT: { label: "Comment", icon: MessageSquare, tone: "bg-slate-100 text-slate-600" }, DEADLINE_APPROACHING: { label: "Deadline approaching", icon: CalendarClock, tone: "bg-amber-50 text-amber-600" },
  TASK_OVERDUE: { label: "Task overdue", icon: OctagonAlert, tone: "bg-red-50 text-red-600" }, DAILY_REPORT_SUBMITTED: { label: "Daily report submitted", icon: FileText, tone: "bg-blue-50 text-blue-600" },
  TASK_AWAITING_REVIEW: { label: "Awaiting review", icon: ClipboardCheck, tone: "bg-violet-50 text-violet-600" }, TASK_APPROVED: { label: "Task approved", icon: CheckCircle2, tone: "bg-green-50 text-green-600" },
  TASK_REJECTED: { label: "Task rejected", icon: XCircle, tone: "bg-red-50 text-red-600" }, BLOCKER_REPORTED: { label: "Blocker reported", icon: OctagonAlert, tone: "bg-red-50 text-red-600" },
  MILESTONE_AT_RISK: { label: "Milestone at risk", icon: Flag, tone: "bg-amber-50 text-amber-600" }, ANNOUNCEMENT: { label: "Announcement", icon: Megaphone, tone: "bg-blue-50 text-blue-600" },
  REPORT_REVIEWED: { label: "Report reviewed", icon: FileText, tone: "bg-green-50 text-green-600" },
};

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  await ensureDeadlineNotifications(user.id);
  const sp = flat(await searchParams);
  const page = Math.max(Number(sp.page) || 1, 1);
  const where = { userId: user.id, ...(sp.show === "unread" ? { readAt: null } : {}), ...(sp.type ? { type: sp.type as "COMMENT" } : {}) };
  const [rows, total, unread] = await Promise.all([
    db.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE }),
    db.notification.count({ where }), db.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);
  return (
    <>
      <PageHeader title="Notifications" description={unread ? `${unread} unread` : "You’re all caught up."} actions={unread > 0 && <ActionButton action={markAllNotificationsReadAction} variant="secondary" size="md">Mark all as read</ActionButton>} />
      <Card>
        <form className="flex flex-wrap items-center gap-3 border-b border-line p-4" role="search" aria-label="Filter notifications">
          <Select name="show" defaultValue={sp.show ?? ""} aria-label="Show" className="w-40"><option value="">All</option><option value="unread">Unread only</option></Select>
          <Select name="type" defaultValue={sp.type ?? ""} aria-label="Type" className="w-60"><option value="">All types</option>{NOTIFICATION_TYPES.map((t) => <option key={t} value={t}>{META[t]!.label}</option>)}</Select>
          <button className={buttonClass("secondary")}>Filter</button>{(sp.show || sp.type) && <Link href="/notifications" className={buttonClass("ghost")}>Clear</Link>}
        </form>
        {rows.length === 0 ? <EmptyState title="No notifications" description={sp.show || sp.type ? "Nothing matches that filter." : "Assignments, mentions, reviews and deadlines will show up here."} icon={<Bell className="size-5" />} /> : (
          <ul className="divide-y divide-line">
            {rows.map((n) => { const m = META[n.type]!; const Icon = m.icon; return (
              <li key={n.id} className={cn("flex items-start gap-3 px-5 py-3.5", !n.readAt && "bg-blue-50/40")}>
                <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full", m.tone)}><Icon className="size-4" aria-hidden /></span>
                <div className="min-w-0 flex-1">
                  <Link href={`/notifications/open/${n.id}`} className="text-sm font-medium hover:underline">{!n.readAt && <span className="mr-2 inline-block size-2 rounded-full bg-blue-600 align-middle" aria-label="Unread" />}{n.title}</Link>
                  {n.body && <p className="mt-0.5 text-sm text-slate-600">{renderMentions(n.body)}</p>}
                  <p className="mt-0.5 text-xs text-slate-500">{m.label} · {timeAgo(n.createdAt)}</p>
                </div>
                {!n.readAt && <ActionButton action={markNotificationReadAction.bind(null, n.id)} variant="ghost">Mark read</ActionButton>}
              </li>
            ); })}
          </ul>
        )}
        <Pagination page={page} pageSize={PAGE} total={total} hrefFor={(p) => `/notifications${qs(sp, { page: p === 1 ? undefined : String(p) })}`} />
      </Card>
    </>
  );
}
