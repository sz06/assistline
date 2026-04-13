"use node";

/**
 * AI Models — Convex actions for fetching available models from providers.
 *
 * Each provider exposes a REST endpoint (or OpenAI-compatible endpoint) that
 * returns the list of models available to the caller's API key. This action
 * hits those endpoints at runtime so the dashboard always shows current models.
 */

import { v } from "convex/values";
import { action } from "../_generated/server";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ModelInfo {
  id: string;
  name: string;
  description?: string;
}

// Provider-specific response shapes
interface OpenAIModel {
  id: string;
  object: string;
  owned_by: string;
}

interface AnthropicModel {
  id: string;
  display_name: string;
  type: string;
}

interface GoogleModel {
  name: string;
  displayName: string;
  description: string;
  supportedGenerationMethods?: string[];
}

interface GroqModel {
  id: string;
  object: string;
  owned_by: string;
}

// ---------------------------------------------------------------------------
// OpenAI
// ---------------------------------------------------------------------------

async function fetchOpenAIModels(apiKey: string): Promise<ModelInfo[]> {
  const res = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    throw new Error(`OpenAI /models failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { data: OpenAIModel[] };

  // Filter to chat/completion models (exclude embeddings, tts, whisper, dall-e, etc.)
  const chatPrefixes = ["gpt-", "o1", "o3", "o4", "chatgpt-"];
  const excludePatterns = ["realtime", "audio", "search", "transcribe"];

  return json.data
    .filter((m) => {
      const id = m.id.toLowerCase();
      const isChat = chatPrefixes.some((p) => id.startsWith(p));
      const isExcluded = excludePatterns.some((p) => id.includes(p));
      return isChat && !isExcluded;
    })
    .map((m) => ({
      id: m.id,
      name: formatModelName(m.id),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Anthropic
// ---------------------------------------------------------------------------

async function fetchAnthropicModels(apiKey: string): Promise<ModelInfo[]> {
  const res = await fetch("https://api.anthropic.com/v1/models", {
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
  });
  if (!res.ok) {
    throw new Error(
      `Anthropic /models failed: ${res.status} ${await res.text()}`,
    );
  }
  const json = (await res.json()) as { data: AnthropicModel[] };

  return json.data
    .map((m) => ({
      id: m.id,
      name: m.display_name || formatModelName(m.id),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Google Generative AI (Gemini)
// ---------------------------------------------------------------------------

async function fetchGoogleAllModels(apiKey: string): Promise<GoogleModel[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
  );
  if (!res.ok) {
    throw new Error(
      `Google AI /models failed: ${res.status} ${await res.text()}`,
    );
  }
  const json = (await res.json()) as { models: GoogleModel[] };
  return json.models;
}

async function fetchGoogleModels(apiKey: string): Promise<ModelInfo[]> {
  const models = await fetchGoogleAllModels(apiKey);

  return models
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
    .map((m) => ({
      id: m.name.replace("models/", ""),
      name: m.displayName || formatModelName(m.name.replace("models/", "")),
      description: m.description,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function fetchGoogleEmbeddingModels(
  apiKey: string,
): Promise<ModelInfo[]> {
  const models = await fetchGoogleAllModels(apiKey);

  return models
    .filter((m) => m.supportedGenerationMethods?.includes("embedContent"))
    .map((m) => ({
      id: m.name.replace("models/", ""),
      name: m.displayName || formatModelName(m.name.replace("models/", "")),
      description: m.description,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Groq
// ---------------------------------------------------------------------------

async function fetchGroqModels(apiKey: string): Promise<ModelInfo[]> {
  const res = await fetch("https://api.groq.com/openai/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    throw new Error(`Groq /models failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { data: GroqModel[] };

  return json.data
    .map((m) => ({
      id: m.id,
      name: formatModelName(m.id),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Ollama (local, OpenAI-compatible)
// ---------------------------------------------------------------------------

async function fetchOllamaModels(baseUrl: string): Promise<ModelInfo[]> {
  try {
    // Strip trailing /v1 if present — Ollama's native API doesn't use it
    const cleanBase = baseUrl.replace(/\/v1\/?$/, "");
    const res = await fetch(`${cleanBase}/api/tags`);
    if (!res.ok) {
      throw new Error(`Ollama /api/tags failed: ${res.status}`);
    }
    const json = (await res.json()) as {
      models: { name: string; model: string }[];
    };

    return json.models.map((m) => ({
      id: m.name,
      name: formatModelName(m.name),
    }));
  } catch {
    // Ollama might not be running — return empty list, not an error
    return [];
  }
}

// ---------------------------------------------------------------------------
// CLIProxyAPI (OpenAI-compatible)
// ---------------------------------------------------------------------------

async function fetchCliProxyApiModels(baseUrl: string): Promise<ModelInfo[]> {
  // CLIProxyAPI exposes an OpenAI-compatible /v1/models endpoint
  const cleanBase = baseUrl.replace(/\/+$/, "");
  const url = cleanBase.endsWith("/v1")
    ? `${cleanBase}/models`
    : `${cleanBase}/v1/models`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `CLIProxyAPI /models failed: ${res.status} ${await res.text()}`,
    );
  }
  const json = (await res.json()) as { data: OpenAIModel[] };

  return json.data
    .map((m) => ({
      id: m.id,
      name: formatModelName(m.id),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Helper — format a raw model ID into a human-readable name
// ---------------------------------------------------------------------------

function formatModelName(id: string): string {
  return id
    .replace(/-/g, " ")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// OpenAI — embedding models
// ---------------------------------------------------------------------------

async function fetchOpenAIEmbeddingModels(
  apiKey: string,
): Promise<ModelInfo[]> {
  const res = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    throw new Error(`OpenAI /models failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { data: OpenAIModel[] };

  return json.data
    .filter((m) => m.id.toLowerCase().startsWith("text-embedding-"))
    .map((m) => ({
      id: m.id,
      name: formatModelName(m.id),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Convex Actions — separate endpoints for language and embedding models
// ---------------------------------------------------------------------------

/** Fetch language models available for a given provider. */
export const listLanguageModels = action({
  args: {
    provider: v.string(),
    apiKey: v.optional(v.string()),
    baseUrl: v.optional(v.string()),
  },
  handler: async (_ctx, args): Promise<ModelInfo[]> => {
    const { provider, apiKey, baseUrl } = args;

    switch (provider) {
      case "openai": {
        if (!apiKey) throw new Error("OpenAI requires an API key");
        return fetchOpenAIModels(apiKey);
      }
      case "anthropic": {
        if (!apiKey) throw new Error("Anthropic requires an API key");
        return fetchAnthropicModels(apiKey);
      }
      case "google": {
        if (!apiKey) throw new Error("Google AI requires an API key");
        return fetchGoogleModels(apiKey);
      }
      case "groq": {
        if (!apiKey) throw new Error("Groq requires an API key");
        return fetchGroqModels(apiKey);
      }
      case "ollama": {
        if (!baseUrl) throw new Error("Ollama requires a base URL");
        return fetchOllamaModels(baseUrl);
      }
      case "cliproxyapi": {
        if (!baseUrl) throw new Error("CLIProxyAPI requires a base URL");
        return fetchCliProxyApiModels(baseUrl);
      }
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  },
});

/** Fetch embedding models available for a given provider. */
export const listEmbeddingModels = action({
  args: {
    provider: v.string(),
    apiKey: v.optional(v.string()),
    baseUrl: v.optional(v.string()),
  },
  handler: async (_ctx, args): Promise<ModelInfo[]> => {
    const { provider, apiKey, baseUrl } = args;

    switch (provider) {
      case "openai": {
        if (!apiKey) throw new Error("OpenAI requires an API key");
        return fetchOpenAIEmbeddingModels(apiKey);
      }
      case "google": {
        if (!apiKey) throw new Error("Google AI requires an API key");
        return fetchGoogleEmbeddingModels(apiKey);
      }
      case "ollama": {
        if (!baseUrl) throw new Error("Ollama requires a base URL");
        return fetchOllamaModels(baseUrl);
      }
      default:
        throw new Error(
          `Embedding models not supported for provider: ${provider}`,
        );
    }
  },
});
