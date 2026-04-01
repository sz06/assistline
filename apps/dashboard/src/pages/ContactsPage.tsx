import { api, type Id } from "@repo/api";
import { Button, Input, PageHeader } from "@repo/ui";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Loader2,
  Mail,
  Phone,
  Plus,
  Search,
  Settings2,
  Sparkles,
  UploadCloud,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ColumnKey =
  | "name"
  | "company"
  | "phone"
  | "email"
  | "roles"
  | "created"
  | "updated"
  | "suggestions";

type SortField =
  | "name"
  | "company"
  | "created"
  | "updated"
  | "suggestionCreated";
type SortDir = "asc" | "desc";

interface ContactHandle {
  _id: Id<"contactHandles">;
  type: "phone" | "email" | "facebook" | "instagram" | "telegram";
  value: string;
  label?: string;
}

interface ContactSuggestion {
  _id: string;
  field: string;
  value: string;
}

interface Contact {
  _id: Id<"contacts">;
  _creationTime: number;
  name?: string;
  nickname?: string;
  otherNames?: string[];
  handles?: ContactHandle[];
  company?: string;
  jobTitle?: string;
  birthday?: string;
  notes?: string;
  lastUpdateAt?: number;
  roles?: Id<"roles">[];
  suggestions?: ContactSuggestion[];
  earliestSuggestionAt?: number;
}

// ---------------------------------------------------------------------------
// Column Definitions
// ---------------------------------------------------------------------------

interface ColumnDef {
  key: ColumnKey;
  label: string;
  /** Sortable columns map to a SortField; non-sortable ones are undefined */
  sortField?: SortField;
  defaultVisible: boolean;
  /** Name column can never be hidden */
  locked?: boolean;
}

const COLUMN_DEFS: ColumnDef[] = [
  {
    key: "name",
    label: "Name",
    sortField: "name",
    defaultVisible: true,
    locked: true,
  },
  {
    key: "company",
    label: "Company",
    sortField: "company",
    defaultVisible: false,
  },
  { key: "phone", label: "Phone", defaultVisible: true },
  { key: "email", label: "Email", defaultVisible: true },
  { key: "roles", label: "Roles", defaultVisible: false },
  {
    key: "created",
    label: "Added",
    sortField: "created",
    defaultVisible: true,
  },
  {
    key: "updated",
    label: "Updated",
    sortField: "updated",
    defaultVisible: true,
  },
  {
    key: "suggestions",
    label: "Suggestions",
    sortField: "suggestionCreated",
    defaultVisible: true,
  },
];

const STORAGE_KEY = "contacts-columns";

function loadVisibleColumns(): Set<ColumnKey> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as ColumnKey[];
      const set = new Set<ColumnKey>(parsed);
      set.add("name"); // always include name
      return set;
    }
  } catch {
    // fall through to defaults
  }
  return new Set(COLUMN_DEFS.filter((c) => c.defaultVisible).map((c) => c.key));
}

