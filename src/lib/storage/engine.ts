import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream, promises as fs, constants as fsConstants } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform, type Readable } from "node:stream";

export const STORAGE_ROOT = process.env.NOTICEBOARD_STORAGE_ROOT ?? "/srv/noticeboard";
const STORAGE_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type DiskPressure = "NORMAL" | "WARNING" | "RESTRICTED" | "EMERGENCY";

export function getDiskPressure(usagePercent: number): DiskPressure {
  if (usagePercent >= 95) return "EMERGENCY";
  if (usagePercent >= 90) return "RESTRICTED";
  if (usagePercent >= 80) return "WARNING";
  return "NORMAL";
}

function assertStorageKey(storageKey: string): void { if (!STORAGE_KEY_PATTERN.test(storageKey)) throw new Error("Invalid storage key"); }
function filesRoot(): string { return path.join(STORAGE_ROOT, "files"); }
function objectDir(key: string): string { return path.join(filesRoot(), key.slice(0, 2).toLowerCase(), key); }
function objectPath(key: string): string { return path.join(objectDir(key), "object"); }
function stagingDir(): string { return path.join(STORAGE_ROOT, "staging"); }
function quarantineObjectsDir(): string { return path.join(STORAGE_ROOT, "quarantine", "objects"); }
function quarantinePartialsDir(): string { return path.join(STORAGE_ROOT, "quarantine", "partials"); }
function quarantinePath(key: string): string { assertStorageKey(key); return path.join(quarantineObjectsDir(), `${key}.quarantined`); }

async function fsyncFile(filePath: string): Promise<void> { const h=await fs.open(filePath,fsConstants.O_RDONLY); try{await h.sync();}finally{await h.close();} }
async function fsyncDirectory(dir: string): Promise<void> { const h=await fs.open(dir,fsConstants.O_RDONLY); try{await h.sync();}finally{await h.close();} }
function assertInside(candidate: string, root: string): void { const c=path.resolve(candidate), r=path.resolve(root); if(c!==r&&!c.startsWith(`${r}${path.sep}`))throw new Error("Path escapes storage root"); }

async function ensureDir(dir: string): Promise<void> { await fs.mkdir(dir,{recursive:true}); const info=await fs.lstat(dir); if(!info.isDirectory())throw new Error("Storage path must be a directory"); }

async function assertNoSymlinkComponents(candidate: string, root: string): Promise<void> {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  assertInside(resolvedCandidate, resolvedRoot);

  const relative = path.relative(resolvedRoot, resolvedCandidate);
  let current = resolvedRoot;

  for (const component of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    const info = await fs.lstat(current);
    if (info.isSymbolicLink()) {
      throw new Error("Quarantine path must not contain symlink");
    }
  }
}

export class StorageEngine {
  async init(): Promise<void> { await Promise.all([ensureDir(filesRoot()),ensureDir(stagingDir()),ensureDir(quarantineObjectsDir()),ensureDir(quarantinePartialsDir()),ensureDir(path.join(STORAGE_ROOT,"tmp")),ensureDir(path.join(STORAGE_ROOT,"backups"))]); }
  createStorageKey(): string { const key=randomUUID(); assertStorageKey(key); return key; }
  async createStagingFile(): Promise<{uploadId:string;stagingPath:string}> { await this.init(); const uploadId=randomUUID(); const stagingPath=path.join(stagingDir(),`${uploadId}.partial`); assertInside(stagingPath,stagingDir()); return {uploadId,stagingPath}; }

  async getDiskStats(): Promise<{writable:boolean;usagePercent:number;pressure:DiskPressure;freeBytes:number;totalBytes:number}> {
    await this.init(); await fs.access(STORAGE_ROOT,fsConstants.W_OK); const stat=await fs.statfs(STORAGE_ROOT); const totalBytes=Number(stat.blocks)*Number(stat.bsize); const freeBytes=Number(stat.bavail)*Number(stat.bsize); const usedBytes=Math.max(0,totalBytes-freeBytes); const usagePercent=totalBytes>0?usedBytes/totalBytes*100:100; return {writable:true,usagePercent,pressure:getDiskPressure(usagePercent),freeBytes,totalBytes};
  }

  async assertUploadCapacity(expectedBytes:number|null, largeUploadBytes:number, reserveBytes:number):Promise<void>{ const stats=await this.getDiskStats(); if(stats.pressure==="EMERGENCY")throw new Error("Storage emergency: uploads are disabled"); if(stats.pressure==="RESTRICTED"&&expectedBytes!==null&&expectedBytes>largeUploadBytes)throw new Error("Storage restricted: large uploads are temporarily disabled"); if(expectedBytes!==null&&stats.freeBytes-expectedBytes<reserveBytes)throw new Error("Insufficient storage headroom"); }

