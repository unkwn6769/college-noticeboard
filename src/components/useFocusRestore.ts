"use client";

import { useEffect, useRef } from "react";

/**
 * Restores focus to whatever had it before a modal surface opened.
 *
 * Both the drawer and the command palette are built on the Radix Dialog
 * primitive, but neither is opened by a `Dialog.Trigger`. Radix can only hand
 * focus back to a trigger it owns, so on close the focused element was
 * unmounted with the portal and the browser dropped focus onto `<body>`.
 * That is not merely untidy: a keyboard or screen-reader user who dismisses the
 * menu is then at the top of the document with no idea where they were, and
 * Tab restarts from the skip link.
 *
 * This hook captures `document.activeElement` on open and returns focus to it
 * on close, skipping elements that are no longer in the document (a link the
 * user followed, for example) so it can never throw focus onto a detached
 * node.
 */
export function useFocusRestore(open: boolean) {
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      if (!previouslyFocused.current) {
        const active = document.activeElement;
        previouslyFocused.current =
          active instanceof HTMLElement && active !== document.body ? active : null;
      }
      return;
    }
    const target = previouslyFocused.current;
    previouslyFocused.current = null;
    if (target && target.isConnected) target.focus();
  }, [open]);
}
