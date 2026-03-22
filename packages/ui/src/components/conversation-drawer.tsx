import { Drawer } from "@base-ui/react/drawer";
import { Switch } from "@base-ui/react/switch";
import { Bot, MoreVertical, Send, Sparkles, Trash2, X } from "lucide-react";
import * as React from "react";
import { cn } from "../lib/utils";

export interface ConversationDrawerProps {
  /** Whether the AI agent is enabled for this conversation */
  aiEnabled: boolean;
  /** Whether suggested replies are sent automatically */
  autoSend: boolean;
  /** Whether suggested actions are executed automatically */
  autoAct: boolean;
  /** Input token count (shown when AI is enabled) */
  tokensIn?: number;
  /** Output token count (shown when AI is enabled) */
  tokensOut?: number;
  /** Called when the AI enabled toggle changes */
  onAIEnabledChange: (value: boolean) => void;
  /** Called when the auto-send toggle changes */
  onAutoSendChange: (value: boolean) => void;
  /** Called when the auto-act toggle changes */
  onAutoActChange: (value: boolean) => void;
  /** Called when the delete chat button is clicked */
  onDeleteChat: () => void;
}

/** A right-side drawer for conversation settings (AI toggles, delete). */
export function ConversationDrawer({
  aiEnabled,
  autoSend,
  autoAct,
  tokensIn,
  tokensOut,
  onAIEnabledChange,
  onAutoSendChange,
  onAutoActChange,
  onDeleteChat,
}: ConversationDrawerProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <Drawer.Root open={open} onOpenChange={setOpen} swipeDirection="right">
      <Drawer.Trigger
        data-testid="conversation-drawer-trigger"
        className="h-8 w-8 flex items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        <MoreVertical className="h-4 w-4" />
      </Drawer.Trigger>

      <Drawer.Portal>
        <Drawer.Backdrop className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-opacity" />
        <Drawer.Viewport className="fixed inset-0 z-50 flex justify-end">
          <Drawer.Popup className="h-full w-80 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 shadow-xl flex flex-col ml-auto">
            <Drawer.Content className="flex flex-col h-full overflow-hidden">
              {/* ── Header ──────────────────────────────── */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800 shrink-0">
                <Drawer.Title className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Conversation Settings
                </Drawer.Title>
                <Drawer.Close className="h-7 w-7 flex items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                  <X className="h-4 w-4" />
                </Drawer.Close>
              </div>

              {/* ── AI Settings Section ─────────────────── */}
              <div className="flex-1 overflow-y-auto">
                <div className="px-5 pt-4 pb-2">
                  <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                    AI Settings
                  </p>
                </div>

                {/* Enable AI */}
                <ToggleRow
                  icon={<Bot className="h-4 w-4 text-blue-500" />}
                  title="Enable AI"
                  description="Activate Chatter agent"
                  checked={aiEnabled}
                  onCheckedChange={onAIEnabledChange}
                  accentColor="emerald"
                  testId="ai-toggle-enabled"
                />

                {/* Auto Post Reply */}
                <ToggleRow
                  icon={<Send className="h-4 w-4 text-amber-500" />}
                  title="Auto Post Reply"
                  description="Send suggested replies automatically"
                  checked={autoSend}
                  onCheckedChange={onAutoSendChange}
                  disabled={!aiEnabled}
                  accentColor="amber"
                  testId="ai-toggle-autosend"
                />

                {/* Auto Perform Actions */}
                <ToggleRow
                  icon={<Sparkles className="h-4 w-4 text-violet-500" />}
                  title="Auto Perform Actions"
                  description="Execute suggested actions automatically"
                  checked={autoAct}
                  onCheckedChange={onAutoActChange}
                  disabled={!aiEnabled}
                  accentColor="violet"
                  testId="ai-toggle-autoact"
                />

                {/* Token Usage Stats */}
                {aiEnabled && (tokensIn || tokensOut) ? (
                  <div className="px-5 mt-4">
                    <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
                      <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2.5">
                        Token Usage
                      </p>
                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg px-3 py-2">
                          <p className="text-[10px] text-blue-400 dark:text-blue-500 font-medium">
                            Input
                          </p>
                          <p className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                            {(tokensIn ?? 0).toLocaleString()}
                          </p>
                        </div>
                        <div className="bg-violet-50 dark:bg-violet-950/30 rounded-lg px-3 py-2">
                          <p className="text-[10px] text-violet-400 dark:text-violet-500 font-medium">
                            Output
                          </p>
                          <p className="text-sm font-semibold text-violet-600 dark:text-violet-400">
                            {(tokensOut ?? 0).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="mt-2 text-[10px] text-gray-400 dark:text-gray-500 text-right">
                        Total:{" "}
                        {((tokensIn ?? 0) + (tokensOut ?? 0)).toLocaleString()}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* ── Delete Chat (pinned to bottom) ─────── */}
              <div className="shrink-0 border-t border-gray-200 dark:border-gray-800 px-5 py-4">
                <button
                  type="button"
                  data-testid="conversation-drawer-delete"
                  onClick={() => {
                    onDeleteChat();
                    setOpen(false);
                  }}
                  className="w-full flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/50 border border-red-200 dark:border-red-900/50 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete Chat
                </button>
              </div>
            </Drawer.Content>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

/* ── Internal toggle-row helper ────────────────────────────────── */

const switchAccentMap: Record<string, string> = {
  emerald: "data-[checked]:bg-emerald-500",
  amber: "data-[checked]:bg-amber-500",
  violet: "data-[checked]:bg-violet-500",
};

function ToggleRow({
  icon,
  title,
  description,
  checked,
  onCheckedChange,
  disabled = false,
  accentColor,
  testId,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
  accentColor: string;
  testId?: string;
}) {
  return (
    <div
      className={cn(
        "px-5 py-3 flex items-center justify-between gap-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors",
        disabled && "opacity-40",
      )}
    >
      <div className="flex items-center gap-3">
        {icon}
        <div>
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
            {title}
          </p>
          <p className="text-[11px] text-gray-400 dark:text-gray-500">
            {description}
          </p>
        </div>
      </div>
      <Switch.Root
        data-testid={testId}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        className={cn(
          "relative inline-flex items-center h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out bg-gray-300 dark:bg-gray-700 disabled:cursor-not-allowed",
          switchAccentMap[accentColor],
        )}
      >
        <Switch.Thumb className="pointer-events-none block h-4 w-4 rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out translate-x-0 data-[checked]:translate-x-4" />
      </Switch.Root>
    </div>
  );
}
