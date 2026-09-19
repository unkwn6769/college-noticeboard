import { constants as fc } from "node:fs";
import { promises as fs } from "node:fs";
import { Readable, Transform } from "node:stream";
import path from "node:path";
import { classifyLegacyPath, type ScannerCandidate } from "./legacy-scanner-core";

export type SourceCandidate = ScannerCandidate & {
  sourceRef: string;
  contentType?: string;
  etag?: string;
  lastModified?: string;
};
export type SourceDirectoryFailure = { url: string; relativePathPrefix: string; status: number | null; error: string };
export interface SourceAdapter {
  discover(): Promise<SourceCandidate[]>;
  readonly discoveryFailures?: SourceDirectoryFailure[];
  open(candidate: SourceCandidate): Promise<{ stream: NodeJS.ReadableStream; sizeBytes: number }>;
  resolve(relativePath: string): Promise<SourceCandidate>;
}
const safeRelative = (value: string) => value.length > 0 && !value.startsWith("/") && !value.includes("\\") && !value.split("/").some((part) => !part || part === "." || part === "..");
const department = (relativePath: string) => classifyLegacyPath(relativePath);

export class FilesystemAdapter implements SourceAdapter {
  readonly discoveryFailures: SourceDirectoryFailure[] = [];
  constructor(public readonly sourceRoot: string) {}
  async discover(): Promise<SourceCandidate[]> {
    const base = path.resolve(this.sourceRoot); const out: SourceCandidate[] = [];
    const rootStat = await fs.lstat(base); if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error("Legacy scanner source must be a real mounted directory");
    const walk = async (dir: string): Promise<void> => {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const absolutePath = path.join(dir, entry.name); const stat = await fs.lstat(absolutePath);
        if (stat.isSymbolicLink()) continue;
        if (stat.isDirectory()) { await walk(absolutePath); continue; }
        if (!stat.isFile()) continue;
        const relativePath = path.relative(base, absolutePath).split(path.sep).join("/");
        if (!safeRelative(relativePath) || isTemporaryName(path.basename(relativePath))) continue;
        out.push({ relativePath, absolutePath, sourceRef: absolutePath, sizeBytes: stat.size, mtimeMs: Math.trunc(stat.mtimeMs), department: department(relativePath) });
      }
    };
    await walk(base); return out.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  }
  async open(candidate: SourceCandidate) {
    const fd = await fs.open(candidate.sourceRef, fc.O_RDONLY | fc.O_NOFOLLOW); const stat = await fd.stat();
    if (!stat.isFile()) { await fd.close(); throw new Error("Legacy source must be a regular file"); }
    return { stream: fd.createReadStream({ autoClose: true }), sizeBytes: stat.size };
  }
  async resolve(relativePath: string) { const absolutePath=path.resolve(this.sourceRoot,relativePath); if (!absolutePath.startsWith(path.resolve(this.sourceRoot)+path.sep)||!safeRelative(relativePath)) throw new Error("Invalid legacy source path"); const stat=await fs.lstat(absolutePath); if(!stat.isFile()||stat.isSymbolicLink()) throw new Error("Legacy source must be a regular file"); return {relativePath,absolutePath,sourceRef:absolutePath,sizeBytes:stat.size,mtimeMs:Math.trunc(stat.mtimeMs),department:department(relativePath)}; }
}

