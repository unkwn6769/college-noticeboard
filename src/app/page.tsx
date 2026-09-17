import PublicNav from "@/src/components/PublicNav";
import { listPublishedNotices } from "@/src/lib/notices";
export const dynamic = "force-dynamic";
export default async function HomePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const notices = await listPublishedNotices(q);
  return <><PublicNav/><main className="container page"><section className="hero"><h1>College Noticeboard</h1><p className="muted">Official notices, updates and documents.</p></section><form className="search"><input name="q" defaultValue={q} placeholder="Search notices"/><button className="btn">Search</button></form><section className="grid">{notices.map((n)=><article className="card" key={n.id}><div className="meta">{n.author} · {new Date(n.published_at).toLocaleString()}</div><h2><a href={`/notices/${n.id}`}>{n.title}</a></h2><p className="muted">{String(n.body).slice(0,180)}{String(n.body).length>180?'…':''}</p></article>)}{notices.length===0&&<div className="card"><h2>No notices found</h2><p className="muted">Try a different search.</p></div>}</section></main></>;
}
