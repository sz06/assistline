// Convex API reference for the listener.
//
// The @repo/api package exports TypeScript source files (main: "index.ts")
// which works in Vite but causes issues in plain Node.js / Docker.
// Instead, we use `anyApi` from convex/server directly — this is the same
// approach the generated api.js uses internally.
//
// At runtime, function references are just string paths, so this works
// identically to the typed API from @repo/api.
//
// With admin auth, the listener can call internalMutation/internalAction
// functions in addition to public ones.

import { anyApi } from "convex/server";

export const api = anyApi as unknown as {
  channels: {
    core: {
      getByType: typeof anyApi.channels.core.getByType;
    };
  };
  config: {
    set: typeof anyApi.config.set;
  };
  ingest: {
    handleMatrixEvent: typeof anyApi.ingest.handleMatrixEvent;
    handleEphemeralEvent: typeof anyApi.ingest.handleEphemeralEvent;
    handleConversationMeta: typeof anyApi.ingest.handleConversationMeta;
  };
  self: {
    addSelfIdentity: typeof anyApi.self.addSelfIdentity;
  };
};
