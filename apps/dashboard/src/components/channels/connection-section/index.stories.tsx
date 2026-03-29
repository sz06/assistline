import type { Meta, StoryObj } from "@storybook/react";
import { ConnectionSection } from "./index";

const meta = {
  title: "Components/Channels/ConnectionSection",
  component: ConnectionSection,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof ConnectionSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Disconnected: Story = {
  args: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    channelId: "123" as any, // Mock ID
    status: "disconnected",
    channelType: "whatsapp",
    onPair: () => console.log("Pair"),
    onCancel: () => console.log("Cancel"),
    onDisconnect: () => console.log("Disconnect"),
    onSubmitCookies: async () => {},
  },
};

export const PairingWhatsApp: Story = {
  args: {
    ...Disconnected.args,
    status: "pairing",
    channelType: "whatsapp",
    qrCode:
      "https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=Example",
  },
};

export const Connected: Story = {
  args: {
    ...Disconnected.args,
    status: "connected",
    channelType: "facebook",
    phoneNumber: "+1234567890",
    connectedAt: Date.now(),
  },
};

export const ErrorState: Story = {
  args: {
    ...Disconnected.args,
    status: "error",
    channelType: "telegram",
    error: "Connection failed. Please check your credentials.",
  },
};
