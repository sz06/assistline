import { api } from "@repo/api";
import { Button, Input, Label, PageHeader, Textarea } from "@repo/ui";
import { useMutation, useQuery } from "convex/react";
import { AlertCircle, CheckCircle2, Send } from "lucide-react";
import { useState } from "react";

export function SimulatorPage() {
  const conversations = useQuery(api.conversations.list);
  const insertMessage = useMutation(api.messages.insertMessage);

  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [responseMsg, setResponseMsg] = useState("");

  const [sender, setSender] = useState("");
  const [roomId, setRoomId] = useState("");
  const [message, setMessage] = useState("");

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!sender || !roomId || !message) {
      setStatus("error");
      setResponseMsg("Please fill in all fields.");
      return;
    }

    setStatus("loading");

    try {
      await insertMessage({
        matrixRoomId: roomId,
        sender: sender,
        text: message,
        direction: "in",
        timestamp: Date.now(),
      });

      setStatus("success");
      setResponseMsg("Message simulated successfully!");
      setMessage(""); // Clear message but keep sender and room for quick re-testing
    } catch (error: unknown) {
      console.error("Simulation error:", error);
      setStatus("error");
      setResponseMsg(
        error instanceof Error ? error.message : "Failed to simulate message.",
      );
    }
  };

  return (
    <div className="p-4 md:p-6 overflow-auto h-full max-w-3xl">
      <PageHeader
        title="System Simulator"
        description="Simulate incoming Matrix messages natively to test AI flows without a real bridge."
      />

      <div className="mt-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 shadow-sm">
        <form onSubmit={handleSend} className="space-y-6">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sender">Sender (Matrix ID)</Label>
              <Input
                id="sender"
                value={sender}
                onChange={(e) => setSender(e.target.value)}
                placeholder="@user:example.com"
                required
              />
              <p className="text-xs text-gray-500">
                The Matrix ID of the user sending the message.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="roomId">To (Matrix Room ID)</Label>
              <div className="relative">
                <select
                  id="roomIdSelect"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  className="flex w-full mb-2 rounded-md border border-gray-200 bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-950 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:focus-visible:ring-gray-300 transition-colors"
                >
                  <option value="">
                    Select existing room or type below...
                  </option>
                  {conversations?.map((conv) => (
                    <option key={conv._id} value={conv.matrixRoomId}>
                      {conv.contactDetails?.name || conv.name || "Unknown"} (
                      {conv.matrixRoomId})
                    </option>
                  ))}
                </select>
                <Input
                  id="roomId"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  placeholder="!room:example.com"
                  required
                />
              </div>
              <p className="text-xs text-gray-500">
                Select an existing room from the list, or type a new one
                manually.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="message">Message Body</Label>
            <Textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type the message you want to simulate..."
              required
              rows={4}
              className="bg-transparent"
            />
          </div>

          <div className="flex items-center gap-4">
            <Button
              type="submit"
              disabled={status === "loading"}
              className="min-w-[120px]"
            >
              {status === "loading" ? (
                "Simulating..."
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Simulate
                </>
              )}
            </Button>

            {status === "success" && (
              <div className="flex items-center text-green-600 dark:text-green-500 text-sm font-medium">
                <CheckCircle2 className="w-4 h-4 mr-1.5" />
                {responseMsg}
              </div>
            )}
            {status === "error" && (
              <div className="flex items-center text-red-600 dark:text-red-500 text-sm font-medium">
                <AlertCircle className="w-4 h-4 mr-1.5" />
                {responseMsg}
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
