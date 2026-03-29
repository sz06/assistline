import { Button } from "@repo/ui";
import { Loader2 } from "lucide-react";
import { useState } from "react";

export function InstagramInstructions({
  instructions,
  onSubmitCookies,
}: {
  instructions?: string;
  onSubmitCookies: (cookies: string) => Promise<unknown>;
}) {
  const meta = {
    site: "instagram.com",
    url: "https://instagram.com",
    cookies: "sessionid, csrftoken, mid, ig_did, ds_user_id",
  };

  const [cookieInput, setCookieInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const trimmed = cookieInput.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmitCookies(trimmed);
      setCookieInput("");
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Failed to submit cookies",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const steps = [
    <span key="1">
      Open{" "}
      <a
        href={meta.url}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-blue-600 dark:text-blue-400 hover:underline"
      >
        {meta.site} ↗
      </a>{" "}
      in a private window and log in normally.
    </span>,
    <span key="2">
      Open{" "}
      <span className="font-mono text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded">
        DevTools
      </span>{" "}
      (F12) → <strong>Network</strong> tab → filter by{" "}
      <span className="font-mono text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded">
        graphql
      </span>
      .
    </span>,
    <span key="3">
      Right-click any request → <strong>Copy</strong> →{" "}
      <strong>Copy as cURL</strong> (choose POSIX if offered two options).
    </span>,
    <span key="4">
      Paste the copied cURL into the box below and click{" "}
      <strong>Submit Cookies</strong>.
    </span>,
  ];

  return (
    <div className="flex flex-col gap-5 w-full max-w-md mx-auto">
      {instructions && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 text-left space-y-1">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide">
            Bridge says
          </p>
          <p className="text-sm text-amber-800 dark:text-amber-300 whitespace-pre-wrap break-words">
            {instructions}
          </p>
        </div>
      )}

      {!instructions && (
        <div className="flex flex-col items-center justify-center py-6 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Waiting for bridge…
          </p>
        </div>
      )}

      <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 text-left space-y-4">
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
          How to log in to Instagram
        </p>
        <ol className="space-y-3">
          {steps.map((step, i) => (
            <li
              key={i}
              className="flex gap-3 text-sm text-gray-700 dark:text-gray-300"
            >
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs font-bold flex items-center justify-center mt-0.5">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
        <p className="text-xs text-gray-400 dark:text-gray-500 border-t border-gray-200 dark:border-gray-700 pt-3">
          Alternatively, send the cookies as a JSON object with keys:{" "}
          <span className="font-mono">{meta.cookies}</span>
        </p>
      </div>

      {instructions && (
        <div className="space-y-2">
          <label
            htmlFor="cookie-input"
            className="text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Paste cURL or cookie JSON here
          </label>
          <textarea
            id="cookie-input"
            value={cookieInput}
            onChange={(e) => setCookieInput(e.target.value)}
            placeholder={`curl 'https://www.${meta.site}/api/graphql/'  -b 'sessionid=...' ...`}
            rows={5}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-xs font-mono text-gray-800 dark:text-gray-200 px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
          />
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-gray-400">
              {cookieInput.length > 0
                ? `${cookieInput.length.toLocaleString()} chars`
                : "Paste the full cURL command — we extract only the required cookies."}
            </p>
            <Button
              type="button"
              size="sm"
              disabled={submitting || cookieInput.trim().length === 0}
              onClick={handleSubmit}
            >
              {submitting && (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              )}
              {submitting ? "Submitting…" : "Submit Cookies"}
            </Button>
          </div>
          {submitError && (
            <p className="text-xs text-red-500 dark:text-red-400">
              {submitError}
            </p>
          )}
        </div>
      )}

      <p className="text-xs text-center text-gray-400 dark:text-gray-500">
        The bridge will confirm once login is successful and the channel status
        will update automatically.
      </p>
    </div>
  );
}
