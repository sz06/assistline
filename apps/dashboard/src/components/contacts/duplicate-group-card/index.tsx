import type { Id } from "@repo/api";
import { Button } from "@repo/ui";
import {
  CheckCircle2,
  Circle,
  Combine,
  Users,
  ArrowUpToLine,
} from "lucide-react";
import { useState } from "react";

// We import the specific type to be used as props
import type { api } from "@repo/api";
import type { useQuery } from "convex/react";

export type MergeCandidateSet = NonNullable<
  ReturnType<
    typeof useQuery<typeof api.contacts.deduplication.getMergeCandidates>
  >
>["results"][0];

function formatTime(ts: number) {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export interface DuplicateGroupCardProps {
  group: MergeCandidateSet;
  similarContacts?: MergeCandidateSet["contacts"];
  onMerge: (
    primaryId: Id<"contacts">,
    additionalMergeIds: Id<"contacts">[],
  ) => Promise<void>;
}

export function DuplicateGroupCard({
  group,
  similarContacts = group.similarContacts ?? [],
  onMerge,
}: DuplicateGroupCardProps) {
  const [similars, setSimilars] = useState(similarContacts);
  const [addedContacts, setAddedContacts] = useState<
    MergeCandidateSet["contacts"]
  >([]);
  const [primaryId, setPrimaryId] = useState<Id<"contacts">>(
    group.contacts[0].contact._id,
  );
  const [isMerging, setIsMerging] = useState(false);

  const mainContacts = [...group.contacts, ...addedContacts];

  const handleMerge = async () => {
    setIsMerging(true);
    try {
      await onMerge(
        primaryId,
        addedContacts.map((c) => c.contact._id),
      );
    } catch (err) {
      console.error("Failed to merge:", err);
    } finally {
      setIsMerging(false);
    }
  };

  const renderCardContent = (
    cItem: MergeCandidateSet["contacts"][0],
    isPrimary: boolean,
    isSimilar: boolean,
  ) => {
    const { contact, handles, identities } = cItem;
    return (
      <>
        {/* Selection Indicator */}
        {!isSimilar && (
          <div className="absolute top-4 right-4 text-gray-300 dark:text-gray-700">
            {isPrimary ? (
              <CheckCircle2 className="h-6 w-6 text-blue-600 fill-blue-100 dark:fill-blue-900/40" />
            ) : (
              <Circle className="h-6 w-6" />
            )}
          </div>
        )}

        {isSimilar && (
          <button
            type="button"
            className="absolute top-4 right-4 text-gray-400 hover:text-blue-600 dark:hover:text-blue-500 transition-colors"
            title="Move to Merge Group"
            onClick={(e) => {
              e.stopPropagation();
              setSimilars((prev) =>
                prev.filter((x) => x.contact._id !== contact._id),
              );
              setAddedContacts((prev) => [...prev, cItem]);
            }}
          >
            <ArrowUpToLine className="h-6 w-6" />
          </button>
        )}

        {isPrimary && !isSimilar && (
          <div className="absolute -top-3 left-4 bg-blue-600 text-white text-[10px] uppercase tracking-wide font-bold px-2 py-0.5 rounded-full shadow-sm">
            Primary Profile
          </div>
        )}

        <div className="flex items-center gap-3 mb-4 mt-2 pr-8">
          <div className="h-10 w-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500 font-semibold uppercase shrink-0 overflow-hidden outline outline-1 outline-gray-200 dark:outline-gray-700">
            {contact.avatarUrl ? (
              <img
                src={contact.avatarUrl}
                alt="Avatar"
                className="w-full h-full object-cover"
              />
            ) : (
              contact.name?.charAt(0) || "?"
            )}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm truncate">
              {contact.name || "Unknown Name"}
            </p>
            <p className="text-xs text-gray-500">
              Created {formatTime(contact._creationTime)}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <h4 className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-1.5">
              Metadata
            </h4>
            <div className="text-xs text-gray-600 dark:text-gray-400 grid grid-cols-[1fr_2fr] gap-x-2 gap-y-1">
              <span className="text-gray-400 font-medium">Company</span>
              <span className="truncate">{contact.company || "—"}</span>
              <span className="text-gray-400 font-medium">Title</span>
              <span className="truncate">{contact.jobTitle || "—"}</span>
              <span className="text-gray-400 font-medium">Other Names</span>
              <span
                className="truncate"
                title={contact.otherNames?.join(", ")}
              >
                {contact.otherNames?.length ? contact.otherNames.join(", ") : "—"}
              </span>
            </div>
          </div>

          {handles.length > 0 && (
            <div>
              <h4 className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-1.5 pt-2 border-t border-gray-100 dark:border-gray-800">
                Handles
              </h4>
              <div className="space-y-1">
                {handles.map((h) => (
                  <div
                    key={h._id}
                    className="bg-gray-50 dark:bg-gray-800 px-2 py-1.5 rounded text-xs flex justify-between items-center"
                  >
                    <span className="text-gray-900 dark:text-gray-200 font-medium truncate">
                      {h.value}
                    </span>
                    <span className="text-gray-400 text-[10px] uppercase bg-white dark:bg-gray-900 px-1 rounded-sm border border-gray-200 dark:border-gray-700">
                      {h.type}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {identities.length > 0 && (
            <div>
              <h4 className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-1.5 pt-2 border-t border-gray-100 dark:border-gray-800">
                Matrix Identities
              </h4>
              <div className="space-y-1">
                {identities.map((iden) => (
                  <div
                    key={iden._id}
                    className="text-xs text-gray-500 font-mono truncate"
                  >
                    {iden.matrixId}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </>
    );
  };

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm mb-6 flex flex-col">
      <div className="bg-gray-50/80 dark:bg-gray-800/60 px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center rounded-t-xl">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-md bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
            <Combine className="h-4 w-4" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
              Merge Duplicate Group
            </h3>
            <p className="text-[11px] text-gray-500 font-medium">
              {mainContacts.length} profiles selected for merge
            </p>
          </div>
        </div>
        <Button
          onClick={handleMerge}
          disabled={isMerging || mainContacts.length < 2}
        >
          {isMerging ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              Merging...
            </span>
          ) : (
            <span className="flex items-center gap-2">
              Confirm Merge ({mainContacts.length})
            </span>
          )}
        </Button>
      </div>

      <div className="p-5 overflow-x-auto custom-scrollbar">
        <div className="flex gap-4 min-w-max pb-2">
          {mainContacts.map((cItem) => {
            const isPrimary = primaryId === cItem.contact._id;
            return (
              <div
                key={cItem.contact._id}
                onClick={() => setPrimaryId(cItem.contact._id)}
                className={`w-[280px] p-4 rounded-xl border-2 transition-all cursor-pointer relative ${
                  isPrimary
                    ? "border-blue-600 bg-blue-50/50 dark:bg-blue-900/10 shadow-sm"
                    : "border-gray-200 dark:border-gray-800 hover:border-blue-300 dark:hover:border-blue-800/50 bg-white dark:bg-gray-900"
                }`}
              >
                {renderCardContent(cItem, isPrimary, false)}
              </div>
            );
          })}
        </div>
      </div>

      {similars.length > 0 && (
        <div className="bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-800 p-5 overflow-x-auto rounded-b-xl">
          <h4 className="text-xs font-bold uppercase text-gray-500 mb-4 tracking-wider flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            Similar Contacts Suggested
          </h4>
          <div className="flex gap-4 min-w-max pb-2">
            {similars.map((sItem) => (
              <div
                key={sItem.contact._id}
                className="w-[280px] p-4 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-700 bg-white/60 dark:bg-gray-900/30 relative hover:border-blue-300 dark:hover:border-gray-600 transition-colors"
              >
                {renderCardContent(sItem, false, true)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
