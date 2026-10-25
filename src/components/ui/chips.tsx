import { Badge } from "./primitives";
import {
  HEALTH_LABEL, HEALTH_TONE, MOOD_LABEL, MOOD_TONE, PRIORITY_LABEL, PRIORITY_TONE, PROJECT_STATUS_LABEL, PROJECT_STATUS_TONE,
  REPORT_STATUS_LABEL, REPORT_STATUS_TONE, TASK_STATUS_LABEL, TASK_STATUS_TONE, type Health, type Priority, type ProjectStatus, type ReportStatus, type TaskStatus,
} from "@/lib/constants";

export const TaskStatusBadge = ({ status }: { status: string }) => <Badge tone={TASK_STATUS_TONE[status as TaskStatus]} dot>{TASK_STATUS_LABEL[status as TaskStatus]}</Badge>;
export const PriorityBadge = ({ priority }: { priority: string }) => <Badge tone={PRIORITY_TONE[priority as Priority]}>{PRIORITY_LABEL[priority as Priority]}</Badge>;
export const ProjectStatusBadge = ({ status }: { status: string }) => <Badge tone={PROJECT_STATUS_TONE[status as ProjectStatus]} dot>{PROJECT_STATUS_LABEL[status as ProjectStatus]}</Badge>;
export const HealthBadge = ({ health }: { health: string }) => <Badge tone={HEALTH_TONE[health as Health]} dot>{HEALTH_LABEL[health as Health]}</Badge>;
export const ReportStatusBadge = ({ status }: { status: string }) => <Badge tone={REPORT_STATUS_TONE[status as ReportStatus]} dot>{REPORT_STATUS_LABEL[status as ReportStatus]}</Badge>;
export const MoodBadge = ({ mood }: { mood: string }) => <Badge tone={MOOD_TONE[mood as keyof typeof MOOD_TONE]}>{MOOD_LABEL[mood as keyof typeof MOOD_LABEL]}</Badge>;
