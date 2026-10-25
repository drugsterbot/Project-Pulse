import { FilesPanel } from "@/components/files-panel";
import { can, atLeast } from "@/lib/permissions";
import type { Ctx } from "./types";

export async function FilesTab({ ctx }: { ctx: Ctx }) {
  const { user, id, level, sp } = ctx;
  return <FilesPanel user={user} basePath={`/projects/${id}`} fixedParams={{ tab: "files" }} params={sp} projectId={id} canUpload={can(level, "upload")} canShare={atLeast(level, "manage")} />;
}
