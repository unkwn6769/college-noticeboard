import PublicNav from "@/src/components/PublicNav";
import PublicFooter from "@/src/components/PublicFooter";
import { Skeleton, SkeletonRegion } from "@/src/components/Skeleton";

// Scoped to /search on purpose: a loading boundary at a parent segment would
// also wrap notFound() routes below it, and a response that has already
// streamed a shell can no longer carry a 404 status.
export default function SearchLoading() {
  return (
    <>
      <PublicNav />
      <main className="page" id="main-content">
        <div className="container">
          <SkeletonRegion label="Searching the noticeboard, please wait.">
            <div className="search-hero">
              <Skeleton width={110} height={12} />
              <Skeleton width="min(28rem, 90%)" height={40} />
              <Skeleton width="min(38rem, 100%)" height={14} />
              <div className="search-form" style={{ marginTop: 24 }}>
                <Skeleton height={46} />
                <Skeleton width={120} height={46} />
              </div>
            </div>

            <div className="search-summary">
              <Skeleton width={220} height={18} />
              <Skeleton width={160} height={12} />
            </div>

            <section className="section">
              <Skeleton width={160} height={12} />
              <Skeleton width={220} height={24} />
              <div className="result-list" style={{ marginTop: 16 }}>
                {Array.from({ length: 4 }, (_, index) => (
                  <div className="result-card" key={index}>
                    <Skeleton width={30} height={30} circle />
                    <span className="result-main">
                      <Skeleton width="70%" height={15} />
                      <Skeleton width="100%" height={12} />
                      <Skeleton width="35%" height={11} />
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </SkeletonRegion>
        </div>
      </main>
      <PublicFooter />
    </>
  );
}
