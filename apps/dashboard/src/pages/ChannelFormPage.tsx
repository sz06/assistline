import { zodResolver } from "@hookform/resolvers/zod";
import { api, type Id } from "@repo/api";
import { Button, Input, Label, PageHeader } from "@repo/ui";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, Loader2, QrCode, Unplug, X } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Zod Schema
// ---------------------------------------------------------------------------

const CHANNEL_TYPES = ["whatsapp", "telegram"] as const;
type ChannelType = (typeof CHANNEL_TYPES)[number];
type ChannelStatus = "disconnected" | "pairing" | "connected" | "error";

const channelFormSchema = z.object({
  type: z.enum(CHANNEL_TYPES),
  label: z.string().min(1, "Label is required"),
});

type ChannelFormData = z.infer<typeof channelFormSchema>;

const CHANNEL_TYPE_OPTIONS: { value: ChannelType; label: string }[] = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "telegram", label: "Telegram" },
];

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
    api.channels.get,
    isEditing && channelId ? { id: channelId } : "skip",
  );

  const createChannel = useMutation(api.channels.create);
  const updateChannel = useMutation(api.channels.update);
  const requestPairing = useMutation(api.channels.requestPairing);
  const disconnectChannel = useMutation(api.channels.disconnect);

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
          status={channelStatus ?? "disconnected"}
          qrCode={channel.qrCode}
          phoneNumber={channel.phoneNumber}
          error={channel.error}
          connectedAt={channel.connectedAt}
          onPair={() => requestPairing({ id: channelId })}
          onCancel={() => disconnectChannel({ id: channelId })}
          onDisconnect={() => disconnectChannel({ id: channelId })}
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

// ---------------------------------------------------------------------------
// Connection Section (Edit mode)
// ---------------------------------------------------------------------------

function ConnectionSection({
  status,
  qrCode,
  phoneNumber,
  error,
  connectedAt,
  onPair,
  onCancel,
  onDisconnect,
}: {
  status: ChannelStatus;
  qrCode?: string;
  phoneNumber?: string;
  error?: string;
  connectedAt?: number;
  onPair: () => void;
  onCancel: () => void;
  onDisconnect: () => void;
}) {
  const statusLabel = {
    disconnected: {
      text: "Disconnected",
      color: "text-gray-500",
      dot: "bg-gray-400",
    },
    pairing: {
      text: "Pairing…",
      color: "text-amber-600 dark:text-amber-400",
      dot: "bg-amber-400 animate-pulse",
    },
    connected: {
      text: "Connected",
      color: "text-emerald-600 dark:text-emerald-400",
      dot: "bg-emerald-400",
    },
    error: {
      text: "Error",
      color: "text-red-600 dark:text-red-400",
      dot: "bg-red-400",
    },
  }[status];

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm p-6 mb-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">
            Connection Status
          </h3>
          <span
            className={`inline-flex items-center gap-1.5 text-sm font-medium ${statusLabel.color}`}
          >
            <span className={`h-2 w-2 rounded-full ${statusLabel.dot}`} />
            {statusLabel.text}
          </span>
          {phoneNumber && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Phone: {phoneNumber}
            </p>
          )}
          {status === "error" && error && (
            <p className="text-sm text-red-500 dark:text-red-400 mt-1">
              {error}
            </p>
          )}
          {status === "connected" && connectedAt && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Connected since {new Date(connectedAt).toLocaleDateString()} at{" "}
              {new Date(connectedAt).toLocaleTimeString()}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {status === "disconnected" && (
            <Button onClick={onPair} variant="outline" size="sm">
              <QrCode className="h-4 w-4 mr-1.5" />
              Connect
            </Button>
          )}
          {status === "pairing" && (
            <Button onClick={onCancel} variant="outline" size="sm">
              <X className="h-4 w-4 mr-1.5" />
              Cancel
            </Button>
          )}
          {status === "error" && (
            <Button onClick={onPair} variant="outline" size="sm">
              <QrCode className="h-4 w-4 mr-1.5" />
              Retry
            </Button>
          )}
          {status === "connected" && (
            <Button onClick={onDisconnect} variant="outline" size="sm">
              <Unplug className="h-4 w-4 mr-1.5" />
              Disconnect
            </Button>
          )}
        </div>
      </div>

      {/* QR Code (shown during pairing) */}
      {status === "pairing" && (
        <div className="mt-6 border-t border-gray-200 dark:border-gray-800 pt-6">
          <QrCodeDisplay qrCode={qrCode} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// QR Code Display
// ---------------------------------------------------------------------------

function QrCodeDisplay({ qrCode }: { qrCode?: string }) {
  if (!qrCode) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Generating QR code…
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500">
          This may take a few seconds
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="bg-white p-4 rounded-xl shadow-inner">
        <img
          src={qrCode}
          alt="WhatsApp QR Code"
          className="w-64 h-64 image-rendering-pixelated"
        />
      </div>
      <div className="text-center space-y-1">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Scan with WhatsApp
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 max-w-xs">
          Open WhatsApp → Settings → Linked Devices → Link a Device → Scan this
          code
        </p>
      </div>
    </div>
  );
}
