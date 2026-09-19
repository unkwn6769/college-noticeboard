import { getDepartment } from "./department-registry";
export type ScannerCandidate={relativePath:string;absolutePath:string;sizeBytes:number;mtimeMs:number;department:string|null};
export type ScannerComparison="new"|"changed"|"unchanged"|"skipped";
export function classifyLegacyPath(value:string){return getDepartment(value.split("/")[0])?.slug??null;}
export function compareCandidate(c:ScannerCandidate,p?:{source_size_bytes:string|null;source_mtime_ms:string|null}):ScannerComparison{if(!c.department)return "skipped";if(!p)return "new";return Number(p.source_size_bytes)===c.sizeBytes&&Number(p.source_mtime_ms)===c.mtimeMs?"unchanged":"changed";}
export function needsVerification(comparison:ScannerComparison,status:string|undefined,verifiedAt:string|null|undefined,now:number,intervalMs:number){return comparison!=="unchanged"||!verifiedAt||(status!=="IMPORTED"&&status!=="OBSERVED")||now-Date.parse(verifiedAt)>=intervalMs;}
