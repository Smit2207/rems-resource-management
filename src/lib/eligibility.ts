/**
 * Shared eligibility and availability logic.
 *
 * These are pure TypeScript functions used by the frontend for consistent UI
 * feedback. Security-critical enforcement happens on the backend via Supabase
 * RPCs (check_resource_availability, check_borrower_eligibility) and RLS.
 *
 * Frontend checks are a convenience only; the database is the source of truth.
 */

import type { Database } from "./supabase";

type Resource = Database["public"]["Tables"]["resources"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type Booking = Database["public"]["Tables"]["bookings"]["Row"];

/** Lifecycle states that allow new booking requests. */
const BOOKABLE_LIFECYCLE_STATES = new Set([
  "available",
  "reserved",
]);

/** Lifecycle states that explicitly block booking. */
const NON_BOOKABLE_LIFECYCLE_STATES = new Set([
  "draft",
  "pending_verification",
  "checked_out",
  "return_review",
  "maintenance",
  "investigation",
  "retired",
]);

/**
 * Lifecycle state labels for display.
 */
export const LIFECYCLE_LABELS: Record<string, string> = {
  draft: "Draft",
  pending_verification: "Pending Verification",
  available: "Available",
  reserved: "Reserved",
  checked_out: "Checked Out",
  return_review: "Return Review",
  maintenance: "Maintenance",
  investigation: "Under Investigation",
  retired: "Retired",
};

/**
 * Lifecycle state color variants for StatusBadge.
 */
export const LIFECYCLE_VARIANTS: Record<string, string> = {
  draft: "badge-maintenance",
  pending_verification: "badge-maintenance",
  available: "badge-active",
  reserved: "badge-approved",
  checked_out: "badge-checked_out",
  return_review: "badge-maintenance",
  maintenance: "badge-maintenance",
  investigation: "badge-maintenance",
  retired: "badge-disabled",
};

/**
 * Whether a lifecycle state allows new booking requests.
 */
export function isLifecycleBookable(lifecycleState: string | null): boolean {
  if (!lifecycleState) return false;
  return BOOKABLE_LIFECYCLE_STATES.has(lifecycleState);
}

/**
 * Whether a lifecycle state explicitly blocks booking.
 */
export function isLifecycleBlocked(lifecycleState: string | null): boolean {
  if (!lifecycleState) return true;
  return NON_BOOKABLE_LIFECYCLE_STATES.has(lifecycleState);
}

/**
 * Human-readable label for a lifecycle state.
 */
export function lifecycleLabel(lifecycleState: string | null): string {
  if (!lifecycleState) return "Unknown";
  return LIFECYCLE_LABELS[lifecycleState] ?? lifecycleState;
}

/**
 * Color variant for a lifecycle state badge.
 */
export function lifecycleVariant(lifecycleState: string | null): string {
  if (!lifecycleState) return "badge-maintenance";
  return LIFECYCLE_VARIANTS[lifecycleState] ?? "badge-maintenance";
}

/**
 * Effective lifecycle state considering active bookings.
 * Mirrors the public.get_resource_lifecycle_state RPC.
 *
 * @param resource - Resource row
 * @param bookings - All bookings for this resource
 */
export function computeLifecycleState(
  resource: Resource,
  bookings: Booking[],
): string {
  const stored = resource.lifecycle_state || "available";

  // Recognized non-bookable states take precedence regardless of bookings
  if (
    stored === "draft" ||
    stored === "pending_verification" ||
    stored === "maintenance" ||
    stored === "investigation" ||
    stored === "retired" ||
    stored === "return_review"
  ) {
    return stored;
  }

  // Unknown or unrecognized lifecycle states: check bookings only
  const hasCheckedOut = bookings.some((b) => b.status === "Checked Out");
  const hasApprovedOrCheckedOut = bookings.some(
    (b) => b.status === "Approved" || b.status === "Checked Out",
  );

  if (hasCheckedOut) return "checked_out";
  if (hasApprovedOrCheckedOut) return "reserved";

  // Default to stored state, or "available" if unrecognized
  return stored === "available" || stored === "reserved"
    ? stored
    : "available";
}

/**
 * Check borrower eligibility against resource requirements.
 * Mirrors the public.check_borrower_eligibility RPC.
 *
 * @param resource - Resource row
 * @param borrower - Borrower profile
 * @returns true if eligible
 */
export function checkEligibility(resource: Resource, borrower: Profile): boolean {
  // Eligibility: department match (when set)
  if (
    resource.eligibility_department &&
    borrower.department !== resource.eligibility_department
  ) {
    return false;
  }

  // Eligibility: min year (when set)
  if (
    resource.eligibility_min_year != null &&
    (borrower.year_of_study == null ||
      borrower.year_of_study < resource.eligibility_min_year)
  ) {
    return false;
  }

  // Training requirement (NULL-safe)
  if (
    resource.required_training &&
    resource.training_required &&
    !(
      borrower.training_completed?.includes(resource.training_required) ?? false
    )
  ) {
    return false;
  }

  return true;
}

/**
 * Get human-readable reasons why a borrower is not eligible.
 *
 * @param resource - Resource row
 * @param borrower - Borrower profile
 * @returns Array of missing eligibility reasons
 */
export function getEligibilityMissingReasons(
  resource: Resource,
  borrower: Profile,
): string[] {
  const reasons: string[] = [];

  if (
    resource.eligibility_department &&
    borrower.department !== resource.eligibility_department
  ) {
    reasons.push(`Department: ${resource.eligibility_department}`);
  }

  if (
    resource.eligibility_min_year != null &&
    (borrower.year_of_study == null ||
      borrower.year_of_study < resource.eligibility_min_year)
  ) {
    reasons.push(`Year of study: >= ${resource.eligibility_min_year}`);
  }

  if (
    resource.required_training &&
    resource.training_required &&
    !(borrower.training_completed?.includes(resource.training_required) ?? false)
  ) {
    reasons.push(`Training: ${resource.training_required}`);
  }

  return reasons;
}

/**
 * Check if a time range overlaps with existing Approved or Checked Out bookings.
 * Mirrors the overlap logic used by the bookings_no_overlap constraint.
 *
 * @param bookings - All bookings for the resource
 * @param startTime - Requested start time (ISO string)
 * @param endTime - Requested end time (ISO string)
 * @returns true if the time range is available
 */
export function isTimeRangeAvailable(
  bookings: Booking[],
  startTime: string,
  endTime: string,
): boolean {
  const reqStart = new Date(startTime).getTime();
  const reqEnd = new Date(endTime).getTime();

  if (reqEnd <= reqStart) return false;

  for (const b of bookings) {
    if (b.status !== "Approved" && b.status !== "Checked Out") continue;

    const bStart = new Date(b.start_time).getTime();
    const bEnd = new Date(b.end_time).getTime();

    // Overlap if ranges intersect: reqStart < bEnd && reqEnd > bStart
    if (reqStart < bEnd && reqEnd > bStart) {
      return false;
    }
  }

  return true;
}

/**
 * Get booking conflict reasons for a requested time range.
 *
 * @param resource - Resource row (for context)
 * @param bookings - All bookings for the resource
 * @param startTime - Requested start time
 * @param endTime - Requested end time
 * @returns Array of conflict descriptions
 */
export function getBookingConflictReasons(
  _resource: Resource,
  bookings: Booking[],
  startTime: string,
  endTime: string,
): string[] {
  const reasons: string[] = [];
  const reqStart = new Date(startTime);
  const reqEnd = new Date(endTime);

  for (const b of bookings) {
    if (b.status !== "Approved" && b.status !== "Checked Out") continue;

    const bStart = new Date(b.start_time);
    const bEnd = new Date(b.end_time);

    if (reqStart < bEnd && reqEnd > bStart) {
      reasons.push(
        `Overlaps with ${b.status.toLowerCase()} booking ` +
          `${b.start_time.slice(0, 16)} – ${b.end_time.slice(0, 16)}`,
      );
    }
  }

  return reasons;
}

/**
 * Combined check: is a resource bookable by a borrower for a time range?
 * Checks lifecycle state, eligibility, and availability.
 *
 * @param resource - Resource row
 * @param borrower - Borrower profile (null = skip eligibility check)
 * @param bookings - All bookings for the resource
 * @param startTime - Requested start time
 * @param endTime - Requested end time
 * @returns { bookable, reasons } - Whether bookable and why not
 */
export function checkResourceBookable(
  resource: Resource,
  borrower: Profile | null,
  bookings: Booking[],
  startTime: string,
  endTime: string,
): { bookable: boolean; reasons: string[] } {
  const reasons: string[] = [];

  // 1. Lifecycle state check
  const lifecycle = computeLifecycleState(resource, bookings);
  if (!isLifecycleBookable(lifecycle)) {
    reasons.push(
      `Resource is ${lifecycleLabel(lifecycle).toLowerCase()} and cannot be booked.`,
    );
  }

  // 2. Eligibility check (only if borrower provided)
  if (borrower) {
    const missing = getEligibilityMissingReasons(resource, borrower);
    for (const reason of missing) {
      reasons.push(`Not eligible: ${reason}.`);
    }
  }

  // 3. Availability check (time range conflicts)
  if (isLifecycleBookable(lifecycle)) {
    if (!isTimeRangeAvailable(bookings, startTime, endTime)) {
      reasons.push(...getBookingConflictReasons(resource, bookings, startTime, endTime));
    }
  }

  return {
    bookable: reasons.length === 0,
    reasons,
  };
}
