/**
 * Smart Alternatives.
 *
 * When a requested resource is unavailable or ineligible, suggests:
 *   - Compatible alternative resources (same category/type, available)
 *   - Alternative time slots (where supported)
 *   - The existing waiting-list option
 *
 * All suggestions respect eligibility, lifecycle, and booking-conflict rules.
 * Never fabricates availability or implies a reservation has been made.
 */

import type { Database } from "../lib/supabase";
import {
  computeLifecycleState,
  getEligibilityMissingReasons,
  isLifecycleBookable,
  isTimeRangeAvailable,
  lifecycleLabel,
  checkResourceBookable,
} from "../lib/eligibility";
import { matchResources, filterBookable } from "../lib/matchmaker";

type Resource = Database["public"]["Tables"]["resources"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type Booking = Database["public"]["Tables"]["bookings"]["Row"];

/** A single alternative resource suggestion. */
export interface ResourceAlternative {
  resource: Resource;
  score: number;
  matchReasons: string[];
  whyNotOriginal: string[];
  lifecycleState: string;
  isBookable: boolean;
}

/** An alternative time slot suggestion. */
export interface TimeAlternative {
  startTime: string;
  endTime: string;
  reason: string;
  isAvailable: boolean;
}

/** Result of alternatives analysis. */
export interface AlternativesResult {
  resourceAlternatives: ResourceAlternative[];
  timeAlternatives: TimeAlternative[];
  waitingListEligible: boolean;
  originalResource: Resource | null;
  originalLifecycleState: string;
  originalMissingReasons: string[];
}

/**
 * Generate alternatives when a resource is unavailable or ineligible.
 *
 * @param originalResource - The resource that couldn't be booked
 * * @param allResources - All resources to search for alternatives
 * @param allBookings - All bookings for conflict detection
 * @param borrower - Borrower profile (for eligibility)
 * @param criteria - Original search criteria (time, quantity, location, etc.)
 */
export function generateAlternatives(
  originalResource: Resource | null,
  allResources: Resource[],
  allBookings: Booking[],
  borrower: Profile | null,
  criteria: {
    startTime?: string;
    endTime?: string;
    quantity?: number;
    location?: string;
    tags?: string[];
    categoryId?: string;
    type?: string;
  },
): AlternativesResult {
  const result: AlternativesResult = {
    resourceAlternatives: [],
    timeAlternatives: [],
    waitingListEligible: false,
    originalResource: originalResource ?? null,
    originalLifecycleState: "unknown",
    originalMissingReasons: [],
  };

  if (!originalResource) return result;

  // Analyze why the original resource is not bookable
  const originalBookings = allBookings.filter(
    (b) => b.resource_id === originalResource.id,
  );
  result.originalLifecycleState = computeLifecycleState(
    originalResource,
    originalBookings,
  );

  if (borrower && criteria.startTime && criteria.endTime) {
    const bookableCheck = checkResourceBookable(
      originalResource,
      borrower,
      originalBookings,
      criteria.startTime,
      criteria.endTime,
    );
    result.originalMissingReasons = bookableCheck.reasons;
  } else if (borrower) {
    result.originalMissingReasons = getEligibilityMissingReasons(
      originalResource,
      borrower,
    );
  }

  // Always check lifecycle state for missing reasons
  if (!isLifecycleBookable(result.originalLifecycleState)) {
    result.originalMissingReasons.push(
      `Resource is ${lifecycleLabel(result.originalLifecycleState).toLowerCase()}`,
    );
  }

  // --- Resource alternatives ---
  // Use matchmaker to find compatible resources, excluding the original
  const matchCriteria = {
    categoryId: criteria.categoryId ?? originalResource.category_id ?? undefined,
    type: criteria.type ?? originalResource.type,
    tags: criteria.tags ?? originalResource.tags ?? undefined,
    startTime: criteria.startTime,
    endTime: criteria.endTime,
    quantity: criteria.quantity ?? originalResource.capacity ?? undefined,
    location: criteria.location ?? originalResource.location ?? undefined,
    borrower,
    limit: 10,
  };

  const matches = matchResources(
    allResources.filter((r) => r.id !== originalResource.id),
    allBookings,
    borrower,
    matchCriteria,
  );

  const bookableMatches = filterBookable(matches);

  for (const match of bookableMatches.slice(0, 5)) {
    const matchBookings = allBookings.filter(
      (b) => b.resource_id === match.resource.id,
    );
    const matchLifecycle = computeLifecycleState(match.resource, matchBookings);

    result.resourceAlternatives.push({
      resource: match.resource,
      score: match.score,
      matchReasons: match.matchReasons,
      whyNotOriginal: result.originalMissingReasons,
      lifecycleState: matchLifecycle,
      isBookable: match.isBookable,
    });
  }

  // --- Time alternatives ---
  // Suggest alternative time slots if the original time is blocked
  if (criteria.startTime && criteria.endTime) {
    const originalStart = new Date(criteria.startTime);
    const originalEnd = new Date(criteria.endTime);
    const durationMs = originalEnd.getTime() - originalStart.getTime();

    if (durationMs > 0) {
      // Try earlier and later slots on the same day
      const candidates: TimeAlternative[] = [];

      // Earlier slots: 1 hour, 2 hours, 4 hours before
      for (const hoursBack of [1, 2, 4]) {
        const altStart = new Date(
          originalStart.getTime() - hoursBack * 60 * 60 * 1000,
        );
        const altEnd = new Date(altStart.getTime() + durationMs);
        const altBookings = originalBookings.filter(
          (b) =>
            b.status === "Approved" || b.status === "Checked Out",
        );
        const isAvailable = isTimeRangeAvailable(
          altBookings,
          altStart.toISOString(),
          altEnd.toISOString(),
        );
        candidates.push({
          startTime: altStart.toISOString(),
          endTime: altEnd.toISOString(),
          reason: `${hoursBack} hour(s) earlier`,
          isAvailable,
        });
      }

      // Later slots: 1 hour, 2 hours, 4 hours after
      for (const hoursForward of [1, 2, 4]) {
        const altStart = new Date(
          originalStart.getTime() + hoursForward * 60 * 60 * 1000,
        );
        const altEnd = new Date(altStart.getTime() + durationMs);
        const altBookings = originalBookings.filter(
          (b) =>
            b.status === "Approved" || b.status === "Checked Out",
        );
        const isAvailable = isTimeRangeAvailable(
          altBookings,
          altStart.toISOString(),
          altEnd.toISOString(),
        );
        candidates.push({
          startTime: altStart.toISOString(),
          endTime: altEnd.toISOString(),
          reason: `${hoursForward} hour(s) later`,
          isAvailable,
        });
      }

      result.timeAlternatives = candidates;
    }
  }

  // --- Waiting list eligibility ---
  // Borrower can join waiting list if they are eligible but resource is unavailable
  if (borrower && originalResource) {
    const eligibilityMissing = getEligibilityMissingReasons(
      originalResource,
      borrower,
    );
    result.waitingListEligible = eligibilityMissing.length === 0;
  }

  return result;
}

/**
 * Format a human-readable explanation for why an alternative fits.
 */
export function formatAlternativeReason(alt: ResourceAlternative): string {
  const parts: string[] = [];

  if (alt.matchReasons.length > 0) {
    parts.push(`Why it fits: ${alt.matchReasons.join(", ")}`);
  }

  if (alt.lifecycleState === "available") {
    parts.push("Currently available for booking");
  } else if (alt.lifecycleState === "reserved") {
    parts.push("Has existing bookings but may still be available");
  } else {
    parts.push(`Status: ${lifecycleLabel(alt.lifecycleState)}`);
  }

  return parts.join(" • ");
}
