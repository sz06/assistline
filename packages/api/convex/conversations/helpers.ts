import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { extractWhatsAppPhoneNumber } from "../utils/matrix";

/**
 * For a DM conversation, find the "other" participant (not the user) and
 * return their contact details. Uses the channel's connected phone number
 * to identify which participant is "self".
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
  const selfPhone = channel?.phoneNumber?.replace(/\D/g, "");

  // Find the participant whose phone number does NOT match the user's
  for (const participantMatrixId of conv.participants) {
    const participantPhone = extractWhatsAppPhoneNumber(participantMatrixId);

    // Skip this participant if they match the user's phone number
    if (selfPhone && participantPhone === selfPhone) {
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

  // Resolve header contact details — for DMs, use the OTHER participant
  const contactDetails = {
    name: conv.name ?? "Unknown",
    phone: "",
    email: "",
  };

  const isGroup = (conv.memberCount ?? 0) > 2;
  if (isGroup && conv.name) {
    contactDetails.name = conv.name;
  } else {
    const otherContact = await resolveOtherParticipantContact(ctx, conv);
    if (otherContact) {
      contactDetails.name = otherContact.name;
      contactDetails.phone = otherContact.phone;
      contactDetails.email = otherContact.email;
    }
  }

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

  return { ...conv, contactDetails, messages: resolvedMessages };
}
