import Link from "next/link";
import PublicNav from "@/src/components/PublicNav";
import PublicFooter from "@/src/components/PublicFooter";
import { getNotice } from "@/src/lib/notices";
import { notFound } from "next/navigation";

export const dynamic="force-dynamic";

function labelDepartment(value:string|null|undefined){return value?.replace("-noticeboard", "") ?? null;}

export default async function NoticePage({ params }: { params: Promise<{ id:string }> }) {
  const { id } = await params;
  const notice = await getNotice(id);
  if (!notice) notFound();
  const department = labelDepartment(notice.department);
  return <><PublicNav/><main className="container page public-page"><Link className="public-back-link" href="/#notices">← Latest notices</Link><article className="card public-notice-detail">
    <div className="public-notice-detail-meta">
      {notice.is_pinned && <span className="public-tag">Important</span>}
      {department && <span className="public-tag">{department}</span>}
      {notice.category && <span className="public-tag">{notice.category}</span>}
      <span className="public-notice-date">{notice.author} · {new Date(notice.published_at).toLocaleString()}</span>
    </div>
    <h1>{notice.title}</h1>
    <div className="notice-body">{notice.body}</div>
  </article></main><PublicFooter/></>
}
