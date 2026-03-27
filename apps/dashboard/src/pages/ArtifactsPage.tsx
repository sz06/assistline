import { api, type Id } from "@repo/api";
import { Button, Input, PageHeader } from "@repo/ui";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  ChevronLeft,
  ChevronRight,
  Database,
  Lightbulb,
  Loader2,
  Plus,
  Search,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArtifactCard } from "../components/artifacts/artifact-card";
import { DeleteConfirmDialog } from "../components/artifacts/delete-confirm-dialog";
import { EmptyState } from "../components/artifacts/empty-state";
import { MergeSuggestionsTab } from "../components/artifacts/merge-suggestions-tab";
import { SuggestionCard } from "../components/artifacts/suggestion-card";
import { useDebounce } from "../hooks/use-debounce";

const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

export function ArtifactsPage() {
  const artifacts = useQuery(api.artifacts.list);
  const roles = useQuery(api.roles.list);
  const removeArtifact = useMutation(api.artifacts.remove);
  const generateEmbeddings = useAction(api.artifacts.generateMissingEmbeddings);

  const suggestions = useQuery(api.artifactSuggestions.queries.listAll);
  const executeSuggestion = useMutation(
    api.artifactSuggestions.mutations.execute,
  );
  const dismissSuggestion = useMutation(
    api.artifactSuggestions.mutations.dismiss,
  );

  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<
    "artifacts" | "suggestions" | "merge"
  >("artifacts");

  const [deletingId, setDeletingId] = useState<Id<"artifacts"> | null>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const searchArtifacts = useAction(api.artifacts.vectorSearch);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [isGenerating, setIsGenerating] = useState(false);

  type SortOption = "updatedAt" | "createdAt" | "expiry";
  const [sortBy, setSortBy] = useState<SortOption>("updatedAt");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");

  useEffect(() => {
    if (!debouncedSearch.trim()) {
      setSearchResults(null);
      setIsSearching(false);
      return;
    }

    let isMounted = true;
    setIsSearching(true);

    searchArtifacts({ query: debouncedSearch })
      .then((results) => {
        if (isMounted) {
          setSearchResults(results);
          setIsSearching(false);
        }
      })
      .catch((err) => {
        console.error("Vector search failed:", err);
        if (isMounted) setIsSearching(false);
      });

    return () => {
      isMounted = false;
    };
  }, [debouncedSearch, searchArtifacts]);

  const missingCount = useMemo(() => {
    let count = 0;
    if (artifacts) {
      count += artifacts.filter((a: any) => !a.hasEmbedding).length;
    }
    if (suggestions) {
      count += suggestions.filter((s) => !s.embedding).length;
    }
    return count;
  }, [artifacts, suggestions]);

  const handleGenerateEmbeddings = async () => {
    setIsGenerating(true);
    try {
      await generateEmbeddings();
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleConfirmDelete = async () => {
    if (!deletingId) return;
    await removeArtifact({ id: deletingId });
    setDeletingId(null);
  };

  // Filter → Sort → Paginate
  const { paged, totalFiltered } = useMemo(() => {
    if (!artifacts) return { paged: undefined, totalFiltered: 0 };

    let list = artifacts;
    if (debouncedSearch.trim()) {
      list = searchResults ?? [];
    }

    list = [...list].sort((a: any, b: any) => {
      let valA: number;
      let valB: number;

      switch (sortBy) {
        case "createdAt":
          valA = a._creationTime;
          valB = b._creationTime;
          break;
        case "expiry":
          valA = a.expiresAt ?? Number.MAX_SAFE_INTEGER;
          valB = b.expiresAt ?? Number.MAX_SAFE_INTEGER;
          break;
        case "updatedAt":
        default:
          valA = a.updatedAt;
          valB = b.updatedAt;
          break;
      }

      if (valA < valB) return sortOrder === "asc" ? -1 : 1;
      if (valA > valB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    const start = (page - 1) * pageSize;
    return {
      paged: list.slice(start, start + pageSize),
      totalFiltered: list.length,
    };
  }, [
    artifacts,
    debouncedSearch,
    searchResults,
    page,
    pageSize,
    sortBy,
    sortOrder,
  ]);

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
          <div className="flex items-center gap-2 shrink-0 mt-1">
            {missingCount > 0 && (
              <Button
                variant="outline"
                onClick={handleGenerateEmbeddings}
                disabled={isGenerating}
                title={`Generate embeddings for ${missingCount} artifacts`}
              >
                {isGenerating ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Database className="h-4 w-4 mr-2" />
                )}
                Backfill ({missingCount})
              </Button>
            )}
            <Button
              onClick={() => navigate("/artifacts/add")}
              data-testid="add-artifact-btn"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Artifact
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-6 border-b border-gray-200 dark:border-gray-800 mb-6 mt-4">
          <button
            type="button"
            onClick={() => setActiveTab("artifacts")}
            className={`pb-3 text-sm font-medium transition-colors relative ${
              activeTab === "artifacts"
                ? "text-blue-600 dark:text-blue-400"
                : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            }`}
          >
            Artifacts
            {activeTab === "artifacts" && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400 rounded-t-full" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("suggestions")}
            className={`pb-3 text-sm font-medium transition-colors relative flex items-center gap-2 ${
              activeTab === "suggestions"
                ? "text-blue-600 dark:text-blue-400"
                : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            }`}
          >
            Suggestions
            {suggestions && suggestions.length > 0 && (
              <span className="inline-flex items-center justify-center bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {suggestions.length}
              </span>
            )}
            {activeTab === "suggestions" && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400 rounded-t-full" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("merge")}
            className={`pb-3 text-sm font-medium transition-colors relative flex items-center gap-2 ${
              activeTab === "merge"
                ? "text-blue-600 dark:text-blue-400"
                : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            }`}
          >
            Merge suggestions
            {activeTab === "merge" && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400 rounded-t-full" />
            )}
          </button>
        </div>

        {activeTab === "artifacts" && (
          <>
            {/* Search and Sort controls */}
            {artifacts && artifacts.length > 0 && (
              <div className="flex flex-col sm:flex-row items-center gap-3 mt-2 mb-6 w-full">
                <div className="relative w-full sm:flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    value={search}
                    onChange={(e) => handleSearch(e.target.value)}
                    placeholder="Search artifacts…"
                    className="pl-10"
                    data-testid="artifacts-search"
                  />
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortOption)}
                    className="flex-1 sm:flex-none h-9 border border-gray-200 dark:border-gray-800 rounded-md bg-white dark:bg-gray-950 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                  >
                    <option value="updatedAt">Updated At</option>
                    <option value="createdAt">Created At</option>
                    <option value="expiry">Expiry</option>
                  </select>
                  <select
                    value={sortOrder}
                    onChange={(e) =>
                      setSortOrder(e.target.value as "desc" | "asc")
                    }
                    className="h-9 border border-gray-200 dark:border-gray-800 rounded-md bg-white dark:bg-gray-950 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                  >
                    <option value="desc">Desc</option>
                    <option value="asc">Asc</option>
                  </select>
                </div>
              </div>
            )}

            {/* Content */}
            <div className="mt-4 space-y-4">
              {paged === undefined || roles === undefined || isSearching ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                </div>
              ) : paged.length === 0 && !debouncedSearch ? (
                <EmptyState onAdd={() => navigate("/artifacts/add")} />
              ) : paged.length === 0 && debouncedSearch ? (
                <div className="text-center py-16">
                  <Search className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                  <p className="text-gray-500 dark:text-gray-400 text-sm">
                    No artifacts match "
                    <span className="font-medium">{debouncedSearch}</span>"
                  </p>
                </div>
              ) : (
                paged.map((a: any) => (
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
          </>
        )}

        {activeTab === "suggestions" && (
          <div className="mt-4 space-y-4">
            {suggestions === undefined ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : suggestions.length === 0 ? (
              <div className="text-center py-16">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 dark:bg-amber-900/20 mx-auto mb-4">
                  <Lightbulb className="h-7 w-7 text-amber-500" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  No pending suggestions
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5 max-w-md mx-auto">
                  The AI will automatically suggest facts and memories based on
                  chat conversations. Check back later!
                </p>
              </div>
            ) : (
              suggestions.map((s) => (
                <SuggestionCard
                  key={s._id}
                  suggestion={s}
                  roles={roles}
                  onApprove={() =>
                    executeSuggestion({
                      suggestionId: s._id as Id<"artifactSuggestions">,
                    })
                  }
                  onDismiss={() =>
                    dismissSuggestion({
                      suggestionId: s._id as Id<"artifactSuggestions">,
                    })
                  }
                />
              ))
            )}
          </div>
        )}

        {activeTab === "merge" && <MergeSuggestionsTab />}

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
