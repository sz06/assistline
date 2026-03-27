import { cn, Input } from "@repo/ui";
import { ChevronDown, Search } from "lucide-react";
import * as React from "react";

export interface SidebarLink {
  label: string;
  href: string;
  icon?: React.ReactNode;
}

export interface SidebarGroupData {
  title?: string;
  links: SidebarLink[];
  defaultExpanded?: boolean;
}

export interface SidebarProps {
  groups: SidebarGroupData[];
  activePath: string;
  onNavigate: (href: string) => void;
  header?: React.ReactNode;
  className?: string;
  /**
   * Called when a link is clicked.
   * Useful for closing the parent Sidedrawer on mobile.
   */
  onLinkClick?: () => void;
}

export function Sidebar({
  groups,
  activePath,
  onNavigate,
  header,
  className,
  onLinkClick,
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = React.useState("");

  // Filter groups based on search query
  const filteredGroups = React.useMemo(() => {
    if (!searchQuery.trim()) return groups;
    const query = searchQuery.toLowerCase();

    return groups
      .map((group) => ({
        ...group,
        links: group.links.filter((link) =>
          link.label.toLowerCase().includes(query),
        ),
      }))
      .filter((group) => group.links.length > 0);
  }, [groups, searchQuery]);

  return (
    <aside
      className={cn(
        "flex h-screen w-full flex-col border-r border-gray-200/60 bg-white/60 backdrop-blur-xl dark:border-gray-800/60 dark:bg-gray-950/60",
        className,
      )}
    >
      {header && (
        <div className="flex h-16 items-center border-b border-gray-200 px-4 dark:border-gray-700 shrink-0">
          {header}
        </div>
      )}

      <div className="px-3 pt-3 pb-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
          <Input
            type="text"
            placeholder="Search menu..."
            className="pl-9 h-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <nav className="flex-1 space-y-4 py-2 overflow-y-auto">
        {filteredGroups.map((group, idx) => (
          <SidebarNavGroup
            // biome-ignore lint/suspicious/noArrayIndexKey: Index is stable enough for sidebar groups
            key={group.title || idx.toString()}
            group={group}
            activePath={activePath}
            onNavigate={(href) => {
              onNavigate(href);
              onLinkClick?.();
            }}
            forceExpanded={searchQuery.trim().length > 0}
          />
        ))}
      </nav>
    </aside>
  );
}

interface SidebarNavGroupProps {
  group: SidebarGroupData;
  activePath: string;
  onNavigate: (href: string) => void;
  forceExpanded?: boolean;
}

function SidebarNavGroup({
  group,
  activePath,
  onNavigate,
  forceExpanded,
}: SidebarNavGroupProps) {
  const hasActiveChild = group.links.some((l) => l.href === activePath);
  const initiallyExpanded =
    forceExpanded || group.defaultExpanded !== false || hasActiveChild;
  const [expanded, setExpanded] = React.useState(initiallyExpanded);

  // If search is active, we force expand the groups
  const isExpanded = forceExpanded || expanded;

  return (
    <div className="flex flex-col space-y-1">
      {group.title && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="group flex w-full items-center justify-between px-3 py-1.5 text-[11px] font-bold text-gray-500 uppercase tracking-widest hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
        >
          {group.title}
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 transition-transform duration-300 opacity-60 group-hover:opacity-100",
              isExpanded ? "" : "-rotate-90",
            )}
          />
        </button>
      )}

      {isExpanded && (
        <div className="space-y-1 mt-1">
          {group.links.map((link) => {
            const isActive = activePath === link.href;
            return (
              <button
                key={link.href}
                type="button"
                onClick={() => onNavigate(link.href)}
                className={cn(
                  "relative flex w-full items-center gap-3 px-3 py-2 text-sm font-medium transition-all duration-200 active:scale-[0.98] outline-none",
                  isActive
                    ? "bg-blue-600/10 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400"
                    : "text-gray-600 hover:bg-gray-100/80 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800/50 dark:hover:text-gray-100",
                )}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 h-2/3 w-1 rounded-r-full bg-blue-600 dark:bg-blue-500" />
                )}
                {link.icon && (
                  <span
                    className={cn(
                      "h-4 w-4 shrink-0 transition-colors",
                      isActive
                        ? "text-blue-700 dark:text-blue-400"
                        : "text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-300",
                    )}
                  >
                    {link.icon}
                  </span>
                )}
                <span
                  className={cn("truncate", isActive ? "font-semibold" : "")}
                >
                  {link.label}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
