import type { Id } from "@repo/api";
import { api } from "@repo/api";
import { Button, PageHeader } from "@repo/ui";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { DuplicateGroupCard } from "../components/contacts/duplicate-group-card";
import { EmptyMergeState } from "../components/contacts/empty-merge-state";

export function MergeContactsPage() {
  const navigate = useNavigate();
  const executeMerge = useMutation(api.contacts.deduplication.executeMerge);
  const [offset, setOffset] = useState(0);
  const data = useQuery(api.contacts.deduplication.getMergeCandidates, {
    limit: 10,
    offset,
  });

  const groups = data?.results;
  const hasMore = data?.hasMore;
  const totalSets = data?.totalSets;

  const [resolvedSets, setResolvedSets] = useState<Set<Id<"contacts">>>(
    new Set(),
  );

  const handleResolved = (primaryId: Id<"contacts">) => {
    setResolvedSets((prev) => {
      const next = new Set(prev);
      next.add(primaryId);
      return next;
    });
  };

  const activeGroups =
    groups?.filter(
      (g) => !g.contacts.some((c) => resolvedSets.has(c.contact._id)),
    ) ?? [];

  return (
    <div className="p-4 md:p-6 w-full flex flex-col h-full overflow-auto">
      <div className="flex items-center justify-between mb-8">
        <PageHeader
          title="Resolve Duplicates"
          description="We've automatically scanned your database and found overlapping records. Pick the primary profile to merge them into."
        />
        <Button variant="outline" onClick={() => navigate("/contacts")}>
          Done
        </Button>
      </div>

      {data === undefined ? (
        <div className="flex items-center justify-center p-20 text-gray-400 flex-col gap-4">
          <div className="h-8 w-8 border-4 border-gray-200 border-t-blue-600 rounded-full animate-spin" />
          <p>Scanning global address book...</p>
        </div>
      ) : totalSets === 0 ? (
        <EmptyMergeState />
      ) : (
        <div className="space-y-6 flex-1 pb-10">
          <div className="bg-blue-50 dark:bg-blue-900/10 text-blue-800 dark:text-blue-300 px-4 py-3 rounded-lg text-sm mb-6 flex items-center justify-between border border-blue-100 dark:border-blue-900/30">
            <span>
              Action Required: <strong>{totalSets}</strong> potential duplicate
              sets require your review. Overlapping identities will be safely
              migrated to your selected Primary Profile.
            </span>
          </div>

          {activeGroups.length === 0 && groups && groups.length > 0 ? (
            <div className="text-center py-10 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-800 text-gray-500">
              You've cleared this page.
              {hasMore && " Click next to load more."}
            </div>
          ) : (
            activeGroups.map((group) => {
              const uniqueKey = group.contacts
                .map((c) => c.contact._id)
                .sort()
                .join("-");

              return (
                <DuplicateGroupCard
                  key={uniqueKey}
                  group={group}
                  onMerge={async (primaryId, additionalMergeIds) => {
                    const duplicateIds = group.contacts
                      .map((c) => c.contact._id)
                      .filter((id) => id !== primaryId)
                      .concat(
                        additionalMergeIds.filter((id) => id !== primaryId),
                      );

                    await executeMerge({
                      primaryContactId: primaryId,
                      duplicateContactIds: duplicateIds,
                    });

                    handleResolved(primaryId);
                  }}
                />
              );
            })
          )}

          <div className="flex items-center justify-between pt-6 border-t border-gray-200 dark:border-gray-800 mt-6">
            <Button
              variant="outline"
              disabled={offset === 0}
              onClick={() => setOffset((p) => Math.max(0, p - 10))}
            >
              Previous Page
            </Button>
            <div className="text-sm text-gray-500">
              Showing {offset + 1}-{Math.min(offset + 10, totalSets!)} of{" "}
              {totalSets}
            </div>
            <Button
              variant="outline"
              disabled={!hasMore}
              onClick={() => setOffset((p) => p + 10)}
            >
              Next Page
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
