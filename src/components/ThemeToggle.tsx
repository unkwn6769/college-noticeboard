"use client";

import { useCallback, useEffect, useState } from "react";

export type ThemePreference = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "noticeboard.theme";

/**
 * Applies a preference to the document. Exported so the pre-paint inline
 * script in the root layout and this component cannot drift apart.
 */
export function applyTheme(preference: ThemePreference): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const dark =
    preference === "dark" ||
    (preference === "system" &&
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  root.dataset.theme = dark ? "dark" : "light";
  root.style.colorScheme = dark ? "dark" : "light";
}

function readStoredPreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {
    // Storage can be unavailable (private mode, blocked cookies). The theme
    // then simply follows the operating system.
  }
  return "system";
}

/**
 * Theme control.
 *
 * Light / Dark / System. The resolved theme is written to
 * `document.documentElement.dataset.theme` before first paint by the inline
 * script in the root layout, so there is no flash and no hydration mismatch;
 * this component only owns the user-facing control and keeps following the
 * operating system while the preference is "system".
 */
export default function ThemeToggle({ className }: { className?: string }) {
  const [preference, setPreference] = useState<ThemePreference>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setPreference(readStoredPreference());
    setMounted(true);
  }, []);

  useEffect(() => {
    if (preference !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [preference]);

  const choose = useCallback((next: ThemePreference) => {
    setPreference(next);
    applyTheme(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Non-fatal: the theme still applies for this page view.
    }
  }, []);

  const options: Array<{ value: ThemePreference; label: string }> = [
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
    { value: "system", label: "System" },
  ];

  if (!mounted) {
    // Same dimensions as the real control, so the header does not shift.
    return <span className={className} style={{ display: "inline-block", width: 36, height: 36 }} />;
  }

  return (
    <div
      className={`row row-2 no-print${className ? ` ${className}` : ""}`}
      role="group"
      aria-label="Colour theme"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="btn btn-ghost btn-icon btn-sm"
          aria-pressed={preference === option.value}
          onClick={() => choose(option.value)}
        >
          <span className="sr-only">{option.label} theme</span>
          <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {option.value === "light" ? (
              <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4" /></>
            ) : option.value === "dark" ? (
              <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
            ) : (
              <><rect x="2" y="4" width="20" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></>
            )}
          </svg>
        </button>
      ))}
    </div>
  );
}
