import { api, type Id } from "@repo/api";
import { Button } from "@repo/ui";
import { useAction } from "convex/react";
import { Lightbulb, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

function MergeGroupCard({
  group,
  idx,
  onDismiss,
  onMerge,
}: {
  group: { items: Array<{ _id: string; value: string }> };
  idx: number;
  onDismiss: () => void;
  onMerge: (mergedValue: string) => Promise<void>;
}) {
  const [isMerging, setIsMerging] = useState(false);
  const [mergedValue, setMergedValue] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleStartMerge = () => {
    setMergedValue(group.items.map((i) => i.value).join("\n\n"));
    setIsMerging(true);
  };

  const handleConfirmMerge = async () => {
    if (!mergedValue.trim()) return;
    setSubmitting(true);
    try {
      await onMerge(mergedValue);
    } finally {
      setSubmitting(false);
      setIsMerging(false);
    }
  };

  return (
    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-gray-200 dark:border-gray-800">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          Similar Group {idx + 1}
        </h4>
        {!isMerging && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onDismiss}>
              Dismiss
            </Button>
            <Button size="sm" onClick={handleStartMerge}>
              Merge
            </Button>
          </div>
        )}
      </div>

      {isMerging ? (
        <div className="space-y-3">
          <textarea
            value={mergedValue}
            onChange={(e) => setMergedValue(e.target.value)}
            className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[120px]"
            placeholder="Edit the merged fact..."
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsMerging(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleConfirmMerge}
              disabled={submitting}
            >
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirm Merge
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {group.items.map((item) => (
            <div
              key={item._id}
              className="bg-white dark:bg-gray-900 p-3 rounded-lg border border-gray-200 dark:border-gray-800 shadow-sm"
            >
              <p className="text-sm text-gray-700 dark:text-gray-300">
                {item.value}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function MergeSuggestionsTab() {
  const getMergeSuggestions = useAction(api.artifacts.getMergeSuggestions);
  const mergeArtifacts = useAction(api.artifacts.mergeArtifacts);
  const [groups, setGroups] = useState<Array<{
    items: Array<{ _id: string; value: string }>;
  }> | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchGroups = async () => {
    setLoading(true);
    try {
      const result = await getMergeSuggestions();
      setGroups(result);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGroups();
  }, []);

  const handleDismiss = (index: number) => {
    setGroups((prev) => prev?.filter((_, i) => i !== index) ?? null);
  };

  const handleMerge = async (index: number, mergedValue: string) => {
    if (!groups) return;
    const group = groups[index];
    const artifactIds = group.items.map((i) => i._id as Id<"artifacts">);
    await mergeArtifacts({ artifactIds, mergedValue });
    handleDismiss(index);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!groups || groups.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-50 dark:bg-gray-800 mx-auto mb-4">
          <Lightbulb className="h-7 w-7 text-gray-400" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          No similar artifacts found
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5 max-w-md mx-auto">
          Your knowledge base is clean! There are no highly similar facts that
          need merging.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-8">
      <div className="flex justify-end">
        <Button variant="outline" onClick={fetchGroups}>
          Refresh Groups
        </Button>
      </div>
      {groups.map((group, idx) => (
        <MergeGroupCard
          key={idx}
          group={group}
          idx={idx}
          onDismiss={() => handleDismiss(idx)}
          onMerge={(value) => handleMerge(idx, value)}
        />
      ))}
    </div>
  );
}
