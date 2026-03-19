import { zodResolver } from "@hookform/resolvers/zod";
import { api, type Id } from "@repo/api";
import { Button, Input, Label, PageHeader, Textarea } from "@repo/ui";
import { useMutation, useQuery } from "convex/react";
import { AlertCircle, CheckCircle2, Send } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Zod Schema
// ---------------------------------------------------------------------------

const simulatorFormSchema = z.object({
  sender: z.string().min(1, "Sender is required"),
  roomId: z.string().min(1, "Room ID is required"),
  channelId: z.string().min(1, "Channel is required"),
  message: z.string().min(1, "Message is required"),
});

type SimulatorFormData = z.infer<typeof simulatorFormSchema>;

// ---------------------------------------------------------------------------
// Simulator Page
// ---------------------------------------------------------------------------

export function SimulatorPage() {
  const conversations = useQuery(api.conversations.list);
  const channels = useQuery(api.channels.list);
  const insertMessage = useMutation(api.messages.insertMessage);

  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [responseMsg, setResponseMsg] = useState("");

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<SimulatorFormData>({
    resolver: zodResolver(simulatorFormSchema),
    defaultValues: {
      sender: "",
      roomId: "",
      channelId: "",
      message: "",
    },
  });

  const roomIdValue = watch("roomId");

  const onValid = async (data: SimulatorFormData) => {
    setStatus("loading");

    try {
      await insertMessage({
        matrixRoomId: data.roomId,
        eventId: `sim_${Date.now().toString()}`,
        sender: data.sender,
        text: data.message,
        direction: "in",
        timestamp: Date.now(),
        channelId: data.channelId as Id<"channels">,
        memberCount: 1,
        participants: [data.sender],
      });

      setStatus("success");
      setResponseMsg("Message simulated successfully!");
      setValue("message", ""); // Clear message but keep sender and room for quick re-testing
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
        <form onSubmit={handleSubmit(onValid)} className="space-y-6">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sender">Sender (Matrix ID)</Label>
              <Input
                id="sender"
                {...register("sender")}
                placeholder="@user:example.com"
              />
              {errors.sender ? (
                <p className="text-xs text-red-500">{errors.sender.message}</p>
              ) : (
                <p className="text-xs text-gray-500">
                  The Matrix ID of the user sending the message.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="roomId">To (Matrix Room ID)</Label>
              <div className="relative">
                <select
                  id="roomIdSelect"
                  value={roomIdValue}
                  onChange={(e) => setValue("roomId", e.target.value)}
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
                  {...register("roomId")}
                  placeholder="!room:example.com"
                />
              </div>
              {errors.roomId ? (
                <p className="text-xs text-red-500">{errors.roomId.message}</p>
              ) : (
                <p className="text-xs text-gray-500">
                  Select an existing room from the list, or type a new one
                  manually.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="channelId">Channel</Label>
            <select
              id="channelId"
              {...register("channelId")}
              className="flex w-full rounded-md border border-gray-200 bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-950 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:focus-visible:ring-gray-300 transition-colors"
            >
              <option value="">Select a channel...</option>
              {channels?.map((ch) => (
                <option key={ch._id} value={ch._id}>
                  {ch.label} ({ch.type})
                </option>
              ))}
            </select>
            {errors.channelId ? (
              <p className="text-xs text-red-500">{errors.channelId.message}</p>
            ) : (
              <p className="text-xs text-gray-500">
                The channel this simulated message comes through.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="message">Message Body</Label>
            <Textarea
              id="message"
              {...register("message")}
              placeholder="Type the message you want to simulate..."
              rows={4}
              className="bg-transparent"
            />
            {errors.message && (
              <p className="text-xs text-red-500">{errors.message.message}</p>
            )}
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
