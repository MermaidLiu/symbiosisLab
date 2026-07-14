import clsx from "clsx";

const statusColors: Record<string, string> = {
  available: "bg-emerald-50 text-emerald-700 border-emerald-200",
  maintenance: "bg-tsinghua-yellow-light text-amber-800 border-tsinghua-yellow",
  retired: "bg-gray-100 text-gray-600 border-gray-200",
  in_use: "bg-blue-50 text-blue-700 border-blue-200",
  quarantine: "bg-orange-50 text-orange-700 border-orange-200",
  pending: "bg-tsinghua-yellow-light text-amber-800 border-tsinghua-yellow",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
  cancelled: "bg-gray-100 text-gray-500 border-gray-200",
  completed: "bg-thu-muted text-thu border-thu-subtle",
};

export function StatusBadge({ status, label }: { status: string; label: string }) {
  return (
    <span
      className={clsx(
        "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        statusColors[status] ?? "bg-gray-100 text-gray-600"
      )}
    >
      {label}
    </span>
  );
}
