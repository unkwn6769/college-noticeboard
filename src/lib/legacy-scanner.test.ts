import { describe, expect, it } from "vitest";
import { classifyLegacyPath, compareCandidate, needsVerification } from "./legacy-scanner-core";
import { discoverLegacyFiles } from "./legacy-scanner";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { DEPARTMENTS } from "./department-registry";
describe("legacy scanner classification and comparison", () => {
  const candidate={relativePath:"cse-noticeboard/2026/a.pdf",absolutePath:"/source/cse-noticeboard/2026/a.pdf",sizeBytes:12,mtimeMs:100,department:"cse-noticeboard"};
  it("uses only exact registered top-level department slugs",()=>{expect(classifyLegacyPath(candidate.relativePath)).toBe("cse-noticeboard");expect(classifyLegacyPath("CSIT/file.pdf")).toBeNull();expect(classifyLegacyPath("unknown/file.pdf")).toBeNull();});
  it("classifies all 15 registered departments including CSIT",()=>{for(const d of DEPARTMENTS)expect(classifyLegacyPath(`${d.slug}/resource.pdf`)).toBe(d.slug);});
  it("recognizes new, unchanged, changed, and unclassifiable resources",()=>{expect(compareCandidate(candidate)).toBe("new");expect(compareCandidate(candidate,{source_size_bytes:"12",source_mtime_ms:"100"})).toBe("unchanged");expect(compareCandidate({...candidate,mtimeMs:101},{source_size_bytes:"12",source_mtime_ms:"100"})).toBe("changed");expect(compareCandidate({...candidate,department:null})).toBe("skipped");});
  it("eventually verifies same-size same-mtime resources",()=>{expect(needsVerification("unchanged","IMPORTED","2020-01-01T00:00:00Z",Date.now(),1)).toBe(true);});
  it("discovers nested regular files without following symlinks",async()=>{const root=await mkdtemp(path.join(os.tmpdir(),"legacy-scanner-"));try{await mkdir(path.join(root,"cse-noticeboard","2026"),{recursive:true});await writeFile(path.join(root,"cse-noticeboard","2026","a.txt"),"ok");await symlink(path.join(root,"cse-noticeboard","2026","a.txt"),path.join(root,"cse-noticeboard","link.txt"));const found=await discoverLegacyFiles(root);expect(found.map(f=>f.relativePath)).toEqual(["cse-noticeboard/2026/a.txt"]);}finally{await rm(root,{recursive:true,force:true});}});
});
