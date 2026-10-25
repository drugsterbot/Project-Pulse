import Link from "next/link";
import { Archive, ArchiveRestore, Download, ExternalLink, File as FileIcon, FileImage, FileText, GitPullRequest, Presentation, Sheet, Trash2, Video } from "lucide-react";
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { projectWhere } from "@/lib/access";
import { listFiles } from "@/lib/files";
import { isAdminRole } from "@/lib/permissions";
import { FILE_CATEGORY_LABEL, FILE_KIND_LABEL } from "@/lib/constants";
import { bytes, fmtDate } from "@/lib/utils";
import { qs } from "@/lib/queries";
import { ActionButton } from "./action-form";
import { FileUploader } from "./file-uploader";
import { Badge, Card, CardHeader, EmptyState, Pagination, Table, Td, Th } from "./ui/primitives";
import { Input, Select } from "./ui/form";
import { buttonClass } from "./ui/button";
import { archiveFileAction, deleteFileAction, setFileSharedAction } from "@/actions/files";

const KIND_ICON = { IMAGE: FileImage, PDF: FileText, DOCUMENT: FileText, SPREADSHEET: Sheet, PRESENTATION: Presentation, TEXT: FileText, LINK: ExternalLink, VIDEO_LINK: Video, COMMIT_LINK: GitPullRequest, OTHER: FileIcon } as const;

