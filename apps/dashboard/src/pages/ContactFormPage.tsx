import { zodResolver } from "@hookform/resolvers/zod";
import { api, type Id } from "@repo/api";
import { Button, Input, Label, PageHeader } from "@repo/ui";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, Loader2, X } from "lucide-react";
import { useEffect } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Zod Schema
// ---------------------------------------------------------------------------

const phoneEntrySchema = z.object({
  label: z.string().optional(),
  value: z.string().min(1, "Phone number is required"),
});

const emailEntrySchema = z.object({
  label: z.string().optional(),
  value: z.string().email("Invalid email address"),
});

const addressEntrySchema = z.object({
  label: z.string().optional(),
  street: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
});

const contactFormSchema = z
  .object({
    name: z.string(),
    nickname: z.string(),
    phoneNumbers: z.array(phoneEntrySchema),
    emails: z.array(emailEntrySchema),
    company: z.string(),
    jobTitle: z.string(),
    birthday: z.string(),
    notes: z.string(),
    addresses: z.array(addressEntrySchema),
  })
  .refine((data) => data.name.trim() || data.nickname.trim(), {
    message: "Either name or nickname is required",
    path: ["name"],
  });

type ContactFormData = z.infer<typeof contactFormSchema>;

// ---------------------------------------------------------------------------
// Contact Form Page
// ---------------------------------------------------------------------------