function saveVisibleColumns(cols: Set<ColumnKey>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...cols]));
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
  const contacts = useQuery(api.contacts.queries.list);
  const allRoles = useQuery(api.roles.list);
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [visibleCols, setVisibleCols] =
    useState<Set<ColumnKey>>(loadVisibleColumns);
  const [colMenuOpen, setColMenuOpen] = useState(false);

  // Build role ID → name map
  const roleMap = useMemo(() => {
    const map: Record<string, string> = {};
    if (allRoles) {
      for (const role of allRoles) {
        map[String(role._id)] = role.name;
      }
    }
    return map;
  }, [allRoles]);

  const isColVisible = useCallback(
    (key: ColumnKey) => visibleCols.has(key),
    [visibleCols],
  );

  const toggleColumn = (key: ColumnKey) => {
    setVisibleCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      next.add("name"); // safety: never remove name
      saveVisibleColumns(next);
      return next;
    });
  };

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
        const phones = (
          c.handles?.filter((h: ContactHandle) => h.type === "phone") ?? []
        )
          .map((p: ContactHandle) => p.value)
          .join(" ")
          .toLowerCase();
        const emails = (
          c.handles?.filter((h: ContactHandle) => h.type === "email") ?? []
        )
          .map((e: ContactHandle) => e.value)
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
        case "updated":
          cmp =
            (a.lastUpdateAt ?? a._creationTime) -
            (b.lastUpdateAt ?? b._creationTime);
          break;
        case "suggestionCreated": {
          // Contacts with no suggestions sort last ascending
          const aSug =
            a.earliestSuggestionAt ??
            (sortDir === "asc" ? Infinity : -Infinity);
          const bSug =
            b.earliestSuggestionAt ??
            (sortDir === "asc" ? Infinity : -Infinity);
          cmp = aSug - bSug;
          break;
        }
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
          <div className="flex gap-2 shrink-0 mt-1">
            <Button
              onClick={() => navigate("/contacts/import")}
              variant="outline"
              data-testid="import-contacts-btn"
            >
              <UploadCloud className="h-4 w-4 mr-2" />
              Import
            </Button>
            <Button
              onClick={() => navigate("/contacts/add")}
              data-testid="add-contact-btn"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Contact
            </Button>
          </div>
        </div>

        {/* ── Toolbar: Search + Column Config ─────────────── */}
        {contacts && contacts.length > 0 && (
          <div className="flex items-center gap-2 mt-2 mb-6">
            <div className="relative max-w-md flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search by name, company, phone, email…"
                className="pl-10"
                data-testid="contacts-search"
              />
            </div>
            <ColumnConfigDropdown
              visibleCols={visibleCols}
              onToggle={toggleColumn}
              open={colMenuOpen}
              onOpenChange={setColMenuOpen}
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
                      {/* Name — always visible */}
                      <SortableHeader
                        label="Name"
                        field="name"
                        activeField={sortField}
                        dir={sortDir}
                        onSort={handleSort}
                      />
                      {isColVisible("company") && (
                        <SortableHeader
                          label="Company"
                          field="company"
                          activeField={sortField}
                          dir={sortDir}
                          onSort={handleSort}
                        />
                      )}
                      {isColVisible("phone") && (
                        <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Phone
                        </th>
                      )}
                      {isColVisible("email") && (
                        <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Email
                        </th>
                      )}
                      {isColVisible("roles") && (
                        <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Roles
                        </th>
                      )}
                      {isColVisible("created") && (
                        <SortableHeader
                          label="Added"
                          field="created"
                          activeField={sortField}
                          dir={sortDir}
                          onSort={handleSort}
                        />
                      )}
                      {isColVisible("updated") && (
                        <SortableHeader
                          label="Updated"
                          field="updated"
                          activeField={sortField}
                          dir={sortDir}
                          onSort={handleSort}
                        />
                      )}
                      {isColVisible("suggestions") && (
                        <SortableHeader
                          label="Suggestions"
                          field="suggestionCreated"
                          activeField={sortField}
                          dir={sortDir}
                          onSort={handleSort}
                        />
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {paged.map((contact) => (
                      <ContactRow
                        key={contact._id}
                        contact={contact}
                        roleMap={roleMap}
                        visibleCols={visibleCols}
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
// Column Config Dropdown
// ---------------------------------------------------------------------------

function ColumnConfigDropdown({
  visibleCols,
  onToggle,
  open,
  onOpenChange,
}: {
  visibleCols: Set<ColumnKey>;
  onToggle: (key: ColumnKey) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onOpenChange(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onOpenChange]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className="p-2 rounded-md border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-500 dark:text-gray-400"
        data-testid="column-config-btn"
        title="Configure columns"
      >
        <Settings2 className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-52 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg p-1">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-gray-800">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Columns
            </span>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {COLUMN_DEFS.map((col) => {
            const checked = visibleCols.has(col.key);
            const disabled = col.locked;
            return (
              <label
                key={col.key}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                  disabled
                    ? "opacity-50 cursor-not-allowed"
                    : "hover:bg-gray-50 dark:hover:bg-gray-800/60"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => {
                    if (!disabled) onToggle(col.key);
                  }}
                  className="h-3.5 w-3.5 rounded border-gray-300 dark:border-gray-600 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
                  data-testid={`col-toggle-${col.key}`}
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {col.label}
                </span>
              </label>
            );
          })}
        </div>
      )}
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
  roleMap,
  visibleCols,
  onEdit,
}: {
  contact: Contact;
  roleMap: Record<string, string>;
  visibleCols: Set<ColumnKey>;
  onEdit: () => void;
}) {
  const approveSuggestion = useMutation(
    api.contactSuggestions.mutations.execute,
  );
  const dismissSuggestion = useMutation(
    api.contactSuggestions.mutations.dismiss,
  );

  const name = displayName(contact.name, contact.nickname, contact.otherNames);
  const initials = getInitials(
    contact.name,
    contact.nickname,
    contact.otherNames,
  );
  const gradient = pickGradient(name);
  const primaryPhone = contact.handles?.find((h) => h.type === "phone")?.value;
  const primaryEmail = contact.handles?.find((h) => h.type === "email")?.value;
  const roleNames = (contact.roles ?? [])
    .map((id) => roleMap[String(id)])
    .filter(Boolean);

  return (
    <tr
      onClick={onEdit}
      data-testid={`contact-row-${contact._id}`}
      className="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/60 cursor-pointer transition-colors group"
    >
      {/* Name + Avatar — always visible */}
      <td className="px-4 py-3 align-top">
        <div className="flex items-start gap-3">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${gradient} text-white font-semibold text-xs shadow-sm group-hover:scale-105 transition-transform mt-0.5`}
          >
            {initials}
          </div>
          <div>
            <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100">
              {name}
            </h3>
            {contact.nickname && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                aka {contact.nickname}
              </p>
            )}
            {contact.otherNames && contact.otherNames.length > 0 && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                {contact.otherNames.join(", ")}
              </p>
            )}
          </div>
        </div>
      </td>

      {/* Company */}
      {visibleCols.has("company") && (
        <td className="px-4 py-3 align-top">
          <span className="text-sm text-gray-600 dark:text-gray-300">
            {contact.company || "—"}
          </span>
        </td>
      )}

      {/* Phone */}
      {visibleCols.has("phone") && (
        <td className="px-4 py-3 align-top">
          {primaryPhone ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300">
              <Phone className="h-3.5 w-3.5 shrink-0 text-gray-400" />
              {primaryPhone}
            </span>
          ) : (
            <span className="text-sm text-gray-400 dark:text-gray-600">—</span>
          )}
        </td>
      )}

      {/* Email */}
      {visibleCols.has("email") && (
        <td className="px-4 py-3 align-top">
          {primaryEmail ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300">
              <Mail className="h-3.5 w-3.5 shrink-0 text-gray-400" />
              {primaryEmail}
            </span>
          ) : (
            <span className="text-sm text-gray-400 dark:text-gray-600">—</span>
          )}
        </td>
      )}

      {/* Roles */}
      {visibleCols.has("roles") && (
        <td className="px-4 py-3 align-top">
          {roleNames.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {roleNames.map((rn) => (
                <span
                  key={rn}
                  className="inline-block rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-2 py-0.5 text-xs font-medium"
                >
                  {rn}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-sm text-gray-400 dark:text-gray-600">—</span>
          )}
        </td>
      )}

      {/* Added date */}
      {visibleCols.has("created") && (
        <td className="px-4 py-3 align-top">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {formatDate(contact._creationTime)}
          </span>
        </td>
      )}

      {/* Updated date */}
      {visibleCols.has("updated") && (
        <td className="px-4 py-3 align-top">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {contact.lastUpdateAt ? formatDate(contact.lastUpdateAt) : "—"}
          </span>
        </td>
      )}

      {/* Contact Suggestions */}
      {visibleCols.has("suggestions") && (
        // biome-ignore lint/a11y/useKeyWithClickEvents: intentional propagation stop
        <td
          className="px-4 py-3 align-top"
          onClick={(e) => e.stopPropagation()}
        >
          {contact.suggestions && contact.suggestions.length > 0 ? (
            <div className="flex flex-col gap-2">
              {contact.suggestions.map((s) => (
                <div
                  key={s._id}
                  className="flex flex-col gap-1.5 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-3 py-2"
                >
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="h-3 w-3 text-amber-500 shrink-0" />
                    <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 capitalize">
                      {s.field}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-200 leading-snug">
                    {s.value}
                  </p>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        approveSuggestion({
                          suggestionId: s._id as Id<"contactSuggestions">,
                        })
                      }
                      className="inline-flex items-center gap-1 rounded-md bg-emerald-100 dark:bg-emerald-900/40 hover:bg-emerald-200 dark:hover:bg-emerald-900/70 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 text-xs font-medium transition-colors"
                      data-testid={`approve-suggestion-${s._id}`}
                    >
                      <Check className="h-3 w-3" />
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        dismissSuggestion({
                          suggestionId: s._id as Id<"contactSuggestions">,
                        })
                      }
                      className="inline-flex items-center gap-1 rounded-md bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 px-2 py-0.5 text-xs font-medium transition-colors"
                      data-testid={`dismiss-suggestion-${s._id}`}
                    >
                      <X className="h-3 w-3" />
                      Dismiss
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <span className="text-sm text-gray-400 dark:text-gray-600">—</span>
          )}
        </td>
      )}
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
