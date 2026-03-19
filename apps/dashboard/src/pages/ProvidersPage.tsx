import { api, type Id } from "@repo/api";
import { Button, Input, Label, PageHeader } from "@repo/ui";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  Bot,
  Check,
  Copy,
  Cpu,
  Edit3,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  RefreshCcw,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

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
  placeholder: string;
}

const PROVIDER_META: Record<string, ProviderMeta> = {
  openai: {
    label: "OpenAI",
    description: "GPT-4o, o3, o4-mini, and more",
    icon: <Sparkles className="h-5 w-5" />,
    color: "bg-emerald-100 dark:bg-emerald-900/30",
    textColor: "text-emerald-600 dark:text-emerald-400",
    requiresApiKey: true,
    placeholder: "sk-…",
  },
  anthropic: {
    label: "Anthropic",
    description: "Claude Sonnet, Haiku, and Opus",
    icon: <Bot className="h-5 w-5" />,
    color: "bg-orange-100 dark:bg-orange-900/30",
    textColor: "text-orange-600 dark:text-orange-400",
    requiresApiKey: true,
    placeholder: "sk-ant-…",
  },
  google: {
    label: "Google AI",
    description: "Gemini Pro, Gemini Flash, and more",
    icon: <Sparkles className="h-5 w-5" />,
    color: "bg-blue-100 dark:bg-blue-900/30",
    textColor: "text-blue-600 dark:text-blue-400",
    requiresApiKey: true,
    placeholder: "AIza…",
  },
  ollama: {
    label: "Ollama",
    description: "Local models — Llama, Mistral, Phi, etc.",
    icon: <Cpu className="h-5 w-5" />,
    color: "bg-violet-100 dark:bg-violet-900/30",
    textColor: "text-violet-600 dark:text-violet-400",
    requiresApiKey: false,
    placeholder: "",
  },
  groq: {
    label: "Groq",
    description: "Ultra-fast inference — Llama, Mixtral",
    icon: <Sparkles className="h-5 w-5" />,
    color: "bg-rose-100 dark:bg-rose-900/30",
    textColor: "text-rose-600 dark:text-rose-400",
    requiresApiKey: true,
    placeholder: "gsk_…",
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
      placeholder: "API key…",
    }
  );
}

const ALL_PROVIDER_KEYS = Object.keys(PROVIDER_META);

// ---------------------------------------------------------------------------
// Hook — fetch models from provider API via Convex action
// ---------------------------------------------------------------------------

interface ModelInfo {
  id: string;
  name: string;
  description?: string;
}

