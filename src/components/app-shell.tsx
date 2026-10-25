"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  Bell, BarChart3, CalendarCheck, ClipboardList, FolderKanban, FolderOpen, LayoutDashboard, LayoutGrid, LogOut, Menu, Search, Sparkles, Timer, UserCog, Users, X, Activity, Gauge, UserCircle2, Network,
} from "lucide-react";
import { Logo } from "./logo";
import { Avatar } from "./ui/primitives";
import { ActionButton } from "./action-form";
import { cn, timeAgo } from "@/lib/utils";
import { logoutAction } from "@/actions/auth";
import { markAllNotificationsReadAction } from "@/actions/notifications";

const ICONS = {
  dashboard: LayoutDashboard, tasks: ClipboardList, board: LayoutGrid, reports: CalendarCheck, time: Timer, projects: FolderKanban, files: FolderOpen,
  activity: Activity, workload: Gauge, analytics: BarChart3, insights: Sparkles, users: UserCog, teams: Network,
};
export type NavItem = { href: string; label: string; icon: keyof typeof ICONS };
export type NavGroup = { title: string; items: NavItem[] };
export type NotificationLite = { id: string; title: string; body: string | null; href: string | null; createdAt: string; read: boolean };

export function AppShell({ user, nav, unread, notifications, children }: {
  user: { name: string; email: string; roleLabel: string; avatarUrl: string | null }; nav: NavGroup[]; unread: number; notifications: NotificationLite[]; children: ReactNode;
}) {
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  const [bell, setBell] = useState(false);
  const [menu, setMenu] = useState(false);
  useEffect(() => { setDrawer(false); setBell(false); setMenu(false); }, [pathname]);

  const sidebar = (
    <div className="flex h-full flex-col bg-ink text-slate-300">
      <div className="flex h-14 items-center justify-between px-4"><Link href="/dashboard" aria-label="ProjectPulse home"><Logo light /></Link>
        <button className="rounded-md p-1.5 text-slate-400 hover:bg-white/10 lg:hidden" onClick={() => setDrawer(false)} aria-label="Close menu"><X className="size-5" /></button>
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-3" aria-label="Main">
        {nav.map((g) => (
          <div key={g.title}>
            <div className="px-2 pb-1.5 text-xs font-medium text-slate-500">{g.title}</div>
            <ul className="space-y-0.5">
              {g.items.map((it) => {
                const Icon = ICONS[it.icon];
                const active = pathname === it.href || (it.href !== "/dashboard" && pathname.startsWith(it.href));
                return (
                  <li key={it.href}>
                    <Link href={it.href} aria-current={active ? "page" : undefined}
                      className={cn("flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors", active ? "bg-ink-3 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white")}>
                      <Icon className={cn("size-4", active ? "text-blue-400" : "text-slate-400")} aria-hidden />{it.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t border-white/10 p-3 text-xs text-slate-400">
        <div className="flex items-center gap-2.5"><Avatar name={user.name} src={user.avatarUrl} size={30} />
          <div className="min-w-0"><div className="truncate text-sm font-medium text-white">{user.name}</div><div className="truncate">{user.roleLabel}</div></div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2">Skip to content</a>
      <aside className="sticky top-0 hidden h-screen lg:block">{sidebar}</aside>
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink/60" onClick={() => setDrawer(false)} aria-hidden />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85%]">{sidebar}</div>
        </div>
      )}
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-white/90 px-4 backdrop-blur sm:px-6">
          <button className="rounded-md p-2 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setDrawer(true)} aria-label="Open menu"><Menu className="size-5" /></button>
          <form action="/search" className="relative max-w-md flex-1" role="search">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input name="q" type="search" placeholder="Search projects, tasks and files" aria-label="Search" className="h-9 w-full rounded-md border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm placeholder:text-slate-400 focus-visible:border-blue-500 focus-visible:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30" />
          </form>
          <div className="ml-auto flex items-center gap-1">
            <div className="relative">
              <button onClick={() => { setBell((v) => !v); setMenu(false); }} aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} aria-expanded={bell} className="relative rounded-md p-2 text-slate-600 hover:bg-slate-100">
                <Bell className="size-5" />
                {unread > 0 && <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-4 text-white">{unread > 9 ? "9+" : unread}</span>}
              </button>
              {bell && (
                <div className="absolute right-0 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-line bg-white shadow-xl">
                  <div className="flex items-center justify-between border-b border-line px-4 py-2.5"><span className="text-sm font-semibold">Notifications</span>
                    {unread > 0 && <ActionButton action={markAllNotificationsReadAction} variant="ghost">Mark all read</ActionButton>}
                  </div>
                  <ul className="max-h-80 divide-y divide-line overflow-y-auto">
                    {notifications.length === 0 && <li className="px-4 py-8 text-center text-sm text-slate-500">You’re all caught up.</li>}
                    {notifications.map((n) => (
                      <li key={n.id}><Link href={`/notifications/open/${n.id}`} className={cn("block px-4 py-2.5 hover:bg-slate-50", !n.read && "bg-blue-50/50")}>
                        <div className="flex items-start gap-2">{!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-blue-600" aria-label="Unread" />}
                          <div className="min-w-0"><p className="truncate text-sm font-medium">{n.title}</p>{n.body && <p className="truncate text-xs text-slate-500">{n.body}</p>}<p className="mt-0.5 text-xs text-slate-400">{timeAgo(n.createdAt)}</p></div>
                        </div></Link></li>
                    ))}
                  </ul>
                  <Link href="/notifications" className="block border-t border-line px-4 py-2.5 text-center text-sm font-medium text-blue-700 hover:bg-slate-50">View all</Link>
                </div>
              )}
            </div>
            <div className="relative">
              <button onClick={() => { setMenu((v) => !v); setBell(false); }} aria-label="Account menu" aria-expanded={menu} className="rounded-full p-0.5 hover:ring-2 hover:ring-slate-200"><Avatar name={user.name} src={user.avatarUrl} size={32} /></button>
              {menu && (
                <div className="absolute right-0 mt-2 w-60 rounded-xl border border-line bg-white py-1 shadow-xl">
                  <div className="border-b border-line px-4 py-2.5"><p className="truncate text-sm font-medium">{user.name}</p><p className="truncate text-xs text-slate-500">{user.email}</p></div>
                  <Link href="/profile" className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-slate-50"><UserCircle2 className="size-4 text-slate-500" />Profile & password</Link>
                  <form action={logoutAction}><button className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-700 hover:bg-red-50"><LogOut className="size-4" />Sign out</button></form>
                </div>
              )}
            </div>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
