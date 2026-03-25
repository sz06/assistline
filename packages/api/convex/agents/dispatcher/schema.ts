import { z } from "zod";

// ── Mutation Action Schemas ──────────────────────────────────────────────────

/** Action: update fields on a contact. */
const UpdateContactAction = z.object({
  type: z.literal("updateContact"),
  contactId: z.string().describe("Convex ID of the contact to update"),
  name: z.string().optional(),
  nickname: z.string().optional(),
  company: z.string().optional(),
  jobTitle: z.string().optional(),
  birthday: z.string().optional(),
  notes: z.string().optional(),
});

/** Action: create a new artifact. */
const CreateArtifactAction = z.object({
  type: z.literal("createArtifact"),
  value: z
    .string()
    .describe(
      'The self-descriptive artifact value, e.g. "User\'s home address: 123 Main St"',
    ),
  expiresAt: z
    .number()
    .optional()
    .describe("Unix timestamp (ms) when this artifact expires, if temporary"),
});

/** Action: assign a role to a contact. */
const AssignRoleAction = z.object({
  type: z.literal("assignRole"),
  contactId: z.string().describe("Convex ID of the contact"),
  roleName: z.string().describe("Name of the role to assign, e.g. 'spouse'"),
});

/** Discriminated union of all mutation actions Dispatcher can suggest. */
export const DispatcherMutationSchema = z.discriminatedUnion("type", [
  UpdateContactAction,
  CreateArtifactAction,
  AssignRoleAction,
]);

export type DispatcherMutationAction = z.infer<typeof DispatcherMutationSchema>;
