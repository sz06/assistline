/**
 * AI Engine — provider resolution and model instantiation.
 *
 * Reads provider configuration from the `aiProviders` table and creates
 * AI SDK model instances dynamically. No model names are hardcoded;
 * available models are discovered at runtime via each provider's API.
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAI } from "@ai-sdk/openai";
import type { EmbeddingModel, LanguageModel } from "ai";

// ---------------------------------------------------------------------------
// Supported provider keys (must match `aiProviders.provider` values)
// ---------------------------------------------------------------------------

/** All provider identifiers the engine currently knows how to instantiate. */
export const SUPPORTED_PROVIDERS = [
  "openai",
  "anthropic",
  "google",
  "groq",
  "ollama",
  "cliproxyapi",
] as const;

export type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number];

// ---------------------------------------------------------------------------
// Provider factory — creates an AI SDK provider from stored config
// ---------------------------------------------------------------------------

interface ProviderConfig {
  provider: string;
  apiKey?: string;
  baseUrl?: string;
}

/**
 * Create an AI SDK language model from a stored provider config + model id.
 *
 * The returned object can be passed directly to `generateText`, `streamText`,
 * `generateObject`, etc.
 */
export function resolveLanguageModel(
  config: ProviderConfig,
  modelId: string,
): LanguageModel {
  const { provider, apiKey } = config;

  switch (provider) {
    case "openai":
      return createOpenAI({ apiKey: apiKey ?? "" })(modelId);

    case "anthropic":
      return createAnthropic({ apiKey: apiKey ?? "" })(modelId);

    case "google":
      return createGoogleGenerativeAI({ apiKey: apiKey ?? "" })(modelId);

    case "groq":
      return createGroq({ apiKey: apiKey ?? "" })(modelId);

    case "ollama":
      // Ollama exposes an OpenAI-compatible API locally
      if (!config.baseUrl) {
        throw new Error("Ollama requires a base URL");
      }
      return createOpenAI({
        apiKey: "ollama", // dummy key, ollama doesn't require one
        baseURL: config.baseUrl,
      })(modelId);

    case "cliproxyapi":
      // CLIProxyAPI exposes an OpenAI-compatible API
      if (!config.baseUrl) {
        throw new Error("CLIProxyAPI requires a base URL");
      }
      return createOpenAI({
        apiKey: "cliproxyapi", // dummy key, CLIProxyAPI doesn't require one
        baseURL: config.baseUrl,
      })(modelId);

    default:
      throw new Error(`Unsupported AI provider: ${provider}`);
  }
}

/**
 * Create an AI SDK embedding model from a stored provider config + model id.
 */
export function resolveEmbeddingModel(
  config: ProviderConfig,
  modelId: string,
): EmbeddingModel {
  const { provider, apiKey } = config;

  switch (provider) {
    case "openai":
      return createOpenAI({ apiKey: apiKey ?? "" }).embedding(modelId);

    case "google":
      return createGoogleGenerativeAI({
        apiKey: apiKey ?? "",
      }).textEmbeddingModel(modelId);

    default:
      throw new Error(
        `Embedding models not supported for provider: ${provider}`,
      );
  }
}
