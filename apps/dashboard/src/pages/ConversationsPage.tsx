import { api, type Id } from "@repo/api";
import { Button, ConfirmDialog, Input } from "@repo/ui";
import { ConversationDrawer } from "../components/conversation-drawer/conversation-drawer";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import {
  ArrowLeft,
  Bot,
  Inbox,
  Loader2,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  Send,
  Sparkles,
  Tag,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { channelColorMap, channelIconMap } from "../components/ChannelIcons";
import { AI_TOGGLE_COLORS } from "../constants";

// Status Badge styles matching our three states
const statusConfig: Record<string, { color: string; label: string }> = {
  idle: { color: "bg-gray-400", label: "Idle" },
  needs_reply: { color: "bg-blue-500", label: "Needs Reply" },
  waiting_on_contact: { color: "bg-amber-500", label: "Waiting on Contact" },
};

// Channel status dot colors
const channelStatusDot: Record<string, string> = {
  connected: "bg-emerald-400",
  pairing: "bg-amber-400 animate-pulse",
  error: "bg-red-400",
  disconnected: "bg-gray-400",
};

export function ConversationsPage() {
  const channels = useQuery(api.channels.list);
  const [selectedChannelId, setSelectedChannelId] =
    useState<Id<"channels"> | null>(null);

  const {
    results: conversations,
    status: paginationStatus,
    loadMore,
  } = usePaginatedQuery(
    api.conversations.queries.list,
    selectedChannelId ? { channelId: selectedChannelId } : {},
    { initialNumItems: 20 },
  );

  const [selectedId, setSelectedId] = useState<Id<"conversations"> | null>(
    null,
  );
  const [search, setSearch] = useState("");

  // Reset selected conversation when switching channels
  useEffect(() => {
    setSelectedId(null);
    setSearch("");
  }, [selectedChannelId]);

  // Infinite scroll — observe a sentinel element at the bottom of the list
  const sentinelRef = useRef<HTMLDivElement>(null);
  const handleIntersection = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0]?.isIntersecting && paginationStatus === "CanLoadMore") {
        loadMore(20);
      }
    },
    [paginationStatus, loadMore],
  );
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(handleIntersection, {
      rootMargin: "200px",
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [handleIntersection]);

  const filtered = useMemo(() => {
    if (!conversations) return [];
    if (!search.trim()) return conversations;
    const q = search.toLowerCase();
    return conversations.filter(
      (c) =>
        c.participantDetails.name.toLowerCase().includes(q) ||
        c.participantDetails.phone.toLowerCase().includes(q),
    );
  }, [conversations, search]);

  return (
    <div className="flex h-full">
      {/* ── CHANNEL SIDEBAR ─────────────────────────────────────── */}
      <div className="hidden md:flex w-14 shrink-0 flex-col items-center border-r border-gray-200 dark:border-gray-800 bg-gray-100/60 dark:bg-gray-900/80 py-3 gap-1">
        {/* All channels */}
        <button
          type="button"
          data-testid="channel-filter-all"
          title="All channels"
          onClick={() => setSelectedChannelId(null)}
          className={`group relative flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-200 ${
            selectedChannelId === null
              ? "bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 shadow-sm ring-2 ring-blue-500/30"
              : "text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800"
          }`}
        >
          <Inbox className="h-5 w-5" />
          {/* Tooltip */}
          <span className="pointer-events-none absolute left-full ml-2 rounded-md bg-gray-900 dark:bg-gray-100 px-2 py-1 text-xs font-medium text-white dark:text-gray-900 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 shadow-lg">
            All channels
          </span>
        </button>

        {/* Divider */}
        <div className="w-6 border-t border-gray-300 dark:border-gray-700 my-1.5" />

        {/* Per-channel icons */}
        {channels?.map((channel) => {
          const IconComponent = channelIconMap[channel.type];
          const colors = channelColorMap[channel.type];
          const isActive = selectedChannelId === channel._id;
          const dotColor =
            channelStatusDot[channel.status] ?? channelStatusDot.disconnected;

          if (!IconComponent || !colors) return null;

          return (
            <button
              type="button"
              key={channel._id}
              data-testid={`channel-filter-${channel._id}`}
              title={channel.label}
              onClick={() => setSelectedChannelId(channel._id)}
              className={`group relative flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-200 ${
                isActive
                  ? `${colors.bg} ${colors.text} shadow-sm ring-2 ring-current/20`
                  : "text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800"
              }`}
            >
              <IconComponent className="h-5 w-5" />
              {/* Status dot */}
              <span
                className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-gray-100 dark:border-gray-900 ${dotColor}`}
              />
              {/* Tooltip */}
              <span className="pointer-events-none absolute left-full ml-2 rounded-md bg-gray-900 dark:bg-gray-100 px-2 py-1 text-xs font-medium text-white dark:text-gray-900 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 shadow-lg">
                {channel.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── LEFT PANEL: Conversation List ────────────────────────────── */}
      <div
        className={`w-full md:w-80 shrink-0 border-r border-gray-200 dark:border-gray-800 flex flex-col bg-gray-50/50 dark:bg-gray-900/50 ${selectedId ? "hidden md:flex" : "flex"}`}
      >
        {/* Mobile channel selector (shown below md breakpoint) */}
        <div className="md:hidden flex items-center gap-1.5 px-3 pt-3 overflow-x-auto">
          <button
            type="button"
            onClick={() => setSelectedChannelId(null)}
            className={`shrink-0 flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
              selectedChannelId === null
                ? "bg-blue-100 dark:bg-blue-900/40 text-blue-600"
                : "text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800"
            }`}
          >
            <Inbox className="h-4 w-4" />
          </button>
          {channels?.map((channel) => {
            const IconComponent = channelIconMap[channel.type];
            const colors = channelColorMap[channel.type];
            const isActive = selectedChannelId === channel._id;
            if (!IconComponent || !colors) return null;
            return (
              <button
                type="button"
                key={channel._id}
                onClick={() => setSelectedChannelId(channel._id)}
                className={`shrink-0 flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                  isActive
                    ? `${colors.bg} ${colors.text}`
                    : "text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800"
                }`}
              >
                <IconComponent className="h-4 w-4" />
              </button>
            );
          })}
        </div>

        <div className="p-3 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search conversations..."
                className="pl-9 bg-white dark:bg-gray-800 h-9 text-sm"
              />
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 &&
          paginationStatus === "LoadingFirstPage" ? (
            <div className="p-4 space-y-3">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className="animate-pulse flex items-center gap-3 p-3"
                >
                  <div className="h-10 w-10 rounded-full bg-gray-200 dark:bg-gray-700" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-24 rounded bg-gray-200 dark:bg-gray-700" />
                    <div className="h-2.5 w-32 rounded bg-gray-200 dark:bg-gray-700" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500 p-6">
              <MessageSquare className="h-10 w-10 mb-2 opacity-40" />
              <p className="text-sm font-medium">No conversations found</p>
            </div>
          ) : (
            <>
              {filtered.map((conv) => {
                const statusObj = statusConfig[conv.status || "idle"];
                const isSelected = selectedId === conv._id;
                const hasAnyAI =
                  conv.aiEnabled || conv.autoSend || conv.autoAct;
                return (
                  <button
                    type="button"
                    key={conv._id}
                    onClick={() => setSelectedId(conv._id)}
                    className={`relative w-full text-left px-4 py-3 flex items-center gap-3 transition-colors border-b border-gray-100 dark:border-gray-800/60 hover:bg-gray-100 dark:hover:bg-gray-800/50 ${
                      isSelected
                        ? "bg-blue-50 dark:bg-blue-950/30 border-l-2 border-l-blue-500"
                        : ""
                    }`}
                  >
                    {/* 3-segment AI status bar */}
                    {!isSelected && hasAnyAI && (
                      <span className="absolute left-0 top-0 bottom-0 w-[3px] flex flex-col">
                        <span
                          className={`flex-1 ${conv.aiEnabled ? AI_TOGGLE_COLORS.aiEnabled : "bg-transparent"}`}
                        />
                        <span
                          className={`flex-1 ${conv.autoSend ? AI_TOGGLE_COLORS.autoSend : "bg-transparent"}`}
                        />
                        <span
                          className={`flex-1 ${conv.autoAct ? AI_TOGGLE_COLORS.autoAct : "bg-transparent"}`}
                        />
                      </span>
                    )}
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white font-semibold text-sm shadow-sm relative ${
                        conv.memberCount > 2
                          ? "bg-gradient-to-br from-violet-500 to-purple-600"
                          : "bg-gradient-to-br from-blue-500 to-indigo-600"
                      }`}
                    >
                      {conv.memberCount > 2 ? (
                        <Users className="h-4.5 w-4.5" />
                      ) : (
                        conv.participantDetails.name.charAt(0).toUpperCase()
                      )}
                      <span
                        title={statusObj?.label}
                        className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white dark:border-gray-900 ${statusObj?.color}`}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm truncate text-gray-900 dark:text-gray-100">
                          {conv.participantDetails.name}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {(conv.unreadCount ?? 0) > 0 && (
                            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 text-[10px] font-bold text-white shadow-sm">
                              {conv.unreadCount}
                            </span>
                          )}
                          {conv.memberCount > 2 && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium leading-tight bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-400">
                              {conv.memberCount} members
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                        {conv.memberCount > 2
                          ? (conv.topic ?? "Group conversation")
                          : conv.participantDetails.phone || conv.matrixRoomId}
                      </p>
                    </div>
                  </button>
                );
              })}

              {/* Infinite scroll sentinel */}
              <div ref={sentinelRef} className="h-1" />

              {paginationStatus === "LoadingMore" && (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── RIGHT PANEL: Chat View ───────────────────────────────────── */}
      <div
        className={`flex-1 flex flex-col min-w-0 ${selectedId ? "flex" : "hidden md:flex"}`}
      >
        {selectedId ? (
          <ChatPanel
            id={selectedId}
            onDelete={() => setSelectedId(null)}
            onBack={() => setSelectedId(null)}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 dark:text-gray-500">
            <MessageSquare className="h-16 w-16 mb-4 opacity-30" />
            <p className="text-lg font-medium">Select a conversation</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ChatPanel({
  id,
  onDelete,
  onBack,
}: {
  id: Id<"conversations">;
  onDelete: () => void;
  onBack: () => void;
}) {
  const data = useQuery(api.conversations.queries.getWithMessages, { id });
  const sendMessage = useMutation(api.messages.mutations.sendMessage);
  const updateAISettings = useMutation(
    api.conversations.mutations.updateAISettings,
  );
  const deleteConversation = useMutation(
    api.conversations.mutations.deleteConversation,
  );
  const markAsRead = useMutation(api.conversations.mutations.markAsRead);
  const dismissSuggestedReplyMut = useMutation(
    api.conversations.mutations.dismissSuggestedReply,
  );
  const dismissSuggestedActionMut = useMutation(
    api.conversations.mutations.dismissSuggestedAction,
  );
  const executeSuggestedActionMut = useMutation(
    api.conversations.mutations.executeSuggestedAction,
  );

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Mark conversation as read when opened
  useEffect(() => {
    markAsRead({ conversationId: id });
  }, [id, markAsRead]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data?.messages]);

  if (!data)
    return (
      <div className="flex-1 flex items-center justify-center">Loading...</div>
    );

  const handleSend = async () => {
    if (!draft.trim() || sending) return;
    setSending(true);
    try {
      await sendMessage({ conversationId: id, content: draft.trim() });
      setDraft("");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-2 md:gap-3 px-3 md:px-6 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 shrink-0">
        <button
          type="button"
          onClick={onBack}
          className="md:hidden flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-full text-white font-semibold ${
            data.memberCount > 2
              ? "bg-gradient-to-br from-violet-500 to-purple-600"
              : "bg-gradient-to-br from-blue-500 to-indigo-600"
          }`}
        >
          {data.memberCount > 2 ? (
            <Users className="h-4 w-4" />
          ) : (
            data.participantDetails.name.charAt(0).toUpperCase()
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-sm text-gray-900 dark:text-gray-100">
            {data.participantDetails.name}
          </h2>
          <div className="text-[11px] text-gray-500">
            {data.memberCount > 2
              ? `${data.memberCount} members${data.topic ? ` · ${data.topic}` : ""}`
              : data.participantDetails.phone || "No phone linked"}
          </div>
        </div>

        {/* AI toggle status dots (read-only) */}
        {(data.aiEnabled || data.autoSend || data.autoAct) && (
          <div
            className="flex items-center gap-1 mr-1"
            title="AI: green = Enabled, amber = Auto Send, violet = Auto Act"
          >
            {data.aiEnabled && (
              <span
                className={`h-2 w-2 rounded-full ${AI_TOGGLE_COLORS.aiEnabled}`}
              />
            )}
            {data.autoSend && (
              <span
                className={`h-2 w-2 rounded-full ${AI_TOGGLE_COLORS.autoSend}`}
              />
            )}
            {data.autoAct && (
              <span
                className={`h-2 w-2 rounded-full ${AI_TOGGLE_COLORS.autoAct}`}
              />
            )}
          </div>
        )}

        {/* Conversation Settings Drawer */}
        <ConversationDrawer
          aiEnabled={data.aiEnabled === true}
          autoSend={data.autoSend === true}
          autoAct={data.autoAct === true}
          tokensIn={data.aiTokensIn}
          tokensOut={data.aiTokensOut}
          onAIEnabledChange={(checked) =>
            updateAISettings({
              conversationId: id,
              aiEnabled: checked,
            })
          }
          onAutoSendChange={(checked) =>
            updateAISettings({
              conversationId: id,
              autoSend: checked,
            })
          }
          onAutoActChange={(checked) =>
            updateAISettings({
              conversationId: id,
              autoAct: checked,
            })
          }
          onDeleteChat={() => setShowDeleteConfirm(true)}
        />
      </div>

      {/* Feed */}
      <div className="flex-1 overflow-y-auto px-6 py-4 bg-gray-50 dark:bg-gray-900/30">
        <div className="space-y-3">
          {data.messages.map((msg) => {
            const isUser = msg.direction === "in";
            const isGroup = (data.memberCount ?? 0) > 2;
            const senderLabel = isUser ? (msg.senderName ?? msg.sender) : "You";
            const isRedacted = msg.isRedacted === true;
            const isEdited = msg.editedAt != null;
            const messageType = msg.type ?? "text";
            const hasAttachment =
              messageType !== "text" &&
              messageType !== "notice" &&
              msg.attachmentUrl;

            return (
              <div key={msg._id}>
                <div
                  className={`flex ${isUser ? "justify-start" : "justify-end"}`}
                >
                  {/* Sender initial avatar — groups only, incoming only */}
                  {isUser && isGroup && (
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-cyan-600 text-white text-[10px] font-bold mr-2 mt-0.5 shadow-sm">
                      {(msg.senderName ?? "?").charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div
                    className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${isUser ? "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-tl-sm text-gray-900 dark:text-gray-100" : "bg-blue-600 text-white rounded-tr-sm"}`}
                  >
                    {/* Sender name label */}
                    <p
                      className={`text-[11px] font-semibold mb-1 ${isUser ? "text-teal-600 dark:text-teal-400" : "text-white/80"}`}
                    >
                      {senderLabel}
                    </p>

                    {/* Deleted marker */}
                    {isRedacted && (
                      <div
                        className={`mb-1.5 flex items-center gap-1 text-[11px] font-medium opacity-80 ${isUser ? "text-red-500" : "text-red-200"}`}
                      >
                        <Trash2 className="h-3 w-3" />
                        <span>Deleted message</span>
                      </div>
                    )}

                    {/* Message Body Context */}
                    <div className={`${isRedacted ? "opacity-60" : ""}`}>
                      {/* Attachment type indicator for media */}
                      {hasAttachment && (
                        <div
                          className={`text-xs font-medium mb-1 flex items-center gap-1 ${isUser ? "text-gray-500" : "text-white/70"}`}
                        >
                          {messageType === "image" && "📷 Image"}
                          {messageType === "video" && "🎬 Video"}
                          {messageType === "audio" && "🎵 Audio"}
                          {messageType === "file" &&
                            `📎 ${msg.attachmentFileName ?? "File"}`}
                          {messageType === "sticker" && "🏷️ Sticker"}
                        </div>
                      )}
                      {msg.text && (
                        <p
                          className={`whitespace-pre-wrap ${isRedacted ? "line-through" : ""}`}
                        >
                          {msg.text}
                        </p>
                      )}
                    </div>

                    {/* Edit history — previous versions */}
                    {isEdited &&
                      msg.editHistory &&
                      msg.editHistory.length > 0 && (
                        <div
                          className={`mt-2 border-t ${isUser ? "border-gray-200 dark:border-gray-700" : "border-white/20"} pt-1.5`}
                        >
                          <p
                            className={`text-[10px] font-medium mb-1 ${isUser ? "text-gray-400 dark:text-gray-500" : "text-white/50"}`}
                          >
                            Previous{" "}
                            {msg.editHistory.length === 1
                              ? "version"
                              : "versions"}
                          </p>
                          {[...msg.editHistory].reverse().map((entry, idx) => (
                            <div
                              key={idx}
                              className={`${idx > 0 ? "mt-1.5" : ""}`}
                            >
                              <p
                                className={`whitespace-pre-wrap text-xs line-through ${isUser ? "text-gray-400 dark:text-gray-500" : "text-white/40"}`}
                              >
                                {entry.text}
                              </p>
                              <p
                                className={`text-[9px] ${isUser ? "text-gray-300 dark:text-gray-600" : "text-white/30"}`}
                              >
                                {new Date(entry.editedAt).toLocaleString()}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}

                    {/* Timestamp + edited label */}
                    <p
                      className={`text-[10px] mt-1.5 ${isUser ? "text-gray-400" : "text-white/70"}`}
                    >
                      {new Date(msg.timestamp).toLocaleString()}
                      {isEdited && (
                        <span className="ml-1.5 italic">(edited)</span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Reactions row */}
                {msg.reactions && msg.reactions.length > 0 && (
                  <div
                    className={`flex gap-1 mt-1 ${isUser ? "justify-start" : "justify-end"} ${isUser && isGroup ? "ml-9" : ""}`}
                  >
                    {msg.reactions.map((r) => (
                      <span
                        key={r.key}
                        className="inline-flex items-center gap-0.5 rounded-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-2 py-0.5 text-xs shadow-sm"
                      >
                        <span>{r.key}</span>
                        {r.senders.length > 1 && (
                          <span className="text-gray-500 font-medium">
                            {r.senders.length}
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Typing indicator */}
          {data.typingUsers && data.typingUsers.length > 0 && (
            <div className="flex justify-start">
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                <div className="flex items-center gap-1">
                  <span
                    className="h-2 w-2 rounded-full bg-gray-400 animate-bounce"
                    style={{ animationDelay: "0ms" }}
                  />
                  <span
                    className="h-2 w-2 rounded-full bg-gray-400 animate-bounce"
                    style={{ animationDelay: "150ms" }}
                  />
                  <span
                    className="h-2 w-2 rounded-full bg-gray-400 animate-bounce"
                    style={{ animationDelay: "300ms" }}
                  />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* AI Suggested Actions */}
      {data.suggestedActions?.map((actionStr, idx) => {
        let parsed: Record<string, unknown> = {};
        try {
          parsed = JSON.parse(actionStr);
        } catch {
          /* raw string fallback */
        }
        const actionType = (parsed.type as string) ?? "unknown";

        // Badge config per action type
        const badgeConfig: Record<
          string,
          {
            icon: typeof Plus;
            label: string;
            bg: string;
            border: string;
            text: string;
            accent: string;
          }
        > = {
          createArtifact: {
            icon: Plus,
            label: "Add",
            bg: "bg-emerald-50",
            border: "border-emerald-200",
            text: "text-emerald-700",
            accent: "bg-emerald-500",
          },
          updateContact: {
            icon: Pencil,
            label: "Update",
            bg: "bg-sky-50",
            border: "border-sky-200",
            text: "text-sky-700",
            accent: "bg-sky-500",
          },
          assignRole: {
            icon: Tag,
            label: "Assign",
            bg: "bg-violet-50",
            border: "border-violet-200",
            text: "text-violet-700",
            accent: "bg-violet-500",
          },
        };
        const badge = badgeConfig[actionType] ?? {
          icon: Bot,
          label: actionType,
          bg: "bg-gray-50",
          border: "border-gray-200",
          text: "text-gray-700",
          accent: "bg-gray-500",
        };
        const BadgeIcon = badge.icon;

        // Extract displayable fields (exclude 'type' and IDs)
        const displayFields = Object.entries(parsed).filter(
          ([k]) => k !== "type" && k !== "contactId",
        );

        return (
          <div
            key={idx}
            className={`px-4 py-3 ${badge.bg} border-t ${badge.border} flex flex-col gap-2`}
          >
            {/* Header row */}
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold text-white ${badge.accent}`}
              >
                <BadgeIcon className="h-3 w-3" />
                {badge.label}
              </span>
              <span className={`text-xs font-medium ${badge.text}`}>
                {actionType === "updateContact" && "Contact"}
                {actionType === "createArtifact" && "Memory / Fact"}
                {actionType === "assignRole" && "Role"}
              </span>
              <div className="flex-1" />
              <Button
                size="sm"
                onClick={() =>
                  executeSuggestedActionMut({
                    conversationId: id,
                    actionIndex: idx,
                    actionJson: actionStr,
                    source: "user",
                  })
                }
                className={`h-6 px-2.5 text-[10px] font-semibold ${badge.accent} hover:opacity-90`}
              >
                Approve
              </Button>
              <button
                type="button"
                onClick={() =>
                  dismissSuggestedActionMut({
                    conversationId: id,
                    actionIndex: idx,
                  })
                }
                className="text-gray-400 hover:text-gray-600 shrink-0"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Field details */}
            {displayFields.length > 0 && (
              <div className="flex flex-col gap-1.5 pl-1">
                {displayFields.map(([key, value]) => {
                  // Format value for display — handle arrays and objects
                  const formatValue = (v: unknown): string => {
                    if (v === null || v === undefined) return "—";
                    if (Array.isArray(v)) {
                      return v
                        .map((item) => {
                          if (typeof item === "object" && item !== null) {
                            // e.g. { label: "work", value: "email@..." }
                            const obj = item as Record<string, unknown>;
                            const parts = Object.values(obj).filter(Boolean);
                            return parts.join(": ");
                          }
                          return String(item);
                        })
                        .join(", ");
                    }
                    if (typeof v === "object") {
                      return Object.entries(v as Record<string, unknown>)
                        .filter(([, val]) => val)
                        .map(([k, val]) => `${k}: ${val}`)
                        .join(", ");
                    }
                    return String(v);
                  };

                  const formatted = formatValue(value);

                  return (
                    <div
                      key={key}
                      className="flex items-baseline gap-2 text-xs"
                    >
                      <span className="text-gray-400 font-medium min-w-[60px]">
                        {key}
                      </span>
                      {actionType === "updateContact" ? (
                        <span className="flex items-center gap-1.5">
                          <span className="text-gray-300 line-through">
                            empty
                          </span>
                          <span className="text-gray-400">→</span>
                          <span className={`font-medium ${badge.text}`}>
                            {formatted}
                          </span>
                        </span>
                      ) : (
                        <span className={badge.text}>{formatted}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      {data.suggestedReply && (
        <div className="px-4 py-2 bg-amber-50 border-t border-amber-200 flex items-start gap-3">
          <Sparkles className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <div className="flex-1 text-sm text-gray-700 whitespace-pre-wrap">
            {data.suggestedReply}
          </div>
          <Button
            size="sm"
            onClick={() => {
              setDraft(data.suggestedReply ?? "");
              dismissSuggestedReplyMut({ conversationId: id });
            }}
            className="bg-amber-500 h-7 text-xs"
          >
            Use Reply
          </Button>
          <button
            type="button"
            onClick={() => dismissSuggestedReplyMut({ conversationId: id })}
            className="text-gray-400 hover:text-gray-600 shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Compose */}
      <div className="p-3 border-t border-gray-200 bg-white dark:bg-gray-950 flex items-center gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Type a message..."
          className="flex-1"
        />
        <Button onClick={handleSend} disabled={!draft.trim() || sending}>
          <Send className="h-4 w-4" />
        </Button>
      </div>

      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title="Delete conversation"
        description="This will permanently delete this conversation."
        confirmLabel="Delete"
        onConfirm={async () => {
          await deleteConversation({ conversationId: id });
          setShowDeleteConfirm(false);
          onDelete();
        }}
      />
    </>
  );
}
