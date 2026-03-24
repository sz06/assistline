import { api, type Id } from "@repo/api";
import { Button, Input, PageHeader } from "@repo/ui";
import { useMutation, useQuery } from "convex/react";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Database,
  Loader2,
  Lock,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

export function ArtifactsPage() {
  const artifacts = useQuery(api.artifacts.list);
  const roles = useQuery(api.roles.list);
  const removeArtifact = useMutation(api.artifacts.remove);
  const navigate = useNavigate();

  const [deletingId, setDeletingId] = useState<Id<"artifacts"> | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(10);

  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleConfirmDelete = async () => {
    if (!deletingId) return;
    await removeArtifact({ id: deletingId });
    setDeletingId(null);
  };

  // Filter → Paginate
  const { paged, totalFiltered } = useMemo(() => {
    if (!artifacts) return { paged: undefined, totalFiltered: 0 };

    let list = artifacts;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = artifacts.filter((a) => a.value.toLowerCase().includes(q));
    }

    const start = (page - 1) * pageSize;
    return {
      paged: list.slice(start, start + pageSize),
      totalFiltered: list.length,
    };
  }, [artifacts, search, page, pageSize]);

  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const rangeStart = totalFiltered === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, totalFiltered);

  return (
    <div className="p-4 md:p-6 overflow-auto h-full">
      <div>
        <div className="flex items-start justify-between gap-4">
          <PageHeader
            title="Artifacts & Memories"
            description="Manage memories, user preferences, and saved contexts for the AI."
          />
          <Button
            onClick={() => navigate("/artifacts/add")}
            className="shrink-0 mt-1"
            data-testid="add-artifact-btn"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Artifact
          </Button>
        </div>

        {/* Search bar */}
        {artifacts && artifacts.length > 0 && (
          <div className="flex items-center gap-2 mt-2 mb-6">
            <div className="relative max-w-md flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search artifacts…"
                className="pl-10"
                data-testid="artifacts-search"
              />
            </div>
          </div>
        )}

        {/* Content */}
        <div className="mt-4 space-y-4">
          {paged === undefined || roles === undefined ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : paged.length === 0 && !search ? (
            <EmptyState onAdd={() => navigate("/artifacts/add")} />
          ) : paged.length === 0 && search ? (
            <div className="text-center py-16">
              <Search className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                No artifacts match "
                <span className="font-medium">{search}</span>"
              </p>
            </div>
          ) : (
            paged.map((a) => (
              <ArtifactCard
                key={a._id}
                artifact={a}
                roles={roles}
                onClick={() => navigate(`/artifacts/${a._id}/update`)}
                onDelete={() => setDeletingId(a._id)}
              />
            ))
          )}
        </div>

        {/* Pagination bar */}
        {paged && paged.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 text-sm text-gray-500 dark:text-gray-400">
            <div className="flex items-center gap-2">
              <span>Rows per page:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                data-testid="page-size-select"
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-3">
              <span data-testid="pagination-info">
                {rangeStart}–{rangeEnd} of {totalFiltered}
              </span>
              <div className="flex gap-1">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="p-1.5 rounded-md border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  data-testid="pagination-prev"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="p-1.5 rounded-md border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  data-testid="pagination-next"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {deletingId && (
          <DeleteConfirmDialog
            onConfirm={handleConfirmDelete}
            onCancel={() => setDeletingId(null)}
          />
        )}
      </div>
    </div>
  );
}

function ArtifactCard({
  artifact,
  roles,
  onClick,
  onDelete,
}: {
  artifact: {
    _id: Id<"artifacts">;
    _creationTime: number;
    value: string;
    accessibleToRoles: Id<"roles">[];
    expiresAt?: number;
    updatedAt: number;
  };
  roles: { _id: Id<"roles">; name: string; color?: string }[];
  onClick: () => void;
  onDelete: () => void;
}) {
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

function DeleteConfirmDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
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

function EmptyState({ onAdd }: { onAdd: () => void }) {
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
