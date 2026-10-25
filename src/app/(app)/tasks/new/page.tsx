import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { loadTaskFormData } from "@/lib/page-access";
import { flat } from "@/lib/queries";
import { Card, CardBody, EmptyState, PageHeader } from "@/components/ui/primitives";
import { TaskForm } from "@/components/task-form";

export const metadata = { title: "New task" };

export default async function NewTaskPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  if (user.role === "TEAM_MEMBER" || user.role === "CLIENT_VIEWER") redirect("/unauthorized");
  const sp = flat(await searchParams);
  const data = await loadTaskFormData(user);
  return (
    <>
      <PageHeader title="New task" back={{ href: sp.projectId ? `/projects/${sp.projectId}?tab=tasks` : "/tasks", label: "Back" }} />
      <Card><CardBody>
        {data.projects.length === 0 ? <EmptyState title="No projects to add tasks to" description="You need to manage or lead an active project to create tasks." /> : <TaskForm data={data} initial={{ projectId: data.projects.some((p) => p.id === sp.projectId) ? sp.projectId : undefined }} />}
      </CardBody></Card>
    </>
  );
}
