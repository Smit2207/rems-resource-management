/**
 * Smart Resource Matchmaker.
 *
 * Deterministic, explainable resource discovery assistant.
 * Users describe what they need and receive ranked recommendations.
 *
 * Ranking factors (all explainable):
 *   - Category match (exact category ID)
 *   - Tag overlap (user-specified tags match resource tags)
 *   - Eligibility (borrower meets department/year/training requirements)
 *   - Availability (no overlapping Approved/Checked Out bookings)
 *   - Location match (user-specified location matches resource location)
 *   - Capacity (resource capacity meets or exceeds requested quantity)
 *   - Lifecycle state (bookable states ranked higher)
 *
 * Excluded resources (never shown as bookable):
 *   - Non-bookable lifecycle states (draft, maintenance, investigation, retired, etc.)
 *   - Resources with booking conflicts for the requested time
 *   - Resources where borrower is not eligible
 *
 * A recommendation is never a confirmed reservation. Backend validation
 * via create_booking RPC and bookings_no_overlap constraint is required.
 */

import type { Database } from "./supabase";
import {
  checkResourceBookable,
  computeLifecycleState,
  getBookingConflictReasons,
  getEligibilityMissingReasons,
  isLifecycleBookable,
  lifecycleLabel,
  isTimeRangeAvailable,
} from "./eligibility";

type Resource = Database["public"]["Tables"]["resources"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type Booking = Database["public"]["Tables"]["bookings"]["Row"];

/** Search criteria for the matchmaker. */
export interface MatchmakerCriteria {
  /** Free-text description of need (parsed for keywords) */
  description?: string;
  /** Preferred category ID */
  categoryId?: string;
  /** Resource type: "equipment" or "space" */
  type?: string;
  /** Required tags */
  tags?: string[];
  /** Requested start time (ISO string) */
  startTime?: string;
  /** Requested end time (ISO string) */
  endTime?: string;
  /** Required quantity/capacity */
  quantity?: number;
  /** Preferred location */
  location?: string;
  /** Borrower profile (for eligibility checks) */
  borrower?: Profile | null;
  /** Maximum number of results */
  limit?: number;
}

/** A single matchmaker result with score and explanation. */
export interface MatchResult {
  resource: Resource;
  score: number;
  lifecycleState: string;
  isBookable: boolean;
  reasons: string[];
  matchReasons: string[]; // Why this resource matches
  missingReasons: string[]; // Why it might not be bookable
}

/**
 * Parse keywords from a free-text description.
 * Splits on whitespace and punctuation, lowercases, filters short words.
 */
function parseKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s,.;:!?]+/)
    .filter((w) => w.length > 2)
    .filter((w, i, arr) => arr.indexOf(w) === i); // deduplicate
}

/**
 * Score a single resource against the criteria.
 * Returns the score, match reasons, and missing reasons.
 */
