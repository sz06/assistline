import type { Id } from "@repo/api";
import { Calendar, Database, Lock, Trash2 } from "lucide-react";

export interface ArtifactCardProps {
  artifact: {
    _id: Id<"artifacts">;
    _creationTime: number;
    value: string;
    accessibleToRoles: Id<"roles">[];
    expiresAt?: number;
    updatedAt: number;
    hasEmbedding?: boolean;
  };
  roles: { _id: Id<"roles">; name: string; color?: string }[];
  onClick: () => void;
  onDelete: () => void;
}

export function ArtifactCard({
  artifact,
  roles,
  onClick,
  onDelete,
}: ArtifactCardProps) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm overflow-hidden transition-all hover:border-blue-300 dark:hover:border-blue-700">
      <div className="flex items-start justify-between px-5 py-4">
        <button
          type="button"
          onClick={onClick}
          className="flex items-start gap-4 flex-1 min-w-0 text-left focus:outline-none group"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 group-hover:scale-105 transition-transform mt-1">
            <Database className="h-5 w-5" />
          </div>

          <div className="min-w-0 flex-1 pr-4">
            <div className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg border border-gray-100 dark:border-gray-800 line-clamp-3 whitespace-pre-wrap">
              {artifact.value}
            </div>
          </div>
        </button>

        <div className="flex items-center gap-2 shrink-0 ml-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            title="Delete artifact"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="border-t border-gray-100 dark:border-gray-800/50 px-5 py-3 bg-gray-50/50 dark:bg-gray-900/50 flex items-center justify-between text-xs text-gray-500">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5 text-gray-400" />
            <span className="font-medium">Roles:</span>
            {artifact.accessibleToRoles.length > 0 ? (
              <div className="flex gap-1 flex-wrap">
                {artifact.accessibleToRoles.map((roleId) => {
                  const role = roles.find((r) => r._id === roleId);
                  if (!role) return null;
                  return (
                    <span
                      key={role._id}
                      className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${role.color || "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"}`}
                    >
                      {role.name}
                    </span>
                  );
                })}
              </div>
            ) : (
              <span className="italic text-gray-400">None (Public)</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={`mr-2 px-1.5 py-0.5 rounded text-xs font-medium ${artifact.hasEmbedding ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400"}`}
          >
            {artifact.hasEmbedding ? "Vectorized" : "Missing Embedding"}
          </span>
          {artifact.expiresAt && (
            <span
              className={`mr-2 px-1.5 py-0.5 rounded text-xs font-medium ${artifact.expiresAt < Date.now() ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"}`}
            >
              {artifact.expiresAt < Date.now()
                ? "Expired"
                : `Expires ${new Date(artifact.expiresAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`}
            </span>
          )}
          <Calendar className="h-3.5 w-3.5 text-gray-400" />
          <span className="inline-flex">
            Updated{" "}
            {new Date(artifact.updatedAt).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </span>
        </div>
      </div>
    </div>
  );
}
