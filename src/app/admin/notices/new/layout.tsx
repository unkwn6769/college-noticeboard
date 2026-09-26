import type { Metadata } from "next";

/**
 * These routes are client components, and `metadata` must be resolved on the
 * server. A thin server layout owns the document title, description and
 * indexing directive for the segment.
 */
export const metadata: Metadata = {
  title: "New notice",
  description: "Create a draft notice for the college noticeboard.",
  robots: { index: false, follow: false },
};

export default function SegmentLayout({ children }: { children: React.ReactNode }) {
  return children;
}
