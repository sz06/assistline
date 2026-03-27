import type { Meta, StoryObj } from "@storybook/react";
import { InlineSuggestionCard } from "./index";

const meta: Meta<typeof InlineSuggestionCard> = {
  title: "Components/Artifacts/InlineSuggestionCard",
  component: InlineSuggestionCard,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="max-w-2xl border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden bg-white dark:bg-gray-950">
        <div className="bg-emerald-50/50 dark:bg-emerald-950/20">
          <Story />
        </div>
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof InlineSuggestionCard>;

const mockRoles = [
  { _id: "role1", name: "User" },
  { _id: "role2", name: "System" },
];

export const NewFact: Story = {
  args: {
    suggestion: {
      _id: "sug1",
      type: "create",
      value: "The user is planning a trip to Italy next summer.",
    },
    onApprove: () => console.log("Approved"),
    onDismiss: () => console.log("Dismissed"),
    className: "px-4 md:px-8",
  },
};

export const UpdatedFact: Story = {
  args: {
    suggestion: {
      _id: "sug2",
      type: "update",
      value: "The user prefers to fly Delta Airlines for all trips.",
    },
    onApprove: () => console.log("Approved"),
    onDismiss: () => console.log("Dismissed"),
    className: "px-4 md:px-8",
  },
};

export const WithRolesAndExpiration: Story = {
  args: {
    suggestion: {
      _id: "sug3",
      type: "create",
      value: "Temporary access to the staging server granted.",
      accessibleToRoles: ["role1", "role2"],
      expiresAt: Date.now() + 86400000 * 7, // 7 days from now
    },
    roles: mockRoles,
    onApprove: () => console.log("Approved"),
    onDismiss: () => console.log("Dismissed"),
    className: "px-4 md:px-8",
  },
};