export type HttpAdapterOptions = { rootUrl?: string; timeoutMs?: number; maxResponseBytes?: number; concurrency?: number; maxDirectories?: number; maxFiles?: number };
function isTemporaryName(name: string) { return name.startsWith("~$") || name.startsWith(".~lock.") || name.endsWith(".tmp") || name.endsWith(".partial") || name.endsWith(".part"); }
function parseDirectory(html: string, base: URL): URL[] {
  const links: URL[] = []; const re = /<a\b[^>]*href\s*=\s*(["'])(.*?)\1/gi; let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const raw = match[2]; if (!raw || raw.startsWith("#")) continue;
    let url: URL; try { url = new URL(raw, base); } catch { continue; }
    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) continue;
    let decoded: string; try { decoded = decodeURIComponent(url.pathname); } catch { continue; }
    if (!decoded.startsWith(base.pathname) || decoded.split("/").some((part) => part === ".." || part === ".")) continue;
    if (!url.search && !url.hash) links.push(url);
  }
  return links;
}
export class HttpDirectoryAdapter implements SourceAdapter {
  readonly rootUrl: URL; readonly timeoutMs: number; readonly maxResponseBytes: number; readonly concurrency: number; readonly maxDirectories: number; readonly maxFiles: number;
  readonly discoveryFailures: SourceDirectoryFailure[] = [];
  constructor(options: HttpAdapterOptions = {}) { this.rootUrl = new URL(options.rootUrl ?? process.env.LEGACY_NOTICEBOARD_HTTP_ROOT ?? "http://10.24.14.231/noticeboards/"); if (!this.rootUrl.pathname.endsWith("/")) this.rootUrl.pathname += "/"; this.timeoutMs = options.timeoutMs ?? Number(process.env.LEGACY_NOTICEBOARD_HTTP_TIMEOUT_MS ?? 15000); this.maxResponseBytes = options.maxResponseBytes ?? Number(process.env.LEGACY_NOTICEBOARD_HTTP_MAX_RESPONSE_BYTES ?? 1024 * 1024 * 1024); this.concurrency = options.concurrency ?? Number(process.env.LEGACY_NOTICEBOARD_HTTP_CONCURRENCY ?? 4); this.maxDirectories = options.maxDirectories ?? 10000; this.maxFiles = options.maxFiles ?? 100000; }
  private async request(url: URL, method = "GET"): Promise<Response> { let current = url; for (let attempt = 0; attempt < 4; attempt++) { if (current.origin !== this.rootUrl.origin || !current.pathname.startsWith(this.rootUrl.pathname)) throw new Error("HTTP source URL escaped configured origin/root"); const signal = AbortSignal.timeout(this.timeoutMs); const response = await fetch(current, { method, signal, redirect: "manual", headers: { "user-agent": "College-Noticeboard-R17" } }); if (response.status >= 300 && response.status < 400) { const location = response.headers.get("location"); if (!location) throw new Error("HTTP source redirect missing location"); current = new URL(location, current); continue; } return response; } throw new Error("Too many HTTP source redirects"); }
  private async releaseMetadataResponse(response: Response) { try { await response.body?.cancel(); } catch {} }
  private async metadata(url: URL): Promise<Response> { let response = await this.request(url, "HEAD"); if (response.status === 405 || response.status === 501) { await this.releaseMetadataResponse(response); response = await this.request(url); } return response; }
  private async fileMetadata(url: URL, tolerateUnavailable = true) {
    const response = await this.metadata(url);
    try {
      if (response.status === 404 || response.status === 403) { if (tolerateUnavailable) return null; throw new Error(`HTTP source file failed: ${response.status}`); }
      if (!response.ok) throw new Error(`HTTP source file failed: ${response.status}`);
      const length = Number(response.headers.get("content-length") ?? "0");
      if (length > this.maxResponseBytes) throw new Error("HTTP response exceeds configured limit");
      return { length, contentType: response.headers.get("content-type") ?? undefined, etag: response.headers.get("etag") ?? undefined, lastModified: response.headers.get("last-modified") ?? undefined };
    } finally { await this.releaseMetadataResponse(response); }
  }
  private async readBounded(response: Response): Promise<Buffer> { const length = Number(response.headers.get("content-length") ?? "0"); if (length > this.maxResponseBytes) throw new Error("HTTP response exceeds configured limit"); const chunks: Buffer[] = []; let total = 0; if (!response.body) return Buffer.alloc(0); for await (const chunk of Readable.fromWeb(response.body as any)) { const buffer = Buffer.from(chunk as Uint8Array); total += buffer.length; if (total > this.maxResponseBytes) throw new Error("HTTP response exceeds configured limit"); chunks.push(buffer); } return Buffer.concat(chunks); }
  async discover(): Promise<SourceCandidate[]> { const files: SourceCandidate[] = []; const queue = [this.rootUrl]; const seen = new Set<string>(); this.discoveryFailures.length = 0; while (queue.length && seen.size < this.maxDirectories && files.length < this.maxFiles) { const batch: URL[] = []; while (queue.length && batch.length < Math.max(1, this.concurrency) && seen.size + batch.length < this.maxDirectories) { const directory = queue.shift()!; const key = directory.href; if (seen.has(key)) continue; seen.add(key); batch.push(directory); } const discovered = await Promise.all(batch.map(async directory => { const response = await this.request(directory); if (response.status === 404 || response.status === 403 || response.status >= 500) { this.discoveryFailures.push({ url: directory.href, relativePathPrefix: decodeURIComponent(directory.pathname.slice(this.rootUrl.pathname.length)).replace(/\/$/, ""), status: response.status, error: `HTTP source directory failed: ${response.status}` }); await this.releaseMetadataResponse(response); return { directories: [] as URL[], files: [] as SourceCandidate[] }; } if (!response.ok) throw new Error(`HTTP source directory failed: ${response.status}`); const html = (await this.readBounded(response)).toString("utf8"); const directories: URL[] = []; const found: SourceCandidate[] = []; for (const url of parseDirectory(html, directory)) { if (url.pathname.endsWith("/")) { directories.push(url); continue; } if (files.length + found.length >= this.maxFiles) break; const relativePath = decodeURIComponent(url.pathname.slice(this.rootUrl.pathname.length)); if (!safeRelative(relativePath) || isTemporaryName(path.basename(relativePath))) continue; const metadata = await this.fileMetadata(url); if (!metadata) continue; found.push({ relativePath, sourceRef: url.href, absolutePath: url.href, sizeBytes: Number.isFinite(metadata.length) ? metadata.length : 0, mtimeMs: Date.parse(metadata.lastModified ?? "") || 0, department: department(relativePath), contentType: metadata.contentType, etag: metadata.etag, lastModified: metadata.lastModified }); } return { directories, files: found }; })); for (const result of discovered) { queue.push(...result.directories); files.push(...result.files); } } this.discoveryFailures.sort((a, b) => a.url.localeCompare(b.url)); return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath)); }
  async open(candidate: SourceCandidate) { const url = new URL(candidate.sourceRef); const response = await this.request(url); if (response.status === 404 || response.status === 403) throw new Error(`HTTP source file unavailable: ${response.status}`); if (!response.ok) throw new Error(`HTTP source file failed: ${response.status}`); const length = Number(response.headers.get("content-length") ?? "0"); if (length > this.maxResponseBytes) throw new Error("HTTP response exceeds configured limit"); if (!response.body) throw new Error("HTTP source response has no body"); let total=0; const limit=this.maxResponseBytes; const bounded=Readable.fromWeb(response.body as any).pipe(new Transform({ transform(chunk,_encoding,callback){ total+=Buffer.byteLength(chunk); if(total>limit){ callback(new Error("HTTP response exceeds configured limit")); return; } callback(null,chunk); } })); return { stream: bounded, sizeBytes: Number.isFinite(length) ? length : 0 }; }
  async resolve(relativePath: string) { if(!safeRelative(relativePath)||isTemporaryName(path.basename(relativePath))) throw new Error("Invalid legacy source path"); const url=new URL(relativePath.split("/").map(encodeURIComponent).join("/"),this.rootUrl); if(!url.pathname.startsWith(this.rootUrl.pathname)) throw new Error("HTTP source path escaped root"); const metadata=await this.fileMetadata(url, false); if(!metadata) throw Error("HTTP source file unavailable"); return {relativePath,sourceRef:url.href,absolutePath:url.href,sizeBytes:Number.isFinite(metadata.length)?metadata.length:0,mtimeMs:Date.parse(metadata.lastModified??"")||0,department:department(relativePath),contentType:metadata.contentType,etag:metadata.etag,lastModified:metadata.lastModified}; }
}
export function createLegacySourceAdapter(): SourceAdapter { return (process.env.LEGACY_NOTICEBOARD_SOURCE ?? "filesystem").toLowerCase() === "http" ? new HttpDirectoryAdapter() : new FilesystemAdapter(process.env.LEGACY_NOTICEBOARD_ROOT ?? "/mnt/legacy-noticeboards/noticeboards"); }
