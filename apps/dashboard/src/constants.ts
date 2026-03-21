/**
 * Colour tokens for the three AI-toggle indicators.
 * Used by the sidebar 3-segment border, the chat-header dots,
 * and the ConversationDrawer toggle switches.
 */
export const AI_TOGGLE_COLORS = {
  /** Enable AI — matches the Conversation Drawer "emerald" accent */
  aiEnabled: "bg-emerald-500",
  /** Auto Post Reply — matches the Conversation Drawer "amber" accent */
  autoSend: "bg-amber-500",
  /** Auto Perform Actions — matches the Conversation Drawer "violet" accent */
  autoAct: "bg-violet-500",
} as const;
