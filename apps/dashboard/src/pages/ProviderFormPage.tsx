import { zodResolver } from "@hookform/resolvers/zod";
import { api, type Id } from "@repo/api";
import { Button, Input, Label, PageHeader } from "@repo/ui";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  Bot,
  Check,
  Copy,
  Cpu,
  Eye,
  EyeOff,
  Loader2,
  RefreshCcw,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Provider metadata — display information for known providers
// ---------------------------------------------------------------------------

interface ProviderMeta {
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  textColor: string;
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
// Zod Schema
// ---------------------------------------------------------------------------

const providerFormSchema = z
  .object({
    provider: z.string().min(1, "Please select a provider"),
    name: z.string(),
    model: z.string().min(1, "Please select a model"),
    apiKey: z.string(),
  })
  .refine(
    (data) => {
      const meta = getMeta(data.provider);
      return !meta.requiresApiKey || data.apiKey.trim().length > 0;
    },
    { message: "API key is required for this provider", path: ["apiKey"] },
  );

type ProviderFormData = z.infer<typeof providerFormSchema>;

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

  useEffect(() => {
    if (!provider) return;

    const meta = getMeta(provider);
    if (meta.requiresApiKey && !apiKey.trim()) return;

    const timer = setTimeout(() => {
      fetchModels();
    }, 600);

    return () => clearTimeout(timer);
  }, [provider, apiKey, fetchModels]);

  return { models, loading, error, refetch: fetchModels };
}

// ---------------------------------------------------------------------------
// Model Selector
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
// Provider Form Page
// ---------------------------------------------------------------------------

export function ProviderFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEditing = Boolean(id);
  const providerId = id as Id<"aiProviders"> | undefined;

  // For Edit mode, fetch the provider data
  const provider = useQuery(
    api.aiProviders.get,
    isEditing && providerId ? { id: providerId } : "skip",
  );

  // For Add mode — get count to determine default status
  const allProviders = useQuery(api.aiProviders.list);

  const createProvider = useMutation(api.aiProviders.create);
  const updateProvider = useMutation(api.aiProviders.update);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProviderFormData>({
    resolver: zodResolver(providerFormSchema),
    defaultValues: {
      provider: "",
      name: "",
      model: "",
      apiKey: "",
    },
  });

  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);

  const selectedProvider = watch("provider");
  const apiKeyValue = watch("apiKey");
  const selectedModel = watch("model");

  const meta = selectedProvider ? getMeta(selectedProvider) : null;

  // When editing and data loads, populate the form once
  useEffect(() => {
    if (isEditing && provider) {
      reset({
        provider: provider.provider,
        name: provider.name ?? "",
        model: provider.model ?? "",
        apiKey: provider.apiKey ?? "",
      });
    }
  }, [isEditing, provider, reset]);

  const handleCopyKey = () => {
    if (!apiKeyValue) return;
    navigator.clipboard.writeText(apiKeyValue);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const selectProvider = (key: string) => {
    setValue("provider", key);
    setValue("model", "");
    setValue("apiKey", "");
    setValue("name", "");
  };

  const onValid = async (data: ProviderFormData) => {
    if (isEditing && providerId) {
      await updateProvider({
        id: providerId,
        name: data.name || undefined,
        model: data.model,
        apiKey: data.apiKey || undefined,
      });
    } else {
      await createProvider({
        provider: data.provider,
        name: data.name || undefined,
        model: data.model,
        apiKey: data.apiKey || undefined,
        isDefault: allProviders?.length === 0,
      });
    }
    navigate("/providers");
  };

  // If editing but still loading data, show spinner
  if (isEditing && provider === undefined) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  // If editing but provider not found
  if (isEditing && provider === null) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <h2 className="text-xl font-semibold mb-2">Provider Not Found</h2>
        <p className="text-gray-500 mb-6">
          This provider may have been deleted.
        </p>
        <Button onClick={() => navigate("/providers")}>
          Back to Providers
        </Button>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 overflow-auto h-full w-full">
      <div className="mb-6">
        <button
          type="button"
          onClick={() => navigate("/providers")}
          className="inline-flex items-center text-sm font-medium text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back to Providers
        </button>
        <PageHeader
          title={isEditing ? "Edit Provider" : "Add Provider"}
          description={
            isEditing
              ? "Update provider configuration."
              : "Choose an AI provider, enter your API key, and select a model."
          }
        />
      </div>

      <form
        onSubmit={handleSubmit(onValid)}
        className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm p-6 space-y-6"
      >
        {/* ── Provider Selection (Add mode only) ── */}
        {!isEditing && (
          <div>
            <Label>Provider</Label>
            <div className="mt-3 space-y-3">
              {ALL_PROVIDER_KEYS.map((key) => {
                const m = PROVIDER_META[key];
                const isSelected = selectedProvider === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => selectProvider(key)}
                    className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all group ${
                      isSelected
                        ? "border-blue-400 dark:border-blue-600 bg-blue-50/50 dark:bg-blue-900/10 ring-1 ring-blue-200 dark:ring-blue-800"
                        : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50/50 dark:hover:bg-gray-800/30"
                    }`}
                    data-testid={`provider-option-${key}`}
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
              })}
            </div>
            {errors.provider && (
              <p className="text-xs text-red-500 mt-2">
                {errors.provider.message}
              </p>
            )}
          </div>
        )}

        {/* ── Provider name (Edit mode — read-only) ── */}
        {isEditing && meta && (
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-xl ${meta.color} ${meta.textColor}`}
            >
              {meta.icon}
            </div>
            <div>
              <h3 className="font-semibold text-base">{meta.label}</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {meta.description}
              </p>
            </div>
          </div>
        )}

        {/* ── Name ── */}
        {selectedProvider && (
          <div>
            <Label htmlFor="pf-name">Name</Label>
            <Input
              id="pf-name"
              {...register("name")}
              placeholder={`e.g. Work ${meta?.label ?? ""}, Personal key`}
              className="mt-1.5 max-w-sm"
              data-testid="provider-name-input"
            />
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
              Optional — helps distinguish multiple keys for the same provider.
            </p>
          </div>
        )}

        {/* ── API Key ── */}
        {meta?.requiresApiKey && selectedProvider && (
          <div>
            <Label htmlFor="pf-api-key">API Key</Label>
            <div className="relative mt-1.5">
              <Input
                id="pf-api-key"
                type={showKey ? "text" : "password"}
                {...register("apiKey")}
                placeholder={meta.placeholder}
                className="pr-20"
                data-testid="provider-api-key-input"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {isEditing && (
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
                )}
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
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
              Your key is stored in Convex and never exposed to the browser
              after saving.
            </p>
            {errors.apiKey && (
              <p className="text-xs text-red-500 mt-1">
                {errors.apiKey.message}
              </p>
            )}
          </div>
        )}

        {selectedProvider && !meta?.requiresApiKey && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No API key required — {meta?.label ?? selectedProvider} runs
            locally.
          </p>
        )}

        {/* ── Model Selector ── */}
        {selectedProvider && (
          <ModelSelector
            provider={selectedProvider}
            apiKey={apiKeyValue}
            selectedModel={selectedModel}
            onModelChange={(modelId) => setValue("model", modelId)}
          />
        )}
        {errors.model && (
          <p className="text-xs text-red-500">{errors.model.message}</p>
        )}

        {/* ── Footer ── */}
        <div className="pt-4 flex justify-end gap-3 border-t border-gray-100 dark:border-gray-800">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate("/providers")}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting}
            data-testid="save-provider-btn"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEditing ? "Save Changes" : "Add Provider"}
          </Button>
        </div>
      </form>
    </div>
  );
}
