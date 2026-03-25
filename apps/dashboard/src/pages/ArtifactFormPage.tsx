import { zodResolver } from "@hookform/resolvers/zod";
import { api, type Id } from "@repo/api";
import { Button, Input, Label, PageHeader } from "@repo/ui";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { z } from "zod";

const artifactFormSchema = z.object({
  value: z.string().min(1, "Value is required"),
  accessibleToRoles: z.array(z.string()).optional(),
  expiresAt: z.string().optional(),
});

type ArtifactFormData = z.infer<typeof artifactFormSchema>;

export function ArtifactFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEditing = Boolean(id);
  const artifactId = id as Id<"artifacts"> | undefined;

  const artifact = useQuery(
    api.artifacts.get,
    isEditing && artifactId ? { id: artifactId } : "skip",
  );

  const roles = useQuery(api.roles.list);
  const createArtifact = useMutation(api.artifacts.create);
  const updateArtifact = useMutation(api.artifacts.update);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ArtifactFormData>({
    resolver: zodResolver(artifactFormSchema),
    defaultValues: {
      value: "",
      accessibleToRoles: [],
      expiresAt: "",
    },
  });

  useEffect(() => {
    if (isEditing && artifact) {
      let localDatetime = "";
      if (artifact.expiresAt) {
        const d = new Date(artifact.expiresAt);
        // Format as YYYY-MM-DDTHH:mm for datetime-local input (user's local TZ)
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        const hours = String(d.getHours()).padStart(2, "0");
        const minutes = String(d.getMinutes()).padStart(2, "0");
        localDatetime = `${year}-${month}-${day}T${hours}:${minutes}`;
      }
      reset({
        value: artifact.value,
        accessibleToRoles: artifact.accessibleToRoles as string[],
        expiresAt: localDatetime,
      });
    }
  }, [isEditing, artifact, reset]);

  const onValid = async (data: ArtifactFormData) => {
    const expiresAt = data.expiresAt
      ? new Date(data.expiresAt).getTime()
      : undefined;
    const roleIds = (data.accessibleToRoles || []) as Id<"roles">[];

    if (isEditing && artifactId) {
      await updateArtifact({
        id: artifactId,
        value: data.value,
        accessibleToRoles: roleIds,
        expiresAt,
      });
    } else {
      await createArtifact({
        value: data.value,
        accessibleToRoles: roleIds,
        expiresAt,
      });
    }

    navigate("/artifacts");
  };

  if (isEditing && artifact === undefined) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (isEditing && artifact === null) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <h2 className="text-xl font-semibold mb-2">Artifact Not Found</h2>
        <p className="text-gray-500 mb-6">
          This artifact may have been deleted.
        </p>
        <Button onClick={() => navigate("/artifacts")}>
          Back to Artifacts
        </Button>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 overflow-auto h-full w-full">
      <div className="mb-6">
        <button
          type="button"
          onClick={() => navigate("/artifacts")}
          className="inline-flex items-center text-sm font-medium text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back to Artifacts
        </button>
        <PageHeader
          title={isEditing ? "Edit Artifact" : "Add Artifact"}
          description={
            isEditing
              ? "Update memory configuration."
              : "Create a new memory or fact for the AI."
          }
        />
      </div>

      <form
        onSubmit={handleSubmit(onValid)}
        className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm p-6 space-y-6"
      >
        <div>
          <Label htmlFor="af-val">Memory</Label>
          <textarea
            id="af-val"
            {...register("value")}
            placeholder="e.g. User&#39;s spouse name: Sarah"
            rows={4}
            className="mt-1.5 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[100px] resize-y"
          />
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
            Write a self-descriptive fact. This is used for both storage and
            semantic search.
          </p>
          {errors.value && (
            <p className="text-xs text-red-500 mt-1">{errors.value.message}</p>
          )}
        </div>

        <div>
          <Label htmlFor="af-expires">Expires At (Optional)</Label>
          <Input
            id="af-expires"
            type="datetime-local"
            {...register("expiresAt")}
            className="mt-1.5"
          />
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
            If set, this memory will be automatically deleted after the
            specified date and time. Displayed in your local timezone.
          </p>
        </div>

        <div>
          <Label>Accessible To Roles (Optional)</Label>
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
            {roles === undefined ? (
              <span className="text-gray-400 text-sm flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading roles...
              </span>
            ) : roles.length > 0 ? (
              roles.map((r) => (
                <label
                  key={r._id}
                  className="flex items-center gap-2 text-sm border border-gray-200 dark:border-gray-800 p-2.5 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <input
                    type="checkbox"
                    value={r._id}
                    {...register("accessibleToRoles")}
                    className="rounded border-gray-300 dark:border-gray-700 text-blue-600 focus:ring-blue-500 bg-white dark:bg-gray-900"
                  />
                  <span className="font-medium text-gray-700 dark:text-gray-200">
                    {r.name}
                  </span>
                </label>
              ))
            ) : (
              <span className="text-gray-500 text-sm">No roles exist yet.</span>
            )}
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
            Select the roles allowed to read this memory. Leave all unchecked
            for public access.
          </p>
          {errors.accessibleToRoles && (
            <p className="text-xs text-red-500 mt-1">
              {errors.accessibleToRoles.message}
            </p>
          )}
        </div>

        <div className="pt-4 flex justify-end gap-3 border-t border-gray-100 dark:border-gray-800">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate("/artifacts")}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEditing ? "Save Changes" : "Add Artifact"}
          </Button>
        </div>
      </form>
    </div>
  );
}
