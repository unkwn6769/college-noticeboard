import Link from "next/link";

export default function PublicNav() {
  return (
    <header className="public-topbar">
      <div className="container public-topbar-inner">
        <Link className="public-brand-wrap" href="/">
          <span className="public-brand-mark" aria-hidden="true">CN</span>
          <span>
            <span className="public-brand">College Noticeboard</span>
            <span className="public-brand-subtitle">Official announcements</span>
          </span>
        </Link>
        <nav className="public-nav" aria-label="Primary navigation">
          <Link href="/">Home</Link>
          <Link href="/#notices">Notices</Link>
          <Link href="/departments">Departments</Link>
          <Link href="/search">Search</Link>
          <Link href="/login">Admin</Link>
        </nav>
      </div>
    </header>
  );
}
