import { Badge, type BadgeProps } from "./badge";

const statusVariantMap: Record<string, BadgeProps["variant"]> = {
  // Job statuses
  PENDING: "secondary",
  BROADCASTING: "default",
  REQUIRES_SOURCING: "warning",
  ASSIGNED: "default",
  IN_PROGRESS: "default",
  COMPLETED: "success",
  CANCELLED: "destructive",
  REFUNDED: "destructive",
  // Conversation statuses
  WAITING_FOR_USER: "secondary",
  WAITING_FOR_AGENT: "default",
  ESCALATED: "warning",
  // Broadcast responses
  ACCEPTED: "success",
  DECLINED: "destructive",
  EXPIRED: "secondary",
  // Payment statuses
  SENT: "default",
  CONFIRMED: "success",
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const variant = statusVariantMap[status] ?? "outline";
  return (
    <Badge variant={variant} className={className}>
      {status.replace(/_/g, " ")}
    </Badge>
  );
}
