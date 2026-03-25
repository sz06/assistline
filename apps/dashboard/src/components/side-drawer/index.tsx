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
  if (!isOpen) return null;

  return (
    <div className={cn("fixed inset-0 z-40 md:hidden", className)}>
      {/* Backdrop */}
      <button
        type="button"
        className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-label="Close sidebar"
      />
      {/* Slide-in panel */}
      <div className="relative z-50 animate-in slide-in-from-left duration-200 h-full">
        {children}
      </div>
    </div>
  );
}
