"use node";

import { createTool, type ToolCtx } from "@convex-dev/agent";
import { z } from "zod";
import { api } from "../../_generated/api";
import type { DataModel, Id } from "../../_generated/dataModel";

/**
 * Rename the current chat session to a descriptive title.
 * Used by the Chatter agent to give the conversation a meaningful name.
 */
export function createRenameChatSessionTool({
  sessionId,
}: {
  sessionId?: Id<"chatSessions">;
}) {
  return createTool<{ title: string }, string, ToolCtx<DataModel>>({
    description:
      "Rename the current chat session. Use this to give the chat a concise, meaningful title based on the user's initial query or the ongoing topic of conversation.",
    inputSchema: z.object({
      title: z
        .string()
        .describe(
          "The new short title for the chat session, e.g., 'Planning Italy Trip' or 'Debugging React'.",
        ),
    }),
    execute: async (ctx, { title }): Promise<string> => {
      if (!sessionId) {
        return "Failed: No active chat session to rename.";
      }
      await ctx.runMutation(api.chatSessions.rename, {
        id: sessionId,
        title,
      });
      return `Successfully renamed the chat session to "${title}".`;
    },
  });
}
