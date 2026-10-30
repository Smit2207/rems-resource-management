export function StatusBadge({ status }: { status: string }) {
  const key = status.toLowerCase().replace(/\s/g, "_");
  const variant = (BadgeVariants as Record<string, string>)[key] || "";
  const label = status.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  return (
    <span className={`badge ${variant}`}>
      {label}
    </span>
  );
}

const BadgeVariants: Record<string, string> = {
  active: "badge-active",
  disabled: "badge-disabled",
  maintenance: "badge-maintenance",
  pending: "badge-pending",
  approved: "badge-approved",
  rejected: "badge-rejected",
  cancelled: "badge-cancelled",
  checked_out: "badge-checked_out",
  returned: "badge-returned",
  completed: "badge-completed",
  open: "badge-open",
  under_review: "badge-under_review",
  resolved: "badge-resolved",
  student: "badge-student",
  manager: "badge-manager",
  admin: "badge-admin",
};
