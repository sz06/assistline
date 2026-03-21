import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ConversationDrawer } from "../components/conversation-drawer";

const meta = {
  title: "Components/ConversationDrawer",
  component: ConversationDrawer,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  args: {
    onAIEnabledChange: fn(),
    onAutoSendChange: fn(),
    onAutoActChange: fn(),
    onDeleteChat: fn(),
  },
} satisfies Meta<typeof ConversationDrawer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default state — AI disabled, no token usage. */
export const Default: Story = {
  args: {
    aiEnabled: false,
    autoSend: false,
    autoAct: false,
  },
};

/** AI enabled with auto-send toggled on and token usage stats visible. */
export const AIEnabled: Story = {
  args: {
    aiEnabled: true,
    autoSend: true,
    autoAct: false,
    tokensIn: 12_450,
    tokensOut: 3_820,
  },
};

/** All features enabled with high token usage numbers. */
export const AllFeaturesOn: Story = {
  args: {
    aiEnabled: true,
    autoSend: true,
    autoAct: true,
    tokensIn: 48_900,
    tokensOut: 15_230,
  },
};
