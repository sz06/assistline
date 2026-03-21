import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/**
 * Insert an outbound message, update conversation metadata, and schedule
 * Matrix delivery. Shared by `sendMessage` (public) and `internalSendMessage`
 * (called by the Chatter agent when autoSend is enabled).
 *
 * Returns the inserted message's Convex ID.
 */
export async function insertOutboundMessage(
  ctx: MutationCtx,
  args: {
    conversationId: Id<"conversations">;
    matrixRoomId: string;
    content: string;
    auditSource: "manual" | "auto";
    auditDetails?: Record<string, unknown>;
  },
): Promise<Id<"messages">> {
  // Insert the outbound message with a temporary placeholder eventId.
  // It will be replaced with the real Matrix event ID once delivery succeeds.
  const messageId = await ctx.db.insert("messages", {
    conversationId: args.conversationId,
    eventId: `outbound_${Date.now().toString()}`,
    sender: "dashboard_user",
    text: args.content,
    direction: "out",
    timestamp: Date.now(),
  });

  // Update conversation metadata so the list reflects the new message
  const now = Date.now();
  await ctx.db.patch(args.conversationId, {
    lastMessageId: messageId,
    updatedAt: now,
    status: "waiting_on_contact",
  });

  // Audit log (async, fire-and-forget)
  await ctx.scheduler.runAfter(0, internal.auditLogs.log, {
    action: "message.send",
    source: args.auditSource,
    entity: "messages",
    entityId: messageId,
    details: JSON.stringify({
      conversationId: args.conversationId,
      ...args.auditDetails,
    }),
    timestamp: now,
  });

  // Schedule Matrix delivery (async — the actual HTTP call to the homeserver)
  await ctx.scheduler.runAfter(0, internal.matrixActions.sendMatrixMessage, {
    matrixRoomId: args.matrixRoomId,
    messageId,
    content: args.content,
  });

  return messageId;
}
