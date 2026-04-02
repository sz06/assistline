import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { syncContactHandles } from "../contacts/shared";

/**
 * For a DM conversation, find the "other" participant (not the user) and
 * return their contact details.
 *
 * Iterates conv.participants directly and skips the one belonging to the
 * self-contact (isSelf: true). No message scanning needed.
 *
 * Accepts an optional pre-loaded selfContactId to avoid duplicate lookups
 * when the caller already has it.
 */
export async function resolveOtherParticipantContact(
  ctx: QueryCtx,
  conv: {
    _id: Id<"conversations">;
    participants: string[];
    channelId: Id<"channels">;
    name?: string;
  },
  selfContactId?: Id<"contacts"> | null,
): Promise<{
  name: string;
  phone: string;
  email: string;
  contactId: Id<"contacts"> | null;
  matrixId: string | null;
} | null> {
  // Load self-contact's Matrix IDs to filter them out.
  let resolvedSelfId = selfContactId;
  if (resolvedSelfId === undefined) {
    const selfContact = await ctx.db
      .query("contacts")
      .withIndex("by_isSelf", (q) => q.eq("isSelf", true))
      .first();
    resolvedSelfId = selfContact?._id ?? null;
  }

  const selfIdentities = resolvedSelfId
    ? await ctx.db
        .query("contactIdentities")
        .withIndex("by_contactId", (q) => q.eq("contactId", resolvedSelfId!))
        .collect()
    : [];
  const selfIds = new Set(selfIdentities.map((i) => i.matrixId));

  // Iterate participants, skip self, return the first non-self contact.
  for (const matrixId of conv.participants) {
    if (selfIds.has(matrixId)) continue;

    const identity = await ctx.db
      .query("contactIdentities")
      .withIndex("by_matrixId", (q) => q.eq("matrixId", matrixId))
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

        return {
          name:
            contact.name?.trim() ||
            contact.otherNames?.[0] ||
            conv.name ||
            "Unknown",
          phone:
            handles.find((h) => h.type === "phone")?.value ?? "",
          email:
            handles.find((h) => h.type === "email")?.value ?? "",
          contactId: identity.contactId,
          matrixId,
        };
      }
    }
  }

  return null;
}

/**
 * Resolve display details for the "other side" of a conversation.
 * For groups: uses the room name. For DMs: resolves the contact.
 *
 * Accepts an optional pre-loaded selfContactId to avoid duplicate lookups.
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
  selfContactId?: Id<"contacts"> | null,
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
    const otherContact = await resolveOtherParticipantContact(ctx, conv, selfContactId);
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

  // Load self-contact ONCE — shared by resolveParticipantDetails + isOwnMessage
  const selfContact = await ctx.db
    .query("contacts")
    .withIndex("by_isSelf", (q) => q.eq("isSelf", true))
    .first();
  const selfContactId = selfContact?._id ?? null;

  const participantDetails = await resolveParticipantDetails(ctx, conv, selfContactId);

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
      const isOwnMessage =
        selfContactId !== null && senderContactId === selfContactId;
      return { ...msg, senderName, senderContactId, isOwnMessage };
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
