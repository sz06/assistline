import type { Meta, StoryObj } from "@storybook/react";
import { WhatsAppInstructions } from "./index";

const meta = {
  title: "Components/Channels/WhatsAppInstructions",
  component: WhatsAppInstructions,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof WhatsAppInstructions>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    qrCode:
      "https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=Example",
  },
};

export const Loading: Story = {
  args: {},
};
