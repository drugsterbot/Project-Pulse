export const ROLES = ["SUPER_ADMIN", "ADMIN", "PROJECT_MANAGER", "TEAM_LEAD", "TEAM_MEMBER", "CLIENT_VIEWER"] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: "Super admin", ADMIN: "Admin", PROJECT_MANAGER: "Project manager",
  TEAM_LEAD: "Team lead", TEAM_MEMBER: "Team member", CLIENT_VIEWER: "Client viewer",
};

export const PROJECT_STATUS_LABEL = { PLANNING: "Planning", ACTIVE: "Active", ON_HOLD: "On hold", COMPLETED: "Completed", CANCELLED: "Cancelled" } as const;
export type ProjectStatus = keyof typeof PROJECT_STATUS_LABEL;
export const PRIORITY_LABEL = { LOW: "Low", MEDIUM: "Medium", HIGH: "High", CRITICAL: "Critical" } as const;
export type Priority = keyof typeof PRIORITY_LABEL;
export const TASK_STATUS_LABEL = {
  NOT_STARTED: "Not started", IN_PROGRESS: "In progress", WAITING_FOR_REVIEW: "Waiting for review",
  BLOCKED: "Blocked", COMPLETED: "Completed", REOPENED: "Reopened",
} as const;
export type TaskStatus = keyof typeof TASK_STATUS_LABEL;
export const TASK_STATUSES = Object.keys(TASK_STATUS_LABEL) as TaskStatus[];
export const BOARD_COLUMNS: TaskStatus[] = ["NOT_STARTED", "IN_PROGRESS", "WAITING_FOR_REVIEW", "BLOCKED", "COMPLETED", "REOPENED"];
export const HEALTH_LABEL = { HEALTHY: "Healthy", AT_RISK: "At risk", DELAYED: "Delayed" } as const;
export type Health = keyof typeof HEALTH_LABEL;
export const MILESTONE_STATUS_LABEL = { PENDING: "Pending", IN_PROGRESS: "In progress", COMPLETED: "Completed" } as const;
export const REPORT_STATUS_LABEL = { DRAFT: "Draft", SUBMITTED: "Submitted", APPROVED: "Approved", CHANGES_REQUESTED: "Changes requested", REJECTED: "Rejected" } as const;
export type ReportStatus = keyof typeof REPORT_STATUS_LABEL;
export const MOOD_LABEL = { GOOD: "Good", NORMAL: "Normal", NEED_HELP: "Need help" } as const;
export const FILE_CATEGORY_LABEL = {
  PROJECT_BRIEF: "Project brief", REQUIREMENTS: "Requirements", DESIGN: "Design", DEVELOPMENT: "Development",
  TESTING: "Testing", CLIENT_DOCUMENTS: "Client documents", REPORTS: "Reports", DELIVERABLES: "Deliverables", ARCHIVE: "Archive",
} as const;
export type FileCategory = keyof typeof FILE_CATEGORY_LABEL;
export const FILE_KIND_LABEL = {
  IMAGE: "Image", PDF: "PDF", DOCUMENT: "Document", SPREADSHEET: "Spreadsheet", PRESENTATION: "Presentation",
  TEXT: "Text", LINK: "Link", VIDEO_LINK: "Video link", COMMIT_LINK: "Commit / PR", OTHER: "Other",
} as const;
export type FileKind = keyof typeof FILE_KIND_LABEL;
export const SEVERITY_LABEL = { LOW: "Low", MEDIUM: "Medium", HIGH: "High", CRITICAL: "Critical" } as const;
export const RISK_STATUS_LABEL = { OPEN: "Open", MITIGATING: "Mitigating", RESOLVED: "Resolved", ACCEPTED: "Accepted" } as const;

export const NOTIFICATION_TYPES = [
  "TASK_ASSIGNED", "MENTION", "COMMENT", "DEADLINE_APPROACHING", "TASK_OVERDUE", "DAILY_REPORT_SUBMITTED",
  "TASK_AWAITING_REVIEW", "TASK_APPROVED", "TASK_REJECTED", "BLOCKER_REPORTED", "MILESTONE_AT_RISK", "ANNOUNCEMENT", "REPORT_REVIEWED",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type Tone = "slate" | "blue" | "green" | "amber" | "red" | "violet" | "teal";
export const TONE_CLASS: Record<Tone, string> = {
  slate: "bg-slate-100 text-slate-700 ring-slate-200",
  blue: "bg-blue-50 text-blue-700 ring-blue-200",
  green: "bg-green-50 text-green-700 ring-green-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
  teal: "bg-teal-50 text-teal-700 ring-teal-200",
};
export const TASK_STATUS_TONE: Record<TaskStatus, Tone> = {
  NOT_STARTED: "slate", IN_PROGRESS: "blue", WAITING_FOR_REVIEW: "violet", BLOCKED: "red", COMPLETED: "green", REOPENED: "amber",
};
export const PRIORITY_TONE: Record<Priority, Tone> = { LOW: "slate", MEDIUM: "blue", HIGH: "amber", CRITICAL: "red" };
export const PROJECT_STATUS_TONE: Record<ProjectStatus, Tone> = { PLANNING: "violet", ACTIVE: "blue", ON_HOLD: "amber", COMPLETED: "green", CANCELLED: "slate" };
export const HEALTH_TONE: Record<Health, Tone> = { HEALTHY: "green", AT_RISK: "amber", DELAYED: "red" };
export const REPORT_STATUS_TONE: Record<ReportStatus, Tone> = { DRAFT: "slate", SUBMITTED: "blue", APPROVED: "green", CHANGES_REQUESTED: "amber", REJECTED: "red" };
export const MOOD_TONE = { GOOD: "green", NORMAL: "slate", NEED_HELP: "amber" } as const;

export const PROJECT_TABS = [
  ["overview", "Overview"], ["tasks", "Tasks"], ["board", "Board"], ["timeline", "Timeline"], ["milestones", "Milestones"],
  ["updates", "Daily updates"], ["files", "Files"], ["team", "Team"], ["activity", "Activity"], ["risks", "Risks"],
  ["reports", "Reports"], ["settings", "Settings"],
] as const;
