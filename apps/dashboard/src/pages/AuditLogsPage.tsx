import { api } from "@repo/api";
import { PageHeader } from "@repo/ui";
import { usePaginatedQuery } from "convex/react";
import {
  Bot,
  ChevronDown,
  ChevronRight,
  Database,
  Loader2,
  MessageSquare,
  Radio,
  ScrollText,
  Search,
  Shield,
  Users,
  Zap,
} from "lucide-react";
import { useMemo, useState } from "react";

// ---------------------------------------------------------------------------
// Action → icon mapping
// ---------------------------------------------------------------------------
const ENTITY_ICON_MAP: Record<string, React.ReactNode> = {
  contacts: <Users className="h-4 w-4" />,
  conversations: <MessageSquare className="h-4 w-4" />,
  messages: <MessageSquare className="h-4 w-4" />,
  channels: <Radio className="h-4 w-4" />,
  aiProviders: <Bot className="h-4 w-4" />,
  roles: <Shield className="h-4 w-4" />,
  artifacts: <Database className="h-4 w-4" />,
};

function getEntityIcon(entity?: string) {
  return ENTITY_ICON_MAP[entity ?? ""] ?? <Zap className="h-4 w-4" />;
}

// ---------------------------------------------------------------------------
// Human-friendly action labels
// ---------------------------------------------------------------------------
function formatAction(action: string): string {
  const [entity, verb] = action.split(".");
  if (!verb) return action;
  const verbs: Record<string, string> = {
    create: "Created",
    update: "Updated",
    delete: "Deleted",
    save: "Saved",
    send: "Sent",
    insert: "Received",
    redact: "Redacted",
    edit: "Edited",
    toggleAI: "Toggled AI",
    markAsRead: "Marked as read",
    requestPairing: "Requested Pairing",
    disconnect: "Disconnected",
    dismissSuggestedReply: "Dismissed Reply",
    dismissSuggestedAction: "Dismissed Action",
    setDefault: "Set as Default",
  };
  const entityLabels: Record<string, string> = {
    contact: "Contact",
    conversation: "Conversation",
    message: "Message",
    channel: "Channel",
    aiProvider: "AI Provider",
    role: "Role",
    artifact: "Artifact",
  };
  return `${verbs[verb] ?? verb} ${entityLabels[entity ?? ""] ?? entity}`;
}

// ---------------------------------------------------------------------------
// Relative time formatter
// ---------------------------------------------------------------------------
function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type SourceFilter = "all" | "auto" | "manual";

const ENTITY_OPTIONS = [
  "all",
  "contacts",
  "conversations",
  "messages",
  "channels",
  "aiProviders",
  "roles",
  "artifacts",
] as const;

