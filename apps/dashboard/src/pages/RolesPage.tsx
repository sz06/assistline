import { zodResolver } from "@hookform/resolvers/zod";
import { api, type Id } from "@repo/api";
import { Button, Input, PageHeader } from "@repo/ui";
import { useMutation, useQuery } from "convex/react";
import { Loader2, Plus, Shield, Trash2, X } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const roleSchema = z.object({
  name: z.string().min(1, "Name is required").max(64),
  description: z.string().optional(),
});

type RoleFormData = z.infer<typeof roleSchema>;

export function RolesPage() {
  const roles = useQuery(api.roles.list);
  const createRole = useMutation(api.roles.create);
  const removeRole = useMutation(api.roles.remove);

  const [isAdding, setIsAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<Id<"roles"> | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<RoleFormData>({
    resolver: zodResolver(roleSchema),
    defaultValues: { name: "", description: "" },
  });

  const onValid = async (data: RoleFormData) => {
    await createRole({
      name: data.name,
      description: data.description || undefined,
    });
    reset();
    setIsAdding(false);
  };

  const handleConfirmDelete = async () => {
    if (!deletingId) return;
    await removeRole({ id: deletingId });
    setDeletingId(null);
  };

  return (
    <div className="p-4 md:p-6 overflow-auto h-full">
      <div>
        <div className="flex items-start justify-between gap-4">
          <PageHeader
            title="Roles Management"
            description="Create distinct roles to restrict knowledge base artifacts to specific personas."
          />
          <Button
            onClick={() => setIsAdding(true)}
            className="shrink-0 mt-1"
            data-testid="add-role-btn"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Role
          </Button>
        </div>

        <div className="mt-8 space-y-4">
          {/* Add form inline */}
          {isAdding && (
            <form
              onSubmit={handleSubmit(onValid)}
              className="bg-gray-50 dark:bg-gray-900 border border-blue-200 dark:border-blue-900 rounded-xl p-5 mb-6"
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-semibold text-sm">Create New Role</h3>
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Input
                    {...register("name")}
                    placeholder="Role Name (e.g. spouse)"
                  />
                  {errors.name && (
                    <p className="text-xs text-red-500 mt-1">
                      {errors.name.message}
                    </p>
                  )}
                </div>
                <div>
                  <Input
                    {...register("description")}
                    placeholder="Description (optional)"
                  />
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-3">
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => setIsAdding(false)}
                >
                  Cancel
                </Button>
                <Button type="submit">Save Role</Button>
              </div>
            </form>
          )}

          {roles === undefined ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : roles.length === 0 && !isAdding ? (
            <EmptyState onAdd={() => setIsAdding(true)} />
          ) : (
            roles.map((r) => (
              <div
                key={r._id}
                className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl px-5 py-4 flex items-center justify-between"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-500">
                    <Shield className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-base">{r.name}</h3>
                    <p className="text-sm text-gray-500">
                      {r.description || "No description provided."}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setDeletingId(r._id)}
                    className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {deletingId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <button
              type="button"
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setDeletingId(null)}
              aria-label="Close dialog"
            />
            <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 w-full max-w-sm mx-4 p-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30 mx-auto mb-4">
                <Trash2 className="h-6 w-6 text-red-500" />
              </div>
              <h2 className="text-lg font-semibold">Delete Role</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                Are you sure you want to delete this role?
              </p>
              <div className="mt-6 flex justify-center gap-3">
                <Button variant="outline" onClick={() => setDeletingId(null)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleConfirmDelete}
                  style={{ backgroundColor: "#dc2626", color: "white" }}
                >
                  Yes, delete
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="text-center py-12">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800 mx-auto mb-4">
        <Shield className="h-7 w-7 text-gray-400" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
        No roles created
      </h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5 max-w-md mx-auto">
        Create roles like "spouse" or "work" to manage memory access control.
      </p>
      <div className="mt-6">
        <Button onClick={onAdd}>
          <Plus className="h-4 w-4 mr-2" />
          Create First Role
        </Button>
      </div>
    </div>
  );
}
