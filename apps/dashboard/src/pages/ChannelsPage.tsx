import { api, type Id } from "@repo/api";
import { Button, PageHeader } from "@repo/ui";
import { useMutation, useQuery } from "convex/react";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  MessageSquare,
  Phone,
  Plus,
  QrCode,
  Trash2,
  Unplug,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { useState } from "react";

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
  const channels = useQuery(api.channels.list);
  const createChannel = useMutation(api.channels.create);
  const requestPairing = useMutation(api.channels.requestPairing);
  const disconnectChannel = useMutation(api.channels.disconnect);
  const removeChannel = useMutation(api.channels.remove);
  const [showAddDialog, setShowAddDialog] = useState(false);

  const handleAddWhatsApp = async () => {
    const id = await createChannel({
      type: "whatsapp",
      label: "WhatsApp",
    });
    // Immediately start pairing
    await requestPairing({ id });
    setShowAddDialog(false);
  };

  return (
    <div className="p-4 md:p-6 overflow-auto h-full">
      <div className="max-w-4xl">
        <div className="flex items-start justify-between">
          <PageHeader
            title="Channels"
            description="Connect messaging platforms to receive and send messages."
          />
          <Button
            onClick={() => setShowAddDialog(true)}
            className="shrink-0 mt-1"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Channel
          </Button>
        </div>

        {/* ── Channel List ──────────────────────────────────────── */}
        <div className="mt-8 space-y-4">
          {channels === undefined ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : channels.length === 0 ? (
            <EmptyState onAdd={() => setShowAddDialog(true)} />
          ) : (
            channels.map((channel) => (
              <ChannelCard
                key={channel._id}
                channel={channel}
                onPair={() => requestPairing({ id: channel._id })}
                onCancel={() => disconnectChannel({ id: channel._id })}
                onDisconnect={() => disconnectChannel({ id: channel._id })}
                onRemove={() => removeChannel({ id: channel._id })}
              />
            ))
          )}
        </div>

        {/* ── Add Channel Dialog ────────────────────────────────── */}
        {showAddDialog && (
          <AddChannelDialog
            onAddWhatsApp={handleAddWhatsApp}
            onClose={() => setShowAddDialog(false)}
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
  onPair,
  onCancel,
  onDisconnect,
  onRemove,
}: {
  channel: {
    _id: Id<"channels">;
    type: string;
    label: string;
    status: ChannelStatus;
    qrCode?: string;
    phoneNumber?: string;
    error?: string;
    connectedAt?: number;
  };
  onPair: () => void;
  onCancel: () => void;
  onDisconnect: () => void;
  onRemove: () => void;
}) {
  const status = STATUS_CONFIG[channel.status];
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-4">
          {/* Channel icon */}
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">
            <WhatsAppIcon />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-base">{channel.label}</h3>
              <span
                className={`inline-flex items-center gap-1.5 text-xs font-medium ${status.color}`}
              >
                <span className={`h-2 w-2 rounded-full ${status.dotColor}`} />
                {status.label}
              </span>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {channel.phoneNumber ? (
                <span className="inline-flex items-center gap-1">
                  <Phone className="h-3.5 w-3.5" />
                  {channel.phoneNumber}
                </span>
              ) : channel.status === "connected" ? (
                "Connected"
              ) : channel.status === "pairing" ? (
                "Scan the QR code below with WhatsApp"
              ) : channel.status === "error" ? (
                (channel.error ?? "An error occurred")
              ) : (
                "Not connected"
              )}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {confirmDelete ? (
            // Delete confirmation — hides all other actions
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500 mr-1">
                Remove channel?
              </span>
              <button
                type="button"
                onClick={() => {
                  onRemove();
                  setConfirmDelete(false);
                }}
                className="inline-flex items-center justify-center h-9 px-3 rounded-md text-sm font-medium text-white transition-colors"
                style={{ backgroundColor: "#dc2626" }}
              >
                Yes, remove
              </button>
              <Button
                onClick={() => setConfirmDelete(false)}
                variant="outline"
                size="sm"
              >
                No
              </Button>
            </div>
          ) : (
            <>
              {channel.status === "disconnected" && (
                <Button onClick={onPair} variant="outline" size="sm">
                  <QrCode className="h-4 w-4 mr-1.5" />
                  Connect
                </Button>
              )}
              {channel.status === "pairing" && (
                <Button onClick={onCancel} variant="outline" size="sm">
                  <X className="h-4 w-4 mr-1.5" />
                  Cancel
                </Button>
              )}
              {channel.status === "error" && (
                <Button onClick={onPair} variant="outline" size="sm">
                  <QrCode className="h-4 w-4 mr-1.5" />
                  Retry
                </Button>
              )}
              {channel.status === "connected" && (
                <Button onClick={onDisconnect} variant="outline" size="sm">
                  <Unplug className="h-4 w-4 mr-1.5" />
                  Disconnect
                </Button>
              )}
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                title="Remove channel"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* QR Code Section (shown during pairing) */}
      {channel.status === "pairing" && (
        <div className="border-t border-gray-200 dark:border-gray-800 px-5 py-6">
          <QrCodeDisplay qrCode={channel.qrCode} />
        </div>
      )}

      {/* Connected Info */}
      {channel.status === "connected" && channel.connectedAt && (
        <div className="border-t border-gray-100 dark:border-gray-800/50 px-5 py-3 bg-gray-50/50 dark:bg-gray-900/50">
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Connected {new Date(channel.connectedAt).toLocaleDateString()} at{" "}
            {new Date(channel.connectedAt).toLocaleTimeString()}
          </p>
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

// ---------------------------------------------------------------------------
// Empty State
// ---------------------------------------------------------------------------

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800 mb-5">
        <MessageSquare className="h-8 w-8 text-gray-400" />
      </div>
      <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300">
        No channels connected
      </h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5 max-w-sm">
        Connect a messaging platform to start receiving and responding to
        messages.
      </p>
      <Button onClick={onAdd} className="mt-5">
        <Plus className="h-4 w-4 mr-2" />
        Add your first channel
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add Channel Dialog
// ---------------------------------------------------------------------------

function AddChannelDialog({
  onAddWhatsApp,
  onClose,
}: {
  onAddWhatsApp: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close dialog"
      />

      {/* Dialog */}
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-semibold mb-1">Add Channel</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Choose a messaging platform to connect.
        </p>

        <div className="space-y-3">
          {/* WhatsApp */}
          <button
            type="button"
            onClick={onAddWhatsApp}
            className="w-full flex items-center gap-4 p-4 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-emerald-400 dark:hover:border-emerald-600 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10 transition-all group"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform">
              <WhatsAppIcon />
            </div>
            <div className="text-left">
              <p className="font-medium text-gray-900 dark:text-gray-100">
                WhatsApp
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Connect via QR code scan
              </p>
            </div>
            <CheckCircle2 className="h-5 w-5 ml-auto text-gray-300 dark:text-gray-600 group-hover:text-emerald-500 transition-colors" />
          </button>

          {/* Telegram (coming soon) */}
          <div className="flex items-center gap-4 p-4 rounded-xl border border-gray-100 dark:border-gray-800 opacity-50 cursor-not-allowed">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
              <MessageSquare className="h-6 w-6" />
            </div>
            <div className="text-left">
              <p className="font-medium text-gray-900 dark:text-gray-100">
                Telegram
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Coming soon
              </p>
            </div>
            <span className="ml-auto text-xs font-medium text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
              Soon
            </span>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// WhatsApp SVG Icon
// ---------------------------------------------------------------------------

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 fill-current">
      <title>WhatsApp</title>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}
