import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import { mkdtemp, rm, stat, symlink, writeFile, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

const root = await mkdtemp(path.join(os.tmpdir(), "college-noticeboard-storage-"));

async function createEngine() {
  vi.resetModules();
  process.env.NOTICEBOARD_STORAGE_ROOT = root;
  const { StorageEngine } = await import("./engine");
  const engine = new StorageEngine();
  await engine.init();
  return engine;
}

describe("StorageEngine", () => {
  beforeEach(async () => { await rm(root, { recursive:true, force:true }); await (await import("node:fs/promises")).mkdir(root,{recursive:true}); });
  afterEach(() => { vi.resetModules(); });

  it("creates required storage directories", async () => {
    await createEngine();
    for(const p of ["files","staging","quarantine/objects","quarantine/partials","tmp","backups"]) await expect(stat(path.join(root,p))).resolves.toBeTruthy();
  });
  it("generates storage keys", async () => {
    const engine=await createEngine(); const a=engine.createStorageKey(); const b=engine.createStorageKey();
    expect(a).toMatch(/^[0-9a-f-]{36}$/i); expect(b).toMatch(/^[0-9a-f-]{36}$/i); expect(a).not.toBe(b);
  });
  it("streams and hashes", async () => { const e=await createEngine(); const s=await e.createStagingFile(); const r=await e.writeStream(Readable.from([Buffer.from("hello "),Buffer.from("college "),Buffer.from("noticeboard")]),s.stagingPath); expect(r.sizeBytes).toBe(25); expect(r.sha256).toBe("b2546767c1c0351ed60e3d2020bccbf8dd550d7e35270a0674bdf547641b6800"); });
  it("finalizes verified staging", async () => { const e=await createEngine(); const s=await e.createStagingFile(); const r=await e.writeStream(Readable.from([Buffer.from("finalize")]),s.stagingPath); await expect(e.finalizeWrite(s.stagingPath,r.sizeBytes,r.sha256)).resolves.toEqual(r); });
  it("rejects staging size mismatch", async () => { const e=await createEngine(); const s=await e.createStagingFile(); const r=await e.writeStream(Readable.from([Buffer.from("size")]),s.stagingPath); await expect(e.finalizeWrite(s.stagingPath,r.sizeBytes+1,r.sha256)).rejects.toThrow("Staging file size mismatch"); });
  it("rejects staging checksum mismatch", async () => { const e=await createEngine(); const s=await e.createStagingFile(); const r=await e.writeStream(Readable.from([Buffer.from("checksum")]),s.stagingPath); await expect(e.finalizeWrite(s.stagingPath,r.sizeBytes,"0".repeat(64))).rejects.toThrow("Staging file checksum mismatch"); });
  it("rejects staging symlink during finalize", async () => { const e=await createEngine(); const s=await e.createStagingFile(); const real=path.join(root,"real.partial"); await writeFile(real,"x"); await symlink(real,s.stagingPath); await expect(e.finalizeWrite(s.stagingPath,1,"invalid")).rejects.toThrow("Staging path must be a regular file"); });
  it("publishes atomically using storage-key sharding", async () => { const e=await createEngine(); const k="8b0c4e2b-1234-4567-89ab-cdef01234567"; const s=await e.createStagingFile(); const r=await e.writeStream(Readable.from([Buffer.from("content")]),s.stagingPath); const p=await e.publish(k,s.stagingPath); expect(p).toBe(path.join(root,"files","8b",k,"object")); await expect(stat(p)).resolves.toBeTruthy(); expect(await e.verify(k,r.sizeBytes,r.sha256)).toBe(true); });
  it("refuses overwrite", async () => { const e=await createEngine(); const k="11111111-1234-4123-8123-123456789abc"; const a=await e.createStagingFile(); await e.writeStream(Readable.from([Buffer.from("a")]),a.stagingPath); await e.publish(k,a.stagingPath); const b=await e.createStagingFile(); await e.writeStream(Readable.from([Buffer.from("b")]),b.stagingPath); await expect(e.publish(k,b.stagingPath)).rejects.toMatchObject({code:"EEXIST"}); await expect(stat(b.stagingPath)).resolves.toBeTruthy(); });
  it("allows distinct storage keys", async () => { const e=await createEngine(); const a=await e.createStagingFile(); await e.writeStream(Readable.from([Buffer.from("a")]),a.stagingPath); const b=await e.createStagingFile(); await e.writeStream(Readable.from([Buffer.from("b")]),b.stagingPath); const ka="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"; const kb="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"; await e.publish(ka,a.stagingPath); await e.publish(kb,b.stagingPath); await expect(e.verify(ka,1,createHash("sha256").update("a").digest("hex"))).resolves.toBe(true); await expect(e.verify(kb,1,createHash("sha256").update("b").digest("hex"))).resolves.toBe(true); });
  it("quarantines", async () => { const e=await createEngine(); const k="deadbeef-1234-4123-8123-123456789abc"; const s=await e.createStagingFile(); await e.writeStream(Readable.from([Buffer.from("q")]),s.stagingPath); await e.publish(k,s.stagingPath); const q=await e.quarantine(k); expect(q).toContain(`${k}.quarantined`); await expect(stat(q)).resolves.toBeTruthy(); });
  it("rejects quarantining symlink", async () => { const e=await createEngine(); const k="33333333-3333-4333-8333-333333333333"; const s=await e.createStagingFile(); await e.writeStream(Readable.from([Buffer.from("q")]),s.stagingPath); const p=await e.publish(k,s.stagingPath); const real=path.join(root,"real"); await writeFile(real,"q"); await unlink(p); await symlink(real,p); await expect(e.quarantine(k)).rejects.toThrow("Object must be a regular file"); });
  it("purges quarantine file and rejects symlinks", async () => { const e=await createEngine(); const k="feedface-1234-4123-8123-123456789abc"; const s=await e.createStagingFile(); await e.writeStream(Readable.from([Buffer.from("q")]),s.stagingPath); await e.publish(k,s.stagingPath); const q=await e.quarantine(k); await e.purgeQuarantine(q); await expect(stat(q)).rejects.toMatchObject({code:"ENOENT"}); const real=path.join(root,"quarantine","objects","real"); const link=path.join(root,"quarantine","objects","link"); await writeFile(real,"x"); await symlink(real,link); await expect(e.purgeQuarantine(link)).rejects.toThrow("Quarantine path must be a regular file"); });
  it("rejects quarantine purge through a symlinked parent", async () => { const e=await createEngine(); const outside=path.join(root,"outside"); const target=path.join(outside,"target"); const linkDir=path.join(root,"quarantine","objects","nested"); await (await import("node:fs/promises")).mkdir(outside,{recursive:true}); await writeFile(target,"outside-target"); await symlink(outside,linkDir); await expect(e.purgeQuarantine(path.join(linkDir,"target"))).rejects.toThrow("Quarantine path must not contain symlink"); await expect(stat(target)).resolves.toBeTruthy(); });
  it("scans staging and objects safely", async () => { const e=await createEngine(); const s=await e.createStagingFile(); await e.writeStream(Readable.from([Buffer.from("x")]),s.stagingPath); expect(await e.scanStaging()).toContain(path.basename(s.stagingPath)); const k="abcdef12-1234-4123-8123-123456789abc"; await e.publish(k,s.stagingPath); expect(await e.scanObjects()).toHaveLength(1); });
  it("classifies disk thresholds", async () => { const { getDiskPressure }=await import("./engine"); expect(getDiskPressure(79.9)).toBe("NORMAL"); expect(getDiskPressure(80)).toBe("WARNING"); expect(getDiskPressure(90)).toBe("RESTRICTED"); expect(getDiskPressure(95)).toBe("EMERGENCY"); });
});
