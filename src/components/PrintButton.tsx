"use client";

import { Printer } from "lucide-react";

type Props = {
  label?: string;
  className?: string;
};

/**
 * Print action for the reading view. Uses the browser's own print pipeline so
 * the stylesheet in `src/styles/print.css` is what the operator gets: chrome
 * removed, document measure preserved, in-page links expanded.
 */
export default function PrintButton({ label = "Print", className }: Props) {
  return (
    <button
      type="button"
      className={`btn btn-secondary btn-sm no-print${className ? ` ${className}` : ""}`}
      onClick={() => {
        if (typeof window === "undefined") return;
        window.print();
      }}
    >
      <Printer aria-hidden="true" />
      {label}
    </button>
  );
}
