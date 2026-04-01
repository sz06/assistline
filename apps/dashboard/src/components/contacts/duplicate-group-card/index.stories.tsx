import type { Meta, StoryObj } from "@storybook/react";
import type { Id } from "@repo/api";
import { DuplicateGroupCard, type MergeCandidateSet } from "./index";

const meta: Meta<typeof DuplicateGroupCard> = {
  title: "Contacts/DuplicateGroupCard",
  component: DuplicateGroupCard,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof DuplicateGroupCard>;

const mockGroup: MergeCandidateSet = {
  contacts: [
    {
      contact: {
        _id: "c-1" as Id<"contacts">,
        _creationTime: Date.now() - 86400000 * 30, // 30 days ago
        name: "John Doe",
        company: "Acme Corp",
        jobTitle: "Software Engineer",
      },
      handles: [
        { _id: "h-1" as Id<"contactHandles">, value: "john.doe@example.com", type: "email", _creationTime: Date.now(), contactId: "c-1" as Id<"contacts"> },
        { _id: "h-2" as Id<"contactHandles">, value: "+1234567890", type: "phone", _creationTime: Date.now(), contactId: "c-1" as Id<"contacts"> },
      ],
      identities: [
        { _id: "i-1" as Id<"contactIdentities">, matrixId: "@john:matrix.org", _creationTime: Date.now(), contactId: "c-1" as Id<"contacts"> },
      ],
    },
    {
      contact: {
        _id: "c-2" as Id<"contacts">,
        _creationTime: Date.now() - 86400000 * 10,
        name: "John D.",
        company: "Acme",
        jobTitle: "Developer",
      },
      handles: [
        { _id: "h-3" as Id<"contactHandles">, value: "john.doe@example.com", type: "email", _creationTime: Date.now(), contactId: "c-2" as Id<"contacts"> },
      ],
      identities: [],
    },
    {
      contact: {
        _id: "c-3" as Id<"contacts">,
        _creationTime: Date.now() - 86400000 * 2,
        name: "Johnny Doe",
        avatarUrl: "https://i.pravatar.cc/150?u=john",
      },
      handles: [
        { _id: "h-4" as Id<"contactHandles">, value: "+1234567890", type: "phone", _creationTime: Date.now(), contactId: "c-3" as Id<"contacts"> },
      ],
      identities: [
        { _id: "i-2" as Id<"contactIdentities">, matrixId: "@johnny123:whatsapp.net", _creationTime: Date.now(), contactId: "c-3" as Id<"contacts"> },
      ],
    },
  ],
};

export const Default: Story = {
  args: {
    group: mockGroup,
    onMerge: async (primaryId: string) => {
      console.log("Merge initiated with primary ID:", primaryId);
      return new Promise((resolve) => setTimeout(resolve, 1500));
    },
  },
};
