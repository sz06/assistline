import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { cn } from "@repo/ui";
import type * as React from "react";

export interface SidedrawerProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}

export function Sidedrawer({
  isOpen,
  onClose,
  children,
  className,
}: SidedrawerProps) {
  return (
    <BaseDialog.Root open={isOpen} onOpenChange={onClose}>
      <BaseDialog.Portal>
        {/* Backdrop: Glassmorphic blur with fade transition */}
        <BaseDialog.Backdrop
          className={cn(
            "fixed inset-0 z-40 bg-black/60 backdrop-blur-md",
            "transition-opacity duration-300",
            "data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 md:hidden",
          )}
        />

        {/* Slide-in panel: Elevated, premium glassmorphic surface */}
        <BaseDialog.Popup
          className={cn(
            "fixed left-0 top-0 bottom-0 z-50 h-full w-72 max-w-[85vw]",
            "bg-white/95 dark:bg-gray-950/95 backdrop-blur-xl",
            "border-r border-gray-200/50 dark:border-gray-800/50 shadow-2xl",
            "transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
            "data-[starting-style]:-translate-x-full data-[ending-style]:-translate-x-full",
            "md:hidden", // Hide on desktop to avoid rendering if incorrectly opened
            className,
          )}
        >
          {children}
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}
