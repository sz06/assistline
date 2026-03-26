import type { Meta, StoryObj } from "@storybook/react-vite";
import { SuggestionCard } from ".";

const meta = {
  title: "Components/Artifacts/SuggestionCard",
  component: SuggestionCard,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  argTypes: {
    onApprove: { action: "approved" },
    onDismiss: { action: "dismissed" },
  },
} satisfies Meta<typeof SuggestionCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CreateSuggestion: Story = {
  args: {
    suggestion: {
      _id: "s_1",
      type: "create",
      value: "User mentioned they prefer email over SMS for updates.",
      embedding: [0.1, 0.2, 0.3], // mock embedding presence
    },
    onApprove: () => {},
    onDismiss: () => {},
  },
};

export const UpdateSuggestion: Story = {
  args: {
    suggestion: {
      _id: "s_2",
      type: "update",
      value:
        "Changed primary language from Spanish to English based on recent chat.",
      artifactId: "a_1",
      sessionId: "session_123",
      conversationId: "conv_456",
    },
    onApprove: () => {},
    onDismiss: () => {},
  },
};

export const MissingEmbedding: Story = {
  args: {
    suggestion: {
      _id: "s_3",
      type: "create",
      value: "Requires embedding generation for semantic search.",
    },
    onApprove: () => {},
    onDismiss: () => {},
  },
};
