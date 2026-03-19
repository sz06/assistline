import { api, type Id } from "@repo/api";
import {
  Button,
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuPopup,
  DropdownMenuTrigger,
  Input,
} from "@repo/ui";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  Bot,
  MessageSquare,
  MoreVertical,
  Search,
  Send,
  Sparkles,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

// Status Badge styles matching our three states
const statusConfig: Record<string, { color: string; label: string }> = {
  idle: { color: "bg-gray-400", label: "Idle" },
  needs_reply: { color: "bg-blue-500", label: "Needs Reply" },
  waiting_on_contact: { color: "bg-amber-500", label: "Waiting on Contact" },
};

export function ConversationsPage() {
  const conversations = useQuery(api.conversations.list, { limit: 20 });
  const [selectedId, setSelectedId] = useState<Id<"conversations"> | null>(
    null,
  );
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!conversations) return [];
    if (!search.trim()) return conversations;
    const q = search.toLowerCase();
    return conversations.filter(
      (c) =>
        c.contactDetails.name.toLowerCase().includes(q) ||
        c.contactDetails.phone.toLowerCase().includes(q),
    );
  }, [conversations, search]);

  return (
    <div className="flex h-full">
      {/* ── LEFT PANEL: Conversation List ────────────────────────────── */}
      <div
        className={`w-full md:w-80 shrink-0 border-r border-gray-200 dark:border-gray-800 flex flex-col bg-gray-50/50 dark:bg-gray-900/50 ${selectedId ? "hidden md:flex" : "flex"}`}
      >
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
          {!conversations ? (
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
            filtered.map((conv) => {
              const statusObj = statusConfig[conv.status || "idle"];
              return (
                <button
                  type="button"
                  key={conv._id}
                  onClick={() => setSelectedId(conv._id)}
                  className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors border-b border-gray-100 dark:border-gray-800/60 hover:bg-gray-100 dark:hover:bg-gray-800/50 ${
                    selectedId === conv._id
                      ? "bg-blue-50 dark:bg-blue-950/30 border-l-2 border-l-blue-500"
                      : ""
                  }`}
                >
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white font-semibold text-sm shadow-sm relative ${
                      conv.isGroup
                        ? "bg-gradient-to-br from-violet-500 to-purple-600"
                        : "bg-gradient-to-br from-blue-500 to-indigo-600"
                    }`}
                  >
                    {conv.isGroup ? (
                      <Users className="h-4.5 w-4.5" />
                    ) : (
                      conv.contactDetails.name.charAt(0).toUpperCase()
                    )}
                    <span
                      title={statusObj?.label}
                      className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white dark:border-gray-900 ${statusObj?.color}`}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm truncate text-gray-900 dark:text-gray-100">
                        {conv.contactDetails.name}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {conv.isGroup && conv.groupDetails && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium leading-tight bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-400">
                            {conv.groupDetails.memberCount} members
                          </span>
                        )}
                        {conv.currentIntent && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium leading-tight bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                            {conv.currentIntent}
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                      {conv.isGroup
                        ? (conv.groupDetails?.topic ?? "Group conversation")
                        : conv.contactDetails.phone || conv.matrixRoomId}
                    </p>
                  </div>
                </button>
              );
            })
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
  const data = useQuery(api.conversations.getWithMessages, { id });
  const sendMessage = useMutation(api.messages.sendMessage);
  const toggleAI = useMutation(api.conversations.toggleAI);
  const deleteConversation = useMutation(api.conversations.deleteConversation);
  const dismissSuggestedReplyMut = useMutation(
    api.conversations.dismissSuggestedReply,
  );
  const dismissSuggestedActionMut = useMutation(
    api.conversations.dismissSuggestedAction,
  );

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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
            data.isGroup
              ? "bg-gradient-to-br from-violet-500 to-purple-600"
              : "bg-gradient-to-br from-blue-500 to-indigo-600"
          }`}
        >
          {data.isGroup ? (
            <Users className="h-4 w-4" />
          ) : (
            data.contactDetails.name.charAt(0).toUpperCase()
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-sm text-gray-900 dark:text-gray-100">
            {data.contactDetails.name}
          </h2>
          <div className="text-[11px] text-gray-500">
            {data.isGroup
              ? `${data.groupDetails?.memberCount ?? ""} members${data.groupDetails?.topic ? ` · ${data.groupDetails.topic}` : ""}`
              : data.contactDetails.phone || "No phone linked"}
          </div>
        </div>

        {/* AI Toggle */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium text-gray-400">
            Auto-Reply AI
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={data.aiEnabled === true}
            onClick={() =>
              toggleAI({
                conversationId: id,
                aiEnabled: !data.aiEnabled,
              })
            }
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${data.aiEnabled === true ? "bg-emerald-500" : "bg-gray-300 dark:bg-gray-700"}`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${data.aiEnabled === true ? "translate-x-4" : "translate-x-0"}`}
            />
          </button>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger className="h-8 w-8 flex items-center justify-center rounded-md text-gray-400 hover:bg-gray-100">
            <MoreVertical className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuPopup>
            <DropdownMenuItem
              className="text-red-600"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
            </DropdownMenuItem>
          </DropdownMenuPopup>
        </DropdownMenu>
      </div>

      {/* Feed */}
      <div className="flex-1 overflow-y-auto px-6 py-4 bg-gray-50 dark:bg-gray-900/30">
        <div className="space-y-3">
          {data.messages.map((msg) => {
            const isUser = msg.direction === "in";
            return (
              <div
                key={msg._id}
                className={`flex ${isUser ? "justify-start" : "justify-end"}`}
              >
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${isUser ? "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-tl-sm text-gray-900 dark:text-gray-100" : "bg-blue-600 text-white rounded-tr-sm"}`}
                >
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                  <p
                    className={`text-[10px] mt-1.5 ${isUser ? "text-gray-400" : "text-white/70"}`}
                  >
                    {new Date(msg.timestamp).toLocaleString()}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* AI Blocks */}
      {data.suggestedActions?.map((actionStr, idx) => (
        <div
          key={idx}
          className="px-4 py-2 bg-indigo-50 border-t border-indigo-200 flex items-center gap-3"
        >
          <Bot className="h-4 w-4 text-indigo-500 shrink-0" />
          <div className="flex-1 text-xs text-indigo-700 truncate">
            {actionStr}
          </div>
          <Button size="sm" className="h-6 px-2 text-[10px] bg-emerald-500">
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
      ))}
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
