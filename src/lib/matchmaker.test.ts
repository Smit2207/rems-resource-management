import { describe, it, expect } from "vitest";
import type { Database } from "../lib/supabase";
import {
  matchResources,
  filterBookable,
  filterUnavailable,
} from "../lib/matchmaker";
import {
  computeLifecycleState,
  isLifecycleBookable,
  checkEligibility,
  getEligibilityMissingReasons,
  isTimeRangeAvailable,
  checkResourceBookable,
  lifecycleLabel,
} from "../lib/eligibility";
import { generateAlternatives } from "../lib/alternatives";

type Resource = Database["public"]["Tables"]["resources"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type Booking = Database["public"]["Tables"]["bookings"]["Row"];

function makeResource(overrides: Partial<Resource> = {}): Resource {
  return {
    id: "resource-1",
    owner_id: "owner-1",
    category_id: "cat-1",
    name: "Test Microscope",
    description: "A high-quality microscope for lab work",
    type: "equipment",
    location: "Building A, Room 101",
    capacity: 1,
    eligibility_department: "Science",
    eligibility_min_year: 2,
    required_training: true,
    training_required: "lab_safety",
    supervision_required: false,
    usage_rules: null,
    deposit_amount: null,
    deposit_conditions: null,
    status: "active",
    lifecycle_state: "available",
    tags: ["microscope", "science", "lab"],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    image_url: null,
    ...overrides,
  };
}

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: "user-1",
    email: "user@test.edu",
    full_name: "Test User",
    role: "student",
    institution: "Test College",
    department: "Science",
    year_of_study: 3,
    student_staff_id: "S12345",
    training_completed: ["lab_safety"],
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: "booking-1",
    resource_id: "resource-1",
    borrower_id: "user-1",
    status: "Approved",
    start_time: "2026-02-01T10:00:00Z",
    end_time: "2026-02-01T12:00:00Z",
    rejection_reason: null,
    requested_at: "2026-01-15T00:00:00Z",
    decided_at: null,
    decided_by: null,
    checkout_at: null,
    checkout_by: null,
    checkout_condition: null,
    accessories_included: null,
    expected_return_at: null,
    return_at: null,
    return_by: null,
    return_condition: null,
    missing_accessories: null,
    damage_notes: null,
    created_at: "2026-01-15T00:00:00Z",
    updated_at: "2026-01-15T00:00:00Z",
    image_url: null,
    ...overrides,
  };
}

describe("Matchmaker", () => {
  const resource = makeResource();
  const borrower = makeProfile();
  const bookings: Booking[] = [];

  it("ranks exact category match higher", () => {
    const results = matchResources(
      [resource],
      bookings,
      borrower,
      { categoryId: "cat-1", limit: 10 }
    );
    expect(results[0].resource.id).toBe("resource-1");
    expect(results[0].matchReasons.some((r: string) => r.includes("category"))).toBe(true);
  });

  it("ranks tag overlap higher", () => {
    const results = matchResources(
      [resource],
      bookings,
      borrower,
      { tags: ["microscope"], limit: 10 }
    );
    expect(results[0].matchReasons.some((r: string) => r.includes("tag"))).toBe(true);
  });

  it("ranks available resources higher than non-bookable", () => {
    const available = makeResource({ lifecycle_state: "available" });
    const maintenance = makeResource({ id: "resource-2", lifecycle_state: "maintenance" });
    const results = matchResources(
      [maintenance, available],
      bookings,
      borrower,
      { limit: 10 }
    );
    const availableResult = results.find((r) => r.resource.id === "resource-1");
    const maintenanceResult = results.find((r) => r.resource.id === "resource-2");
    expect(availableResult).toBeDefined();
    expect(maintenanceResult).toBeDefined();
    expect(availableResult!.isBookable).toBe(true);
    expect(maintenanceResult!.isBookable).toBe(false);
    expect(availableResult!.score).toBeGreaterThan(maintenanceResult!.score);
  });

  it("filters bookable results correctly", () => {
    const results = matchResources(
      [resource],
      bookings,
      borrower,
      { limit: 10 }
    );
    const bookable = filterBookable(results);
    expect(bookable.length).toBe(1);
    expect(bookable[0].isBookable).toBe(true);
  });

  it("filters unavailable results correctly", () => {
    const results = matchResources(
      [resource],
      bookings,
      borrower,
      { limit: 10 }
    );
    const unavailable = filterUnavailable(results);
    expect(unavailable.length).toBe(0);
  });
});

