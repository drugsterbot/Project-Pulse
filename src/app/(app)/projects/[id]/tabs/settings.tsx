import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { ActionButton } from "@/components/action-form";
import { buttonClass } from "@/components/ui/button";
import { archiveProjectAction } from "@/actions/projects";
import type { Ctx } from "./types";

export async function SettingsTab({ ctx }: { ctx: Ctx }) {
  const { id, project } = ctx;
  const archived = !!project.archivedAt;
  return (
    <div className="max-w-2xl space-y-6">
      <Card><CardHeader title="Project details" description="Name, dates, manager, team and client access." />
        <CardBody><Link href={`/projects/${id}/edit`} className={buttonClass("primary")}>Edit project</Link></CardBody></Card>
      <Card className="border-amber-200">
        <CardHeader title={archived ? "Restore project" : "Archive project"} description={archived ? "Bring this project back into lists and dashboards." : "Hide the project from lists, boards and dashboards. Nothing is deleted and you can restore it any time."} />
        <CardBody>
          <ActionButton action={archiveProjectAction.bind(null, id, !archived)} variant={archived ? "secondary" : "danger"} size="md" successMessage={archived ? "Project restored." : "Project archived."}
            confirm={archived ? undefined : { title: `Archive ${project.name}?`, description: "Team members will no longer see it in their lists. You can restore it from Projects → Archived.", confirmLabel: "Archive project" }}>
            {archived ? "Restore project" : "Archive project"}
          </ActionButton>
        </CardBody>
      </Card>
    </div>
  );
}
