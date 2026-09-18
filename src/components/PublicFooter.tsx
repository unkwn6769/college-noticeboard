export default function PublicFooter() {
  return (
    <footer className="public-footer">
      <div className="container public-footer-inner">
        <div>
          <strong>College Noticeboard</strong>
          <p>Official notices, departmental resources and examination information.</p>
        </div>
        <div className="public-footer-links">
            <a href="/">Home</a>
            <a href="/#notices">Notices</a>
            <a href="/departments">Departments</a>
            <a href="/archive">Archive</a>
            <a href="/search">Search</a>
            <a href="/login">Admin</a>
          </div>
      </div>
    </footer>
  );
}
