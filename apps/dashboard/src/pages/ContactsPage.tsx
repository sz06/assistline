import { api, type Id } from "@repo/api";
import { Button, Input, PageHeader } from "@repo/ui";
import { useQuery } from "convex/react";
import {
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Loader2,
  Mail,
  Phone,
  Plus,
  Search,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SortField = "name" | "company" | "created";
type SortDir = "asc" | "desc";

interface PhoneEntry {
  label?: string;
  value: string;
}

interface EmailEntry {
  label?: string;
  value: string;
}

interface Contact {
  _id: Id<"contacts">;
  _creationTime: number;
  name?: string;
  nickname?: string;
  otherNames?: string[];
  phoneNumbers?: PhoneEntry[];
  emails?: EmailEntry[];
  company?: string;
  jobTitle?: string;
  birthday?: string;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

function getInitials(
  name?: string,
  nickname?: string,
  otherNames?: string[],
): string {
  const displayStr = name || nickname || otherNames?.[0];
  if (!displayStr) return "?";
  const parts = displayStr.trim().split(" ");
  if (parts.length > 1)
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  return displayStr[0].toUpperCase();
}

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

function pickGradient(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length];
}

function displayName(
  name?: string,
  nickname?: string,
  otherNames?: string[],
): string {
  return name?.trim() || nickname || otherNames?.[0] || "Unnamed Contact";
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export function ContactsPage() {
  const contacts = useQuery(api.contacts.list);
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Toggle sort on column click
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
    setPage(1);
  };

  // Filter → Sort → Paginate
  const { paged, totalFiltered } = useMemo(() => {
    if (!contacts) return { paged: undefined, totalFiltered: 0 };

    // 1. Filter
    let list = contacts;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = contacts.filter((c) => {
        const n = displayName(c.name, c.nickname).toLowerCase();
        const comp = (c.company ?? "").toLowerCase();
        const phones = (c.phoneNumbers ?? [])
          .map((p) => p.value)
          .join(" ")
          .toLowerCase();
        const emails = (c.emails ?? [])
          .map((e) => e.value)
          .join(" ")
          .toLowerCase();
        return (
          n.includes(q) ||
          comp.includes(q) ||
          phones.includes(q) ||
          emails.includes(q)
        );
      });
    }

    // 2. Sort
    const sorted = [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "name": {
          // 3-tier: name (0) → otherNames (1) → rest (2)
          const aTier = a.name?.trim() ? 0 : a.otherNames?.length ? 1 : 2;
          const bTier = b.name?.trim() ? 0 : b.otherNames?.length ? 1 : 2;
          if (aTier !== bTier) {
            cmp = aTier - bTier;
            break;
          }
          if (aTier === 2) {
            cmp = a._creationTime - b._creationTime;
            break;
          }
          const na = displayName(
            a.name,
            a.nickname,
            a.otherNames,
          ).toLowerCase();
          const nb = displayName(
            b.name,
            b.nickname,
            b.otherNames,
          ).toLowerCase();
          cmp = na.localeCompare(nb);
          break;
        }
        case "company": {
          const ca = (a.company ?? "").toLowerCase();
          const cb = (b.company ?? "").toLowerCase();
          cmp = ca.localeCompare(cb);
          break;
        }
        case "created":
          cmp = a._creationTime - b._creationTime;
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    // 3. Paginate
    const start = (page - 1) * pageSize;
    return {
      paged: sorted.slice(start, start + pageSize),
      totalFiltered: sorted.length,
    };
  }, [contacts, search, sortField, sortDir, page, pageSize]);

  // Reset page when search changes
  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const rangeStart = totalFiltered === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, totalFiltered);

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
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search by name, company, phone, email…"
              className="pl-10"
              data-testid="contacts-search"
            />
          </div>
        )}

        {/* ── Content ────────────────────────────────────────── */}
        <div className="mt-4">
          {paged === undefined ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : paged.length === 0 && !search ? (
            <EmptyState onAdd={() => navigate("/contacts/add")} />
          ) : paged.length === 0 && search ? (
            <div className="text-center py-16">
              <Search className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                No contacts match "<span className="font-medium">{search}</span>
                "
              </p>
            </div>
          ) : (
            <>
              {/* Table */}
              <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
                <table
                  className="w-full text-left text-sm"
                  data-testid="contacts-table"
                >
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-900/60 border-b border-gray-200 dark:border-gray-800">
                      <SortableHeader
                        label="Name"
                        field="name"
                        activeField={sortField}
                        dir={sortDir}
                        onSort={handleSort}
                      />
                      <SortableHeader
                        label="Company"
                        field="company"
                        activeField={sortField}
                        dir={sortDir}
                        onSort={handleSort}
                        className="hidden sm:table-cell"
                      />
                      <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden md:table-cell">
                        Phone
                      </th>
                      <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden lg:table-cell">
                        Email
                      </th>
                      <SortableHeader
                        label="Added"
                        field="created"
                        activeField={sortField}
                        dir={sortDir}
                        onSort={handleSort}
                        className="hidden xl:table-cell"
                      />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {paged.map((contact) => (
                      <ContactRow
                        key={contact._id}
                        contact={contact}
                        onEdit={() =>
                          navigate(`/contacts/${contact._id}/update`)
                        }
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination bar */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 text-sm text-gray-500 dark:text-gray-400">
                <div className="flex items-center gap-2">
                  <span>Rows per page:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                    className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    data-testid="page-size-select"
                  >
                    {PAGE_SIZE_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-3">
                  <span data-testid="pagination-info">
                    {rangeStart}–{rangeEnd} of {totalFiltered}
                  </span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                      className="p-1.5 rounded-md border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      data-testid="pagination-prev"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                      className="p-1.5 rounded-md border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      data-testid="pagination-next"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sortable Header
// ---------------------------------------------------------------------------

function SortableHeader({
  label,
  field,
  activeField,
  dir,
  onSort,
  className = "",
}: {
  label: string;
  field: SortField;
  activeField: SortField;
  dir: SortDir;
  onSort: (f: SortField) => void;
  className?: string;
}) {
  const isActive = field === activeField;
  return (
    <th className={`px-4 py-3 ${className}`}>
      <button
        type="button"
        onClick={() => onSort(field)}
        className="inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
        data-testid={`sort-${field}`}
      >
        {label}
        {isActive ? (
          dir === "asc" ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    </th>
  );
}

// ---------------------------------------------------------------------------
// Contact Row
// ---------------------------------------------------------------------------

function ContactRow({
  contact,
  onEdit,
}: {
  contact: Contact;
  onEdit: () => void;
}) {
  const name = displayName(contact.name, contact.nickname, contact.otherNames);
  const initials = getInitials(
    contact.name,
    contact.nickname,
    contact.otherNames,
  );
  const gradient = pickGradient(name);
  const primaryPhone = contact.phoneNumbers?.[0]?.value;
  const primaryEmail = contact.emails?.[0]?.value;

  return (
    <tr
      onClick={onEdit}
      data-testid={`contact-row-${contact._id}`}
      className="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/60 cursor-pointer transition-colors group"
    >
      {/* Name + Avatar */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${gradient} text-white font-semibold text-xs shadow-sm group-hover:scale-105 transition-transform`}
          >
            {initials}
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">
              {name}
            </h3>
            {contact.nickname && (
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                aka {contact.nickname}
              </p>
            )}
            {contact.otherNames && contact.otherNames.length > 0 && (
              <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">
                {contact.otherNames.join(", ")}
              </p>
            )}
          </div>
        </div>
      </td>

      {/* Company */}
      <td className="px-4 py-3 hidden sm:table-cell">
        <span className="text-sm text-gray-600 dark:text-gray-300 truncate block max-w-[180px]">
          {contact.company || "—"}
        </span>
      </td>

      {/* Phone */}
      <td className="px-4 py-3 hidden md:table-cell">
        {primaryPhone ? (
          <span className="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300">
            <Phone className="h-3.5 w-3.5 text-gray-400" />
            {primaryPhone}
          </span>
        ) : (
          <span className="text-sm text-gray-400 dark:text-gray-600">—</span>
        )}
      </td>

      {/* Email */}
      <td className="px-4 py-3 hidden lg:table-cell">
        {primaryEmail ? (
          <span className="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300 truncate max-w-[200px]">
            <Mail className="h-3.5 w-3.5 text-gray-400" />
            {primaryEmail}
          </span>
        ) : (
          <span className="text-sm text-gray-400 dark:text-gray-600">—</span>
        )}
      </td>

      {/* Added date */}
      <td className="px-4 py-3 hidden xl:table-cell">
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {formatDate(contact._creationTime)}
        </span>
      </td>
    </tr>
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
