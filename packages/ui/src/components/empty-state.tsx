import { InboxIcon } from "lucide-react";
import { cn } from "../lib/utils";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title?: string;
  description?: string;
  children?: React.ReactNode; // action slot
  className?: string;
}

export function EmptyState({
  icon,
  title = "Nothing here yet",
  description,
  children,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-12 text-center",
        className,
      )}
    >
      <div className="mb-4 text-gray-400">
        {icon ?? <InboxIcon className="h-12 w-12" />}
      </div>
      <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
        {title}
      </h3>
      {description && (
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-sm">
          {description}
        </p>
      )}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
