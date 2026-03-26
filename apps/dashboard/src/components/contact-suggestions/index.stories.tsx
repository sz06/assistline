import type { Meta, StoryObj } from "@storybook/react-vite";
import { Check, ChevronDown, X } from "lucide-react";
import { useState } from "react";

// ---------------------------------------------------------------------------
// A purely presentational version of the panel for Storybook.
// The real component uses live Convex hooks; here we pass static data directly
// so the story works without a Convex provider.
// ---------------------------------------------------------------------------

interface MockSuggestion {
  _id: string;
  data: Record<string, string | string[] | undefined>;
}

function ContactSuggestionsPanelPreview({
  suggestions: initialSuggestions,
}: {
  suggestions: MockSuggestion[];
}) {
  const [suggestions, setSuggestions] = useState(initialSuggestions);
  const [open, setOpen] = useState(false);

  if (suggestions.length === 0) return null;

  const removeSuggestion = (id: string) =>
    setSuggestions((prev) => prev.filter((s) => s._id !== id));

  return (
    <div className="relative inline-block">
      {/* Amber chevron trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-0.5 ml-1.5 px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-800/60 transition-colors"
      >
        <span className="text-[10px] font-bold leading-none">
          {suggestions.length}
        </span>
        <ChevronDown
          className={`h-3 w-3 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {/* Accordion panel */}
      {open && (
        <div className="absolute left-0 top-full mt-1 z-40 w-72 rounded-xl border border-amber-200 dark:border-amber-800/60 bg-white dark:bg-gray-900 shadow-lg overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800/40">
            <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
              Contact Suggestions
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-amber-500 hover:text-amber-700 dark:hover:text-amber-300"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Rows */}
          <ul className="divide-y divide-gray-100 dark:divide-gray-800 max-h-72 overflow-y-auto">
            {suggestions.map((suggestion) => {
              const fields = Object.entries(suggestion.data).filter(
                ([, v]) => v !== undefined && v !== null,
              );

              return (
                <li
                  key={suggestion._id}
                  className="flex items-start gap-2 px-3 py-2.5"
                >
                  <div className="flex-1 min-w-0">
                    {fields.map(([field, value]) => (
                      <div key={field} className="flex items-baseline gap-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 shrink-0">
                          {field}
                        </span>
                        <span className="text-xs text-gray-800 dark:text-gray-200 truncate">
                          {Array.isArray(value)
                            ? value.join(", ")
                            : String(value)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-1 shrink-0 mt-0.5">
                    <button
                      type="button"
                      onClick={() => removeSuggestion(suggestion._id)}
                      title="Approve"
                      className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 hover:bg-emerald-600 text-white transition-colors"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeSuggestion(suggestion._id)}
                      title="Dismiss"
                      className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Storybook meta
// ---------------------------------------------------------------------------

const meta = {
  title: "Components/ContactSuggestionsPanel",
  component: ContactSuggestionsPanelPreview,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof ContactSuggestionsPanelPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

// Single suggestion — a name update.
export const SingleSuggestion: Story = {
  args: {
    suggestions: [
      {
        _id: "suggestion-1",
        data: { name: "Shahzaib Salim" },
      },
    ],
  },
};

// Multiple suggestions — name + company + job title.
export const MultipleSuggestions: Story = {
  args: {
    suggestions: [
      {
        _id: "suggestion-1",
        data: { name: "Shahzaib Salim" },
      },
      {
        _id: "suggestion-2",
        data: { company: "Acme Corp", jobTitle: "Senior Engineer" },
      },
    ],
  },
};

// Suggestion with birthday.
export const BirthdaySuggestion: Story = {
  args: {
    suggestions: [
      {
        _id: "suggestion-3",
        data: { birthday: "1990-04-15", nickname: "Shaz" },
      },
    ],
  },
};
