"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

type Props = {
  /** Absolute URL to place on the clipboard. */
  value?: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
  variant?: "button" | "icon";
};

function absoluteUrl(value?: string): string {
  if (value) return value;
  if (typeof window === "undefined") return "";
  return window.location.href;
}

/**
 * Copy-to-clipboard with an explicit, announced confirmation.
 *
 * Falls back to a hidden textarea plus `execCommand` where the async
 * Clipboard API is unavailable (non-secure origins), so the action still
 * works on an internal HTTP deployment.
 */
export default function CopyButton({
  value,
  label = "Copy link",
  copiedLabel = "Copied",
  className,
  variant = "button",
}: Props) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const copy = useCallback(async () => {
    const text = absoluteUrl(value);
    if (!text) return;

    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch {
      ok = false;
    }

    if (!ok) {
      try {
        const area = document.createElement("textarea");
        area.value = text;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        ok = document.execCommand("copy");
        document.body.removeChild(area);
      } catch {
        ok = false;
      }
    }

    setFailed(!ok);
    setCopied(ok);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setCopied(false);
      setFailed(false);
    }, 2000);
  }, [value]);

  const icon = copied ? (
    <Check aria-hidden="true" />
  ) : (
    <Copy aria-hidden="true" />
  );

  if (variant === "icon") {
    return (
      <button
        type="button"
        className={`btn btn-ghost btn-icon btn-sm no-print${className ? ` ${className}` : ""}`}
        onClick={() => void copy()}
      >
        {icon}
        <span className="sr-only" role="status">
          {copied ? "Link copied to clipboard" : failed ? "Copying failed" : label}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`btn btn-secondary no-print${className ? ` ${className}` : ""}`}
      onClick={() => void copy()}
      aria-live="polite"
    >
      {icon}
      {copied ? copiedLabel : failed ? "Copy failed" : label}
    </button>
  );
}
