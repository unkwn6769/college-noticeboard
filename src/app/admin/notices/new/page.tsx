"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { DEPARTMENTS } from "@/src/lib/department-registry";

export default function NewNoticePage(){
  const router=useRouter();
  const [error,setError]=useState("");
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    const f=new FormData(e.currentTarget);
    const r=await fetch("/api/notices",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
      title:f.get("title"), body:f.get("body"), department:f.get("department"), category:f.get("category"), isPinned:f.get("isPinned") === "on"
    })});
    const d=await r.json();
    if(!r.ok){setError(d.error??"Create failed");return;}
    router.push(`/admin/notices/${d.id}`);
  }
  return <><h1>New notice</h1>{error&&<div className="alert">{error}</div>}<form className="form" onSubmit={submit}>
    <label>Title<input name="title" required/></label>
    <label>Department<select name="department" defaultValue=""><option value="">College-wide / general</option>{DEPARTMENTS.map(d=><option key={d.slug} value={d.slug}>{d.shortName} — {d.name}</option>)}</select></label>
    <label>Category<input name="category" maxLength={64} placeholder="Academic, event, examination..."/></label>
    <label className="checkbox-field"><input type="checkbox" name="isPinned"/> Mark as important / pinned</label>
    <label>Body<textarea name="body" required/></label>
    <div className="actions"><button className="btn">Create draft</button><a className="btn secondary" href="/admin/notices">Cancel</a></div>
  </form></>
}
