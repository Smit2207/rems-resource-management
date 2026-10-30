const variants: Record<string, string> = {
  active: "badge-active",
  disabled: "badge-disabled",
  maintenance: "badge-maintenance",
  Pending: "badge-pending",
  Approved: "badge-approved",
  Rejected: "badge-rejected",
  Cancelled: "badge-cancelled",
  "Checked Out": "badge-checked_out",
  Returned: "badge-returned",
  Completed: "badge-completed",
  open: "badge-open",
  under_review: "badge-under_review",
  resolved: "badge-resolved",
  student: "badge-student",
  manager: "badge-manager",
  admin: "badge-admin",
  default: "badge",
};

export function Badge({
  className,
  variant,
  children,
}: {
  className?: string;
  variant?: string;
  children: React.ReactNode;
}) {
  const base = "badge";
  const v = variant ? variants[variant] || variants.default : variants.default;
  return <span className={`${base} ${v} ${className || ""}`}>{children}</span>;
}
