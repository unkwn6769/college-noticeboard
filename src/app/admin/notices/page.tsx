import Link from "next/link";
import { listAdminNotices } from "@/src/lib/notices";

export const dynamic="force-dynamic";

export default async function AdminNoticesPage(){
  const notices=await listAdminNotices();
  return <><div className="actions" style={{justifyContent:"space-between",marginBottom:20}}><div><h1>Notices</h1><p className="muted">Create, edit and publish notices.</p></div><Link className="btn" href="/admin/notices/new">New notice</Link></div><section className="grid">{notices.map(n=><article className="card" key={n.id}><div className="meta">{n.status} · {n.author}{n.department ? ` · ${n.department.replace("-noticeboard", "")}` : ""}{n.is_pinned ? " · Pinned" : ""}</div><h2>{n.title}</h2>{n.category && <p className="muted">{n.category}</p>}<p className="muted">{String(n.body).slice(0,160)}{String(n.body).length>160?'…':''}</p><Link className="btn secondary" href={`/admin/notices/${n.id}`}>Open</Link></article>)}{notices.length===0&&<div className="card">No notices yet.</div>}</section></>
}
