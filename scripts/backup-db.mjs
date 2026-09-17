import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
if(!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const root=process.env.NOTICEBOARD_STORAGE_ROOT??"/srv/noticeboard";
const retention=Number(process.env.DB_BACKUP_RETENTION_DAYS??14);
const dir=path.join(root,"backups"); await mkdir(dir,{recursive:true});
const stamp=new Date().toISOString().replaceAll(":","-").replaceAll(".","-");
const output=path.join(dir,`postgres-${stamp}.dump`);
function run(command,args){return new Promise((resolve,reject)=>{const child=spawn(command,args,{stdio:"inherit"});child.on("exit",code=>code===0?resolve():reject(new Error(`${command} exited with ${code}`)));});}
await run("pg_dump",["--format=custom","--compress=6","--file",output,process.env.DATABASE_URL]);
await run("pg_restore",["--list",output]);
for(const name of await readdir(dir)){if(!name.startsWith("postgres-")||!name.endsWith(".dump"))continue;const full=path.join(dir,name);const info=await stat(full);if((Date.now()-info.mtimeMs)/86400000>retention)await unlink(full);}
console.log(`Backup verified: ${output}`);