function useProviderModels(provider: string | null, apiKey: string) {
  const listModels = useAction(api.ai.models.listModels);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchModels = useCallback(async () => {
    if (!provider) return;

    const meta = getMeta(provider);
    if (meta.requiresApiKey && !apiKey.trim()) {
      setModels([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await listModels({
        provider,
        apiKey: apiKey.trim() || undefined,
      });
      setModels(result);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch models";
      setError(message);
      setModels([]);
    } finally {
      setLoading(false);
    }
  }, [provider, apiKey, listModels]);

  // Auto-fetch when provider/key changes (debounced for key typing)
  useEffect(() => {
    if (!provider) return;

    const meta = getMeta(provider);

    // For providers that need a key, wait until one is entered
    if (meta.requiresApiKey && !apiKey.trim()) return;

    // Small debounce for API key typing
    const timer = setTimeout(() => {
      fetchModels();
    }, 600);

    return () => clearTimeout(timer);
  }, [provider, apiKey, fetchModels]);

  return { models, loading, error, refetch: fetchModels };
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export function ProvidersPage() {
  const providers = useQuery(api.aiProviders.list);
  const createProvider = useMutation(api.aiProviders.create);
  const updateProvider = useMutation(api.aiProviders.update);
  const removeProvider = useMutation(api.aiProviders.remove);
  const setDefault = useMutation(api.aiProviders.setDefault);

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingProvider, setEditingProvider] =
    useState<ProviderForEdit | null>(null);

  // Providers already added (to filter the "add" list)
  const existingKeys = new Set(providers?.map((p) => p.provider) ?? []);

  return (
    <div className="p-4 md:p-6 overflow-auto h-full">
      <div className="max-w-4xl">
        <div className="flex items-start justify-between">
          <PageHeader
            title="AI Providers"
            description="Manage Large-Language-Model providers powering your AI assistant."
          />
          <Button
            onClick={() => setShowAddDialog(true)}
            className="shrink-0 mt-1"
            data-testid="add-provider-btn"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Provider
          </Button>
        </div>

        {/* ── Provider List ──────────────────────────────────────── */}
        <div className="mt-8 space-y-4">
          {providers === undefined ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : providers.length === 0 ? (
            <EmptyState onAdd={() => setShowAddDialog(true)} />
          ) : (
            providers.map((p) => (
              <ProviderCard
                key={p._id}
                provider={p}
                onSetDefault={() => setDefault({ id: p._id })}
                onEdit={() =>
                  setEditingProvider({
                    id: p._id,
                    provider: p.provider,
                    model: p.model ?? "",
                    apiKey: p.apiKey ?? "",
                    isDefault: p.isDefault,
                  })
                }
                onRemove={() => removeProvider({ id: p._id })}
              />
            ))
          )}
        </div>

        {/* ── Add Provider Dialog ─────────────────────────────────── */}
        {showAddDialog && (
          <AddProviderDialog
            existingKeys={existingKeys}
            onAdd={async (provider, model, apiKey) => {
              await createProvider({
                provider,
                model,
                apiKey: apiKey || undefined,
                isDefault: providers?.length === 0,
              });
              setShowAddDialog(false);
            }}
            onClose={() => setShowAddDialog(false)}
          />
        )}

        {/* ── Edit Dialog ────────────────────────────────────────── */}
        {editingProvider && (
          <EditProviderDialog
            data={editingProvider}
            onSave={async (model, apiKey) => {
              await updateProvider({
                id: editingProvider.id,
                model,
                apiKey: apiKey || undefined,
              });
              setEditingProvider(null);
            }}
            onClose={() => setEditingProvider(null)}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProviderForEdit {
  id: Id<"aiProviders">;
  provider: string;
  model: string;
  apiKey: string;
  isDefault: boolean;
}

// ---------------------------------------------------------------------------
// Provider Card
// ---------------------------------------------------------------------------

function ProviderCard({
  provider,
  onSetDefault,
  onEdit,
  onRemove,
}: {
  provider: {
    _id: Id<"aiProviders">;
    provider: string;
    model?: string;
    apiKey?: string;
    isDefault: boolean;
  };
  onSetDefault: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const meta = getMeta(provider.provider);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const hasKey = !!provider.apiKey;

  return (
    <div
      data-testid={`provider-card-${provider.provider}`}
      className={`bg-white dark:bg-gray-900 border rounded-xl shadow-sm overflow-hidden transition-all ${
        provider.isDefault
          ? "border-blue-300 dark:border-blue-700 ring-1 ring-blue-200 dark:ring-blue-800"
          : "border-gray-200 dark:border-gray-800"
      }`}
    >
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-4">
          {/* Provider icon */}
          <div
            className={`flex h-11 w-11 items-center justify-center rounded-xl ${meta.color} ${meta.textColor}`}
          >
            {meta.icon}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-base">{meta.label}</h3>
              {provider.isDefault && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-full">
                  <Star className="h-3 w-3 fill-current" />
                  Default
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {provider.model ?? meta.description}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* API Key status */}
          {meta.requiresApiKey && (
            <span
              className={`hidden sm:inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
                hasKey
                  ? "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20"
                  : "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20"
              }`}
            >
              {hasKey ? (
                <>
                  <Check className="h-3 w-3" /> Key set
                </>
              ) : (
                <>
                  <AlertTriangle className="h-3 w-3" /> No key
                </>
              )}
            </span>
          )}

          {/* Set as default */}
          {!provider.isDefault && (
            <Button
              onClick={onSetDefault}
              variant="outline"
              size="sm"
              title="Set as default"
            >
              <Star className="h-4 w-4 mr-1.5" />
              <span className="hidden sm:inline">Set default</span>
            </Button>
          )}

          {/* Edit */}
          <button
            type="button"
            onClick={onEdit}
            className="p-2 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
            title="Edit API key"
          >
            <Edit3 className="h-4 w-4" />
          </button>

          {/* Delete */}
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Remove?</span>
              <button
                type="button"
                onClick={() => {
                  onRemove();
                  setConfirmDelete(false);
                }}
                className="inline-flex items-center justify-center h-9 px-3 rounded-md text-sm font-medium text-white transition-colors"
                style={{ backgroundColor: "#dc2626" }}
              >
                Yes
              </button>
              <Button
                onClick={() => setConfirmDelete(false)}
                variant="outline"
                size="sm"
              >
                No
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              title="Delete provider"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
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

// ---------------------------------------------------------------------------
// Model Selector — shared between Add & Edit dialogs
// ---------------------------------------------------------------------------

function ModelSelector({
  provider,
  apiKey,
  selectedModel,
  onModelChange,
}: {
  provider: string;
  apiKey: string;
  selectedModel: string;
  onModelChange: (modelId: string) => void;
}) {
  const { models, loading, error, refetch } = useProviderModels(
    provider,
    apiKey,
  );

  const meta = getMeta(provider);

  // Auto-select first model if none selected or current selection no longer
  // exists in the fetched list
  useEffect(() => {
    if (models.length > 0 && !models.find((m) => m.id === selectedModel)) {
      onModelChange(models[0].id);
    }
  }, [models, selectedModel, onModelChange]);

  if (meta.requiresApiKey && !apiKey.trim()) {
    return (
      <div>
        <Label htmlFor="model-select">Model</Label>
        <p className="mt-1.5 text-sm text-gray-400 dark:text-gray-500 italic">
          Enter your API key to load available models…
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <Label htmlFor="model-select">Model</Label>
        <button
          type="button"
          onClick={refetch}
          disabled={loading}
          className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600 disabled:text-gray-400 transition-colors"
          title="Refresh models"
        >
          <RefreshCcw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {loading && models.length === 0 ? (
        <div className="mt-1.5 flex items-center gap-2 text-sm text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading models from {getMeta(provider).label}…
        </div>
      ) : error ? (
        <div className="mt-1.5 space-y-2">
          <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
          <Button variant="outline" size="sm" onClick={refetch}>
            <RefreshCcw className="h-3 w-3 mr-1.5" />
            Retry
          </Button>
        </div>
      ) : models.length === 0 ? (
        <p className="mt-1.5 text-sm text-gray-400 dark:text-gray-500 italic">
          No models found for this provider.
        </p>
      ) : (
        <select
          id="model-select"
          value={selectedModel}
          onChange={(e) => onModelChange(e.target.value)}
          className="mt-1.5 w-full h-10 px-3 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} ({m.id})
            </option>
          ))}
        </select>
      )}

      {loading && models.length > 0 && (
        <p className="mt-1 text-xs text-gray-400 flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          Refreshing…
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add Provider Dialog
// ---------------------------------------------------------------------------

function AddProviderDialog({
  existingKeys,
  onAdd,
  onClose,
}: {
  existingKeys: Set<string>;
  onAdd: (provider: string, model: string, apiKey: string) => Promise<void>;
  onClose: () => void;
}) {
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);

  const availableProviders = ALL_PROVIDER_KEYS.filter(
    (k) => !existingKeys.has(k),
  );
  const meta = selectedProvider ? getMeta(selectedProvider) : null;

  const handleSubmit = async () => {
    if (!selectedProvider || !selectedModel) return;
    setSaving(true);
    try {
      await onAdd(selectedProvider, selectedModel, apiKey);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close dialog"
      />

      {/* Dialog */}
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold">Add Provider</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Choose an AI provider, enter your API key, and we'll fetch the
          available models automatically.
        </p>

        <div className="mt-5 space-y-3">
          {availableProviders.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">
              All supported providers have already been added.
            </p>
          ) : (
            availableProviders.map((key) => {
              const m = PROVIDER_META[key];
              const isSelected = selectedProvider === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setSelectedProvider(key);
                    setSelectedModel("");
                    setApiKey("");
                  }}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all group ${
                    isSelected
                      ? "border-blue-400 dark:border-blue-600 bg-blue-50/50 dark:bg-blue-900/10 ring-1 ring-blue-200 dark:ring-blue-800"
                      : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50/50 dark:hover:bg-gray-800/30"
                  }`}
                >
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-xl ${m.color} ${m.textColor} group-hover:scale-110 transition-transform`}
                  >
                    {m.icon}
                  </div>
                  <div className="text-left flex-1">
                    <p className="font-medium text-gray-900 dark:text-gray-100">
                      {m.label}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {m.description}
                    </p>
                  </div>
                  {isSelected && (
                    <Check className="h-5 w-5 text-blue-500 shrink-0" />
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* API Key input (shown after selection, if needed) — placed BEFORE model selector */}
        {meta?.requiresApiKey && selectedProvider && (
          <div className="mt-5">
            <Label htmlFor="add-api-key-input">API Key</Label>
            <div className="relative mt-1.5">
              <Input
                id="add-api-key-input"
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={meta.placeholder}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                {showKey ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
              Your key is stored in Convex and never exposed to the browser
              after saving.
            </p>
          </div>
        )}

        {selectedProvider && !meta?.requiresApiKey && (
          <p className="mt-5 text-sm text-gray-500 dark:text-gray-400">
            No API key required — {meta?.label ?? selectedProvider} runs
            locally.
          </p>
        )}

        {/* Model selector (fetched dynamically after API key is entered) */}
        {selectedProvider && (
          <div className="mt-5">
            <ModelSelector
              provider={selectedProvider}
              apiKey={apiKey}
              selectedModel={selectedModel}
              onModelChange={setSelectedModel}
            />
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              !selectedProvider ||
              !selectedModel ||
              saving ||
              (meta?.requiresApiKey && !apiKey.trim())
            }
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-2" />
                Add Provider
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit Provider Dialog
// ---------------------------------------------------------------------------

function EditProviderDialog({
  data,
  onSave,
  onClose,
}: {
  data: ProviderForEdit;
  onSave: (model: string, apiKey: string) => Promise<void>;
  onClose: () => void;
}) {
  const meta = getMeta(data.provider);
  const [selectedModel, setSelectedModel] = useState(data.model);
  const [apiKey, setApiKey] = useState(data.apiKey);
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopyKey = () => {
    if (!apiKey) return;
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(selectedModel, apiKey);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close dialog"
      />

      {/* Dialog */}
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 w-full max-w-md mx-4 p-6">
        <div className="flex items-center gap-3 mb-5">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-xl ${meta.color} ${meta.textColor}`}
          >
            {meta.icon}
          </div>
          <div>
            <h2 className="text-lg font-semibold">Edit {meta.label}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Update the model and API key for this provider.
            </p>
          </div>
        </div>

        {/* API Key */}
        {meta.requiresApiKey && (
          <div>
            <Label htmlFor="edit-api-key-input">API Key</Label>
            <div className="relative mt-1.5">
              <Input
                id="edit-api-key-input"
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={meta.placeholder}
                className="pr-20"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleCopyKey}
                  className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  title="Copy key"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  {showKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Model selector (dynamically loaded) */}
        <div className="mt-4">
          <ModelSelector
            provider={data.provider}
            apiKey={apiKey}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
          />
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving…
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
