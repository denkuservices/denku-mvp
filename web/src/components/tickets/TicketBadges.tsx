// Client Component: Import only client-safe utilities
import { getStatusLabel, getStatusBadgeClass, getPriorityLabel, getPriorityBadgeClass } from "@/lib/tickets/utils.client";

type StatusBadgeProps = {
  status: string;
};

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${getStatusBadgeClass(status)}`}>
      {getStatusLabel(status)}
    </span>
  );
}

type PriorityBadgeProps = {
  priority: string;
};

export function PriorityBadge({ priority }: PriorityBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${getPriorityBadgeClass(priority)}`}
    >
      {getPriorityLabel(priority)}
    </span>
  );
}

