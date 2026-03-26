import { api, type Id } from "@repo/api";
import { useMutation } from "convex/react";
import { Check, X } from "lucide-react";

type ContactSuggestion = {
  _id: Id<"contactSuggestions">;
  contactId: Id<"contacts">;
  field: string;
  value: string;
};

interface ContactSuggestionsPanelProps {
  suggestions: ContactSuggestion[];
}

/**
 * Renders pending contact suggestions inline, below the message content.
 * Each suggestion is one field → value row with Approve / Dismiss controls.
 * Mutations are fire-and-forget; Convex reactivity removes the row automatically.
 */
export function ContactSuggestionsPanel({
  suggestions,
}: ContactSuggestionsPanelProps) {
  const approveSuggestion = useMutation(
    api.contactSuggestions.mutations.execute,
  );
  const dismissSuggestion = useMutation(
    api.contactSuggestions.mutations.dismiss,
  );

  if (suggestions.length === 0) return null;

  return (
    <div
      data-testid="contact-suggestions-panel"
      className="mt-2 pt-2 border-t border-amber-200 dark:border-amber-800/40"
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-1.5">
        Contact Suggestions
      </p>
      <ul className="space-y-1.5">
        {suggestions.map((suggestion) => {
          // Attempt to parse arrays (e.g. roles) for display; fall back to raw value
          let displayValue: string;
          try {
            const parsed: unknown = JSON.parse(suggestion.value);
            if (Array.isArray(parsed)) {
              displayValue = parsed
                .map((item: unknown) => {
                  if (
                    typeof item === "object" &&
                    item !== null &&
                    "value" in item
                  ) {
                    const obj = item as { label?: string; value: string };
                    return obj.label ? `${obj.label}: ${obj.value}` : obj.value;
                  }
                  return String(item);
                })
                .join(", ");
            } else {
              displayValue = suggestion.value;
            }
          } catch {
            displayValue = suggestion.value;
          }

          return (
            <li
              key={suggestion._id}
              data-testid={`suggestion-row-${suggestion._id}`}
              className="flex items-center gap-2"
            >
              {/* Field + Value */}
              <div className="flex-1 min-w-0 flex items-baseline gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 shrink-0">
                  {suggestion.field}
                </span>
                <span className="text-xs text-gray-700 dark:text-gray-300 truncate">
                  {displayValue}
                </span>
              </div>

              {/* Approve / Dismiss */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  data-testid={`suggestion-approve-${suggestion._id}`}
                  onClick={() =>
                    approveSuggestion({ suggestionId: suggestion._id })
                  }
                  title="Approve"
                  className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 hover:bg-emerald-600 text-white transition-colors"
                >
                  <Check className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  data-testid={`suggestion-dismiss-${suggestion._id}`}
                  onClick={() =>
                    dismissSuggestion({ suggestionId: suggestion._id })
                  }
                  title="Dismiss"
                  className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
