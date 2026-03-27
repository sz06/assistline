import { cn } from "@repo/ui";
import { Activity, Bot, Check, ChevronDown } from "lucide-react";
import { useRef, useState } from "react";
import { useOnClickOutside } from "../../hooks/use-on-click-outside";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProviderOption {
  _id: string;
  name: string | null;
  provider: string;
  model: string | null;
  isDefault: boolean;
}

export interface TokenStats {
  totalTokensIn: number;
  totalTokensOut: number;
  activeProvider: { name: string; model: string } | null;
}

export interface AiProviderWidgetProps {
  /** Current system-wide token statistics */
  stats: TokenStats;
  /** All available language providers the user can switch between */
  providers: ProviderOption[];
  /** Called when the user selects a new default provider */
  onSetDefault: (id: string) => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}

function providerLabel(p: ProviderOption): string {
  return p.name || p.provider;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * AiProviderWidget
 *
 * Displays global input / output token counts and the currently active AI
 * provider + model. Clicking the provider name opens a compact dropdown that
 * lets the user switch the default language provider on-the-fly.
 */
export function AiProviderWidget({
  stats,
  providers,
  onSetDefault,
  className,
}: AiProviderWidgetProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOnClickOutside(ref, () => setOpen(false));

  const hasProviders = providers.length > 0;

  return (
    <div
      ref={ref}
      className={cn(
        "relative hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-md",
        "bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800",
        "text-xs text-gray-600 dark:text-gray-400 select-none",
        className,
      )}
      data-testid="ai-provider-widget"
    >
      {/* Activity icon */}
      <Activity className="w-3.5 h-3.5 text-blue-500 shrink-0" />

      {/* Token counts */}
      <div className="flex items-center gap-1.5 font-medium tabular-nums">
        <span title="Total input tokens across all providers">
          ↑&thinsp;{formatTokenCount(stats.totalTokensIn)}
        </span>
        <span className="text-gray-300 dark:text-gray-700">/</span>
        <span title="Total output tokens across all providers">
          ↓&thinsp;{formatTokenCount(stats.totalTokensOut)}
        </span>
      </div>

      {/* Separator */}
      {stats.activeProvider && (
        <span className="text-gray-300 dark:text-gray-700">|</span>
      )}

      {/* Active provider + model — click to switch */}
      {stats.activeProvider && hasProviders && (
        <button
          type="button"
          data-testid="ai-provider-trigger"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "flex items-center gap-1 max-w-[160px] font-medium",
            "rounded px-1 -mx-1 py-0.5 transition-colors",
            "hover:bg-gray-100 dark:hover:bg-gray-800",
            "text-gray-700 dark:text-gray-300",
          )}
          title="Click to change default AI provider"
        >
          <Bot className="w-3.5 h-3.5 text-blue-500 shrink-0" />
          <span className="truncate">{stats.activeProvider.name}</span>
          <span className="text-gray-400 dark:text-gray-600 truncate">
            {stats.activeProvider.model}
          </span>
          <ChevronDown
            className={cn(
              "w-3 h-3 shrink-0 text-gray-400 dark:text-gray-600 transition-transform duration-150",
              open && "rotate-180",
            )}
          />
        </button>
      )}

      {/* Provider dropdown */}
      {open && (
        <div
          className={cn(
            "absolute top-full right-0 mt-2 w-64 z-50",
            "bg-white dark:bg-gray-900 rounded-lg shadow-lg ring-1 ring-gray-200 dark:ring-gray-800",
            "divide-y divide-gray-100 dark:divide-gray-800 overflow-hidden",
          )}
          data-testid="ai-provider-dropdown"
        >
          <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-600">
            Default AI Provider
          </div>
          <div className="py-1 max-h-60 overflow-y-auto">
            {providers.map((p) => (
              <button
                key={p._id}
                type="button"
                data-testid={`provider-option-${p._id}`}
                onClick={() => {
                  onSetDefault(p._id);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors",
                  p.isDefault
                    ? "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300"
                    : "hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300",
                )}
              >
                <Check
                  className={cn(
                    "w-3.5 h-3.5 mt-0.5 shrink-0",
                    p.isDefault
                      ? "text-blue-600 dark:text-blue-400"
                      : "opacity-0",
                  )}
                />
                <div className="min-w-0">
                  <p className="text-xs font-semibold leading-tight truncate">
                    {providerLabel(p)}
                  </p>
                  {p.model && (
                    <p className="text-[10px] text-gray-500 dark:text-gray-500 mt-0.5 truncate">
                      {p.model}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
