/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ai_engine from "../ai/engine.js";
import type * as ai_models from "../ai/models.js";
import type * as aiProviders from "../aiProviders.js";
import type * as artifacts from "../artifacts.js";
import type * as auditLogs from "../auditLogs.js";
import type * as channelActions from "../channelActions.js";
import type * as channels from "../channels.js";
import type * as contacts from "../contacts.js";
import type * as conversations from "../conversations.js";
import type * as crons from "../crons.js";
import type * as init from "../init.js";
import type * as matrixActions from "../matrixActions.js";
import type * as messages from "../messages.js";
import type * as roles from "../roles.js";
import type * as settings from "../settings.js";
import type * as utils_contacts from "../utils/contacts.js";
import type * as utils_matrix from "../utils/matrix.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "ai/engine": typeof ai_engine;
  "ai/models": typeof ai_models;
  aiProviders: typeof aiProviders;
  artifacts: typeof artifacts;
  auditLogs: typeof auditLogs;
  channelActions: typeof channelActions;
  channels: typeof channels;
  contacts: typeof contacts;
  conversations: typeof conversations;
  crons: typeof crons;
  init: typeof init;
  matrixActions: typeof matrixActions;
  messages: typeof messages;
  roles: typeof roles;
  settings: typeof settings;
  "utils/contacts": typeof utils_contacts;
  "utils/matrix": typeof utils_matrix;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
