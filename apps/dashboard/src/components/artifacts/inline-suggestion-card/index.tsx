import { Button } from "@repo/ui";
import { Clock, Shield, Sparkles, X } from "lucide-react";

export interface InlineSuggestionCardProps {
  suggestion: {
    _id: string;
    type: "create" | "update";
    value: string;
    accessibleToRoles?: string[];
    expiresAt?: number;
  };
  roles?: { _id: string; name: string }[];
  onApprove: () => void;
  onDismiss: () => void;
  className?: string;
}

export function InlineSuggestionCard({
  suggestion,
  roles,
  onApprove,
  onDismiss,
  className = "",
}: InlineSuggestionCardProps) {
  const isUpdate = suggestion.type === "update";

  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-center gap-3 py-3 ${className}`}
    >
      <div className="flex items-start gap-3 flex-1">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 mt-0.5 sm:mt-0">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider mb-0.5">
            {isUpdate ? "Fact Updated" : "Fact Discovered"}
          </p>
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
            {suggestion.value}
          </p>
          {((suggestion.accessibleToRoles &&
            suggestion.accessibleToRoles.length > 0) ||
            suggestion.expiresAt) && (
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {suggestion.accessibleToRoles &&
                suggestion.accessibleToRoles.length > 0 &&
                roles && (
                  <span
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100/60 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400"
                    title={roles
                      .filter((r) =>
                        suggestion.accessibleToRoles!.includes(r._id),
                      )
                      .map((r) => r.name)
                      .join(", ")}
                  >
                    <Shield className="h-3 w-3" />
                    {roles
                      .filter((r) =>
                        suggestion.accessibleToRoles!.includes(r._id),
                      )
                      .map((r) => r.name)
                      .join(", ")}
                  </span>
                )}
              {suggestion.expiresAt && (
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100/60 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                  title={new Date(suggestion.expiresAt).toLocaleString()}
                >
                  <Clock className="h-3 w-3" />
                  Expires{" "}
                  {new Date(suggestion.expiresAt).toLocaleDateString(
                    undefined,
                    {
                      month: "short",
                      day: "numeric",
                    },
                  )}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button
          size="sm"
          variant="outline"
          onClick={onDismiss}
          className="h-8 pr-3 pl-2.5 text-xs text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400"
        >
          <X className="h-3.5 w-3.5 mr-1" />
          Dismiss
        </Button>
        <Button
          size="sm"
          onClick={onApprove}
          className="h-8 px-4 text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors"
        >
          Approve
        </Button>
      </div>
    </div>
  );
}
