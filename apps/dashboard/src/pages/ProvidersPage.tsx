import { api, type Id } from "@repo/api";
import { Button, PageHeader } from "@repo/ui";
import { useMutation, useQuery } from "convex/react";
import {
  Bot,
  Calendar,
  Cloud,
  Cpu,
  HardDrive,
  Loader2,
  Plus,
  Shield,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

// ---------------------------------------------------------------------------
// Provider metadata — display information for known providers
// ---------------------------------------------------------------------------

interface ProviderMeta {
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string; // tailwind bg
  textColor: string; // tailwind text
  requiresApiKey: boolean;
}

const PROVIDER_META: Record<string, ProviderMeta> = {
  openai: {
    label: "OpenAI",
    description: "GPT-4o, o3, o4-mini, and more",
    icon: <Sparkles className="h-5 w-5" />,
    color: "bg-emerald-100 dark:bg-emerald-900/30",
    textColor: "text-emerald-600 dark:text-emerald-400",
    requiresApiKey: true,
  },
  anthropic: {
    label: "Anthropic",
    description: "Claude Sonnet, Haiku, and Opus",
    icon: <Bot className="h-5 w-5" />,
    color: "bg-orange-100 dark:bg-orange-900/30",
    textColor: "text-orange-600 dark:text-orange-400",
    requiresApiKey: true,
  },
  google: {
    label: "Google AI",
    description: "Gemini Pro, Gemini Flash, and more",
    icon: <Sparkles className="h-5 w-5" />,
    color: "bg-blue-100 dark:bg-blue-900/30",
    textColor: "text-blue-600 dark:text-blue-400",
    requiresApiKey: true,
  },
  ollama: {
    label: "Ollama",
    description: "Local models — Llama, Mistral, Phi, etc.",
    icon: <Cpu className="h-5 w-5" />,
    color: "bg-violet-100 dark:bg-violet-900/30",
    textColor: "text-violet-600 dark:text-violet-400",
    requiresApiKey: false,
  },
  groq: {
    label: "Groq",
    description: "Ultra-fast inference — Llama, Mixtral",
    icon: <Sparkles className="h-5 w-5" />,
    color: "bg-rose-100 dark:bg-rose-900/30",
    textColor: "text-rose-600 dark:text-rose-400",
    requiresApiKey: true,
  },
  cliproxyapi: {
    label: "CLIProxyAPI",
    description: "Free Gemini, GPT, Claude via CLI proxy",
    icon: <Cpu className="h-5 w-5" />,
    color: "bg-teal-100 dark:bg-teal-900/30",
    textColor: "text-teal-600 dark:text-teal-400",
    requiresApiKey: false,
  },
};

/** Fallback metadata for unknown providers */
function getMeta(provider: string): ProviderMeta {
  return (
    PROVIDER_META[provider] ?? {
      label: provider.charAt(0).toUpperCase() + provider.slice(1),
      description: "Custom AI provider",
      icon: <Cpu className="h-5 w-5" />,
      color: "bg-gray-100 dark:bg-gray-800",
      textColor: "text-gray-600 dark:text-gray-400",
      requiresApiKey: true,
    }
  );
}

const ALL_PROVIDER_KEYS = Object.keys(PROVIDER_META);

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export function ProvidersPage() {
  const providers = useQuery(api.aiProviders.list);
  const removeProvider = useMutation(api.aiProviders.remove);
  const setDefault = useMutation(api.aiProviders.setDefault);
  const navigate = useNavigate();

  const [deletingId, setDeletingId] = useState<Id<"aiProviders"> | null>(null);

  const handleConfirmDelete = async () => {
    if (!deletingId) return;
    await removeProvider({ id: deletingId });
    setDeletingId(null);
  };

  const languageProviders =
    providers?.filter((p) => p.type === "language") ?? [];
  const embeddingProviders =
    providers?.filter((p) => p.type === "embedding") ?? [];

  return (
    <div className="p-4 md:p-6 overflow-auto h-full">
      <div>
        <div className="flex items-start justify-between gap-4">
          <PageHeader
            title="AI Providers"
            description="Manage Large-Language-Model and Embedding providers powering your AI assistant."
          />
          <Button
            onClick={() => navigate("/providers/add")}
            className="shrink-0 mt-1"
            data-testid="add-provider-btn"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Provider
          </Button>
        </div>

        {/* ── Provider List ──────────────────────────────────────── */}
        {providers === undefined ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : providers.length === 0 ? (
          <div className="mt-8">
            <EmptyState onAdd={() => navigate("/providers/add")} />
          </div>
        ) : (
          <>
            {/* Language Models Section */}
            <div className="mt-8">
              <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                Language Models
              </h2>
              {languageProviders.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 italic py-4">
                  No language model providers configured.
                </p>
              ) : (
                <div className="space-y-4">
                  {languageProviders.map((p) => (
                    <ProviderCard
                      key={p._id}
                      provider={p}
                      onSetDefault={() => setDefault({ id: p._id })}
                      onClick={() => navigate(`/providers/${p._id}/update`)}
                      onDelete={() => setDeletingId(p._id)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Embedding Models Section */}
            <div className="mt-10">
              <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                Embedding Models
              </h2>
              {embeddingProviders.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 italic py-4">
                  No embedding providers configured.{" "}
                  <button
                    type="button"
                    onClick={() => navigate("/providers/add?type=embedding")}
                    className="text-blue-500 hover:text-blue-600 underline"
                  >
                    Add one
                  </button>{" "}
                  to enable semantic search on artifacts.
                </p>
              ) : (
                <div className="space-y-4">
                  {embeddingProviders.map((p) => (
                    <ProviderCard
                      key={p._id}
                      provider={p}
                      onSetDefault={() => setDefault({ id: p._id })}
                      onClick={() => navigate(`/providers/${p._id}/update`)}
                      onDelete={() => setDeletingId(p._id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Delete Confirmation Dialog ────────────────────────── */}
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

// ---------------------------------------------------------------------------
// Provider Card
// ---------------------------------------------------------------------------

/** Mask an API key to show only the last 4 characters. */
function maskApiKey(key: string): string {
  if (key.length <= 4) return "••••";
  return `${key.slice(0, 3)}…${key.slice(-4)}`;
}

function ProviderCard({
  provider,
  onSetDefault,
  onClick,
  onDelete,
}: {
  provider: {
    _id: Id<"aiProviders">;
    _creationTime: number;
    provider: string;
    type: "language" | "embedding";
    name?: string;
    model?: string;
    apiKey?: string;
    isDefault: boolean;
  };
  onSetDefault: () => void;
  onClick: () => void;
  onDelete: () => void;
}) {
  const meta = getMeta(provider.provider);
  const hasKey = !!provider.apiKey;
  const isLocal = !meta.requiresApiKey;
  const isReady = isLocal || hasKey;
  const displayName = provider.name || meta.label;

  return (
    <div
      data-testid={`provider-card-${provider.provider}`}
      className={`bg-white dark:bg-gray-900 border rounded-xl shadow-sm overflow-hidden transition-all ${
        provider.isDefault
          ? "border-blue-300 dark:border-blue-700 ring-1 ring-blue-200 dark:ring-blue-800"
          : "border-gray-200 dark:border-gray-800"
      }`}
    >
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-4">
        <button
          type="button"
          onClick={onClick}
          className="flex items-center gap-4 flex-1 min-w-0 text-left focus:outline-none group"
        >
          {/* Provider icon */}
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${meta.color} ${meta.textColor} group-hover:scale-105 transition-transform`}
          >
            {meta.icon}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-base">{displayName}</h3>
              {provider.isDefault && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-full">
                  <Star className="h-3 w-3 fill-current" />
                  Default
                </span>
              )}
              {/* Cloud / Local pill */}
              <span
                className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                  isLocal
                    ? "text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20"
                    : "text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-900/20"
                }`}
              >
                {isLocal ? (
                  <HardDrive className="h-3 w-3" />
                ) : (
                  <Cloud className="h-3 w-3" />
                )}
                {isLocal ? "Local" : "Cloud"}
              </span>
            </div>

            {/* Model chip + description */}
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {provider.model ? (
                <span className="inline-flex items-center gap-1 text-xs font-mono font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-md">
                  <Cpu className="h-3 w-3 text-gray-400" />
                  {provider.model}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-md">
                  No model selected
                </span>
              )}
              <span className="text-xs text-gray-400 dark:text-gray-500 hidden sm:inline">
                {meta.description}
              </span>
            </div>
          </div>
        </button>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0 ml-2">
          {/* Set as default */}
          {!provider.isDefault && (
            <Button
              onClick={(e) => {
                e.stopPropagation();
                onSetDefault();
              }}
              variant="outline"
              size="sm"
              title="Set as default"
            >
              <Star className="h-4 w-4 mr-1.5" />
              <span className="hidden sm:inline">Set default</span>
            </Button>
          )}

          {/* Delete */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            title="Delete provider"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Details Footer ──────────────────────────────────────── */}
      <div className="border-t border-gray-100 dark:border-gray-800/50 px-5 py-3 bg-gray-50/50 dark:bg-gray-900/50 flex items-center gap-4 flex-wrap text-xs text-gray-400 dark:text-gray-500">
        {/* Health status */}
        <span
          className={`inline-flex items-center gap-1.5 font-medium ${
            isReady
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-amber-600 dark:text-amber-400"
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${
              isReady
                ? "bg-emerald-400 dark:bg-emerald-500"
                : "bg-amber-400 dark:bg-amber-500 animate-pulse"
            }`}
          />
          {isReady ? "Ready" : "Missing key"}
        </span>

        <span className="text-gray-300 dark:text-gray-700">·</span>

        {/* API key preview */}
        {meta.requiresApiKey && (
          <>
            <span className="inline-flex items-center gap-1">
              <Shield className="h-3 w-3" />
              {hasKey ? (
                <span className="font-mono">
                  {maskApiKey(provider.apiKey ?? "")}
                </span>
              ) : (
                "No key configured"
              )}
            </span>
            <span className="text-gray-300 dark:text-gray-700">·</span>
          </>
        )}

        {/* Date added */}
        <span className="inline-flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          Added{" "}
          {new Date(provider._creationTime).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Delete Confirmation Dialog
// ---------------------------------------------------------------------------

function DeleteConfirmDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onCancel}
        aria-label="Close dialog"
      />

      {/* Dialog */}
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 w-full max-w-sm mx-4 p-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30 mx-auto mb-4">
          <Trash2 className="h-6 w-6 text-red-500" />
        </div>
        <h2 className="text-lg font-semibold">Remove Provider</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
          Are you sure you want to remove this provider? This action cannot be
          undone.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex items-center justify-center h-10 px-4 rounded-md text-sm font-medium text-white transition-colors"
            style={{ backgroundColor: "#dc2626" }}
          >
            Yes, remove
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty State
// ---------------------------------------------------------------------------

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800 mx-auto mb-4">
        <Cpu className="h-7 w-7 text-gray-400" />
      </div>
      <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300">
        No providers configured
      </h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5 max-w-md mx-auto">
        Add an AI provider so your assistant can generate replies, summarize
        conversations, and more.
      </p>

      {/* Quick-start provider tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-8 max-w-xl mx-auto">
        {ALL_PROVIDER_KEYS.map((key) => {
          const m = PROVIDER_META[key];
          return (
            <button
              key={key}
              type="button"
              onClick={onAdd}
              className="flex flex-col items-center gap-2.5 p-4 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 hover:bg-blue-50/40 dark:hover:bg-blue-900/10 transition-all group"
            >
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-xl ${m.color} ${m.textColor} group-hover:scale-110 transition-transform`}
              >
                {m.icon}
              </div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {m.label}
              </span>
            </button>
          );
        })}
      </div>

      <p className="text-xs text-gray-400 dark:text-gray-500 mt-5">
        Click any provider above to get started
      </p>
    </div>
  );
}
