import { api, type Id } from "@repo/api";
import { Button, Input, Label, PageHeader } from "@repo/ui";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PhoneEntry {
  label?: string;
  value: string;
}

interface EmailEntry {
  label?: string;
  value: string;
}

interface AddressEntry {
  label?: string;
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

interface ContactFormData {
  name: string;
  nickname: string;
  phoneNumbers: PhoneEntry[];
  emails: EmailEntry[];
  company: string;
  jobTitle: string;
  birthday: string;
  notes: string;
  addresses: AddressEntry[];
}

const EMPTY_FORM: ContactFormData = {
  name: "",
  nickname: "",
  phoneNumbers: [],
  emails: [],
  company: "",
  jobTitle: "",
  birthday: "",
  notes: "",
  addresses: [],
};

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
    isEditing ? { id: contactId! } : "skip",
  );

  const identities = useQuery(
    api.contacts.getIdentities,
    isEditing ? { contactId: contactId! } : "skip",
  );

  const createContact = useMutation(api.contacts.create);
  const updateContact = useMutation(api.contacts.update);

  const [form, setForm] = useState<ContactFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // When editing and data loads, populate the form once
  useEffect(() => {
    if (isEditing && contact) {
      setForm({
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
  }, [isEditing, contact]);

  const update = <K extends keyof ContactFormData>(
    key: K,
    value: ContactFormData[K],
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  // Multi-value helpers
  const addPhone = () =>
    update("phoneNumbers", [...form.phoneNumbers, { label: "", value: "" }]);
  const removePhone = (idx: number) =>
    update(
      "phoneNumbers",
      form.phoneNumbers.filter((_, i) => i !== idx),
    );
  const setPhone = (idx: number, field: keyof PhoneEntry, val: string) =>
    update(
      "phoneNumbers",
      form.phoneNumbers.map((p, i) => (i === idx ? { ...p, [field]: val } : p)),
    );

  const addEmail = () =>
    update("emails", [...form.emails, { label: "", value: "" }]);
  const removeEmail = (idx: number) =>
    update(
      "emails",
      form.emails.filter((_, i) => i !== idx),
    );
  const setEmail = (idx: number, field: keyof EmailEntry, val: string) =>
    update(
      "emails",
      form.emails.map((e, i) => (i === idx ? { ...e, [field]: val } : e)),
    );

  const addAddress = () => update("addresses", [...form.addresses, {}]);
  const removeAddress = (idx: number) =>
    update(
      "addresses",
      form.addresses.filter((_, i) => i !== idx),
    );
  const setAddress = (idx: number, field: keyof AddressEntry, val: string) =>
    update(
      "addresses",
      form.addresses.map((a, i) => (i === idx ? { ...a, [field]: val } : a)),
    );

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const payload = {
        name: form.name || undefined,
        nickname: form.nickname || undefined,
        phoneNumbers:
          form.phoneNumbers.length > 0 ? form.phoneNumbers : undefined,
        emails: form.emails.length > 0 ? form.emails : undefined,
        company: form.company || undefined,
        jobTitle: form.jobTitle || undefined,
        birthday: form.birthday || undefined,
        notes: form.notes || undefined,
        addresses: form.addresses.length > 0 ? form.addresses : undefined,
      };

      if (isEditing && contactId) {
        await updateContact({ id: contactId, ...payload });
      } else {
        await createContact(payload);
      }
      navigate("/contacts");
    } finally {
      setSaving(false);
    }
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

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm p-6 space-y-6">
        {/* ── Name Fields ── */}
        <div className="grid grid-cols-1 gap-4">
          <div>
            <Label htmlFor="cf-name">Full Name</Label>
            <Input
              id="cf-name"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="John Doe"
              className="mt-1.5"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="cf-nick">Nickname</Label>
          <Input
            id="cf-nick"
            value={form.nickname}
            onChange={(e) => update("nickname", e.target.value)}
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
              onClick={addPhone}
              className="text-xs text-blue-500 hover:text-blue-600 font-medium transition-colors"
            >
              + Add Phone
            </button>
          </div>
          {form.phoneNumbers.map((p, i) => (
            <div key={`ph-${i}`} className="flex items-center gap-2 mt-2">
              <Input
                value={p.label ?? ""}
                onChange={(e) => setPhone(i, "label", e.target.value)}
                placeholder="Label"
                className="w-24 sm:w-32"
              />
              <Input
                value={p.value}
                onChange={(e) => setPhone(i, "value", e.target.value)}
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
          {form.phoneNumbers.length === 0 && (
            <p className="text-sm text-gray-500 italic">
              No phone numbers added
            </p>
          )}
        </div>

        {/* ── Emails ── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label>Email Addresses</Label>
            <button
              type="button"
              onClick={addEmail}
              className="text-xs text-blue-500 hover:text-blue-600 font-medium transition-colors"
            >
              + Add Email
            </button>
          </div>
          {form.emails.map((e, i) => (
            <div key={`em-${i}`} className="flex items-center gap-2 mt-2">
              <Input
                value={e.label ?? ""}
                onChange={(ev) => setEmail(i, "label", ev.target.value)}
                placeholder="Label"
                className="w-24 sm:w-32"
              />
              <Input
                value={e.value}
                onChange={(ev) => setEmail(i, "value", ev.target.value)}
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
          {form.emails.length === 0 && (
            <p className="text-sm text-gray-500 italic">
              No email addresses added
            </p>
          )}
        </div>

        {/* ── Company & Job ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="cf-company">Company</Label>
            <Input
              id="cf-company"
              value={form.company}
              onChange={(e) => update("company", e.target.value)}
              placeholder="Acme Corp"
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="cf-job">Job Title</Label>
            <Input
              id="cf-job"
              value={form.jobTitle}
              onChange={(e) => update("jobTitle", e.target.value)}
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
            value={form.birthday}
            onChange={(e) => update("birthday", e.target.value)}
            className="mt-1.5 max-w-[200px]"
          />
        </div>

        {/* ── Addresses ── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label>Addresses</Label>
            <button
              type="button"
              onClick={addAddress}
              className="text-xs text-blue-500 hover:text-blue-600 font-medium transition-colors"
            >
              + Add Address
            </button>
          </div>
          <div className="space-y-4">
            {form.addresses.map((addr, i) => (
              <div
                key={`addr-${i}`}
                className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <Input
                    value={addr.label ?? ""}
                    onChange={(e) => setAddress(i, "label", e.target.value)}
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
                  value={addr.street ?? ""}
                  onChange={(e) => setAddress(i, "street", e.target.value)}
                  placeholder="Street"
                  className="bg-white dark:bg-gray-900"
                />
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    value={addr.city ?? ""}
                    onChange={(e) => setAddress(i, "city", e.target.value)}
                    placeholder="City"
                    className="bg-white dark:bg-gray-900"
                  />
                  <Input
                    value={addr.state ?? ""}
                    onChange={(e) => setAddress(i, "state", e.target.value)}
                    placeholder="State"
                    className="bg-white dark:bg-gray-900"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    value={addr.postalCode ?? ""}
                    onChange={(e) =>
                      setAddress(i, "postalCode", e.target.value)
                    }
                    placeholder="Postal Code"
                    className="bg-white dark:bg-gray-900"
                  />
                  <Input
                    value={addr.country ?? ""}
                    onChange={(e) => setAddress(i, "country", e.target.value)}
                    placeholder="Country"
                    className="bg-white dark:bg-gray-900"
                  />
                </div>
              </div>
            ))}
            {form.addresses.length === 0 && (
              <p className="text-sm text-gray-500 italic">No addresses added</p>
            )}
          </div>
        </div>

        {/* ── Notes ── */}
        <div>
          <Label htmlFor="cf-notes">Notes</Label>
          <textarea
            id="cf-notes"
            value={form.notes}
            onChange={(e) => update("notes", e.target.value)}
            placeholder="Any additional notes…"
            rows={4}
            className="mt-1.5 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        {/* ── Footer ── */}
        <div className="pt-4 flex justify-end gap-3 border-t border-gray-100 dark:border-gray-800">
          <Button variant="outline" onClick={() => navigate("/contacts")}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saving || (!form.name && !form.nickname)}
            data-testid="save-contact-btn"
          >
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEditing ? "Save Changes" : "Create Contact"}
          </Button>
        </div>
      </div>
    </div>
  );
}
