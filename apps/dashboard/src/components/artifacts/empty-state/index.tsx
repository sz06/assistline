import { Button } from "@repo/ui";
import { Database, Plus } from "lucide-react";

export interface EmptyStateProps {
  onAdd: () => void;
}

export function EmptyState({ onAdd }: EmptyStateProps) {
  return (
    <div className="text-center py-12">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-900/20 mx-auto mb-4">
        <Database className="h-7 w-7 text-blue-500" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
        No artifacts stored yet
      </h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5 max-w-md mx-auto">
        Artifacts store facts and details about users or the workspace. Add one
        to give the AI long-term memory.
      </p>
      <div className="mt-6">
        <Button onClick={onAdd}>
          <Plus className="h-4 w-4 mr-2" />
          Create First Artifact
        </Button>
      </div>
    </div>
  );
}
