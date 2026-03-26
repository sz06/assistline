import type { Id } from "@repo/api";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ArtifactCard } from ".";

const meta = {
  title: "Components/Artifacts/ArtifactCard",
  component: ArtifactCard,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  argTypes: {
    onClick: { action: "clicked" },
    onDelete: { action: "deleted" },
  },
} satisfies Meta<typeof ArtifactCard>;

export default meta;
type Story = StoryObj<typeof meta>;

// Mock data
const mockRoles = [
  {
    _id: "role_1" as Id<"roles">,
    name: "Admin",
    color: "bg-red-100 text-red-700",
  },
  {
    _id: "role_2" as Id<"roles">,
    name: "User",
    color: "bg-blue-100 text-blue-700",
  },
];

export const Default: Story = {
  args: {
    artifact: {
      _id: "artifact_1" as Id<"artifacts">,
      _creationTime: Date.now() - 86400000 * 2,
      value: "User prefers dark mode and concise responses.",
      accessibleToRoles: [],
      updatedAt: Date.now() - 3600000,
      hasEmbedding: true,
    },
    roles: mockRoles,
    onClick: () => {},
    onDelete: () => {},
  },
};

export const WithRoles: Story = {
  args: {
    artifact: {
      _id: "artifact_2" as Id<"artifacts">,
      _creationTime: Date.now() - 86400000 * 5,
      value:
        "System configuration: DB_HOST = db.example.com\nAPI_KEY is required for access.",
      accessibleToRoles: ["role_1" as Id<"roles">, "role_2" as Id<"roles">],
      updatedAt: Date.now() - 7200000,
      hasEmbedding: false,
    },
    roles: mockRoles,
    onClick: () => {},
    onDelete: () => {},
  },
};

export const Expired: Story = {
  args: {
    artifact: {
      _id: "artifact_3" as Id<"artifacts">,
      _creationTime: Date.now() - 86400000 * 10,
      value: "Temporary promotional code: SPRING2024",
      accessibleToRoles: [],
      expiresAt: Date.now() - 86400000,
      updatedAt: Date.now() - 86400000 * 9,
      hasEmbedding: true,
    },
    roles: mockRoles,
    onClick: () => {},
    onDelete: () => {},
  },
};

export const ExpiringSoon: Story = {
  args: {
    artifact: {
      _id: "artifact_4" as Id<"artifacts">,
      _creationTime: Date.now() - 86400000 * 2,
      value: "Upcoming maintenance window scheduled for this weekend.",
      accessibleToRoles: ["role_1" as Id<"roles">],
      expiresAt: Date.now() + 86400000 * 3,
      updatedAt: Date.now() - 3600000,
      hasEmbedding: true,
    },
    roles: mockRoles,
    onClick: () => {},
    onDelete: () => {},
  },
};
