import { api, type Id } from "@repo/api";
import { Button, Input, PageHeader } from "@repo/ui";
import { useQuery } from "convex/react";
import { Loader2, Mail, Phone, Plus, Search, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate initials for avatar */
function getInitials(name?: string, nickname?: string): string {
  if (name) {
    const parts = name.trim().split(" ");
    if (parts.length > 1)
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    return name[0].toUpperCase();
  }
  if (nickname) return nickname[0].toUpperCase();
  return "?";
}

/** Pick a gradient based on the name for visual variety */
const GRADIENTS = [
  "from-violet-500 to-purple-600",
  "from-blue-500 to-cyan-500",
  "from-emerald-500 to-teal-500",
  "from-orange-500 to-amber-500",
  "from-rose-500 to-pink-500",
  "from-indigo-500 to-blue-600",
  "from-fuchsia-500 to-pink-500",
  "from-sky-500 to-blue-500",
];

function pickGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length];
}

function displayName(name?: string, nickname?: string): string {
  return name?.trim() || nickname || "Unnamed Contact";
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export function ContactsPage() {
  const contacts = useQuery(api.contacts.list);
  const navigate = useNavigate();

  const [search, setSearch] = useState("");

  // Filter contacts by search query
  const filtered = useMemo(() => {
    if (!contacts) return undefined;
    if (!search.trim()) return contacts;
    const q = search.toLowerCase();
    return contacts.filter((c) => {
      const name = displayName(c.name, c.nickname).toLowerCase();
      const company = (c.company ?? "").toLowerCase();
      const phones = (c.phoneNumbers ?? [])
        .map((p) => p.value)
        .join(" ")
        .toLowerCase();
      const emails = (c.emails ?? [])
        .map((e) => e.value)
        .join(" ")
        .toLowerCase();
      return (
        name.includes(q) ||
        company.includes(q) ||
        phones.includes(q) ||
        emails.includes(q)
      );
    });
  }, [contacts, search]);

  return (
    <div className="p-4 md:p-6 overflow-auto h-full">
      <div>
        <div className="flex items-start justify-between gap-4">
          <PageHeader
            title="Contacts"
            description="Manage your contacts and their information."
          />
          <Button
            onClick={() => navigate("/contacts/add")}
            className="shrink-0 mt-1"
            data-testid="add-contact-btn"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Contact
          </Button>
        </div>

        {/* ── Search Bar ────────────────────────────────────── */}
        {contacts && contacts.length > 0 && (
          <div className="relative mt-2 mb-6 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, company, phone, email…"
              className="pl-10"
              data-testid="contacts-search"
            />
          </div>
        )}

        {/* ── Contact Grid ──────────────────────────────────── */}
        <div className="mt-4">
          {filtered === undefined ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : filtered.length === 0 && !search ? (
            <EmptyState onAdd={() => navigate("/contacts/add")} />
          ) : filtered.length === 0 && search ? (
            <div className="text-center py-16">
              <Search className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                No contacts match "<span className="font-medium">{search}</span>
                "
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((contact) => (
                <ContactCard
                  key={contact._id}
                  contact={contact}
                  onEdit={() => navigate(`/contacts/${contact._id}/update`)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Contact Card
// ---------------------------------------------------------------------------

function ContactCard({
  contact,
  onEdit,
}: {
  contact: {
    _id: Id<"contacts">;
    name?: string;
    nickname?: string;
    phoneNumbers?: PhoneEntry[];
    emails?: EmailEntry[];
    company?: string;
    jobTitle?: string;
    birthday?: string;
    notes?: string;
    addresses?: AddressEntry[];
  };
  onEdit: () => void;
}) {
  const name = displayName(contact.name, contact.nickname);
  const initials = getInitials(contact.name, contact.nickname);
  const gradient = pickGradient(name);
  const primaryPhone = contact.phoneNumbers?.[0]?.value;
  const primaryEmail = contact.emails?.[0]?.value;

  return (
    <button
      type="button"
      onClick={onEdit}
      data-testid={`contact-card-${contact._id}`}
      className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden group w-full text-left px-4 py-4 flex items-center gap-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      {/* Avatar */}
      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${gradient} text-white font-semibold text-sm shadow-sm group-hover:scale-105 transition-transform`}
      >
        {initials}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">
          {name}
        </h3>
        {(contact.company || contact.jobTitle) && (
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
            {[contact.jobTitle, contact.company].filter(Boolean).join(" · ")}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
          {primaryPhone && (
            <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
              <Phone className="h-3 w-3" />
              {primaryPhone}
            </span>
          )}
          {primaryEmail && (
            <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
              <Mail className="h-3 w-3" />
              <span className="truncate max-w-[140px]">{primaryEmail}</span>
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Empty State
// ---------------------------------------------------------------------------

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="text-center py-16">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 mx-auto mb-4">
        <Users className="h-8 w-8 text-blue-500 dark:text-blue-400" />
      </div>
      <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300">
        No contacts yet
      </h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5 max-w-sm mx-auto">
        Add your first contact to start organizing your relationships and
        conversations.
      </p>
      <Button
        onClick={onAdd}
        className="mt-6"
        data-testid="empty-add-contact-btn"
      >
        <Plus className="h-4 w-4 mr-2" />
        Add Your First Contact
      </Button>
    </div>
  );
}
