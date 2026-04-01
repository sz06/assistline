import { useUIMessages } from "@convex-dev/agent/react";
import { api, type Id } from "@repo/api";
import { Button, Input } from "@repo/ui";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import {
  ArrowLeft,
  Bot,
  Loader2,
  MessageSquarePlus,
  Pencil,
  Search,
  Send,
  Sparkles,
  Trash2,
  User,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { InlineSuggestionCard } from "../components/artifacts/inline-suggestion-card";
import { useDebounce } from "../hooks/use-debounce";

export function ChatPage() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);

  const {
    results: sessions,
    status: paginationStatus,
    loadMore,
  } = usePaginatedQuery(
    api.chatSessions.listPaginated,
    { search: debouncedSearch || undefined },
    { initialNumItems: 20 },
  );

  const createSession = useMutation(api.chatSessions.create);
  const removeSession = useMutation(api.chatSessions.remove);
  const renameSession = useMutation(api.chatSessions.rename);
  const sendMessage = useMutation(api.chatSessions.sendMessage);

  const [activeSessionId, setActiveSessionId] =
    useState<Id<"chatSessions"> | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  // Sidebar state
  const [renamingId, setRenamingId] = useState<Id<"chatSessions"> | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Infinite scroll sentinel
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

  // Resolve the active session
  const activeSession = sessions?.find((s) => s._id === activeSessionId);

  // Auto-select newest session on initial load only (not when user presses back)
  const hasAutoSelected = useRef(false);
  useEffect(() => {
    if (
      !hasAutoSelected.current &&
      !activeSessionId &&
      sessions &&
      sessions.length > 0
    ) {
      hasAutoSelected.current = true;
      setActiveSessionId(sessions[0]._id);
    }
  }, [sessions, activeSessionId]);

  const handleNewChat = async () => {
    const { sessionId } = await createSession({});
    setActiveSessionId(sessionId);
    setInput("");
  };

  const handleSend = async () => {
    if (!input.trim() || !activeSessionId || sending) return;
    const text = input.trim();
    setInput("");
    setSending(true);
    try {
      await sendMessage({ sessionId: activeSessionId, text });
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleRename = async (id: Id<"chatSessions">) => {
    if (renameValue.trim()) {
      await renameSession({ id, title: renameValue.trim() });
    }
    setRenamingId(null);
  };

  const handleDelete = async (id: Id<"chatSessions">) => {
    await removeSession({ id });
    if (activeSessionId === id) {
      setActiveSessionId(null);
    }
  };

  return (
    <div className="flex h-full">
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      {/* On mobile: full width when no session selected; hidden when one is selected */}
      <aside
        className={`w-full md:w-64 shrink-0 border-r border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 flex flex-col ${
          activeSessionId ? "hidden md:flex" : "flex"
        }`}
      >
        <div className="p-3 border-b border-gray-200 dark:border-gray-800 flex flex-col gap-2">
          <Button
            onClick={handleNewChat}
            className="w-full justify-center"
            data-testid="new-chat-btn"
          >
            <MessageSquarePlus className="h-4 w-4 mr-2" />
            New Chat
          </Button>
          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search chats…"
              className="pl-8 h-8 text-sm"
              data-testid="chat-search-input"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {paginationStatus === "LoadingFirstPage" ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-8 px-3">
              {search ? "No chats match your search" : "No chats yet"}
            </p>
          ) : (
            <div className="py-1">
              {sessions.map((s) => (
                <SessionItem
                  key={s._id}
                  session={s}
                  isActive={s._id === activeSessionId}
                  isRenaming={s._id === renamingId}
                  renameValue={renameValue}
                  onSelect={() => {
                    setActiveSessionId(s._id);
                    setRenamingId(null);
                  }}
                  onStartRename={() => {
                    setRenamingId(s._id);
                    setRenameValue(s.title ?? "");
                  }}
                  onRenameChange={setRenameValue}
                  onRenameSubmit={() => handleRename(s._id)}
                  onRenameCancel={() => setRenamingId(null)}
                  onDelete={() => handleDelete(s._id)}
                />
              ))}

              {/* Infinite scroll sentinel */}
              <div ref={sentinelRef} className="h-1" />

              {paginationStatus === "LoadingMore" && (
                <div className="flex justify-center py-3">
                  <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                </div>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* ── Main Chat Area ──────────────────────────────────────────────── */}
      {/* On mobile: hidden when no session selected; full width when one is selected */}
      <div
        className={`flex-1 flex flex-col min-w-0 ${
          activeSessionId ? "flex" : "hidden md:flex"
        }`}
      >
        {activeSession ? (
          <ChatThread
            key={activeSession._id}
            session={activeSession}
            input={input}
            sending={sending}
            onInputChange={setInput}
            onSend={handleSend}
            onKeyDown={handleKeyDown}
            onBack={() => setActiveSessionId(null)}
          />
        ) : (
          <EmptyState onNewChat={handleNewChat} />
        )}
      </div>
    </div>
  );
}

// ── Session Sidebar Item ─────────────────────────────────────────────────────

function SessionItem({
  session,
  isActive,
  isRenaming,
  renameValue,
  onSelect,
  onStartRename,
  onRenameChange,
  onRenameSubmit,
  onRenameCancel,
  onDelete,
}: {
  session: { _id: Id<"chatSessions">; title?: string; updatedAt: number };
  isActive: boolean;
  isRenaming: boolean;
  renameValue: string;
  onSelect: () => void;
  onStartRename: () => void;
  onRenameChange: (v: string) => void;
  onRenameSubmit: () => void;
  onRenameCancel: () => void;
  onDelete: () => void;
}) {
  const displayTitle = session.title || "Untitled Chat";

  if (isRenaming) {
    return (
      <div className="px-2 py-1">
        <div className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-white dark:bg-gray-800 border border-blue-300 dark:border-blue-700">
          <Input
            value={renameValue}
            onChange={(e) => onRenameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onRenameSubmit();
              if (e.key === "Escape") onRenameCancel();
            }}
            className="h-7 text-xs border-0 p-0 shadow-none focus:ring-0"
            autoFocus
          />
          <button
            type="button"
            onClick={onRenameCancel}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-2 py-0.5">
      <div
        className={`group flex items-center w-full rounded-lg transition-colors ${
          isActive
            ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-medium"
            : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
        }`}
      >
        <button
          type="button"
          onClick={onSelect}
          className="flex-1 flex items-center gap-2 px-3 py-2 text-left text-sm truncate bg-transparent border-none outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset rounded-lg"
        >
          <Bot className="h-4 w-4 shrink-0 opacity-60" />
          <span className="truncate">{displayTitle}</span>
        </button>
        <div className="hidden group-hover:flex items-center gap-0.5 shrink-0 pr-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onStartRename();
            }}
            className="p-1 rounded text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
            title="Rename"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            title="Delete"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Chat Thread ──────────────────────────────────────────────────────────────

function ChatThread({
  session,
  input,
  sending,
  onInputChange,
  onSend,
  onKeyDown,
  onBack,
}: {
  session: {
    _id: Id<"chatSessions">;
    threadId: string;
    title?: string;
  };
  input: string;
  sending: boolean;
  onInputChange: (v: string) => void;
  onSend: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onBack: () => void;
}) {
  const { results: messages, status } = useUIMessages(
    api.chatSessions.listThreadMessages,
    { threadId: session.threadId },
    { initialNumItems: 50, stream: true },
  );

  const artifactSuggestions = useQuery(api.artifactSuggestions.queries.list, {
    sessionId: session._id,
  });
  const roles = useQuery(api.roles.list);

  const dismissSuggestedAction = useMutation(
    api.artifactSuggestions.mutations.dismiss,
  );
  const executeSuggestedAction = useMutation(
    api.artifactSuggestions.mutations.execute,
  );

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const isLoading = status === "LoadingFirstPage";
  const isStreaming = messages?.some(
    (m) => m.role === "assistant" && m.status === "streaming",
  );

  return (
    <>
      {/* Mobile header — back button + session title */}
      <div className="md:hidden flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 shrink-0">
        <button
          type="button"
          onClick={onBack}
          className="flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
          {session.title ?? "Untitled Chat"}
        </span>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 md:px-8 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : messages && messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-900/20 mb-4">
              <Sparkles className="h-7 w-7 text-blue-500" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Start a conversation
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-sm">
              Ask me anything — I can search your artifacts, remember facts, and
              help you manage your contacts.
            </p>
          </div>
        ) : (
          <div className="w-full space-y-4">
            {messages?.map((msg, idx) => (
              <MessageBubble
                key={`${session.threadId}-${idx}`}
                role={msg.role}
                parts={msg.parts}
                isStreaming={msg.status === "streaming"}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Suggested Actions Banner */}
      {artifactSuggestions && artifactSuggestions.length > 0 && (
        <div className="flex flex-col border-t border-gray-200 dark:border-gray-800 bg-emerald-50/50 dark:bg-emerald-950/20">
          {artifactSuggestions.map((action, idx) => (
            <InlineSuggestionCard
              key={action._id || idx}
              suggestion={action}
              roles={roles}
              onApprove={() =>
                executeSuggestedAction({ suggestionId: action._id })
              }
              onDismiss={() =>
                dismissSuggestedAction({ suggestionId: action._id })
              }
              className="px-4 md:px-8 border-b border-gray-200 dark:border-gray-800/50 last:border-b-0"
            />
          ))}
        </div>
      )}

      {/* Input bar */}
      <div className="border-t border-gray-200 dark:border-gray-800 px-4 md:px-8 py-3 bg-white dark:bg-gray-950">
        <div className="w-full flex items-end gap-3">
          <textarea
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Type a message…"
            rows={1}
            className="flex-1 resize-none rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 focus:outline-none transition-colors"
            data-testid="chat-input"
          />
          <button
            type="button"
            onClick={onSend}
            disabled={!input.trim() || sending}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
            data-testid="chat-send-btn"
          >
            {sending || isStreaming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Message Bubble ───────────────────────────────────────────────────────────

function MessageBubble({
  role,
  parts,
  isStreaming,
}: {
  role: string;
  // biome-ignore lint/suspicious/noExplicitAny: msg.parts contains tool tracking
  parts: Array<any>;
  isStreaming: boolean;
}) {
  const isUser = role === "user";
  const textContent = parts
    .filter((p) => p.type === "text" && p.text)
    .map((p) => p.text)
    .join("");

  // Extract artifact count from tool results
  let artifactCount = 0;
  if (!isUser) {
    for (const p of parts) {
      // Handle the 'tool-searchArtifacts' type from useUIMessages parts
      if (p.type === "tool-searchArtifacts" && p.output) {
        try {
          const res = typeof p.output === "string" ? JSON.parse(p.output) : p.output;
          if (typeof res.count === "number") {
            artifactCount += res.count;
          }
        } catch (e) {
          // safely ignore
        }
      }
      // Fallback for standard AI SDK toolResult parts just in case
      else if (p.type === "toolResult" && (p.toolName === "searchArtifacts" || p.name === "searchArtifacts") && p.result) {
        try {
          const res = typeof p.result === "string" ? JSON.parse(p.result) : p.result;
          if (typeof res.count === "number") {
            artifactCount += res.count;
          }
        } catch (e) {
          // safely ignore
        }
      }
    }
  }

  if (!textContent && !isStreaming) return null;

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      {/* Avatar */}
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          isUser
            ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
            : "bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400"
        }`}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>

      {/* Message and Metadata */}
      <div className="flex flex-col gap-1.5 max-w-[80%]">
        <div
          className={`rounded-2xl px-4 py-2.5 text-sm ${
            isUser
              ? "bg-blue-600 text-white rounded-br-md"
              : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-md"
          }`}
        >
          {textContent ? (
            isUser ? (
              <p className="whitespace-pre-wrap">{textContent}</p>
            ) : (
              <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-pre:my-2 prose-code:text-xs">
                <Markdown remarkPlugins={[remarkGfm]}>{textContent}</Markdown>
              </div>
            )
          ) : null}
          {isStreaming && !textContent && (
            <div className="flex items-center gap-1 py-1">
              <span className="h-2 w-2 rounded-full bg-purple-400 animate-bounce [animation-delay:0ms]" />
              <span className="h-2 w-2 rounded-full bg-purple-400 animate-bounce [animation-delay:150ms]" />
              <span className="h-2 w-2 rounded-full bg-purple-400 animate-bounce [animation-delay:300ms]" />
            </div>
          )}
        </div>

        {!isUser && artifactCount > 0 && (
          <div className="flex items-center gap-1.5 self-start bg-gray-50 dark:bg-gray-800/60 px-2 py-0.5 rounded-md border border-gray-200 dark:border-gray-800 text-[10px] text-gray-500 dark:text-gray-400 font-medium tracking-wide">
            <Sparkles className="h-3 w-3 text-purple-500" />
            Used {artifactCount} artifact{artifactCount === 1 ? "" : "s"} for context
          </div>
        )}
      </div>
    </div>
  );
}

// ── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ onNewChat }: { onNewChat: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-4">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/30 dark:to-purple-900/30 mb-5">
        <Bot className="h-8 w-8 text-blue-600 dark:text-blue-400" />
      </div>
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
        Assistline Chatter
      </h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 max-w-md">
        Your personal AI assistant. Ask questions, search your knowledge base,
        and I'll remember important facts about you.
      </p>
      <Button
        onClick={onNewChat}
        className="mt-6"
        data-testid="empty-new-chat-btn"
      >
        <MessageSquarePlus className="h-4 w-4 mr-2" />
        Start a Conversation
      </Button>
    </div>
  );
}
