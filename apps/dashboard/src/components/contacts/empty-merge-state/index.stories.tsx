import type { Meta, StoryObj } from "@storybook/react";
import { BrowserRouter } from "react-router-dom";
import { EmptyMergeState } from "./index";

const meta: Meta<typeof EmptyMergeState> = {
  title: "Contacts/EmptyMergeState",
  component: EmptyMergeState,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  decorators: [
    (Story: any) => (
      <BrowserRouter>
        <div className="max-w-2xl mx-auto">
          <Story />
        </div>
      </BrowserRouter>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof EmptyMergeState>;

export const Default: Story = {
  args: {
    onReturn: () => alert("Return clicked!"),
  },
};