function scoreResource(
  resource: Resource,
  criteria: MatchmakerCriteria,
  borrower: Profile | null,
  bookings: Booking[],
): {
  score: number;
  matchReasons: string[];
  missingReasons: string[];
} {
  let score = 0;
  const matchReasons: string[] = [];
  const missingReasons: string[] = [];

  // --- Category match (weight: 30) ---
  if (criteria.categoryId && resource.category_id === criteria.categoryId) {
    score += 30;
    matchReasons.push("Matches your requested category");
  } else if (criteria.categoryId) {
    missingReasons.push("Different category than requested");
  }

  // --- Tag overlap (weight: 20 per matching tag, max 40) ---
  const resourceTags = new Set(resource.tags ?? []);
  const requestedTags = new Set(criteria.tags ?? []);
  const matchingTags = [...requestedTags].filter((t) => resourceTags.has(t));
  if (matchingTags.length > 0) {
    const tagScore = Math.min(matchingTags.length * 20, 40);
    score += tagScore;
    matchReasons.push(
      `Has ${matchingTags.length} requested tag(s): ${matchingTags.join(", ")}`,
    );
  }
  if (criteria.tags?.length && matchingTags.length === 0) {
    missingReasons.push("Does not have requested tags");
  }

  // --- Description keyword match (weight: 10 per keyword, max 30) ---
  if (criteria.description) {
    const keywords = parseKeywords(criteria.description);
    const resourceText = [
      resource.name,
      resource.description,
      resource.type,
      resource.location,
      ...(resource.tags ?? []),
    ]
      .join(" ")
      .toLowerCase();
    let keywordMatches = 0;
    for (const kw of keywords) {
      if (resourceText.includes(kw)) {
        keywordMatches++;
      }
    }
    if (keywordMatches > 0) {
      const descScore = Math.min(keywordMatches * 10, 30);
      score += descScore;
      matchReasons.push(
        `Description matches ${keywordMatches} keyword(s) from your request`,
      );
    }
    if (keywords.length > 0 && keywordMatches === 0) {
      missingReasons.push("Description doesn't match your keywords");
    }
  }

  // --- Type match (weight: 10) ---
  if (criteria.type && resource.type === criteria.type) {
    score += 10;
    matchReasons.push(`Matches resource type: ${resource.type}`);
  } else if (criteria.type) {
    missingReasons.push(`Type is ${resource.type}, not ${criteria.type}`);
  }

  // --- Location match (weight: 15) ---
  if (criteria.location && resource.location) {
    const locMatch =
      resource.location
        .toLowerCase()
        .includes(criteria.location.toLowerCase()) ||
      criteria.location.toLowerCase().includes(
        resource.location.toLowerCase(),
      );
    if (locMatch) {
      score += 15;
      matchReasons.push(`Located at ${resource.location}`);
    } else if (criteria.location) {
      missingReasons.push(`Located at ${resource.location}, not near ${criteria.location}`);
    }
  }

  // --- Capacity match (weight: 15) ---
  if (criteria.quantity && resource.capacity != null) {
    if (resource.capacity >= criteria.quantity) {
      score += 15;
      matchReasons.push(`Capacity ${resource.capacity} meets your need for ${criteria.quantity}`);
    } else {
      missingReasons.push(
        `Capacity ${resource.capacity} is below your requested ${criteria.quantity}`,
      );
    }
  }

  // --- Lifecycle state (weight: 25 for available, 10 for reserved, 0 otherwise) ---
  const lifecycle = computeLifecycleState(resource, bookings);
  if (lifecycle === "available") {
    score += 25;
    matchReasons.push("Currently available");
  } else if (lifecycle === "reserved") {
    score += 10;
    matchReasons.push("Has existing bookings but may still be available");
  } else {
    missingReasons.push(`Lifecycle state: ${lifecycleLabel(lifecycle)}`);
  }

  // --- Eligibility check ---
  if (borrower) {
    const missing = getEligibilityMissingReasons(resource, borrower);
    if (missing.length === 0) {
      score += 20;
      matchReasons.push("You are eligible to borrow this resource");
    } else {
      missingReasons.push(...missing);
    }
  }

  // --- Availability check ---
  if (criteria.startTime && criteria.endTime) {
    const available = isTimeRangeAvailable(bookings, criteria.startTime, criteria.endTime);
    if (available) {
      score += 20;
      matchReasons.push("Available for your requested time");
    } else {
      missingReasons.push(
        ...getBookingConflictReasons(resource, bookings, criteria.startTime, criteria.endTime),
      );
    }
  }

  return { score, matchReasons, missingReasons };
}

/**
 * Run the matchmaker: score all resources and return ranked results.
 *
 * @param resources - All resources
 * @param bookings - All bookings (for conflict detection)
 * @param borrower - Borrower profile (null = skip eligibility)
 * @param criteria - Search criteria
 * @returns Ranked match results
 */
export function matchResources(
  resources: Resource[],
  bookings: Booking[],
  borrower: Profile | null,
  criteria: MatchmakerCriteria,
): MatchResult[] {
  const results: MatchResult[] = [];

  for (const resource of resources) {
    // Filter bookings for this specific resource only
    const resourceBookings = bookings.filter(
      (b) => b.resource_id === resource.id,
    );

    const { score, matchReasons, missingReasons } = scoreResource(
      resource,
      criteria,
      borrower,
      resourceBookings,
    );

    const lifecycleState = computeLifecycleState(resource, resourceBookings);
    const isBookable = isLifecycleBookable(lifecycleState);

    // Check full bookability if borrower and times are provided
    let fullBookable = isBookable;
    let fullMissing: string[] = [];

    if (borrower && criteria.startTime && criteria.endTime) {
      const check = checkResourceBookable(
        resource,
        borrower,
        resourceBookings,
        criteria.startTime,
        criteria.endTime,
      );
      fullBookable = check.bookable;
      fullMissing = check.reasons;
    }

    results.push({
      resource,
      score,
      lifecycleState,
      isBookable: fullBookable,
      reasons: fullMissing.length > 0 ? fullMissing : missingReasons,
      matchReasons,
      missingReasons: fullMissing.length > 0 ? fullMissing : missingReasons,
    });
  }

  // Sort by score descending, then by name for stable ordering
  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (a.resource.name || "").localeCompare(b.resource.name || "");
  });

  // Apply limit
  const limit = criteria.limit ?? 50;
  return results.slice(0, limit);
}

/**
 * Filter results to only bookable resources.
 */
export function filterBookable(results: MatchResult[]): MatchResult[] {
  return results.filter((r) => r.isBookable);
}

/**
 * Filter results to only non-bookable resources (for "why not available" display).
 */
export function filterUnavailable(results: MatchResult[]): MatchResult[] {
  return results.filter((r) => !r.isBookable);
}