/** File browser + uploader. Used on the global Files page and on each project's Files tab. */
export async function FilesPanel({ user, basePath, params, projectId, taskId, canUpload, canShare, fixedParams = {}, compact }: {
  user: SessionUser; basePath: string; params: Record<string, string>; projectId?: string; taskId?: string; canUpload: boolean; canShare?: boolean; fixedParams?: Record<string, string>; compact?: boolean;
}) {
  const page = Number(params.page ?? 1) || 1;
  const { rows, total, pageSize } = await listFiles(user, { projectId, taskId, q: params.q, kind: params.kind, category: params.category, uploaderId: params.uploader, from: params.from, to: params.to, archived: params.archived === "1", page });
  const [uploaders, projects] = await Promise.all([
    db.user.findMany({ where: { uploadedFiles: { some: { project: projectWhere(user), ...(projectId ? { projectId } : {}) } } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    projectId ? Promise.resolve([]) : db.project.findMany({ where: { AND: [projectWhere(user), { archivedAt: null }, { status: { not: "CANCELLED" } }] }, select: { id: true, name: true, code: true }, orderBy: { name: "asc" } }),
  ]);
  const hrefFor = (p: number) => `${basePath}${qs({ ...fixedParams, ...params }, { page: p === 1 ? undefined : String(p) })}`;
  const filtered = ["q", "kind", "category", "uploader", "from", "to", "archived"].some((k) => params[k]);

  return (
    <div className="space-y-5">
      {canUpload && (projectId || projects.length > 0) && <FileUploader target={{ projectId, taskId }} projects={projects} canShare={canShare} />}
      <Card>
        {!compact && <form action={basePath} className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-6" role="search" aria-label="Filter files">
          {Object.entries(fixedParams).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <Input name="q" defaultValue={params.q} placeholder="Search file names" aria-label="Search file names" className="lg:col-span-2" />
          <Select name="kind" defaultValue={params.kind ?? ""} aria-label="Type"><option value="">All types</option>{Object.entries(FILE_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
          <Select name="category" defaultValue={params.category ?? ""} aria-label="Folder"><option value="">All folders</option>{Object.entries(FILE_CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
          <Select name="uploader" defaultValue={params.uploader ?? ""} aria-label="Uploaded by"><option value="">Anyone</option>{uploaders.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select>
          <div className="flex gap-2"><button className={buttonClass("secondary", "md", "flex-1")}>Filter</button>{filtered && <Link href={`${basePath}${qs(fixedParams, {})}`} className={buttonClass("ghost")}>Clear</Link>}</div>
          <Input name="from" type="date" defaultValue={params.from} aria-label="Uploaded from" /><Input name="to" type="date" defaultValue={params.to} aria-label="Uploaded until" />
          <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" name="archived" value="1" defaultChecked={params.archived === "1"} className="size-4 rounded border-slate-300" />Show archived</label>
        </form>}
        {rows.length === 0 ? <EmptyState title={filtered ? "No files match those filters" : "No files yet"} description={filtered ? "Try clearing a filter." : "Upload a file or add a link to keep evidence and documents with the work."} /> : (
          <Table>
            <thead><tr><Th>Name</Th><Th>Folder</Th><Th>Uploaded by</Th><Th>Linked to</Th><Th>Added</Th><Th className="text-right">Actions</Th></tr></thead>
            <tbody>
              {rows.map((f) => {
                const Icon = KIND_ICON[f.kind];
                const href = f.externalUrl ?? `/api/files/${f.id}`;
                const canManage = user.role !== "CLIENT_VIEWER" && (f.uploaderId === user.id || isAdminRole(user.role) || f.project.managerId === user.id);
                return (
                  <tr key={f.id} className="hover:bg-slate-50/70">
                    <Td className="max-w-sm">
                      <div className="flex items-center gap-3">
                        {f.kind === "IMAGE" ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={`/api/files/${f.id}`} alt="" loading="lazy" className="size-10 shrink-0 rounded border border-line object-cover" /> : <span className="flex size-10 shrink-0 items-center justify-center rounded bg-slate-100 text-slate-500"><Icon className="size-5" aria-hidden /></span>}
                        <div className="min-w-0">
                          <a href={href} target="_blank" rel="noopener noreferrer" className="block truncate font-medium hover:text-blue-700 hover:underline">{f.name}</a>
                          <p className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">{FILE_KIND_LABEL[f.kind]}{f.sizeBytes > 0 && <> · {bytes(f.sizeBytes)}</>}{f.currentVersion > 1 && <Badge tone="blue">v{f.currentVersion}</Badge>}{f.sharedWithClient && <Badge tone="teal">Shared with client</Badge>}{f.archivedAt && <Badge>Archived</Badge>}</p>
                        </div>
                      </div>
                    </Td>
                    <Td className="text-slate-600">{FILE_CATEGORY_LABEL[f.category]}<div className="text-xs text-slate-400"><Link href={`/projects/${f.project.id}?tab=files`} className="hover:underline">{f.project.code}</Link></div></Td>
                    <Td className="text-slate-600">{f.uploader.name}</Td>
                    <Td className="text-slate-600">{f.task ? <Link href={`/tasks/${f.task.id}`} className="hover:underline">{f.task.title}</Link> : f.milestone ? f.milestone.name : <span className="text-slate-400">Project</span>}</Td>
                    <Td className="whitespace-nowrap text-slate-600">{fmtDate(f.createdAt)}</Td>
                    <Td>
                      <div className="flex items-center justify-end gap-1">
                        {f.storageKey && <a href={`/api/files/${f.id}?download=1`} aria-label={`Download ${f.name}`} className={buttonClass("ghost", "icon", "size-8")}><Download className="size-4" /></a>}
                        {canManage && canShare && !f.archivedAt && <ActionButton action={setFileSharedAction.bind(null, f.id, !f.sharedWithClient)} variant="ghost" aria-label={f.sharedWithClient ? "Stop sharing with client" : "Share with client"}>{f.sharedWithClient ? "Unshare" : "Share"}</ActionButton>}
                        {canManage && <ActionButton action={archiveFileAction.bind(null, f.id, !f.archivedAt)} variant="ghost" size="icon" className="size-8" aria-label={f.archivedAt ? `Restore ${f.name}` : `Archive ${f.name}`}>{f.archivedAt ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}</ActionButton>}
                        {canManage && <ActionButton action={deleteFileAction.bind(null, f.id)} variant="ghost" size="icon" className="size-8 text-red-600 hover:bg-red-50" aria-label={`Delete ${f.name}`} confirm={{ title: "Delete this file?", description: `“${f.name}” will be removed from the project. Activity history keeps a record.`, confirmLabel: "Delete file" }}><Trash2 className="size-4" /></ActionButton>}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <Pagination page={page} pageSize={pageSize} total={total} hrefFor={hrefFor} />
      </Card>
    </div>
  );
}
void CardHeader;
