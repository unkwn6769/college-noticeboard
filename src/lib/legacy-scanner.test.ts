import { describe, expect, it, vi } from "vitest";
import { classifyLegacyPath, compareCandidate, needsVerification } from "./legacy-scanner-core";
import { discoverLegacyFiles, previewLegacyScan, redactLegacySourceDetails, startLegacyScan } from "./legacy-scanner";
import { HttpDirectoryAdapter } from "./legacy-source-adapters";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { Readable } from "node:stream";
import { DEPARTMENTS } from "./department-registry";
describe("legacy scanner classification and comparison", () => {
  const candidate={relativePath:"cse-noticeboard/2026/a.pdf",absolutePath:"/source/cse-noticeboard/2026/a.pdf",sizeBytes:12,mtimeMs:100,department:"cse-noticeboard"};
  it("uses only exact registered top-level department slugs",()=>{expect(classifyLegacyPath(candidate.relativePath)).toBe("cse-noticeboard");expect(classifyLegacyPath("CSIT/file.pdf")).toBeNull();expect(classifyLegacyPath("unknown/file.pdf")).toBeNull();});
  it("classifies all 15 registered departments including CSIT",()=>{for(const d of DEPARTMENTS)expect(classifyLegacyPath(`${d.slug}/resource.pdf`)).toBe(d.slug);});
  it("recognizes new, unchanged, changed, and unclassifiable resources",()=>{expect(compareCandidate(candidate)).toBe("new");expect(compareCandidate(candidate,{source_size_bytes:"12",source_mtime_ms:"100"})).toBe("unchanged");expect(compareCandidate({...candidate,mtimeMs:101},{source_size_bytes:"12",source_mtime_ms:"100"})).toBe("changed");expect(compareCandidate({...candidate,department:null})).toBe("skipped");});
  it("eventually verifies same-size same-mtime resources",()=>{expect(needsVerification("unchanged","IMPORTED","2020-01-01T00:00:00Z",Date.now(),1)).toBe(true);});
  it("discovers nested regular files without following symlinks",async()=>{const root=await mkdtemp(path.join(os.tmpdir(),"legacy-scanner-"));try{await mkdir(path.join(root,"cse-noticeboard","2026"),{recursive:true});await writeFile(path.join(root,"cse-noticeboard","2026","a.txt"),"ok");await symlink(path.join(root,"cse-noticeboard","2026","a.txt"),path.join(root,"cse-noticeboard","link.txt"));const found=await discoverLegacyFiles(root);expect(found.map(f=>f.relativePath)).toEqual(["cse-noticeboard/2026/a.txt"]);}finally{await rm(root,{recursive:true,force:true});}});
  it("rejects encoded traversal in resolved source paths",async()=>{
    const adapter=new HttpDirectoryAdapter({rootUrl:"http://example.test/noticeboards/"});
    await expect(adapter.resolve("cse-noticeboard/%2e%2e/out.txt")).rejects.toThrow("Invalid legacy source path");
  });
  it("retries transient HTTP fetch failures",async()=>{
    const originalFetch=globalThis.fetch; let calls=0;
    globalThis.fetch=vi.fn(async()=>{calls+=1;if(calls===1)throw new Error("temporary network failure");return new Response("",{status:200,headers:{"content-type":"text/html"}});});
    try{const adapter=new HttpDirectoryAdapter({rootUrl:"http://example.test/noticeboards/"});await expect(adapter.discover()).resolves.toEqual([]);expect(calls).toBe(2);}finally{globalThis.fetch=originalFetch;}
  });
  it("decodes IIS ampersand entities and records inaccessible directories",async()=>{
    const originalFetch=globalThis.fetch;
    globalThis.fetch=vi.fn(async(input)=>{
      const url=new URL(String(input));
      if(url.pathname.endsWith("/bad/")) return new Response("bad",{status:400});
      if(url.pathname.endsWith("/cse-noticeboard/")) return new Response('<a href="a%20%26%20b.txt">a</a><a href="bad/">bad</a>',{status:200,headers:{"content-type":"text/html"}});
      if(url.pathname.endsWith("/noticeboards/")) return new Response('<a href="cse-noticeboard/">cse</a><a href="bad/">bad</a>',{status:200,headers:{"content-type":"text/html"}});
      return new Response("ok",{status:200,headers:{"content-length":"2","content-type":"text/plain"}});
    });
    try{
      const adapter=new HttpDirectoryAdapter({rootUrl:"http://example.test/noticeboards/"});
      const found=await adapter.discover();
      expect(found.map(file=>file.relativePath)).toEqual(["cse-noticeboard/a & b.txt"]);
      expect(adapter.discoveryFailures).toEqual(expect.arrayContaining([
        {url:"http://example.test/noticeboards/bad/",relativePathPrefix:"bad",status:400,error:"HTTP source directory failed: 400"},
        {url:"http://example.test/noticeboards/cse-noticeboard/bad/",relativePathPrefix:"cse-noticeboard/bad",status:400,error:"HTTP source directory failed: 400"},
      ]));
    }finally{globalThis.fetch=originalFetch;}
  });
  it("rejects import without a server-validated preview approval",async()=>{
    await expect(startLegacyScan("00000000-0000-0000-0000-000000000000","IMPORT","not-a-valid-approval")).rejects.toThrow(/preview approval/i);
  });
  it("previews candidates using only read queries",async()=>{
    const queries:string[]=[];
    const db={query:vi.fn(async(sql:string)=>{queries.push(sql);return {rows:[]};})} as unknown as NonNullable<Parameters<typeof previewLegacyScan>[0]>["db"];
    const adapter={discoveryFailures:[],discover:async()=>[{relativePath:"cse-noticeboard/a.txt",absolutePath:"/source/a.txt",sourceRef:"http://example.test/a.txt",sizeBytes:4,mtimeMs:1,department:"cse-noticeboard"}],open:async()=>({stream:Readable.from(["data"]),sizeBytes:4}),resolve:async()=>{throw new Error("not used");}};
    const preview=await previewLegacyScan({adapter,db});
    expect(preview.counts).toMatchObject({discovered:1,new:1,changed:0,duplicate:0,invalid:0,failed:0});
    expect(queries).toHaveLength(2);
    expect(queries.every((sql)=>sql.trimStart().startsWith("SELECT"))).toBe(true);
    expect(queries.some((sql)=>/INSERT|UPDATE|DELETE|audit/i.test(sql))).toBe(false);
  });
});