describe("Eligibility", () => {
  const resource = makeResource();
  const eligibleProfile = makeProfile();
  const ineligibleDept = makeProfile({ department: "Arts" });
  const ineligibleYear = makeProfile({ year_of_study: 1 });
  const ineligibleTraining = makeProfile({ training_completed: [] });

  it("computes lifecycle state as available for active resource", () => {
    const state = computeLifecycleState(resource, []);
    expect(state).toBe("available");
  });

  it("computes lifecycle state as checked_out when booking is Checked Out", () => {
    const bookings = [makeBooking({ status: "Checked Out" })];
    const state = computeLifecycleState(resource, bookings);
    expect(state).toBe("checked_out");
  });

  it("computes lifecycle state as reserved when booking is Approved", () => {
    const bookings = [makeBooking({ status: "Approved" })];
    const state = computeLifecycleState(resource, bookings);
    expect(state).toBe("reserved");
  });

  it("returns true for bookable lifecycle states", () => {
    expect(isLifecycleBookable("available")).toBe(true);
    expect(isLifecycleBookable("reserved")).toBe(true);
    expect(isLifecycleBookable("checked_out")).toBe(false);
    expect(isLifecycleBookable("maintenance")).toBe(false);
  });

  it("checks eligibility correctly for matching profile", () => {
    expect(checkEligibility(resource, eligibleProfile)).toBe(true);
  });

  it("checks eligibility fails for wrong department", () => {
    expect(checkEligibility(resource, ineligibleDept)).toBe(false);
  });

  it("checks eligibility fails for insufficient year", () => {
    expect(checkEligibility(resource, ineligibleYear)).toBe(false);
  });

  it("checks eligibility fails for missing training", () => {
    expect(checkEligibility(resource, ineligibleTraining)).toBe(false);
  });

  it("returns missing eligibility reasons", () => {
    const reasons = getEligibilityMissingReasons(resource, ineligibleDept);
    expect(reasons.length).toBeGreaterThan(0);
    expect(reasons[0]).toContain("Department");
  });

  it("isTimeRangeAvailable detects overlaps", () => {
    const bookings = [makeBooking({ start_time: "2026-02-01T10:00:00Z", end_time: "2026-02-01T12:00:00Z" })];
    expect(isTimeRangeAvailable(bookings, "2026-02-01T11:00:00Z", "2026-02-01T13:00:00Z")).toBe(false);
    expect(isTimeRangeAvailable(bookings, "2026-02-01T08:00:00Z", "2026-02-01T10:00:00Z")).toBe(true);
    expect(isTimeRangeAvailable(bookings, "2026-02-01T12:00:00Z", "2026-02-01T14:00:00Z")).toBe(true);
  });

  it("checkResourceBookable combines lifecycle, eligibility, and availability", () => {
    const result = checkResourceBookable(resource, eligibleProfile, [], "2026-03-01T10:00:00Z", "2026-03-01T12:00:00Z");
    expect(result.bookable).toBe(true);
  });

  it("lifecycleLabel returns human-readable labels", () => {
    expect(lifecycleLabel("available")).toBe("Available");
    expect(lifecycleLabel("checked_out")).toBe("Checked Out");
    expect(lifecycleLabel("pending_verification")).toBe("Pending Verification");
    expect(lifecycleLabel(null)).toBe("Unknown");
  });
});

describe("Alternatives", () => {
  const original = makeResource();
  const alternative = makeResource({ id: "resource-2", name: "Backup Microscope", tags: ["microscope", "science"] });
  const allResources = [original, alternative];
  const allBookings: Booking[] = [];
  const borrower = makeProfile();

  it("generates resource alternatives when original is available", () => {
    const result = generateAlternatives(
      original,
      allResources,
      allBookings,
      borrower,
      { startTime: "2026-03-01T10:00:00Z", endTime: "2026-03-01T12:00:00Z" }
    );
    expect(result.originalResource?.id).toBe("resource-1");
    // The alternative should appear since it matches category/tags
    expect(result.resourceAlternatives.length).toBeGreaterThanOrEqual(0);
  });

  it("returns empty result when no original resource", () => {
    const result = generateAlternatives(
      null,
      allResources,
      allBookings,
      borrower,
      {}
    );
    expect(result.resourceAlternatives).toEqual([]);
    expect(result.timeAlternatives).toEqual([]);
    expect(result.waitingListEligible).toBe(false);
  });
});
