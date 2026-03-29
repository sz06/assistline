import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { syncContactHandles } from "../contacts";

/**
 * For a DM conversation, find the "other" participant (not the user) and
 * return their contact details.
 *
 * Strategy: query inbound messages for this conversation to get the other
 * sender's Matrix ID. One inbound message is enough — in a DM there is only
 * ever one other person. Falls back to conv.participants for new conversations
 * that have no messages yet.
 *
 * Self-detection uses the userProfile.matrixIds list (explicit IDs stored
 * by the user or auto-populated when channels connect) instead of fragile
 * phone-number parsing from Matrix IDs.
 */
export async function resolveOtherParticipantContact(
  ctx: QueryCtx,
  conv: {
    _id: Id<"conversations">;
    participants: string[];
    channelId: Id<"channels">;
    name?: string;
  },
): Promise<{
  name: string;
  phone: string;
  email: string;
  contactId: Id<"contacts"> | null;
  matrixId: string | null;
} | null> {
  // Load the user's known Matrix IDs for self-detection.
  const userProfile = await ctx.db.query("userProfile").first();
  const selfIds = new Set(userProfile?.matrixIds ?? []);

  // One inbound message is enough — in a DM there's only ever one other sender.
  // conv.participants is the fallback if no messages exist yet.
  const inboundMessages = await ctx.db
    .query("messages")
    .withIndex("by_conversationId_timestamp", (q) =>
      q.eq("conversationId", conv._id),
    )
    .filter((q) => q.eq(q.field("direction"), "in"))
    .order("desc")
    .take(1);

  // Collect candidate Matrix IDs
  const seenSenders = new Set<string>();
  for (const msg of inboundMessages) {
    seenSenders.add(msg.sender);
  }
  // Fallback: conv.participants for conversations with no messages yet
  for (const p of conv.participants) {
    seenSenders.add(p);
  }

  for (const senderMatrixId of seenSenders) {
    // Skip the user's own Matrix IDs (puppet accounts)
    if (selfIds.has(senderMatrixId)) continue;

    const identity = await ctx.db
      .query("contactIdentities")
      .withIndex("by_matrixId", (q) => q.eq("matrixId", senderMatrixId))
      .first();

    if (identity) {
      const contact = await ctx.db.get(identity.contactId);
      if (contact) {
        const handles = await ctx.db
          .query("contactHandles")
          .withIndex("by_contactId", (q) =>
            q.eq("contactId", identity.contactId),
          )
          .collect();

        const phone = handles.find((h) => h.type === "phone")?.value ?? "";
        const email = handles.find((h) => h.type === "email")?.value ?? "";

        return {
          name:
            contact.name?.trim() ||
            contact.otherNames?.[0] ||
            conv.name ||
            "Unknown",
          phone,
          email,
          contactId: identity.contactId,
          matrixId: senderMatrixId,
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
    _id: Id<"conversations">;
    participants: string[];
    channelId: Id<"channels">;
    name?: string;
    memberCount: number;
  },
): Promise<{
  name: string;
  phone: string;
  email: string;
  contactId: Id<"contacts"> | null;
}> {
  const details: {
    name: string;
    phone: string;
    email: string;
    contactId: Id<"contacts"> | null;
    matrixId: string | null;
  } = {
    name: conv.name || "Unknown",
    phone: "",
    email: "",
    contactId: null,
    matrixId: null,
  };

  const isGroup = (conv.memberCount ?? 0) > 2;
  if (isGroup && conv.name) {
    details.name = conv.name;
  } else {
    const otherContact = await resolveOtherParticipantContact(ctx, conv);
    if (otherContact) {
      details.name = otherContact.name;
      details.phone = otherContact.phone;
      details.email = otherContact.email;
      details.contactId = otherContact.contactId;
      details.matrixId = otherContact.matrixId;
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

  // Resolve sender display names + contactIds — cache per sender
  const senderNameCache = new Map<string, string>();
  const senderContactIdCache = new Map<string, Id<"contacts"> | null>();
  const resolvedMessages = await Promise.all(
    messages.map(async (msg) => {
      let senderName: string | undefined;
      let senderContactId: Id<"contacts"> | null = null;

      if (senderNameCache.has(msg.sender)) {
        senderName = senderNameCache.get(msg.sender);
        senderContactId = senderContactIdCache.get(msg.sender) ?? null;
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
            senderContactId = identity.contactId;
          }
        }
        senderNameCache.set(msg.sender, senderName ?? msg.sender);
        senderContactIdCache.set(msg.sender, senderContactId);
        senderName = senderNameCache.get(msg.sender);
      }
      return { ...msg, senderName, senderContactId };
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
  source: "user" | "agent" | "system",
  _aiEnabled?: boolean,
  autoSend?: boolean,
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
        await ctx.db.patch(contact._id, { ...patch, lastUpdateAt: Date.now() });

        // Sync contact handles if patched
        if (patch.emails || patch.phoneNumbers) {
          await syncContactHandles(
            ctx,
            contact._id,
            patch.phoneNumbers as any,
            patch.emails as any,
          );
        }
      }
      await ctx.scheduler.runAfter(0, internal.auditLogs.log, {
        action: "contact.update",
        source,
        entity: "contacts",
        entityId: contact._id,
        details: JSON.stringify({
          via: "agent",
          ...(autoSend ? { autoSend: true } : {}),
          fields: Object.keys(patch),
        }),
        timestamp: Date.now(),
      });
    }
  } else if (actionType === "createArtifact") {
    const id = await ctx.db.insert("artifacts", {
      value: action.value as string,
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
        value: action.value,
        via: "agent",
      }),
      timestamp: Date.now(),
    });
  } else if (actionType === "assignRole" && action.contactId) {
    const contactId = action.contactId as Id<"contacts">;
    const contact = await ctx.db.get(contactId);
    const roleName = action.roleName as string;
    const role = await ctx.db
      .query("roles")
      .withIndex("by_name", (q) => q.eq("name", roleName))
      .unique();

    if (contact && role) {
      const currentRoles = contact.roles ?? [];
      if (!currentRoles.includes(role._id)) {
        await ctx.db.patch(contactId, {
          roles: [...currentRoles, role._id],
          lastUpdateAt: Date.now(),
        });
      }
    }

    await ctx.scheduler.runAfter(0, internal.auditLogs.log, {
      action: "contact.assignRole",
      source,
      entity: "contacts",
      entityId: action.contactId as string,
      details: JSON.stringify({
        roleName: action.roleName,
        via: "agent",
      }),
      timestamp: Date.now(),
    });
  }
}
