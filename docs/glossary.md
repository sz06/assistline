# Entity Glossary

This document defines the canonical names for every entity in AssistLine. All code, documentation, agent prompts, and UI copy **must** use these terms consistently.

---

## Core Entities

### User

The single owner and operator of the system. All inboxes, conversations, and contacts belong to this person. There is no multi-user or multi-tenant model.

- **Schema presence:** Implicit — the user is identified by their Matrix ID across conversations.
- **Example:** "The **user** approved the suggested reply."

### Contact

A person the user communicates with. Contacts are stored with optional profile data (name, phone numbers, emails, company, etc.) and can be assigned roles.

- **Schema table:** `contacts`
- **Example:** "Create a new **contact** for this phone number."

### Identity

A single platform-specific handle belonging to a contact (e.g., a WhatsApp Matrix ID). One contact can have many identities.

- **Schema table:** `contactIdentities`
- **Example:** "This **identity** maps to the WhatsApp bridge user `@whatsapp_1234:localhost`."

### Participant

Any party in a conversation — could be the user or a contact. Used when the distinction between user and contact is not important.

- **Schema presence:** `conversations.participants` (array of Matrix IDs).
- **Example:** "There are three **participants** in this group conversation."

---

## Messaging Entities

### Conversation

A thread of messages tied to a Matrix room. Can be a direct message (two participants) or a group (more than two). Conversations belong to a channel.

- **Schema table:** `conversations`
- **Example:** "Open the **conversation** with Alice."

### Message

A single communication unit within a conversation — text, image, video, reaction, etc.

- **Schema table:** `messages`
- **Example:** "The last **message** was a photo."

### Channel

A specific connected instance of a messaging platform (e.g., "My WhatsApp", "Work Telegram"). Conversations flow through channels.

- **Schema table:** `channels`
- **Example:** "This **channel** is connected to your WhatsApp account."

### Platform

The underlying messaging protocol or network — `whatsapp`, `telegram`, etc. A channel *has* a platform type. Platform is a property, not a standalone entity.

- **Schema presence:** `channels.type`, `contactIdentities.platform`
- **Example:** "The **platform** for this channel is WhatsApp."

---

## AI Entities

### Agent

An AI actor that operates within the system. Agents observe conversations, suggest replies, and propose actions. "Chatter" is the primary agent.

- **Schema presence:** `conversations.agentThreadId`, agent code in `agents/`
- **Example:** "The **agent** suggested a reply to the customer."

### Thread

The agent-side conversation context maintained by the Convex Agent component. Distinct from a conversation, which is user-facing. A conversation may have at most one active thread.

- **Schema presence:** `conversations.agentThreadId`
- **Example:** "The agent resumed its **thread** for this conversation."

### Provider

A configured AI service — OpenAI, Anthropic, Ollama, etc. Providers are either `language` (for chat/completions) or `embedding` (for vector search). One provider per type is marked as default.

- **Schema table:** `aiProviders`
- **Example:** "Switch the default **provider** to Ollama."

### Action

A discrete operation an agent suggests or executes — sending a message, saving an artifact, updating a contact, etc. Actions appear as suggestion blocks in the UI awaiting user approval.

- **Schema presence:** `conversations.suggestedActions`
- **Example:** "The agent proposed an **action** to update the contact's phone number."

### Artifact

A piece of knowledge or memory stored by the system with an embedding for semantic search. Artifacts are scoped by role and can expire.

- **Schema table:** `artifacts`
- **Example:** "The agent saved a new **artifact** about the user's travel preferences."

---

## System Entities

### System

The AssistLine application itself. Used when referring to automated behavior that is not attributable to a specific agent (e.g., config seeding, audit logging).

- **Example:** "The **system** seeded default configuration on startup."

### Role

A tag assigned to contacts (and the user via "User") that controls agent behavior and artifact access. Roles provide context to agents about how to interact with a contact.

- **Schema table:** `roles`
- **Example:** "Assign the 'Family' **role** to this contact."

### Config

A key-value system setting that controls runtime behavior (e.g., historical fetch size, polling rates). Seeded from `config.json` on startup.

- **Schema table:** `config`
- **Example:** "Update the **config** for `historicalFetchSize.whatsapp`."

### Audit Log

A timestamped record of a significant event — contact creation, AI toggle, message send, etc. Used for traceability and debugging.

- **Schema table:** `auditLogs`
- **Example:** "The **audit log** shows the AI was disabled at 3:42 PM."

---

## Quick Reference

| Entity     | Schema Table / Field             | Description                                           |
| ---------- | -------------------------------- | ----------------------------------------------------- |
| User       | *(implicit)*                     | The sole owner of the system                          |
| Contact    | `contacts`                       | A person the user communicates with                   |
| Identity   | `contactIdentities`              | A contact's platform-specific handle                  |
| Participant| `conversations.participants`     | Any party in a conversation (user or contact)         |
| Conversation | `conversations`                | A message thread tied to a Matrix room                |
| Message    | `messages`                       | A single communication unit                           |
| Channel    | `channels`                       | A connected messaging platform instance               |
| Platform   | `channels.type`                  | The protocol type (whatsapp, telegram)                |
| Agent      | `agents/`                        | An AI actor (e.g., Chatter)                           |
| Thread     | `conversations.agentThreadId`    | Agent-side conversation context                       |
| Provider   | `aiProviders`                    | A configured AI service                               |
| Action     | `conversations.suggestedActions` | An agent-proposed operation                           |
| Artifact   | `artifacts`                      | A stored memory/fact with embedding                   |
| System     | *(implicit)*                     | The AssistLine application                            |
| Role       | `roles`                          | A tag controlling agent behavior & artifact access     |
| Config     | `config`                         | A key-value runtime setting                           |
| Audit Log  | `auditLogs`                      | A timestamped record of a significant event           |
