import type { Id } from "@repo/api";
import { Button } from "@repo/ui";
import { QrCode, Unplug, X } from "lucide-react";
import { useState } from "react";
import { FacebookInstructions } from "../facebook-instructions";
import { InstagramInstructions } from "../instagram-instructions";
import { TelegramInstructions } from "../telegram-instructions";
import type { ChannelStatus, ChannelType } from "../types";
import { WhatsAppInstructions } from "../whatsapp-instructions";

export function ConnectionSection({
  channelId: _channelId,
  status,
  channelType,
  pairingCode,
  instructions,
  phoneNumber,
  error,
  connectedAt,
  onPair,
  onCancel,
  onDisconnect,
  onSubmitCookies,
}: {
  channelId: Id<"channels">;
  status: ChannelStatus;
  channelType: ChannelType;
  pairingCode?: string;
  instructions?: string;
  phoneNumber?: string;
  error?: string;
  connectedAt?: number;
  onPair: (phone?: string) => void;
  onCancel: () => void;
  onDisconnect: () => void;
  onSubmitCookies: (cookies: string) => Promise<unknown>;
}) {
  const [phoneInput, setPhoneInput] = useState("");

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
      color: "text emerald-600 dark:text-emerald-400",
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
          {status === "disconnected" && channelType !== "whatsapp" && (
            <Button onClick={() => onPair()} variant="outline" size="sm">
              <QrCode className="h-4 w-4 mr-1.5" />
              Connect
            </Button>
          )}
          {status === "disconnected" && channelType === "whatsapp" && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="+1234567890"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                className="h-9 px-3 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <Button
                onClick={() => onPair(phoneInput)}
                variant="outline"
                size="sm"
                disabled={!phoneInput.trim()}
              >
                <QrCode className="h-4 w-4 mr-1.5" />
                Connect
              </Button>
            </div>
          )}
          {status === "pairing" && (
            <Button onClick={onCancel} variant="outline" size="sm">
              <X className="h-4 w-4 mr-1.5" />
              Cancel
            </Button>
          )}
          {status === "error" && (
            <Button onClick={() => onPair()} variant="outline" size="sm">
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

      {status === "pairing" && (
        <div className="mt-6 border-t border-gray-200 dark:border-gray-800 pt-6">
          {channelType === "whatsapp" && (
            <WhatsAppInstructions pairingCode={pairingCode} />
          )}
          {channelType === "telegram" && (
            <TelegramInstructions qrCode={pairingCode} />
          )}
          {channelType === "facebook" && (
            <FacebookInstructions
              instructions={instructions}
              onSubmitCookies={onSubmitCookies}
            />
          )}
          {channelType === "instagram" && (
            <InstagramInstructions
              instructions={instructions}
              onSubmitCookies={onSubmitCookies}
            />
          )}
        </div>
      )}
    </div>
  );
}
