import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here=path.dirname(fileURLToPath(import.meta.url));

if(!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const client=new pg.Client({connectionString:process.env.DATABASE_URL});

await client.connect();

try{
  const dbDir=path.join(here,"..","db");
  const sqlFiles=(await readdir(dbDir,{withFileTypes:true}))
    .filter(entry=>entry.isFile() && /^\d+_.+\.sql$/i.test(entry.name))
    .map(entry=>entry.name)
    .sort();

  if(sqlFiles.length===0) throw new Error("No database SQL files found");

  await client.query("BEGIN");

  for(const name of sqlFiles){
    const sql=await readFile(path.join(dbDir,name),"utf8");
    console.log(`Applying ${name}`);
    await client.query(sql);
  }

  await client.query("COMMIT");
  console.log(`Initialized database foundation (${sqlFiles.length} SQL files)`);
}
catch(error){
  await client.query("ROLLBACK");
  throw error;
}
finally{
  await client.end();
}
