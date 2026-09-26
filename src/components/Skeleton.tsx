type SkeletonProps = {
  width?: string | number;
  height?: string | number;
  circle?: boolean;
  className?: string;
};

/** A single shimmer block. Always paired with an accessible status message. */
export function Skeleton({ width, height = 12, circle = false, className }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={`skeleton${circle ? " skeleton-circle" : ""}${className ? ` ${className}` : ""}`}
      style={{
        display: "block",
        width: width ?? "100%",
        height,
        borderRadius: circle ? "50%" : undefined,
      }}
    />
  );
}

/**
 * Wraps a skeleton layout in a live region so assistive technology is told
 * the content is loading, and so the announcement happens once per route.
 */
export function SkeletonRegion({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className} role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

export function SkeletonText({ lines = 3, lastWidth = "60%" }: { lines?: number; lastWidth?: string }) {
  return (
    <div className="stack stack-2" aria-hidden="true">
      {Array.from({ length: Math.max(1, lines) }, (_, index) => (
        <Skeleton
          key={index}
          height={12}
          width={index === Math.max(1, lines) - 1 ? lastWidth : "100%"}
        />
      ))}
    </div>
  );
}

export function SkeletonNoticeList({ count = 4 }: { count?: number }) {
  return (
    <div className="notice-list">
      {Array.from({ length: count }, (_, index) => (
        <div className="notice-card" key={index} aria-hidden="true">
          <div className="notice-card-main">
            <Skeleton width={120} height={16} />
            <Skeleton width="100%" height={14} />
            <Skeleton width={lastWidthFor(index)} height={14} />
          </div>
          <Skeleton width={90} height={32} />
        </div>
      ))}
    </div>
  );
}

function lastWidthFor(index: number): string {
  return index % 2 === 0 ? "72%" : "55%";
}

export function SkeletonTable({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="stack stack-4" aria-hidden="true">
      {Array.from({ length: rows }, (_, rowIndex) => (
        <div
          className="row"
          key={rowIndex}
          style={{ alignItems: "center", gap: 16, padding: "4px 0" }}
        >
          {Array.from({ length: columns }, (_, columnIndex) => (
            <Skeleton
              key={columnIndex}
              height={12}
              width={columnIndex === 0 ? "30%" : columnIndex === columns - 1 ? "12%" : "16%"}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonMetrics({ count = 4 }: { count?: number }) {
  return (
    <div className="metric-grid" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div className="metric" key={index}>
          <Skeleton width="55%" height={11} />
          <Skeleton width="40%" height={26} />
          <Skeleton width="70%" height={10} />
        </div>
      ))}
    </div>
  );
}
