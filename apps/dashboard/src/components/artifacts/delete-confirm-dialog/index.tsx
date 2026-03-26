import { Button } from "@repo/ui";
import { Trash2 } from "lucide-react";

export interface DeleteConfirmDialogProps {
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteConfirmDialog({
  onConfirm,
  onCancel,
}: DeleteConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onCancel}
        aria-label="Close dialog"
      />
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 w-full max-w-sm mx-4 p-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30 mx-auto mb-4">
          <Trash2 className="h-6 w-6 text-red-500" />
        </div>
        <h2 className="text-lg font-semibold">Delete Artifact</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
          Are you sure you want to delete this memory? It will no longer be
          available to the AI.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex items-center justify-center h-10 px-4 rounded-md text-sm font-medium text-white transition-colors bg-red-600 hover:bg-red-700"
          >
            Yes, delete
          </button>
        </div>
      </div>
    </div>
  );
}
