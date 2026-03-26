import type { Meta, StoryObj } from "@storybook/react-vite";
import { EmptyState } from ".";

const meta = {
  title: "Components/Artifacts/EmptyState",
  component: EmptyState,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  argTypes: {
    onAdd: { action: "add-clicked" },
  },
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    onAdd: () => {},
  },
};
