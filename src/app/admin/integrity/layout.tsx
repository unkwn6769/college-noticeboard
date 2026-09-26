import type { Metadata } from "next";

/**
 * These routes are client components, and `metadata` must be resolved on the
 * server. A thin server layout owns the document title, description and
 * indexing directive for the segment.
 */
export const metadata: Metadata = {
  title: "Integrity",
  description: "Reconcile noticeboard records against stored bytes.",
  robots: { index: false, follow: false },
};

export default function SegmentLayout({ children }: { children: React.ReactNode }) {
  return children;
}
