"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Accessible name for the drawer; also used for the close button. */
  title: string;
  /** Which edge the panel is anchored to. */
  side?: "left" | "right";
  /** Brand/context content rendered left of the close button. */
  header?: ReactNode;
  children?: ReactNode;
  id?: string;
};

/**
 * The single side-drawer implementation in the product.
 *
 * Both the public header menu and the admin workspace menu render through
 * this component, so the product has exactly one modal implementation. The
 * behaviour that is genuinely hard to do correctly by hand — trapping Tab
 * inside the panel, moving focus in on open, restoring focus to the trigger on
 * close, Escape to dismiss, background inertness and scroll locking — is
 * delegated to the same Radix Dialog primitive that `Dialog.tsx` uses. What is
 * left is this project's own design system, so there is exactly one drawer
 * look and one drawer interaction model.
 *
 * Motion is deliberately one-directional: the panel slides in and is removed
 * on dismiss. A one-way transition is the restrained choice here, and it also
 * means the panel is never left mounted-but-inert in the tab order.
 */
export default function Drawer({
  open,
  onOpenChange,
  title,
  side = "right",
  header,
  children,
  id,
}: Props) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="drawer-overlay" />
        <DialogPrimitive.Content
          className={`drawer-panel${side === "left" ? " drawer-panel-left" : ""}`}
          id={id}
        >
          {/* The visible header already reads as a title, but Radix requires a
              programmatic one so the panel is announced correctly. */}
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>

          <div className="drawer-header">
            {header ? <div className="min-w-0">{header}</div> : <span />}
            <DialogPrimitive.Close className="btn btn-ghost btn-icon">
              <X aria-hidden="true" />
              <span className="sr-only">Close {title.toLowerCase()}</span>
            </DialogPrimitive.Close>
          </div>

          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