export function ContactFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEditing = Boolean(id);
  const contactId = id as Id<"contacts"> | undefined;

  // For Edit mode, fetch the contact data and identities
  const contact = useQuery(
    api.contacts.get,
    isEditing && contactId ? { id: contactId } : "skip",
  );

  const identities = useQuery(
    api.contacts.getIdentities,
    isEditing && contactId ? { contactId } : "skip",
  );

  const createContact = useMutation(api.contacts.create);
  const updateContact = useMutation(api.contacts.update);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ContactFormData>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: {
      name: "",
      nickname: "",
      phoneNumbers: [],
      emails: [],
      company: "",
      jobTitle: "",
      birthday: "",
      notes: "",
      addresses: [],
    },
  });

  const {
    fields: phoneFields,
    append: appendPhone,
    remove: removePhone,
  } = useFieldArray({ control, name: "phoneNumbers" });

  const {
    fields: emailFields,
    append: appendEmail,
    remove: removeEmail,
  } = useFieldArray({ control, name: "emails" });

  const {
    fields: addressFields,
    append: appendAddress,
    remove: removeAddress,
  } = useFieldArray({ control, name: "addresses" });

  // When editing and data loads, populate the form once
  useEffect(() => {
    if (isEditing && contact) {
      reset({
        name: contact.name ?? "",
        nickname: contact.nickname ?? "",
        phoneNumbers: contact.phoneNumbers ?? [],
        emails: contact.emails ?? [],
        company: contact.company ?? "",
        jobTitle: contact.jobTitle ?? "",
        birthday: contact.birthday ?? "",
        notes: contact.notes ?? "",
        addresses: contact.addresses ?? [],
      });
    }
  }, [isEditing, contact, reset]);

  const onValid = async (data: ContactFormData) => {
    const payload = {
      name: data.name || undefined,
      nickname: data.nickname || undefined,
      phoneNumbers:
        data.phoneNumbers.length > 0 ? data.phoneNumbers : undefined,
      emails: data.emails.length > 0 ? data.emails : undefined,
      company: data.company || undefined,
      jobTitle: data.jobTitle || undefined,
      birthday: data.birthday || undefined,
      notes: data.notes || undefined,
      addresses: data.addresses.length > 0 ? data.addresses : undefined,
    };

    if (isEditing && contactId) {
      await updateContact({ id: contactId, ...payload });
    } else {
      await createContact(payload);
    }
    navigate("/contacts");
  };

  // If editing but still loading data, show spinner
  if (isEditing && contact === undefined) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  // If editing but contact not found
  if (isEditing && contact === null) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <h2 className="text-xl font-semibold mb-2">Contact Not Found</h2>
        <p className="text-gray-500 mb-6">
          This contact may have been deleted.
        </p>
        <Button onClick={() => navigate("/contacts")}>Back to Contacts</Button>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 overflow-auto h-full w-full">
      <div className="mb-6">
        <button
          type="button"
          onClick={() => navigate("/contacts")}
          className="inline-flex items-center text-sm font-medium text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back to Contacts
        </button>
        <PageHeader
          title={isEditing ? "Edit Contact" : "Add Contact"}
          description={
            isEditing
              ? "Update contact details."
              : "Create a new contact in your address book."
          }
        />
      </div>

      {isEditing && identities !== undefined && identities.length > 0 && (
        <div className="mb-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm p-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Matrix Identities
          </h3>
          <div className="flex flex-col gap-2">
            {identities.map((id) => (
              <div
                key={id._id}
                className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400"
              >
                <span className="font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                  {id.matrixId}
                </span>
                {id.platform && (
                  <span className="text-xs text-gray-500 uppercase font-medium">
                    • {id.platform}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <form
        onSubmit={handleSubmit(onValid)}
        className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm p-6 space-y-6"
      >
        {/* ── Name Fields ── */}
        <div className="grid grid-cols-1 gap-4">
          <div>
            <Label htmlFor="cf-name">Full Name</Label>
            <Input
              id="cf-name"
              {...register("name")}
              placeholder="John Doe"
              className="mt-1.5"
            />
            {errors.name && (
              <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>
            )}
          </div>
        </div>

        <div>
          <Label htmlFor="cf-nick">Nickname</Label>
          <Input
            id="cf-nick"
            {...register("nickname")}
            placeholder="Optional"
            className="mt-1.5 max-w-sm"
          />
        </div>

        {/* ── Phone Numbers ── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label>Phone Numbers</Label>
            <button
              type="button"
              onClick={() => appendPhone({ label: "", value: "" })}
              className="text-xs text-blue-500 hover:text-blue-600 font-medium transition-colors"
            >
              + Add Phone
            </button>
          </div>
          {phoneFields.map((field, i) => (
            <div key={field.id} className="flex items-center gap-2 mt-2">
              <Input
                {...register(`phoneNumbers.${i}.label`)}
                placeholder="Label"
                className="w-24 sm:w-32"
              />
              <Input
                {...register(`phoneNumbers.${i}.value`)}
                placeholder="+1 234 567 8900"
                className="flex-1"
              />
              <button
                type="button"
                onClick={() => removePhone(i)}
                className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                aria-label="Remove phone number"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
          {phoneFields.length === 0 && (
            <p className="text-sm text-gray-500 italic">
              No phone numbers added
            </p>
          )}
          {errors.phoneNumbers && (
            <p className="text-xs text-red-500 mt-1">
              {typeof errors.phoneNumbers.message === "string"
                ? errors.phoneNumbers.message
                : "Please fix phone number errors"}
            </p>
          )}
        </div>

        {/* ── Emails ── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label>Email Addresses</Label>
            <button
              type="button"
              onClick={() => appendEmail({ label: "", value: "" })}
              className="text-xs text-blue-500 hover:text-blue-600 font-medium transition-colors"
            >
              + Add Email
            </button>
          </div>
          {emailFields.map((field, i) => (
            <div key={field.id} className="flex items-center gap-2 mt-2">
              <Input
                {...register(`emails.${i}.label`)}
                placeholder="Label"
                className="w-24 sm:w-32"
              />
              <Input
                {...register(`emails.${i}.value`)}
                placeholder="john@example.com"
                className="flex-1"
              />
              <button
                type="button"
                onClick={() => removeEmail(i)}
                className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                aria-label="Remove email address"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
          {emailFields.length === 0 && (
            <p className="text-sm text-gray-500 italic">
              No email addresses added
            </p>
          )}
          {errors.emails && (
            <p className="text-xs text-red-500 mt-1">
              {typeof errors.emails.message === "string"
                ? errors.emails.message
                : "Please fix email errors"}
            </p>
          )}
        </div>

        {/* ── Company & Job ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="cf-company">Company</Label>
            <Input
              id="cf-company"
              {...register("company")}
              placeholder="Acme Corp"
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="cf-job">Job Title</Label>
            <Input
              id="cf-job"
              {...register("jobTitle")}
              placeholder="Engineer"
              className="mt-1.5"
            />
          </div>
        </div>

        {/* ── Birthday ── */}
        <div>
          <Label htmlFor="cf-bday">Birthday</Label>
          <Input
            id="cf-bday"
            type="date"
            {...register("birthday")}
            className="mt-1.5 max-w-[200px]"
          />
        </div>

        {/* ── Addresses ── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label>Addresses</Label>
            <button
              type="button"
              onClick={() => appendAddress({})}
              className="text-xs text-blue-500 hover:text-blue-600 font-medium transition-colors"
            >
              + Add Address
            </button>
          </div>
          <div className="space-y-4">
            {addressFields.map((field, i) => (
              <div
                key={field.id}
                className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <Input
                    {...register(`addresses.${i}.label`)}
                    placeholder="Label (Home, Work…)"
                    className="w-48 bg-white dark:bg-gray-900 mt-1"
                  />
                  <button
                    type="button"
                    onClick={() => removeAddress(i)}
                    className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                    aria-label="Remove address"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <Input
                  {...register(`addresses.${i}.street`)}
                  placeholder="Street"
                  className="bg-white dark:bg-gray-900"
                />
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    {...register(`addresses.${i}.city`)}
                    placeholder="City"
                    className="bg-white dark:bg-gray-900"
                  />
                  <Input
                    {...register(`addresses.${i}.state`)}
                    placeholder="State"
                    className="bg-white dark:bg-gray-900"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    {...register(`addresses.${i}.postalCode`)}
                    placeholder="Postal Code"
                    className="bg-white dark:bg-gray-900"
                  />
                  <Input
                    {...register(`addresses.${i}.country`)}
                    placeholder="Country"
                    className="bg-white dark:bg-gray-900"
                  />
                </div>
              </div>
            ))}
            {addressFields.length === 0 && (
              <p className="text-sm text-gray-500 italic">No addresses added</p>
            )}
          </div>
        </div>

        {/* ── Notes ── */}
        <div>
          <Label htmlFor="cf-notes">Notes</Label>
          <textarea
            id="cf-notes"
            {...register("notes")}
            placeholder="Any additional notes…"
            rows={4}
            className="mt-1.5 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        {/* ── Footer ── */}
        <div className="pt-4 flex justify-end gap-3 border-t border-gray-100 dark:border-gray-800">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate("/contacts")}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting}
            data-testid="save-contact-btn"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEditing ? "Save Changes" : "Create Contact"}
          </Button>
        </div>
      </form>
    </div>
  );
}
