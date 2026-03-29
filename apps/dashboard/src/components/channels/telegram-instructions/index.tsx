import { Loader2 } from "lucide-react";

export function TelegramInstructions({ qrCode }: { qrCode?: string }) {
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
          alt="Telegram QR Code"
          className="w-64 h-64 image-rendering-pixelated"
        />
      </div>
      <div className="text-center space-y-1">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Scan with Telegram
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 max-w-xs">
          Open Telegram → Settings → Devices → Link Desktop Device → Scan this
          code
        </p>
      </div>
    </div>
  );
}
