import type { SessionUser } from "@/lib/auth";
import type { Level } from "@/lib/permissions";

export type Ctx = {
  user: SessionUser;
  id: string;
  level: Level;
  sp: Record<string, string>;
  project: { id: string; name: string; code: string; description: string | null; goals: string | null; clientName: string | null; status: string; priority: string; startDate: Date | null; endDate: Date | null; managerId: string | null; budget: unknown; estimatedHours: number | null; archivedAt: Date | null; category: string | null; manager: { id: string; name: string } | null };
};
