import type { Meta, StoryObj } from "@storybook/react-vite";
import { DeleteConfirmDialog } from ".";

const meta = {
  title: "Components/Artifacts/DeleteConfirmDialog",
  component: DeleteConfirmDialog,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    onConfirm: { action: "confirmed" },
    onCancel: { action: "cancelled" },
  },
} satisfies Meta<typeof DeleteConfirmDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    onConfirm: () => {},
    onCancel: () => {},
  },
};
