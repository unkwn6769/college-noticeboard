"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  icon?: ReactNode;
  wide?: boolean;
  /** Hide the visual close button when the dialog must be resolved. */
  hideClose?: boolean;
};

/**
 * The single dialog implementation in the product.
 *
 * Radix supplies the parts that are genuinely hard to get right — focus
 * trapping, Escape to close, focus restoration to the trigger, scroll
 * locking, `aria-modal` and background inertness. Everything visual is this
 * project's own design system, so there is exactly one dialog look.
 *
 * On viewports below 560px the same element renders as a bottom sheet.
 */
export default function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  icon,
  wide = false,
  hideClose = false,
}: Props) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="dialog-overlay" />
        <DialogPrimitive.Content className={`dialog${wide ? " dialog-wide" : ""}`}>
          <div className="dialog-header">
            <div className="row row-3" style={{ alignItems: "flex-start" }}>
              {icon ? <span className="dialog-icon" aria-hidden="true">{icon}</span> : null}
              <div>
                <DialogPrimitive.Title className="dialog-title">{title}</DialogPrimitive.Title>
                {description ? (
                  <DialogPrimitive.Description className="dialog-description">
                    {description}
                  </DialogPrimitive.Description>
                ) : (
                  // Radix warns when a dialog has no description; keep one that
                  // is only read by assistive technology.
                  <DialogPrimitive.Description className="sr-only">
                    {title}
                  </DialogPrimitive.Description>
                )}
              </div>
            </div>
            {hideClose ? null : (
              <DialogPrimitive.Close className="dialog-close">
                <X aria-hidden="true" />
                <span className="sr-only">Close dialog</span>
              </DialogPrimitive.Close>
            )}
          </div>

          {children ? <div className="dialog-body">{children}</div> : null}
          {footer ? <div className="dialog-footer">{footer}</div> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
