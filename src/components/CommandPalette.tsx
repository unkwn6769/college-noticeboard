"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { CornerDownLeft, Search, X } from "lucide-react";

export type PaletteCommand = {
  id: string;
  label: string;
  group: string;
  hint?: string;
  keywords?: string;
  run: () => void;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commands: PaletteCommand[];
  placeholder?: string;
};

function score(command: PaletteCommand, query: string): number {
  if (!query) return 1;
  const needle = query.toLowerCase();
  const label = command.label.toLowerCase();
  if (label === needle) return 100;
  if (label.startsWith(needle)) return 80;
  if (label.includes(needle)) return 60;
  const keywords = command.keywords?.toLowerCase() ?? "";
  if (keywords.includes(needle)) return 35;
  const group = command.group.toLowerCase();
  if (group.includes(needle)) return 20;
  return 0;
}

/**
 * Keyboard-first navigation.
 *
 * Opened with ⌘K / Ctrl+K, or with `/` when focus is not already inside a
 * text field. Full arrow-key traversal, Enter to run, Escape to dismiss.
 *
 * Like every other modal surface in the product it is built on the shared
 * Radix Dialog primitive, so Tab is trapped inside the palette, the page
 * behind it is inert, the body scroll is locked and focus is returned to
 * whatever opened it. `onOpenAutoFocus` is overridden only to put the caret in
 * the input; everything else is the primitive's own behaviour.
 */
export default function CommandPalette({ open, onOpenChange, commands, placeholder }: Props) {
  const listId = useId();
  const titleId = useId();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
  }, [open]);

  const results = useMemo(() => {
    return commands
      .map((command) => ({ command, weight: score(command, query.trim()) }))
      .filter((entry) => entry.weight > 0)
      .sort((a, b) => b.weight - a.weight)
      .map((entry) => entry.command);
  }, [commands, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const node = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    node?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  const activate = useCallback(
    (command: PaletteCommand | undefined) => {
      if (!command) return;
      onOpenChange(false);
      command.run();
    },
    [onOpenChange],
  );

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (results.length === 0 ? 0 : (current + 1) % results.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) =>
        results.length === 0 ? 0 : (current - 1 + results.length) % results.length,
      );
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(Math.max(0, results.length - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      activate(results[activeIndex]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onOpenChange(false);
    }
  }

  let lastGroup: string | null = null;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="palette-overlay no-print" />
        <DialogPrimitive.Content
          className="palette"
          aria-label="Command palette"
          aria-labelledby={titleId}
          onOpenAutoFocus={(event) => {
            // Put the caret in the search field rather than the panel itself.
            event.preventDefault();
            inputRef.current?.focus();
          }}
          onKeyDown={onKeyDown}
        >
          <DialogPrimitive.Title id={titleId} className="sr-only">
            Command palette
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Search for a section or an action, then press Enter to open it.
          </DialogPrimitive.Description>

          <div className="palette-input-wrap">
            <Search aria-hidden="true" />
            <input
              ref={inputRef}
              className="palette-input"
              value={query}
              placeholder={placeholder ?? "Type a command or search…"}
              aria-label="Command palette search"
              aria-controls={listId}
              aria-activedescendant={
                results[activeIndex] ? `${listId}-${results[activeIndex].id}` : undefined
              }
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button
              type="button"
              className="dialog-close"
              onClick={() => onOpenChange(false)}
            >
              <X aria-hidden="true" />
              <span className="sr-only">Close command palette</span>
            </button>
          </div>

          {results.length === 0 ? (
            <p className="palette-empty" role="status" aria-live="polite">
              No commands match “{query.trim()}”.
            </p>
          ) : (
            <ul
              className="palette-list"
              id={listId}
              ref={listRef}
              role="listbox"
              aria-label="Commands"
            >
              {results.map((command, index) => {
                const showGroup = command.group !== lastGroup;
                lastGroup = command.group;
                return (
                  <li key={command.id} role="none">
                    {showGroup ? (
                      <p className="palette-group-label" role="presentation">
                        {command.group}
                      </p>
                    ) : null}
                    <button
                      type="button"
                      id={`${listId}-${command.id}`}
                      role="option"
                      aria-selected={index === activeIndex}
                      data-active={index === activeIndex}
                      className="palette-item"
                      onMouseMove={() => setActiveIndex(index)}
                      onClick={() => activate(command)}
                    >
                      <CommandGlyph group={command.group} />
                      <span className="palette-item-label">{command.label}</span>
                      {command.hint ? (
                        <span className="palette-item-hint">{command.hint}</span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="palette-footer">
            <span>
              <span className="kbd">↑</span>
              <span className="kbd">↓</span> to navigate
            </span>
            <span>
              <span className="kbd">
                <CornerDownLeft style={{ width: 11, height: 11 }} aria-hidden="true" />
              </span>
              to open
            </span>
            <span>
              <span className="kbd">esc</span> to dismiss
            </span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function CommandGlyph({ group }: { group: string }) {
  if (group === "Navigate") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m9 18 6-6-6-6" />
      </svg>
    );
  }
  if (group === "Create") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 12h14M12 5v14" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

/**
 * Global shortcut wiring. `/` is deliberately ignored while the operator is
 * typing in a field or a dialog is open, so it can never steal a keystroke.
 */
export function useCommandPaletteShortcuts(
  setOpen: (open: boolean) => void,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen(true);
        return;
      }
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const tag = target.tagName;
      if (target.isContentEditable) return;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (document.querySelector("[role='dialog'][aria-modal='true']")) return;
      event.preventDefault();
      setOpen(true);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setOpen, enabled]);
}
