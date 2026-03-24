# Per-Conversation Notes (Future Feature)

## Overview

Per-conversation notes will serve as the agent's "institutional memory" for each conversation. Instead of relying on message history (which is capped at 20 messages in the agent thread), notes provide persistent, editable context.

## Design Direction

### What Notes Are
- A text field attached to each conversation
- Contains key facts, context, and reminders about the contact and conversation history
- Injected into the Chatter agent's system prompt as additional context

### Who Maintains Them
- **Agent**: The Chatter agent (or a dedicated Notes agent) extracts and appends important facts
- **User**: Can view and edit notes directly in the conversation drawer / sidebar

### How They Fit the Architecture
- Thread messages are a rolling 20-message window (current state)
- Notes are the long-term memory layer, persisting across thread pruning
- At invocation time, the agent receives: system prompt + notes + last 20 thread messages

### Potential Schema

```
conversations: defineTable({
  ...existing fields,
  notes: v.optional(v.string()),  // Freeform text notes
})
```

### Agent Integration
- Notes are injected into the Chatter prompt as a `## CONVERSATION NOTES` section
- When the agent calls `suggestReply` or `noReplyNeeded`, it can also suggest note updates
- A new response tool like `updateNotes` could allow the agent to append/edit notes directly

### UI Integration
- Notes visible in the conversation drawer alongside AI settings
- Editable text area that persists changes to the conversation document
- Optional: diff view showing what the agent added vs what was user-edited

## Status

**Not yet implemented.** This is a planned feature direction documented for future reference.
