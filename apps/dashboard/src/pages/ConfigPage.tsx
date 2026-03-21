import { api } from "@repo/api";
import { PageHeader } from "@repo/ui";
import { useMutation, useQuery } from "convex/react";
import { Loader2, RefreshCw, Save, Settings } from "lucide-react";
import { useState } from "react";

export function ConfigPage() {
  const configRows = useQuery(api.config.list);
  const upsert = useMutation(api.config.set);

  const [editedValues, setEditedValues] = useState<Record<string, string>>({});
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());

  const handleValueChange = (key: string, newVal: string) => {
    setEditedValues((prev) => ({ ...prev, [key]: newVal }));
  };

  const handleSave = async (row: { key: string; value: string }) => {
    const rawVal = editedValues[row.key];
    if (rawVal === undefined) return;

    setSavingKeys((prev) => new Set(prev).add(row.key));
    try {
      await upsert({ key: row.key, value: rawVal });

      // Clear the edit state for this key
      setEditedValues((prev) => {
        const next = { ...prev };
        delete next[row.key];
        return next;
      });
    } catch (err) {
      console.error("Failed to save config:", err);
    } finally {
      setSavingKeys((prev) => {
        const next = new Set(prev);
        next.delete(row.key);
        return next;
      });
    }
  };

  return (
    <div className="p-4 md:p-6 overflow-auto h-full">
      <PageHeader
        title="Configuration"
        description="System-level settings and parameters. Values are stored as strings — use JSON for complex data."
      />

      <div className="mt-8">
        {configRows === undefined ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : configRows.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="overflow-x-auto border border-gray-200 dark:border-gray-800 rounded-xl">
            <table className="w-full" data-testid="config-table">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-800">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Key
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Value
                  </th>
                  <th className="w-20 px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60">
                {configRows.map((row) => {
                  const currentVal = editedValues[row.key] ?? String(row.value);
                  const isChanged = editedValues[row.key] !== undefined;
                  const isSaving = savingKeys.has(row.key);

                  return (
                    <tr
                      key={row._id}
                      className="hover:bg-gray-50 dark:hover:bg-gray-900/30 transition-colors"
                      data-testid={`config-row-${row.key}`}
                    >
                      <td className="px-4 py-3">
                        <code className="text-sm font-mono text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
                          {row.key}
                        </code>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={currentVal}
                          onChange={(e) =>
                            handleValueChange(row.key, e.target.value)
                          }
                          data-testid={`config-value-${row.key}`}
                          className={`w-full max-w-sm px-3 py-1.5 text-sm rounded-md border transition-colors
                            ${
                              isChanged
                                ? "border-blue-400 dark:border-blue-600 bg-blue-50 dark:bg-blue-950/30 ring-1 ring-blue-200 dark:ring-blue-800"
                                : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
                            }
                            text-gray-900 dark:text-gray-100
                            focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500`}
                        />
                      </td>
                      <td className="px-4 py-3">
                        {isChanged && (
                          <button
                            type="button"
                            onClick={() => handleSave(row)}
                            disabled={isSaving}
                            data-testid={`config-save-${row.key}`}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                          >
                            <Save className="h-3 w-3" />
                            {isSaving ? "…" : "Save"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800 mb-4">
        <Settings className="h-7 w-7 text-gray-400" />
      </div>
      <RefreshCw className="h-10 w-10 mb-3 opacity-40" />
      <p className="text-sm font-medium">No config values found</p>
      <p className="text-xs mt-1">
        Run the seed function to populate defaults.
      </p>
    </div>
  );
}
