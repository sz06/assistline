import { api } from "@repo/api";
import { PageHeader } from "@repo/ui";
import { useMutation, useQuery } from "convex/react";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

export function ProfilePage() {
  const profile = useQuery(api.userProfile.get);
  const upsert = useMutation(api.userProfile.upsert);

  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [matrixIds, setMatrixIds] = useState<string[]>([]);
  const [newMatrixId, setNewMatrixId] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Populate form once data loads
  useEffect(() => {
    if (profile !== undefined) {
      setName(profile?.name ?? "");
      setAvatarUrl(profile?.avatarUrl ?? "");
      setMatrixIds(profile?.matrixIds ?? []);
    }
  }, [profile]);

  const handleAddMatrixId = () => {
    const trimmed = newMatrixId.trim();
    if (!trimmed || matrixIds.includes(trimmed)) return;
    setMatrixIds((prev) => [...prev, trimmed]);
    setNewMatrixId("");
  };

  const handleRemoveMatrixId = (id: string) => {
    setMatrixIds((prev) => prev.filter((m) => m !== id));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await upsert({
        name: name.trim() || undefined,
        avatarUrl: avatarUrl.trim() || undefined,
        matrixIds,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      console.error("Failed to save profile:", err);
    } finally {
      setSaving(false);
    }
  };

  if (profile === undefined) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 overflow-auto h-full">
      <PageHeader
        title="My Profile"
        description="Your identity within Assistline. Matrix IDs listed here are treated as 'you' — messages from these IDs are classified as outbound."
      />

      <div className="mt-8 max-w-xl space-y-6">
        {/* Display Name */}
        <div>
          <label
            htmlFor="profile-name"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
          >
            Display Name
          </label>
          <input
            id="profile-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Alice"
            data-testid="profile-name"
            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-colors"
          />
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
            Used in agent prompts to identify you as the conversation owner.
          </p>
        </div>

        {/* Avatar URL */}
        <div>
          <label
            htmlFor="profile-avatar"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
          >
            Avatar URL
            <span className="ml-2 text-xs font-normal text-gray-400">
              (optional)
            </span>
          </label>
          <input
            id="profile-avatar"
            type="url"
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder="https://…"
            data-testid="profile-avatar"
            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-colors"
          />
        </div>

        {/* Matrix IDs */}
        <div>
          <div className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            My Matrix IDs
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
            Add the Matrix IDs for your bridge puppet accounts (one per
            connected channel). These are auto-populated when channels connect,
            but you can also add them manually.
          </p>

          <div className="space-y-2">
            {matrixIds.length > 0 && (
              <div
                className="rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800"
                data-testid="matrix-ids-list"
              >
                {matrixIds.map((id) => (
                  <div
                    key={id}
                    className="flex items-center justify-between px-3 py-2.5 gap-3"
                  >
                    <code className="text-xs font-mono text-gray-700 dark:text-gray-300 truncate">
                      {id}
                    </code>
                    <button
                      type="button"
                      onClick={() => handleRemoveMatrixId(id)}
                      data-testid={`remove-matrix-id-${id}`}
                      className="shrink-0 flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <input
                type="text"
                value={newMatrixId}
                onChange={(e) => setNewMatrixId(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddMatrixId();
                  }
                }}
                placeholder="@whatsapp_14155551234:matrix.local"
                data-testid="new-matrix-id-input"
                className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-colors font-mono"
              />
              <button
                type="button"
                onClick={handleAddMatrixId}
                disabled={!newMatrixId.trim()}
                data-testid="add-matrix-id"
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Plus className="h-4 w-4" />
                Add
              </button>
            </div>
          </div>
        </div>

        {/* Save */}
        <div className="pt-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            data-testid="profile-save"
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saving ? "Saving…" : saved ? "Saved!" : "Save Profile"}
          </button>
        </div>
      </div>
    </div>
  );
}
