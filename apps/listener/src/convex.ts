// Convex API reference for the listener.
//
// The @repo/api package exports TypeScript source files (main: "index.ts")
// which works in Vite but causes issues in plain Node.js / Docker.
// Instead, we use `anyApi` from convex/server directly — this is the same
// approach the generated api.js uses internally.
//
// At runtime, function references are just string paths, so this works
// identically to the typed API from @repo/api.

import { anyApi } from "convex/server";

export const api = anyApi as unknown as {
  channels: {
    getByType: typeof anyApi.channels.getByType;
    setBridgeDisconnected: typeof anyApi.channels.setBridgeDisconnected;
  };
  messages: {
    mutations: {
      insertMessage: typeof anyApi.messages.mutations.insertMessage;
      syncConversationMeta: typeof anyApi.messages.mutations.syncConversationMeta;
      addReaction: typeof anyApi.messages.mutations.addReaction;
      removeReaction: typeof anyApi.messages.mutations.removeReaction;
      redactMessage: typeof anyApi.messages.mutations.redactMessage;
      editMessage: typeof anyApi.messages.mutations.editMessage;
    };
  };
  conversations: {
    mutations: {
      markRead: typeof anyApi.conversations.mutations.markRead;
      setTyping: typeof anyApi.conversations.mutations.setTyping;
    };
  };
  config: {
    set: typeof anyApi.config.set;
  };
};
