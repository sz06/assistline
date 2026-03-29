import type { Meta, StoryObj } from "@storybook/react";
import { InstagramInstructions } from "./index";

const meta = {
  title: "Components/Channels/InstagramInstructions",
  component: InstagramInstructions,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof InstagramInstructions>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    instructions: "Please copy your IG cookie.",
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
