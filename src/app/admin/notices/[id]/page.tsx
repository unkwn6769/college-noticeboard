"use client";
import { useEffect,useState } from "react";
import { useParams } from "next/navigation";
import { DEPARTMENTS } from "@/src/lib/department-registry";

type NoticeState={title:string;body:string;department:string|null;category:string|null;is_pinned:boolean;status:string};

export default function EditNoticePage(){
  const params=useParams<{id:string}>();

  const [notice,setNotice]=useState<NoticeState|null>(null);
  const [error,setError]=useState("");
  useEffect(()=>{fetch(`/api/notices/${params.id}`).then(r=>r.json()).then(d=>{if(d.notice)setNotice(d.notice);else setError(d.error??"Not found")});},[params.id]);
  if(error)return <div className="alert">{error}</div>;
  if(!notice)return <p>Loading…</p>;
  async function save(){
if(!notice)return;
const current=notice;
const r=await fetch(`/api/notices/${params.id}`,{
method:"PATCH",
headers:{"Content-Type":"application/json"},
body:JSON.stringify({
title:current.title,
body:current.body,
department:current.department,
category:current.category,
isPinned:current.is_pinned
})
});
if(!r.ok){
const d=await r.json();
setError(d.error??"Save failed");
return;
}
window.location.reload();
}
  async function act(action:string){const r=await fetch(`/api/notices/${params.id}/${action}`,{method:"POST"});if(!r.ok){const d=await r.json();setError(d.error??"Operation failed");return;}const x=await fetch(`/api/notices/${params.id}`);const d=await x.json();setNotice(d.notice);}
  return <><div className="actions" style={{justifyContent:"space-between"}}><div><h1>Edit notice</h1><div className="meta">Status: {notice.status}{notice.is_pinned ? " · Pinned" : ""}</div></div><a className="btn secondary" href="/admin/notices">Back</a></div>{error&&<div className="alert">{error}</div>}<div className="form">
    <label>Title<input value={notice.title} onChange={e=>setNotice({...notice,title:e.target.value})}/></label>
    <label>Department<select value={notice.department??""} onChange={e=>setNotice({...notice,department:e.target.value||null})}><option value="">College-wide / general</option>{DEPARTMENTS.map(d=><option key={d.slug} value={d.slug}>{d.shortName} — {d.name}</option>)}</select></label>
    <label>Category<input value={notice.category??""} maxLength={64} onChange={e=>setNotice({...notice,category:e.target.value||null})}/></label>
    <label className="checkbox-field"><input type="checkbox" checked={notice.is_pinned} onChange={e=>setNotice({...notice,is_pinned:e.target.checked})}/> Mark as important / pinned</label>
    <label>Body<textarea value={notice.body} onChange={e=>setNotice({...notice,body:e.target.value})}/></label>
    <div className="actions"><button className="btn" onClick={save}>Save</button><button className="btn secondary" onClick={()=>act("publish")}>Publish</button><button className="btn danger" onClick={()=>act("archive")}>Archive</button></div>
  </div></>
}
