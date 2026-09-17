import PublicNav from "@/src/components/PublicNav";
import { getNotice } from "@/src/lib/notices";
import { notFound } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function NoticePage({ params }: { params: Promise<{ id:string }> }) {
  const { id } = await params;
  const notice = await getNotice(id);
  if (!notice) notFound();
  return <><PublicNav/><main className="container page"><article className="card"><div className="meta">{notice.author} · {new Date(notice.published_at).toLocaleString()}</div><h1>{notice.title}</h1><div className="notice-body">{notice.body}</div></article></main></>;
}
