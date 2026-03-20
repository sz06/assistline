import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.hourly(
  "cleanup-expired-artifacts",
  { minuteUTC: 0 },
  internal.artifacts.cleanupExpired,
);

crons.daily(
  "cleanup-old-audit-logs",
  { hourUTC: 3, minuteUTC: 0 },
  internal.auditLogs.cleanupOld,
);

export default crons;
