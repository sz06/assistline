import { Loader2 } from "lucide-react";

export function WhatsAppInstructions({
  pairingCode,
}: {
  pairingCode?: string;
}) {
  if (!pairingCode) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Requesting pairing code from bridge…
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500">
          This may take a few seconds
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 py-4">
      <div className="bg-white dark:bg-gray-800 p-6 sm:p-8 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 w-full max-w-sm text-center">
        <h4 className="text-xs tracking-widest uppercase font-semibold text-gray-400 dark:text-gray-500 mb-2">
          Your Pairing Code
        </h4>
        <div className="text-4xl tracking-[0.2em] font-mono font-bold text-gray-900 dark:text-gray-100 flex justify-center">
          {pairingCode.substring(0, 4)}
          <span className="text-gray-300 dark:text-gray-600 mx-2">-</span>
          {pairingCode.substring(4)}
        </div>
      </div>
      <div className="text-center space-y-2 max-w-xs">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Enter this code in WhatsApp
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Open WhatsApp on your phone → Settings → Linked Devices → Link a
          Device → Link with phone number instead.
        </p>
      </div>
    </div>
  );
}
