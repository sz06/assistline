import type * as React from "react";
import { cn } from "../lib/utils";

interface SidebarLink {
  label: string;
  href: string;
  icon?: React.ReactNode;
}

interface SidebarProps {
  links: SidebarLink[];
  activePath: string;
  onNavigate: (href: string) => void;
  header?: React.ReactNode;
  className?: string;
  /** Mobile overlay mode */
  isOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({
  links,
  activePath,
  onNavigate,
  header,
  className,
  isOpen,
  onClose,
}: SidebarProps) {
  const sidebarContent = (
    <aside
      className={cn(
        "flex h-screen w-48 flex-col border-r border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900",
        className,
      )}
    >
      {header && (
        <div className="flex h-16 items-center border-b border-gray-200 px-4 dark:border-gray-700">
          {header}
        </div>
      )}
      <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto">
        {links.map((link) => {
          const isActive = activePath === link.href;
          return (
            <button
              key={link.href}
              type="button"
              onClick={() => {
                onNavigate(link.href);
                onClose?.();
              }}
              className={cn(
                "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                  : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800",
              )}
            >
              {link.icon && (
                <span className="h-5 w-5 shrink-0">{link.icon}</span>
              )}
              {link.label}
            </button>
          );
        })}
      </nav>
    </aside>
  );

  return (
    <>
      {/* Desktop: static sidebar, always visible */}
      <div className="hidden md:flex">{sidebarContent}</div>

      {/* Mobile: overlay sidebar */}
      {isOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          {/* Backdrop */}
          <button
            type="button"
            className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
            onClick={onClose}
            aria-label="Close sidebar"
          />
          {/* Slide-in panel */}
          <div className="relative z-50 animate-in slide-in-from-left duration-200">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}
