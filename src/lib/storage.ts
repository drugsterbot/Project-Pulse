import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Storage abstraction. Local disk is used in development; implement StorageService for S3/Cloudinary
 * and return it from getStorage() when STORAGE_DRIVER changes. Nothing else in the app touches the disk.
 */
export interface StorageService {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

class LocalStorage implements StorageService {
  // The upload directory is configurable on purpose, so tell the bundler not to trace it.
  private root = path.resolve(/* turbopackIgnore: true */ process.env.UPLOAD_DIR ?? "./uploads");
  private resolve(key: string) {
    const full = path.resolve(/* turbopackIgnore: true */ this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new Error("Invalid storage key");
    return full;
  }
  async put(key: string, data: Buffer) {
    const full = this.resolve(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data);
  }
  async get(key: string) {
    return fs.readFile(this.resolve(key));
  }
  async delete(key: string) {
    await fs.rm(this.resolve(key), { force: true });
  }
}

export function getStorage(): StorageService {
  const driver = process.env.STORAGE_DRIVER ?? "local";
  if (driver === "local") return new LocalStorage();
  // Example: if (driver === "s3") return new S3Storage({ bucket: process.env.S3_BUCKET! });
  throw new Error(`Unsupported STORAGE_DRIVER "${driver}". Add an adapter in src/lib/storage.ts.`);
}
export const storage = getStorage();
export const newStorageKey = (projectId: string, fileName: string) => `${projectId}/${randomUUID()}${path.extname(fileName).toLowerCase()}`;

export const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_MB ?? 15) * 1024 * 1024;
const ALLOWED: Record<string, string[]> = {
  png: ["image/png"], jpg: ["image/jpeg"], jpeg: ["image/jpeg"], gif: ["image/gif"], webp: ["image/webp"],
  pdf: ["application/pdf"], txt: ["text/plain"], md: ["text/markdown", "text/plain", "text/x-markdown"], csv: ["text/csv", "application/vnd.ms-excel", "text/plain"],
  json: ["application/json", "text/plain"], log: ["text/plain"],
  doc: ["application/msword"], docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  xls: ["application/vnd.ms-excel"], xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ppt: ["application/vnd.ms-powerpoint"], pptx: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
};
const MAGIC: Record<string, number[]> = { png: [0x89, 0x50, 0x4e, 0x47], jpg: [0xff, 0xd8, 0xff], jpeg: [0xff, 0xd8, 0xff], gif: [0x47, 0x49, 0x46], pdf: [0x25, 0x50, 0x44, 0x46] };
export const ALLOWED_EXTENSIONS = Object.keys(ALLOWED);

/** Returns an error message, or null when the file is acceptable. SVG/HTML are rejected on purpose (script injection). */
export function validateUpload(name: string, mime: string, buf: Buffer) {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (!ALLOWED[ext]) return `.${ext || "unknown"} files are not allowed. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}.`;
  if (buf.length === 0) return "The file is empty.";
  if (buf.length > MAX_UPLOAD_BYTES) return `File is too large. The limit is ${Math.round(MAX_UPLOAD_BYTES / 1048576)} MB.`;
  if (mime && !ALLOWED[ext].includes(mime) && mime !== "application/octet-stream") return `File type ${mime} does not match .${ext}.`;
  const magic = MAGIC[ext];
  if (magic && !magic.every((b, i) => buf[i] === b)) return `The file contents do not look like a real .${ext} file.`;
  return null;
}
