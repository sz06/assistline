import { api, type Id } from "@repo/api";
import { Button, PageHeader, cn } from "@repo/ui";
import { useMutation, useQuery } from "convex/react";
import {
  AlertCircle,
  Loader2,
  MessageSquare,
  Phone,
  Plus,
  Trash2,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { StaggerList } from "../components/ui/StaggerList";
import {
  channelColorMap,
  channelIconMap,
  WhatsAppIcon,
} from "../components/ChannelIcons";

type ChannelStatus = "disconnected" | "pairing" | "connected" | "error";

const STATUS_CONFIG: Record<
  ChannelStatus,
  { label: string; color: string; icon: React.ReactNode; dotColor: string }
> = {
  disconnected: {
    label: "Disconnected",
    color: "text-gray-500 dark:text-gray-400",
    icon: <WifiOff className="h-4 w-4" />,
    dotColor: "bg-gray-400",
  },
  pairing: {
    label: "Pairing…",
    color: "text-amber-600 dark:text-amber-400",
    icon: <Loader2 className="h-4 w-4 animate-spin" />,
    dotColor: "bg-amber-400 animate-pulse",
  },
  connected: {
    label: "Connected",
    color: "text-emerald-600 dark:text-emerald-400",
    icon: <Wifi className="h-4 w-4" />,
    dotColor: "bg-emerald-400",
  },
  error: {
    label: "Error",
    color: "text-red-600 dark:text-red-400",
    icon: <AlertCircle className="h-4 w-4" />,
    dotColor: "bg-red-400",
  },
};

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export function ChannelsPage() {
  const channels = useQuery(api.channels.core.list);
  const removeChannel = useMutation(api.channels.core.remove);
  const navigate = useNavigate();

  const [deletingId, setDeletingId] = useState<Id<"channels"> | null>(null);

  const handleConfirmDelete = async () => {
    if (!deletingId) return;
    await removeChannel({ id: deletingId });
    setDeletingId(null);
  };

  return (
    <div className="p-4 md:p-6 overflow-auto h-full">
      <div>
        <div className="flex items-start justify-between gap-4">
          <PageHeader
            title="Channels"
            description="Connect messaging platforms to receive and send messages."
          />
          <Button
            onClick={() => navigate("/channels/add")}
            className="shrink-0 mt-1"
            data-testid="add-channel-btn"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Channel
          </Button>
        </div>

        {/* ── Channel List ──────────────────────────────────────── */}
        <div className="mt-8">
          {channels === undefined ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : channels.length === 0 ? (
            <EmptyState onAdd={() => navigate("/channels/add")} />
          ) : (
            <StaggerList className="space-y-4">
              {channels.map((channel) => (
                <ChannelCard
                  key={channel._id}
                  channel={channel}
                  onClick={() => navigate(`/channels/${channel._id}/update`)}
                  onDelete={() => setDeletingId(channel._id)}
                />
              ))}
            </StaggerList>
          )}
        </div>

        {/* ── Delete Confirmation Dialog ────────────────────────── */}
        {deletingId && (
          <DeleteConfirmDialog
            onConfirm={handleConfirmDelete}
            onCancel={() => setDeletingId(null)}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Channel Card
// ---------------------------------------------------------------------------

function ChannelCard({
  channel,
  onClick,
  onDelete,
}: {
  channel: {
    _id: Id<"channels">;
    type: string;
    label: string;
    status: ChannelStatus;
    phoneNumber?: string;
    error?: string;
    connectedAt?: number;
  };
  onClick: () => void;
  onDelete: () => void;
}) {
  const status = STATUS_CONFIG[channel.status];
  const IconComponent = channelIconMap[channel.type] ?? WhatsAppIcon;
  const colors = channelColorMap[channel.type] ?? channelColorMap.whatsapp;

  return (
    <div
      data-testid={`channel-card-${channel._id}`}
      className={cn(
        "glass-panel rounded-xl overflow-hidden hover-card flex flex-col transition-all",
      )}
    >
      <div className="flex items-center justify-between px-5 py-4">
        <button
          type="button"
          onClick={onClick}
          className="flex items-center gap-4 flex-1 min-w-0 text-left focus:outline-none group"
        >
          {/* Channel icon */}
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${colors.bg} ${colors.text} group-hover:scale-105 transition-transform`}
          >
            <IconComponent />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-base truncate">
                {channel.label}
              </h3>
              <span
                className={`inline-flex items-center gap-1.5 text-xs font-medium ${status.color}`}
              >
                <span className={`h-2 w-2 rounded-full ${status.dotColor}`} />
                {status.label}
              </span>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 truncate">
              {channel.phoneNumber ? (
                <span className="inline-flex items-center gap-1">
                  <Phone className="h-3.5 w-3.5" />
                  {channel.phoneNumber}
                </span>
              ) : channel.status === "connected" ? (
                "Connected"
              ) : channel.status === "pairing" ? (
                "Pairing in progress…"
              ) : channel.status === "error" ? (
                (channel.error ?? "An error occurred")
              ) : (
                "Not connected"
              )}
            </p>
          </div>
        </button>

        {/* Delete button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors shrink-0 ml-2"
          title="Remove channel"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Connected Info */}
      {channel.status === "connected" && channel.connectedAt && (
        <div className="border-t border-gray-200/50 dark:border-white/5 px-5 py-3 bg-black/5 dark:bg-white-[0.02]">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Connected {new Date(channel.connectedAt).toLocaleDateString()} at{" "}
            {new Date(channel.connectedAt).toLocaleTimeString()}
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Delete Confirmation Dialog
// ---------------------------------------------------------------------------

function DeleteConfirmDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onCancel}
        aria-label="Close dialog"
      />

      {/* Dialog */}
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 w-full max-w-sm mx-4 p-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30 mx-auto mb-4">
          <Trash2 className="h-6 w-6 text-red-500" />
        </div>
        <h2 className="text-lg font-semibold">Remove Channel</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
          Are you sure you want to remove this channel? This action cannot be
          undone.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex items-center justify-center h-10 px-4 rounded-md text-sm font-medium text-white transition-colors"
            style={{ backgroundColor: "#dc2626" }}
          >
            Yes, remove
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty State
// ---------------------------------------------------------------------------

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl bg-blue-50/50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-500/20 mx-auto mb-6 shadow-[0_0_40px_-10px_rgba(59,130,246,0.4)]">
        <MessageSquare className="h-10 w-10 text-blue-500 dark:text-blue-400" />
      </div>
      <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300">
        No channels connected
      </h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5 max-w-sm">
        Connect a messaging platform to start receiving and responding to
        messages.
      </p>
      <Button
        onClick={onAdd}
        className="mt-5"
        data-testid="empty-add-channel-btn"
      >
        <Plus className="h-4 w-4 mr-2" />
        Add your first channel
      </Button>
    </div>
  );
}
