import { requireUser } from "@/lib/auth";
import { flat } from "@/lib/queries";
import { FilesPanel } from "@/components/files-panel";
import { PageHeader } from "@/components/ui/primitives";
import { isAdminRole } from "@/lib/permissions";

export const metadata = { title: "Files" };
export const dynamic = "force-dynamic";

export default async function FilesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const params = flat(await searchParams);
  return (
    <>
      <PageHeader title={user.role === "CLIENT_VIEWER" ? "Shared files" : "Files"} description={user.role === "CLIENT_VIEWER" ? "Documents your project team has shared with you." : "Evidence, documents and links across your projects. Search by name, type, folder, uploader or date."} />
      <FilesPanel user={user} basePath="/files" params={params} canUpload={user.role !== "CLIENT_VIEWER"} canShare={isAdminRole(user.role) || user.role === "PROJECT_MANAGER"} />
    </>
  );
}