  async writeStream(input:Readable|NodeJS.ReadableStream, stagingPath:string):Promise<{sizeBytes:number;sha256:string}>{ const root=path.resolve(stagingDir()); assertInside(stagingPath,root); const hash=createHash("sha256"); let sizeBytes=0; const source=input as AsyncIterable<Buffer|Uint8Array|string>; const transform=new Transform({transform(chunk,_enc,cb){try{const buf=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);sizeBytes+=buf.length;hash.update(buf);cb(null,buf);}catch(e){cb(e as Error);}}}); await pipeline(source,transform,createWriteStream(stagingPath,{flags:"wx",mode:0o600})); await fsyncFile(stagingPath); await fsyncDirectory(root); return {sizeBytes,sha256:hash.digest("hex")}; }

  async finalizeWrite(stagingPath:string,expectedSizeBytes:number,expectedSha256:string):Promise<{sizeBytes:number;sha256:string}>{ const root=path.resolve(stagingDir());assertInside(stagingPath,root);const info=await fs.lstat(stagingPath);if(!info.isFile())throw new Error("Staging path must be a regular file");if(info.size!==expectedSizeBytes)throw new Error("Staging file size mismatch");await fsyncFile(stagingPath);const hash=createHash("sha256");for await(const chunk of createReadStream(stagingPath))hash.update(chunk as Buffer);const sha256=hash.digest("hex");if(sha256!==expectedSha256)throw new Error("Staging file checksum mismatch");return {sizeBytes:info.size,sha256}; }

  async publish(storageKey:string,stagingPath:string):Promise<string>{ assertStorageKey(storageKey);const root=path.resolve(stagingDir());assertInside(stagingPath,root);const staged=await fs.lstat(stagingPath);if(!staged.isFile())throw new Error("Staging path must be a regular file");await ensureDir(filesRoot());const filesDirectory=path.resolve(filesRoot());const shard=path.join(filesDirectory,storageKey.slice(0,2).toLowerCase());await fs.mkdir(shard,{recursive:true});const shardInfo=await fs.lstat(shard);if(!shardInfo.isDirectory())throw new Error("Storage shard must be a directory");const dir=objectDir(storageKey);await fs.mkdir(dir);const target=objectPath(storageKey);await fsyncDirectory(filesDirectory);await fsyncDirectory(shard);await fs.rename(stagingPath,target);await fsyncDirectory(root);await fsyncDirectory(dir);return target; }

  async inspect(storageKey:string):Promise<{path:string;sizeBytes:number}>{assertStorageKey(storageKey);const target=objectPath(storageKey);const info=await fs.lstat(target);if(!info.isFile())throw new Error("Object must be a regular file");return {path:target,sizeBytes:info.size};}
  async openReadStream(storageKey:string){const info=await this.inspect(storageKey);return { ...info, stream:createReadStream(info.path)};}
  async verify(storageKey:string,size:number,sha256:string):Promise<boolean>{const info=await this.inspect(storageKey);if(info.sizeBytes!==size)return false;const hash=createHash("sha256");for await(const chunk of createReadStream(info.path))hash.update(chunk as Buffer);return hash.digest("hex")===sha256;}

  async quarantine(storageKey:string):Promise<string>{assertStorageKey(storageKey);await this.init();const source=objectPath(storageKey);const info=await fs.lstat(source);if(!info.isFile())throw new Error("Object must be a regular file");const target=quarantinePath(storageKey);await fs.rename(source,target);await fsyncDirectory(path.dirname(source));await fsyncDirectory(quarantineObjectsDir());return target;}
  async getQuarantinePath(storageKey:string):Promise<string>{return quarantinePath(storageKey);}
  async findQuarantineObject(storageKey:string):Promise<string|null>{assertStorageKey(storageKey);const target=quarantinePath(storageKey);try{const info=await fs.lstat(target);return info.isFile()?target:null;}catch(error){const code=error instanceof Error&&"code" in error?error.code:undefined;return code==="ENOENT"?null:Promise.reject(error);}}
  async quarantinePartial(stagingPath:string):Promise<string>{const root=path.resolve(stagingDir());assertInside(stagingPath,root);const info=await fs.lstat(stagingPath);if(!info.isFile())throw new Error("Staging path must be a regular file");const target=path.join(quarantinePartialsDir(),`${path.basename(stagingPath)}-${randomUUID()}`);await fs.rename(stagingPath,target);await fsyncDirectory(root);await fsyncDirectory(quarantinePartialsDir());return target;}
  async purgeQuarantine(pathname:string):Promise<void>{const root=path.resolve(path.join(STORAGE_ROOT,"quarantine"));const resolved=path.resolve(pathname);assertInside(resolved,root);const parent=path.dirname(resolved);await assertNoSymlinkComponents(parent,root);const info=await fs.lstat(resolved);if(!info.isFile())throw new Error("Quarantine path must be a regular file");await fs.unlink(resolved);await fsyncDirectory(parent);}
  async scanStaging():Promise<string[]>{await this.init();return fs.readdir(stagingDir());}
  async scanObjects():Promise<string[]>{await this.init();const objects:string[]=[];for(const shard of await fs.readdir(filesRoot(),{withFileTypes:true})){if(!shard.isDirectory()||!/^[0-9a-f]{2}$/i.test(shard.name))continue;const sd=path.join(filesRoot(),shard.name);for(const dir of await fs.readdir(sd,{withFileTypes:true})){if(!dir.isDirectory()||!STORAGE_KEY_PATTERN.test(dir.name))continue;const obj=path.join(sd,dir.name,"object");try{const info=await fs.lstat(obj);if(info.isFile())objects.push(obj);}catch(error){const code=error instanceof Error&&"code" in error?error.code:undefined;if(code!=="ENOENT")throw error;}}}return objects;}
}

let engine:StorageEngine|undefined;
export function getStorageEngine():StorageEngine{engine??=new StorageEngine();return engine;}