export function AuditLogsPage() {
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [entityFilter, setEntityFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const querySource = sourceFilter === "all" ? undefined : sourceFilter;
  const queryEntity = entityFilter === "all" ? undefined : entityFilter;

  const { results, status, loadMore } = usePaginatedQuery(
    api.auditLogs.list,
    { source: querySource, entity: queryEntity },
    { initialNumItems: 10 },
  );

  const filtered = useMemo(() => {
    if (!results) return undefined;
    if (!search.trim()) return results;
    const q = search.toLowerCase();
    return results.filter(
      (l) =>
        l.action.toLowerCase().includes(q) ||
        (l.details && l.details.toLowerCase().includes(q)) ||
        (l.entity && l.entity.toLowerCase().includes(q)),
    );
  }, [results, search]);

  return (
    <div className="p-4 md:p-6 overflow-auto h-full">
      {/* Header */}
      <PageHeader
        title="Audit Logs"
        description="Complete history of every action taken across the system."
      />

      {/* Filters */}
      <div className="mt-6 flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-wrap">
        {/* Source pills */}
        <div
          className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800/60 rounded-lg p-1"
          data-testid="source-filter"
        >
          {(["all", "auto", "manual"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSourceFilter(s)}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-md capitalize transition-all ${
                sourceFilter === s
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Entity dropdown */}
        <select
          value={entityFilter}
          onChange={(e) => setEntityFilter(e.target.value)}
          className="text-xs font-medium bg-gray-100 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 capitalize text-gray-700 dark:text-gray-300"
          data-testid="entity-filter"
        >
          {ENTITY_OPTIONS.map((e) => (
            <option key={e} value={e}>
              {e === "all" ? "All entities" : e}
            </option>
          ))}
        </select>

        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search actions, entities…"
            className="w-full pl-9 pr-3 py-2 text-sm bg-gray-100 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
            data-testid="audit-search"
          />
        </div>
      </div>

      {/* Timeline */}
      <div className="mt-6 space-y-1">
        {filtered === undefined ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState />
        ) : (
          filtered.map((log) => {
            const isExpanded = expandedId === log._id;
            let parsedDetails: Record<string, unknown> | null = null;
            if (log.details) {
              try {
                parsedDetails = JSON.parse(log.details) as Record<
                  string,
                  unknown
                >;
              } catch {
                parsedDetails = null;
              }
            }
            return (
              <div
                key={log._id}
                className={`rounded-xl transition-colors ${
                  isExpanded
                    ? "bg-gray-50 dark:bg-gray-900/50"
                    : "hover:bg-gray-50 dark:hover:bg-gray-900/50"
                }`}
                data-testid="audit-log-entry"
              >
                {/* Clickable row */}
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : log._id)}
                  className="w-full flex items-start gap-3 py-3 px-4 text-left cursor-pointer"
                >
                  {/* Expand chevron */}
                  <span className="shrink-0 mt-1 text-gray-400 dark:text-gray-500">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </span>

                  {/* Icon */}
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg mt-0.5 ${
                      log.source === "auto"
                        ? "bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400"
                        : "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                    }`}
                  >
                    {getEntityIcon(log.entity)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                        {formatAction(log.action)}
                      </span>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-full ${
                          log.source === "auto"
                            ? "bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-300"
                            : "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300"
                        }`}
                      >
                        {log.source}
                      </span>
                    </div>
                    {log.entityId && (
                      <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 font-mono">
                        {log.entity}:{log.entityId}
                      </p>
                    )}
                  </div>

                  {/* Timestamp */}
                  <span className="shrink-0 text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap mt-1">
                    {timeAgo(log.timestamp)}
                  </span>
                </button>

                {/* Expanded details */}
                {isExpanded && parsedDetails && (
                  <div className="px-4 pb-4 pl-16">
                    <div className="bg-gray-100 dark:bg-gray-800/80 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                      <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 mb-2">
                        Details
                      </p>
                      <div className="space-y-1.5">
                        {Object.entries(parsedDetails).map(([key, value]) => (
                          <div
                            key={key}
                            className="flex items-baseline gap-3 text-sm"
                          >
                            <span className="shrink-0 font-mono text-xs text-gray-500 dark:text-gray-400 min-w-[120px]">
                              {key}
                            </span>
                            <span className="font-mono text-xs text-gray-800 dark:text-gray-200 break-all">
                              {typeof value === "object"
                                ? JSON.stringify(value, null, 2)
                                : String(value ?? "—")}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Expanded but raw string (non-JSON details) */}
                {isExpanded && log.details && !parsedDetails && (
                  <div className="px-4 pb-4 pl-16">
                    <div className="bg-gray-100 dark:bg-gray-800/80 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                      <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 mb-2">
                        Details
                      </p>
                      <p className="font-mono text-xs text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                        {log.details}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Load More */}
      {status === "CanLoadMore" && (
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={() => loadMore(10)}
            className="px-5 py-2.5 text-sm font-medium rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
            data-testid="load-more-btn"
          >
            Load more
          </button>
        </div>
      )}
      {status === "LoadingMore" && (
        <div className="mt-6 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-16">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800 mx-auto mb-4">
        <ScrollText className="h-7 w-7 text-gray-400" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
        No audit logs yet
      </h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5 max-w-md mx-auto">
        Actions across the system will be logged here automatically. Perform an
        action like creating a contact or sending a message to see logs appear.
      </p>
    </div>
  );
}
