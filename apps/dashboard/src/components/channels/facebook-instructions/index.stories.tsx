import type { Meta, StoryObj } from "@storybook/react";
import { FacebookInstructions } from "./index";

const meta = {
  title: "Components/Channels/FacebookInstructions",
  component: FacebookInstructions,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof FacebookInstructions>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    instructions: "Please copy this login string: XYZ123",
    onSubmitCookies: async (cookies: string) => {
      console.log(cookies);
    },
  },
};

export const Loading: Story = {
  args: {
    onSubmitCookies: async (cookies: string) => {
      console.log(cookies);
    },
  },
};
