import { zodResolver } from "@hookform/resolvers/zod";
import { api, type Id } from "@repo/api";
import { Button, Input, Label, PageHeader } from "@repo/ui";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, Loader2, QrCode, Unplug, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { z } from "zod";
import {
  CHANNEL_TYPE_OPTIONS,
  CHANNEL_TYPES,
  type ChannelStatus,
  type ChannelType,
  ConnectionSection,
} from "../components/channels";

// ---------------------------------------------------------------------------
// Zod Schema
// ---------------------------------------------------------------------------

const channelFormSchema = z.object({
  type: z.enum(CHANNEL_TYPES),
  label: z.string().min(1, "Label is required"),
});

type ChannelFormData = z.infer<typeof channelFormSchema>;

// ---------------------------------------------------------------------------
// Channel Form Page
// ---------------------------------------------------------------------------

export function ChannelFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEditing = Boolean(id);
  const channelId = id as Id<"channels"> | undefined;

  // For Edit mode, fetch the channel data
  const channel = useQuery(
    api.channels.core.get,
    isEditing && channelId ? { id: channelId } : "skip",
  );

  const createChannel = useMutation(api.channels.core.create);
  const updateChannel = useMutation(api.channels.core.update);
  const requestPairing = useMutation(api.channels.core.requestPairing);
  const disconnectChannel = useMutation(api.channels.core.disconnect);
  const submitMetaCookies = useMutation(api.channels.meta.submitMetaCookies);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChannelFormData>({
    resolver: zodResolver(channelFormSchema),
    defaultValues: {
      type: "whatsapp",
      label: "",
    },
  });

  // When editing and data loads, populate the form once
  useEffect(() => {
    if (isEditing && channel) {
      reset({
        type: channel.type as ChannelType,
        label: channel.label,
      });
    }
  }, [isEditing, channel, reset]);

  const onValid = async (data: ChannelFormData) => {
    if (isEditing && channelId) {
      await updateChannel({
        id: channelId,
        type: data.type,
        label: data.label,
      });
    } else {
      await createChannel({
        type: data.type,
        label: data.label,
      });
    }
    navigate("/channels");
  };

  // If editing but still loading data, show spinner
  if (isEditing && channel === undefined) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  // If editing but channel not found
  if (isEditing && channel === null) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <h2 className="text-xl font-semibold mb-2">Channel Not Found</h2>
        <p className="text-gray-500 mb-6">
          This channel may have been deleted.
        </p>
        <Button onClick={() => navigate("/channels")}>Back to Channels</Button>
      </div>
    );
  }

  const channelStatus = channel?.status as ChannelStatus | undefined;

  return (
    <div className="p-4 md:p-6 overflow-auto h-full w-full">
      <div className="mb-6">
        <button
          type="button"
          onClick={() => navigate("/channels")}
          className="inline-flex items-center text-sm font-medium text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back to Channels
        </button>
        <PageHeader
          title={isEditing ? "Edit Channel" : "Add Channel"}
          description={
            isEditing
              ? "Update channel details and manage connection."
              : "Connect a new messaging channel."
          }
        />
      </div>

      {/* ── Connection Status & Actions (Edit mode only) ── */}
      {isEditing && channel && channelId && (
        <ConnectionSection
          channelId={channelId}
          status={channelStatus ?? "disconnected"}
          channelType={channel.type as ChannelType}
          pairingCode={
            channel.channelData?.type === "whatsapp"
              ? channel.channelData.pairingCode
              : undefined
          }
          instructions={
            channel.channelData?.type === "facebook" ||
            channel.channelData?.type === "instagram"
              ? channel.channelData.instructions
              : undefined
          }
          phoneNumber={
            channel.channelData?.type === "whatsapp"
              ? channel.channelData.phoneNumber
              : undefined
          }
          error={channel.error}
          connectedAt={channel.connectedAt}
          onPair={(phoneNum?: string) =>
            requestPairing({ id: channelId, phoneNumber: phoneNum })
          }
          onCancel={() => disconnectChannel({ id: channelId })}
          onDisconnect={() => disconnectChannel({ id: channelId })}
          onSubmitCookies={(cookies) =>
            submitMetaCookies({ id: channelId, cookies })
          }
        />
      )}

      <form
        onSubmit={handleSubmit(onValid)}
        className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm p-6 space-y-5"
      >
        {/* ── Platform ── */}
        <div className="space-y-1.5">
          <Label htmlFor="ch-type">Platform</Label>
          <select
            id="ch-type"
            {...register("type")}
            className="w-full h-10 px-3 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            data-testid="channel-type-select"
          >
            {CHANNEL_TYPE_OPTIONS.map((ct) => (
              <option key={ct.value} value={ct.value}>
                {ct.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            The messaging platform to connect.
          </p>
          {errors.type && (
            <p className="text-xs text-red-500">{errors.type.message}</p>
          )}
        </div>

        {/* ── Label ── */}
        <div className="space-y-1.5">
          <Label htmlFor="ch-label">Label</Label>
          <Input
            id="ch-label"
            {...register("label")}
            placeholder="My WhatsApp"
            data-testid="channel-label-input"
          />
          <p className="text-xs text-gray-400 dark:text-gray-500">
            A friendly name to identify this channel.
          </p>
          {errors.label && (
            <p className="text-xs text-red-500">{errors.label.message}</p>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="pt-3 flex justify-end gap-3 border-t border-gray-100 dark:border-gray-800">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate("/channels")}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting}
            data-testid="save-channel-btn"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEditing ? "Save Changes" : "Create Channel"}
          </Button>
        </div>
      </form>
    </div>
  );
}
