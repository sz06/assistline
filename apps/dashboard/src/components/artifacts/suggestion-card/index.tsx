import { Button } from "@repo/ui";
import { Check, Lightbulb, X } from "lucide-react";

export interface SuggestionCardProps {
  suggestion: {
    _id: string;
    type: "create" | "update";
    value: string;
    artifactId?: string;
    embedding?: number[];
    sessionId?: string;
    conversationId?: string;
  };
  onApprove: () => void;
  onDismiss: () => void;
}

export function SuggestionCard({
  suggestion,
  onApprove,
  onDismiss,
}: SuggestionCardProps) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm p-4 flex items-start gap-4 transition-colors hover:border-blue-300 dark:hover:border-blue-700">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 mt-1">
        <Lightbulb className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 text-xs">
          <span
            className={`px-1.5 py-0.5 rounded font-medium ${
              suggestion.type === "create"
                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
            }`}
          >
            {suggestion.type === "create" ? "New Fact" : "Update Fact"}
          </span>
          <span
            className={`px-1.5 py-0.5 rounded font-medium ${suggestion.embedding ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400"}`}
          >
            {suggestion.embedding ? "Vectorized" : "Missing Embedding"}
          </span>
          {suggestion.sessionId && (
            <span className="text-gray-400">Chat Session</span>
          )}
          {suggestion.conversationId && (
            <span className="text-gray-400">Conversation</span>
          )}
        </div>
        <p className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg border border-gray-100 dark:border-gray-800 line-clamp-3 whitespace-pre-wrap">
          {suggestion.value}
        </p>
      </div>
      <div className="flex flex-col gap-2 shrink-0">
        <Button
          size="sm"
          onClick={onApprove}
          className="w-full flex justify-start rounded-md h-8 text-xs px-2.5"
        >
          <Check className="h-3.5 w-3.5 mr-1.5" /> Approve
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onDismiss}
          className="w-full flex justify-start rounded-md h-8 text-xs px-2.5 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
        >
          <X className="h-3.5 w-3.5 mr-1.5" /> Dismiss
        </Button>
      </div>
    </div>
  );
}
