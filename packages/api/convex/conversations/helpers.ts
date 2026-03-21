import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { extractWhatsAppPhoneNumber } from "../utils/matrix";

/**
 * For a DM conversation, find the "other" participant (not the user) and
 * return their contact details. Uses the channel's connected phone number
 * to identify which participant is the user.
 */
export async function resolveOtherParticipantContact(
  ctx: QueryCtx,
  conv: {
    participants: string[];
    channelId: Id<"channels">;
    name?: string;
  },
): Promise<{ name: string; phone: string; email: string } | null> {
  // Look up the channel to get the user's own phone number
  const channel = await ctx.db.get(conv.channelId);
  // Normalize to digits-only so "+16477127932" matches "16477127932"
  const userPhone = channel?.phoneNumber?.replace(/\D/g, "");

  // Find the participant whose phone number does NOT match the user's
  for (const participantMatrixId of conv.participants) {
    const participantPhone = extractWhatsAppPhoneNumber(participantMatrixId);

    // Skip this participant if they match the user's phone number
    if (userPhone && participantPhone === userPhone) {
      continue;
    }

    // Look up this participant's contact
    const identity = await ctx.db
      .query("contactIdentities")
      .withIndex("by_matrixId", (q) => q.eq("matrixId", participantMatrixId))
      .first();

    if (identity) {
      const contact = await ctx.db.get(identity.contactId);
      if (contact) {
        return {
          name:
            contact.name?.trim() ||
            contact.otherNames?.[0] ||
            (conv.name ?? participantMatrixId),
          phone: contact.phoneNumbers?.[0]?.value ?? "",
          email: contact.emails?.[0]?.value ?? "",
        };
      }
    }
  }

  return null;
}

/**
 * Resolve display details for the "other side" of a conversation.
 * For groups: uses the room name. For DMs: resolves the contact.
 */
export async function resolveParticipantDetails(
  ctx: QueryCtx,
  conv: {
    participants: string[];
    channelId: Id<"channels">;
    name?: string;
    memberCount: number;
  },
): Promise<{ name: string; phone: string; email: string }> {
  const details = { name: conv.name ?? "Unknown", phone: "", email: "" };

  const isGroup = (conv.memberCount ?? 0) > 2;
  if (isGroup && conv.name) {
    details.name = conv.name;
  } else {
    const otherContact = await resolveOtherParticipantContact(ctx, conv);
    if (otherContact) {
      details.name = otherContact.name;
      details.phone = otherContact.phone;
      details.email = otherContact.email;
    }
  }

  return details;
}

/**
 * Shared helper: fetches messages for a conversation, resolves contact details
 * and sender display names. Used by both the public query and internal query.
 */
export async function buildConversationWithMessages(
  ctx: QueryCtx,
  conversationId: Id<"conversations">,
  messageLimit: number,
) {
  const conv = await ctx.db.get(conversationId);
  if (!conv) return null;

  // Fetch the latest N messages (desc), then reverse for chronological display
  const messagesDesc = await ctx.db
    .query("messages")
    .withIndex("by_conversationId_timestamp", (q) =>
      q.eq("conversationId", conversationId),
    )
    .order("desc")
    .take(messageLimit);

  const messages = messagesDesc.reverse();

  const participantDetails = await resolveParticipantDetails(ctx, conv);

  // Resolve sender display names — cache per sender to avoid redundant lookups
  const senderNameCache = new Map<string, string>();
  const resolvedMessages = await Promise.all(
    messages.map(async (msg) => {
      let senderName: string | undefined;
      if (senderNameCache.has(msg.sender)) {
        senderName = senderNameCache.get(msg.sender);
      } else {
        const identity = await ctx.db
          .query("contactIdentities")
          .withIndex("by_matrixId", (q) => q.eq("matrixId", msg.sender))
          .first();
        if (identity) {
          const contact = await ctx.db.get(identity.contactId);
          if (contact) {
            senderName =
              contact.name?.trim() || contact.otherNames?.[0] || undefined;
          }
        }
        senderNameCache.set(msg.sender, senderName ?? msg.sender);
        senderName = senderNameCache.get(msg.sender);
      }
      return { ...msg, senderName };
    }),
  );

  return { ...conv, participantDetails, messages: resolvedMessages };
}

// ---------------------------------------------------------------------------
// Suggested-action dispatch (shared between manual approve & autoAct)
// ---------------------------------------------------------------------------

const CONTACT_PATCH_KEYS = [
  "name",
  "nickname",
  "company",
  "jobTitle",
  "birthday",
  "notes",
  "emails",
] as const;

/**
 * Execute a single agent-suggested action (updateContact, createArtifact,
 * or assignRole). Shared by both the public `executeSuggestedAction`
 * mutation and the internal `internalExecuteSuggestedAction` mutation.
 */
export async function executeActionDispatch(
  ctx: MutationCtx,
  actionJson: string,
  source: "auto" | "manual",
  autoAct?: boolean,
) {
  const action = JSON.parse(actionJson) as Record<string, unknown>;
  const actionType = action.type as string;

  if (actionType === "updateContact" && action.contactId) {
    const contactId = action.contactId as Id<"contacts">;
    const contact = await ctx.db.get(contactId);
    if (contact) {
      const patch: Record<string, unknown> = {};
      for (const key of CONTACT_PATCH_KEYS) {
        if (action[key] !== undefined) patch[key] = action[key];
      }
      if (Object.keys(patch).length > 0) {
        await ctx.db.patch(contact._id, patch);
      }
      await ctx.scheduler.runAfter(0, internal.auditLogs.log, {
        action: "contact.update",
        source,
        entity: "contacts",
        entityId: contact._id,
        details: JSON.stringify({
          via: "agent",
          ...(autoAct ? { autoAct: true } : {}),
          fields: Object.keys(patch),
        }),
        timestamp: Date.now(),
      });
    }
  } else if (actionType === "createArtifact") {
    const id = await ctx.db.insert("artifacts", {
      value: action.value as string,
      description: action.description as string,
      accessibleToRoles: [],
      expiresAt: action.expiresAt as number | undefined,
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.auditLogs.log, {
      action: "artifact.create",
      source,
      entity: "artifacts",
      entityId: id,
      details: JSON.stringify({
        description: action.description,
        via: "agent",
        ...(autoAct ? { autoAct: true } : {}),
      }),
      timestamp: Date.now(),
    });
  } else if (actionType === "assignRole" && action.contactId) {
    await ctx.scheduler.runAfter(0, internal.auditLogs.log, {
      action: "contact.assignRole",
      source,
      entity: "contacts",
      entityId: action.contactId as string,
      details: JSON.stringify({
        roleName: action.roleName,
        via: "agent",
        ...(autoAct ? { autoAct: true } : {}),
      }),
      timestamp: Date.now(),
    });
  }
}
