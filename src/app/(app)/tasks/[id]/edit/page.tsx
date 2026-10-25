import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadTaskFormData, pageTask } from "@/lib/page-access";
import { isoDate } from "@/lib/utils";
import { Card, CardBody, PageHeader } from "@/components/ui/primitives";
import { TaskForm } from "@/components/task-form";

export const metadata = { title: "Edit task" };

export default async function EditTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { task } = await pageTask(user, id, "review");
  const [data, deps] = await Promise.all([loadTaskFormData(user), db.taskDependency.findMany({ where: { taskId: id }, select: { dependsOnId: true } })]);
  return (
    <>
      <PageHeader title="Edit task" back={{ href: `/tasks/${id}`, label: task.title }} />
      <Card><CardBody>
        <TaskForm data={data} initial={{ id, projectId: task.projectId, title: task.title, description: task.description ?? "", milestoneId: task.milestoneId ?? "", priority: task.priority, startDate: task.startDate ? isoDate(task.startDate) : "", dueDate: task.dueDate ? isoDate(task.dueDate) : "", estimatedHours: task.estimatedHours, progress: task.progress, labels: task.labels, requiredEvidence: task.requiredEvidence, assigneeIds: task.assignees.map((a) => a.userId), dependsOnIds: deps.map((d) => d.dependsOnId) }} />
      </CardBody></Card>
    </>
  );
}