describe("legacy source detail redaction", () => {
  it("removes the configured source root from a recorded message", () => {
    // This is the exact shape a real SUCCEEDED run stored: the HTTP adapter put
    // the absolute source URL into legacy_scanner_runs.error_message, and the
    // scanner screen rendered it verbatim.
    const stored =
      "http://10.24.14.231/noticeboards/csit-noticeboard/ [500]: HTTP source directory failed: 500; " +
      "http://10.24.14.231/noticeboards/it-noticeboard/2023-24/General/ [400]: HTTP source directory failed: 400";
    const redacted = redactLegacySourceDetails(stored)!;
    expect(redacted).not.toMatch(/10\.24\.14\.231/);
    expect(redacted).not.toMatch(/https?:/);
    // The diagnostic value is untouched: which location, and what happened.
    expect(redacted).toContain("csit-noticeboard/ [500]");
    expect(redacted).toContain("HTTP source directory failed: 500");
    expect(redacted).toContain("it-noticeboard/2023-24/General/ [400]");
  });

  it("removes the mount point from filesystem-sourced messages", () => {
    const redacted = redactLegacySourceDetails(
      "/mnt/legacy-noticeboards/noticeboards/cse-noticeboard/2026/a.pdf: Legacy source must be a regular file",
    )!;
    expect(redacted).not.toContain("/mnt/legacy-noticeboards");
    expect(redacted).toContain("cse-noticeboard/2026/a.pdf");
  });

  it("strips scheme and authority from any other absolute URL", () => {
    const redacted = redactLegacySourceDetails(
      "redirected to https://legacy.internal.example:8080/noticeboards/x/ [403]: failed",
    )!;
    expect(redacted).not.toMatch(/legacy\.internal\.example/);
    expect(redacted).toContain("/noticeboards/x/ [403]: failed");
  });

  it("leaves messages with no source details exactly as they are", () => {
    for (const message of [
      "Scanner lease expired",
      "HTTP source stream timed out after 120000ms",
      "A scanner run is already active",
    ]) {
      expect(redactLegacySourceDetails(message)).toBe(message);
    }
  });

  it("preserves the null and empty cases the status payload depends on", () => {
    expect(redactLegacySourceDetails(null)).toBeNull();
    expect(redactLegacySourceDetails(undefined)).toBeNull();
    expect(redactLegacySourceDetails("")).toBe("");
  });
});
