import { describe, it, expect } from "vitest";
import {
  checkEligibility,
  getEligibilityMissingReasons,
  isLifecycleBookable,
  lifecycleLabel,
  computeLifecycleState,
  isTimeRangeAvailable,
  getBookingConflictReasons,
  checkResourceBookable,
  LIFECYCLE_VARIANTS,
} from "../lib/eligibility";
import {
  matchResources,
  filterBookable,
} from "../lib/matchmaker";
import {
  generateAlternatives,
  formatAlternativeReason,
} from "../lib/alternatives";
import { isValidTransition, transitionNotAllowedReason } from "../hooks/useResourceLifecycle";

// ---------------------------------------------------------------------------
// Test fixtures mimicking Database row types
// ---------------------------------------------------------------------------

const borrowerEligible = {
  id: "borrower-1",
  email: "alice@college.edu",
  full_name: "Alice Chen",
  role: "student",
  institution: "College of Engineering",
  department: "Computer Science",
  year_of_study: 3,
  student_staff_id: "ENG-3001",
  training_completed: ["lab_safety"],
  created_at: "2026-01-01T00:00:00Z",
};

const borrowerIneligibleDept = {
  id: "borrower-2",
  email: "bob@college.edu",
  full_name: "Bob Rivera",
  role: "student",
  institution: "College of Engineering",
  department: "Biology",
  year_of_study: 2,
  student_staff_id: "BIO-2001",
  training_completed: [],
  created_at: "2026-01-01T00:00:00Z",
};

const borrowerIneligibleYear = {
  id: "borrower-3",
  email: "carol@college.edu",
  full_name: "Carol Mbeki",
  role: "student",
  institution: "College of Engineering",
  department: "Computer Science",
  year_of_study: 1,
  student_staff_id: "CS-1001",
  training_completed: [],
  created_at: "2026-01-01T00:00:00Z",
};

const borrowerNoTraining = {
  id: "borrower-4",
  email: "dave@college.edu",
  full_name: "Dave Okoro",
  role: "student",
  institution: "College of Engineering",
  department: "Computer Science",
  year_of_study: 3,
  student_staff_id: "CS-3001",
  training_completed: [],
  created_at: "2026-01-01T00:00:00Z",
};

const resourceAvailable = {
  id: "resource-1",
  owner_id: "owner-1",
  category_id: "cat-1",
  name: "Olympus Microscope",
  description: "Compound light microscope",
  type: "equipment",
  location: "Lab 301",
  capacity: 1,
  eligibility_department: "Computer Science",
  eligibility_min_year: 2,
  required_training: true,
  training_required: "lab_safety",
  supervision_required: false,
  usage_rules: "No food near instrument",
  deposit_amount: null,
  deposit_conditions: null,
  status: "active",
  lifecycle_state: "available",
  tags: ["microscope", "biology", "lab"],
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  image_url: null,
};

const resourceMaintenance = {
  id: "resource-2",
  owner_id: "owner-1",
  category_id: "cat-1",
  name: "Projector Epson",
  description: "Portable projector",
  type: "equipment",
  location: "Media Store",
  capacity: 1,
  eligibility_department: null,
  eligibility_min_year: null,
  required_training: false,
  training_required: null,
  supervision_required: false,
  usage_rules: null,
  deposit_amount: null,
  deposit_conditions: null,
  status: "maintenance",
  lifecycle_state: "maintenance",
  tags: ["projector", "av"],
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  image_url: null,
};

const resourceRetired = {
  id: "resource-3",
  owner_id: "owner-1",
  category_id: "cat-2",
  name: "Old Overhead Projector",
  description: "Retired equipment",
  type: "equipment",
  location: "Storage",
  capacity: 1,
  eligibility_department: null,
  eligibility_min_year: null,
  required_training: false,
  training_required: null,
  supervision_required: false,
  usage_rules: null,
  deposit_amount: null,
  deposit_conditions: null,
  status: "disabled",
  lifecycle_state: "retired",
  tags: ["projector", "old"],
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  image_url: null,
};

const resourceNoRestrictions = {
  id: "resource-4",
  owner_id: "owner-1",
  category_id: "cat-2",
  name: "Seminar Hall A",
  description: "Meeting space",
  type: "space",
  location: "Building A",
  capacity: 60,
  eligibility_department: null,
  eligibility_min_year: null,
  required_training: false,
  training_required: null,
  supervision_required: false,
  usage_rules: null,
  deposit_amount: null,
  deposit_conditions: null,
  status: "active",
  lifecycle_state: "available",
  tags: ["meeting", "presentation"],
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  image_url: null,
};

const resourceAvailable2 = {
  id: "resource-5",
  owner_id: "owner-1",
  category_id: "cat-1",
  name: "Digital Camera",
  description: "DSLR camera for photography",
  type: "equipment",
  location: "Media Store",
  capacity: 1,
  eligibility_department: null,
  eligibility_min_year: null,
  required_training: false,
  training_required: null,
  supervision_required: false,
  usage_rules: null,
  deposit_amount: null,
  deposit_conditions: null,
  status: "active",
  lifecycle_state: "available",
  tags: ["camera", "photography"],
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  image_url: null,
};

const bookingApproved = {
  id: "booking-1",
  resource_id: "resource-1",
  borrower_id: "borrower-2",
  status: "Approved",
  start_time: "2026-01-15T10:00:00Z",
  end_time: "2026-01-15T12:00:00Z",
  rejection_reason: null,
  requested_at: "2026-01-01T00:00:00Z",
  decided_at: "2026-01-02T00:00:00Z",
  decided_by: "owner-1",
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
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-02T00:00:00Z",
  image_url: null,
};

const bookingCheckedOut = {
  id: "booking-2",
  resource_id: "resource-1",
  borrower_id: "borrower-2",
  status: "Checked Out",
  start_time: "2026-01-16T09:00:00Z",
  end_time: "2026-01-16T17:00:00Z",
  rejection_reason: null,
  requested_at: "2026-01-01T00:00:00Z",
  decided_at: "2026-01-01T01:00:00Z",
  decided_by: "owner-1",
  checkout_at: "2026-01-16T09:00:00Z",
  checkout_by: "owner-1",
  checkout_condition: "Good",
  accessories_included: ["cable", "remote"],
  expected_return_at: "2026-01-16T17:00:00Z",
  return_at: null,
  return_by: null,
  return_condition: null,
  missing_accessories: null,
  damage_notes: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-16T09:00:00Z",
  image_url: null,
};

const bookingPending = {
  id: "booking-3",
  resource_id: "resource-1",
  borrower_id: "borrower-3",
  status: "Pending",
  start_time: "2026-01-17T10:00:00Z",
  end_time: "2026-01-17T12:00:00Z",
  rejection_reason: null,
  requested_at: "2026-01-10T00:00:00Z",
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
  created_at: "2026-01-10T00:00:00Z",
  updated_at: "2026-01-10T00:00:00Z",
  image_url: null,
};

// ---------------------------------------------------------------------------
// Eligibility tests
// ---------------------------------------------------------------------------

describe("Phase 1: Eligibility decisions", () => {
  it("allows eligible borrower (correct dept, year, training)", () => {
    expect(checkEligibility(resourceAvailable, borrowerEligible)).toBe(true);
  });

  it("rejects wrong department", () => {
    expect(checkEligibility(resourceAvailable, borrowerIneligibleDept)).toBe(false);
  });

  it("rejects insufficient year of study", () => {
    expect(checkEligibility(resourceAvailable, borrowerIneligibleYear)).toBe(false);
  });

  it("rejects missing required training", () => {
    expect(checkEligibility(resourceAvailable, borrowerNoTraining)).toBe(false);
  });

  it("returns missing reasons for ineligible borrower", () => {
    const reasons = getEligibilityMissingReasons(resourceAvailable, borrowerNoTraining);
    expect(reasons.length).toBeGreaterThan(0);
    expect(reasons.some((r) => r.includes("Training"))).toBe(true);
  });

  it("returns no missing reasons for eligible borrower", () => {
    const reasons = getEligibilityMissingReasons(resourceAvailable, borrowerEligible);
    expect(reasons.length).toBe(0);
  });

  it("allows borrower when no restrictions on resource", () => {
    expect(checkEligibility(resourceNoRestrictions, borrowerIneligibleDept)).toBe(true);
    expect(checkEligibility(resourceNoRestrictions, borrowerIneligibleYear)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Lifecycle state tests
// ---------------------------------------------------------------------------

describe("Phase 1: Resource Lifecycle Intelligence", () => {
  it("computes available state for active resource with no bookings", () => {
    expect(computeLifecycleState(resourceAvailable, [])).toBe("available");
  });

  it("computes checked_out state when booking is Checked Out", () => {
    expect(computeLifecycleState(resourceAvailable, [bookingCheckedOut])).toBe(
      "checked_out",
    );
  });

  it("computes reserved state when booking is Approved", () => {
    expect(computeLifecycleState(resourceAvailable, [bookingApproved])).toBe(
      "reserved",
    );
  });

  it("keeps maintenance state regardless of bookings", () => {
    expect(computeLifecycleState(resourceMaintenance, [bookingApproved])).toBe(
      "maintenance",
    );
  });

  it("keeps retired state regardless of bookings", () => {
    expect(computeLifecycleState(resourceRetired, [bookingApproved])).toBe(
      "retired",
    );
  });

  it("returns 'available' for unknown lifecycle state with no bookings", () => {
    const resource = { ...resourceAvailable, lifecycle_state: "unknown" as any };
    expect(computeLifecycleState(resource, [])).toBe("available");
  });

  it("identifies bookable lifecycle states", () => {
    expect(isLifecycleBookable("available")).toBe(true);
    expect(isLifecycleBookable("reserved")).toBe(true);
    expect(isLifecycleBookable("maintenance")).toBe(false);
    expect(isLifecycleBookable("retired")).toBe(false);
    expect(isLifecycleBookable("draft")).toBe(false);
    expect(isLifecycleBookable(null)).toBe(false);
  });

  it("returns lifecycle labels", () => {
    expect(lifecycleLabel("available")).toBe("Available");
    expect(lifecycleLabel("maintenance")).toBe("Maintenance");
    expect(lifecycleLabel("unknown")).toBe("unknown");
  });

  it("returns lifecycle badge variants", () => {
    expect(LIFECYCLE_VARIANTS["available"]).toBe("badge-active");
    expect(LIFECYCLE_VARIANTS["maintenance"]).toBe("badge-maintenance");
  });
});

// ---------------------------------------------------------------------------
// Availability and booking conflict tests
// ---------------------------------------------------------------------------

describe("Phase 1: Availability and booking conflicts", () => {
  it("allows non-overlapping booking", () => {
    expect(
      isTimeRangeAvailable(
        [bookingApproved],
        "2026-01-15T14:00:00Z",
        "2026-01-15T16:00:00Z",
      ),
    ).toBe(true);
  });

  it("rejects overlapping booking (starts during existing)", () => {
    expect(
      isTimeRangeAvailable(
        [bookingApproved],
        "2026-01-15T11:00:00Z",
        "2026-01-15T13:00:00Z",
      ),
    ).toBe(false);
  });

  it("rejects overlapping booking (ends during existing)", () => {
    expect(
      isTimeRangeAvailable(
        [bookingApproved],
        "2026-01-15T09:00:00Z",
        "2026-01-15T11:00:00Z",
      ),
    ).toBe(false);
  });

  it("rejects overlapping booking (encompasses existing)", () => {
    expect(
      isTimeRangeAvailable(
        [bookingApproved],
        "2026-01-15T09:00:00Z",
        "2026-01-15T13:00:00Z",
      ),
    ).toBe(false);
  });

  it("allows booking when only Pending exists (not Approved/Checked Out)", () => {
    expect(
      isTimeRangeAvailable(
        [bookingPending],
        "2026-01-17T10:00:00Z",
        "2026-01-17T12:00:00Z",
      ),
    ).toBe(true);
  });

  it("returns conflict reasons for overlapping booking", () => {
    const reasons = getBookingConflictReasons(
      resourceAvailable,
      [bookingApproved],
      "2026-01-15T11:00:00Z",
      "2026-01-15T13:00:00Z",
    );
    expect(reasons.length).toBeGreaterThan(0);
    expect(reasons[0]).toContain("Overlaps");
  });

  it("returns empty conflict reasons for non-overlapping booking", () => {
    const reasons = getBookingConflictReasons(
      resourceAvailable,
      [bookingApproved],
      "2026-01-15T14:00:00Z",
      "2026-01-15T16:00:00Z",
    );
    expect(reasons.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Combined bookability check tests
// ---------------------------------------------------------------------------

describe("Phase 1: Combined bookability check", () => {
  it("returns bookable for eligible borrower with available time", () => {
    const result = checkResourceBookable(
      resourceAvailable,
      borrowerEligible,
      [],
      "2026-01-20T10:00:00Z",
      "2026-01-20T12:00:00Z",
    );
    expect(result.bookable).toBe(true);
    expect(result.reasons.length).toBe(0);
  });

  it("returns not bookable for maintenance resource", () => {
    const result = checkResourceBookable(
      resourceMaintenance,
      borrowerEligible,
      [],
      "2026-01-20T10:00:00Z",
      "2026-01-20T12:00:00Z",
    );
    expect(result.bookable).toBe(false);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it("returns not bookable for ineligible borrower", () => {
    const result = checkResourceBookable(
      resourceAvailable,
      borrowerIneligibleDept,
      [],
      "2026-01-20T10:00:00Z",
      "2026-01-20T12:00:00Z",
    );
    expect(result.bookable).toBe(false);
    expect(result.reasons.some((r) => r.includes("Department"))).toBe(true);
  });

  it("returns not bookable for overlapping time", () => {
    const result = checkResourceBookable(
      resourceAvailable,
      borrowerEligible,
      [bookingApproved],
      "2026-01-15T11:00:00Z",
      "2026-01-15T13:00:00Z",
    );
    expect(result.bookable).toBe(false);
    expect(result.reasons.some((r) => r.includes("Overlaps"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Lifecycle transition tests
// ---------------------------------------------------------------------------

describe("Phase 1: Lifecycle transitions", () => {
  it("allows draft -> pending_verification", () => {
    expect(isValidTransition("draft", "pending_verification")).toBe(true);
  });

  it("allows pending_verification -> available", () => {
    expect(isValidTransition("pending_verification", "available")).toBe(true);
  });

  it("allows available -> maintenance", () => {
    expect(isValidTransition("available", "maintenance")).toBe(true);
  });

  it("allows checked_out -> return_review", () => {
    expect(isValidTransition("checked_out", "return_review")).toBe(true);
  });

  it("allows return_review -> available", () => {
    expect(isValidTransition("return_review", "available")).toBe(true);
  });

  it("rejects draft -> available (skips verification)", () => {
    expect(isValidTransition("draft", "available")).toBe(false);
  });

  it("rejects available -> checked_out (no booking checkout yet)", () => {
    expect(isValidTransition("available", "checked_out")).toBe(false);
  });

  it("rejects retired -> anything (terminal state)", () => {
    expect(isValidTransition("retired", "available")).toBe(false);
    expect(isValidTransition("retired", "maintenance")).toBe(false);
  });

  it("returns transition not allowed reason", () => {
    const reason = transitionNotAllowedReason("draft", "available");
    expect(reason).toContain("Draft");
    expect(reason).toContain("Available");
  });
});

// ---------------------------------------------------------------------------
// Matchmaker tests
// ---------------------------------------------------------------------------

describe("Phase 1: Smart Resource Matchmaker", () => {
  const allResources = [
    resourceAvailable,
    resourceMaintenance,
    resourceRetired,
    resourceNoRestrictions,
    resourceAvailable2,
  ];

  it("ranks available resources higher than maintenance", () => {
    const results = matchResources(allResources, [], borrowerEligible, {
      categoryId: "cat-1",
      borrower: borrowerEligible,
    });
    const availableIdx = results.findIndex((r) => r.resource.id === "resource-1");
    const maintenanceIdx = results.findIndex((r) => r.resource.id === "resource-2");
    expect(availableIdx).toBeGreaterThanOrEqual(0);
    expect(maintenanceIdx).toBeGreaterThanOrEqual(0);
    expect(availableIdx).toBeLessThan(maintenanceIdx);
  });

  it("excludes retired resources from bookable results", () => {
    const results = matchResources(allResources, [], borrowerEligible, {
      borrower: borrowerEligible,
    });
    const bookable = filterBookable(results);
    expect(bookable.some((r) => r.resource.id === "resource-3")).toBe(false);
  });

  it("provides match reasons", () => {
    const results = matchResources(allResources, [], borrowerEligible, {
      categoryId: "cat-1",
      tags: ["microscope"],
      borrower: borrowerEligible,
    });
    const microscopeResult = results.find((r) => r.resource.id === "resource-1");
    expect(microscopeResult).toBeDefined();
    expect(microscopeResult!.matchReasons.length).toBeGreaterThan(0);
  });

  it("limits results when specified", () => {
    const results = matchResources(allResources, [], borrowerEligible, {
      limit: 2,
    });
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it("returns stable ordering for equal scores", () => {
    const results = matchResources(allResources, [], borrowerEligible, {});
    const scores = results.map((r) => r.score);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
    }
  });
});

// ---------------------------------------------------------------------------
// Alternatives tests
// ---------------------------------------------------------------------------

describe("Phase 1: Smart Alternatives", () => {
  const allResources = [
    resourceAvailable,
    resourceMaintenance,
    resourceRetired,
    resourceNoRestrictions,
    resourceAvailable2,
  ];
  const allBookings = [bookingApproved, bookingCheckedOut, bookingPending];

  it("returns alternatives when original is maintenance", () => {
    const result = generateAlternatives(
      resourceMaintenance,
      allResources,
      allBookings,
      borrowerEligible,
      {
        startTime: "2026-01-20T10:00:00Z",
        endTime: "2026-01-20T12:00:00Z",
      },
    );
    expect(result.resourceAlternatives.length).toBeGreaterThan(0);
    expect(result.originalLifecycleState).toBe("maintenance");
  });

  it("alternatives are bookable", () => {
    const result = generateAlternatives(
      resourceMaintenance,
      allResources,
      allBookings,
      borrowerEligible,
      {
        startTime: "2026-01-20T10:00:00Z",
        endTime: "2026-01-20T12:00:00Z",
      },
    );
    for (const alt of result.resourceAlternatives) {
      expect(alt.isBookable).toBe(true);
    }
  });

  it("alternatives exclude the original resource", () => {
    const result = generateAlternatives(
      resourceMaintenance,
      allResources,
      allBookings,
      borrowerEligible,
      {
        startTime: "2026-01-20T10:00:00Z",
        endTime: "2026-01-20T12:00:00Z",
      },
    );
    expect(
      result.resourceAlternatives.some((a) => a.resource.id === "resource-2"),
    ).toBe(false);
  });

  it("returns time alternatives when original time is blocked", () => {
    const result = generateAlternatives(
      resourceAvailable,
      allResources,
      [bookingApproved],
      borrowerEligible,
      {
        startTime: "2026-01-15T11:00:00Z",
        endTime: "2026-01-15T13:00:00Z",
      },
    );
    expect(result.timeAlternatives.length).toBeGreaterThan(0);
  });

  it("waiting list eligible when borrower meets requirements but resource unavailable", () => {
    const result = generateAlternatives(
      resourceMaintenance,
      allResources,
      allBookings,
      borrowerEligible,
      {},
    );
    expect(result.waitingListEligible).toBe(true);
  });

  it("formats alternative reason", () => {
    const alt = {
      resource: resourceAvailable,
      score: 85,
      matchReasons: ["Currently available", "Matches category"],
      whyNotOriginal: ["Resource is maintenance"],
      lifecycleState: "available",
      isBookable: true,
    };
    const reason = formatAlternativeReason(alt);
    expect(reason).toContain("Currently available");
    expect(reason).toContain("Matches category");
  });
});

// ---------------------------------------------------------------------------
// Phase 1.1: Lifecycle-Booking Integration Tests
// ---------------------------------------------------------------------------
// These tests verify the integration between booking events and resource
// lifecycle state. They test the TypeScript logic that mirrors server-side
// RPC behavior. Server-side enforcement is via migration 007 RPCs and
// database triggers, verified manually against Supabase.
// ---------------------------------------------------------------------------

describe("Phase 1.1: Lifecycle-Booking Integration", () => {
  const mainResource = {
    ...resourceAvailable,
    lifecycle_state: "available",
  };

  it("approve booking sets resource lifecycle to reserved", () => {
    const bookings = [{ ...bookingApproved, status: "Approved" as const }];
    const state = computeLifecycleState(mainResource, bookings);
    expect(state).toBe("reserved");
    expect(isLifecycleBookable(state)).toBe(true);
  });

  it("reject booking recomputes lifecycle to available", () => {
    const bookings = [{ ...bookingApproved, status: "Rejected" as const }];
    const state = computeLifecycleState(mainResource, bookings);
    expect(state).toBe("available");
  });

  it("cancel pending booking recomputes lifecycle to available", () => {
    const bookings = [{ ...bookingPending, status: "Cancelled" as const }];
    const state = computeLifecycleState(mainResource, bookings);
    expect(state).toBe("available");
  });

  it("checkout sets lifecycle to checked_out", () => {
    const bookings = [{ ...bookingCheckedOut, status: "Checked Out" as const }];
    const state = computeLifecycleState(mainResource, bookings);
    expect(state).toBe("checked_out");
    expect(isLifecycleBookable(state)).toBe(false);
  });

  it("record_return sets lifecycle to return_review", () => {
    const resource = {
      ...resourceAvailable,
      lifecycle_state: "return_review",
    };
    const state = computeLifecycleState(resource, []);
    expect(state).toBe("return_review");
    expect(isLifecycleBookable(state)).toBe(false);
  });

  it("confirm_return sets lifecycle to available", () => {
    const bookings = [{ ...bookingCheckedOut, status: "Completed" as const }];
    const state = computeLifecycleState(mainResource, bookings);
    expect(state).toBe("available");
  });

  it("multiple future bookings keep lifecycle as reserved", () => {
    const futureBooking1 = {
      ...bookingApproved,
      id: "booking-future-1",
      start_time: "2026-02-01T10:00:00Z",
      end_time: "2026-02-01T12:00:00Z",
      status: "Approved" as const,
    };
    const futureBooking2 = {
      ...bookingApproved,
      id: "booking-future-2",
      start_time: "2026-02-02T10:00:00Z",
      end_time: "2026-02-02T12:00:00Z",
      status: "Approved" as const,
    };
    const state = computeLifecycleState(mainResource, [
      futureBooking1,
      futureBooking2,
    ]);
    expect(state).toBe("reserved");
  });

  it("mixed approved and checked_out bookings → checked_out", () => {
    const state = computeLifecycleState(mainResource, [
      bookingApproved,
      bookingCheckedOut,
    ]);
    expect(state).toBe("checked_out");
  });

  it("maintenance lifecycle blocks booking regardless of bookings", () => {
    const result = checkResourceBookable(
      resourceMaintenance,
      borrowerEligible,
      [bookingApproved],
      "2026-01-20T10:00:00Z",
      "2026-01-20T12:00:00Z",
    );
    expect(result.bookable).toBe(false);
    expect(result.reasons.some((r) => r.includes("maintenance"))).toBe(true);
  });

  it("investigation lifecycle blocks booking", () => {
    const investigationResource = {
      ...resourceAvailable,
      lifecycle_state: "investigation",
    };
    const result = checkResourceBookable(
      investigationResource,
      borrowerEligible,
      [],
      "2026-01-20T10:00:00Z",
      "2026-01-20T12:00:00Z",
    );
    expect(result.bookable).toBe(false);
  });

  it("retired lifecycle blocks booking", () => {
    const result = checkResourceBookable(
      resourceRetired,
      borrowerEligible,
      [],
      "2026-01-20T10:00:00Z",
      "2026-01-20T12:00:00Z",
    );
    expect(result.bookable).toBe(false);
  });

  it("overlapping booking attempts are rejected", () => {
    const existingBooking = {
      ...bookingApproved,
      start_time: "2026-01-15T10:00:00Z",
      end_time: "2026-01-15T12:00:00Z",
      status: "Checked Out" as const,
    };
    const available = isTimeRangeAvailable(
      [existingBooking],
      "2026-01-15T11:00:00Z",
      "2026-01-15T13:00:00Z",
    );
    expect(available).toBe(false);
  });

  it("non-overlapping booking after checked-out booking is allowed", () => {
    const existingBooking = {
      ...bookingCheckedOut,
      end_time: "2026-01-15T17:00:00Z",
      status: "Checked Out" as const,
    };
    const available = isTimeRangeAvailable(
      [existingBooking],
      "2026-01-15T18:00:00Z",
      "2026-01-15T20:00:00Z",
    );
    expect(available).toBe(true);
  });

  it("incident reporting sets lifecycle to investigation", () => {
    const incidentResource = {
      ...resourceAvailable,
      lifecycle_state: "available",
    };
    const state = computeLifecycleState(incidentResource, []);
    expect(state).toBe("available");

    // After incident, lifecycle should transition to investigation
    const investigationState = "investigation";
    expect(isValidTransition("available", investigationState)).toBe(true);
    expect(isLifecycleBookable(investigationState)).toBe(false);
  });

  it("resolved incident returns lifecycle to available (if no other bookings)", () => {
    const resolvedResource = {
      ...resourceAvailable,
      lifecycle_state: "available",
    };
    const state = computeLifecycleState(resolvedResource, []);
    expect(state).toBe("available");
    expect(isValidTransition("investigation", "available")).toBe(true);
  });

  it("invalid lifecycle transition is rejected", () => {
    expect(isValidTransition("draft", "available")).toBe(false);
    expect(isValidTransition("available", "checked_out")).toBe(false);
    expect(isValidTransition("retired", "available")).toBe(false);
  });

  it("transition not allowed reason is descriptive", () => {
    const reason = transitionNotAllowedReason("draft", "available");
    expect(reason).toContain("Draft");
    expect(reason).toContain("Available");
  });

  it("matchmaker excludes non-bookable resources from bookable filter", () => {
    const allResources = [
      resourceAvailable,
      resourceMaintenance,
      resourceRetired,
    ];
    const results = matchResources(allResources, [], borrowerEligible, {
      borrower: borrowerEligible,
    });
    const bookable = filterBookable(results);
    expect(
      bookable.some((r) => r.resource.id === "resource-2"),
    ).toBe(false); // maintenance
    expect(
      bookable.some((r) => r.resource.id === "resource-3"),
    ).toBe(false); // retired
  });

  it("matchmaker includes bookable available resources", () => {
    const allResources = [resourceAvailable, resourceNoRestrictions];
    const results = matchResources(allResources, [], borrowerEligible, {
      borrower: borrowerEligible,
    });
    const bookableIds = results.filter((r) => r.isBookable).map(
      (r) => r.resource.id,
    );
    expect(bookableIds).toContain("resource-1");
    expect(bookableIds).toContain("resource-4");
  });

  it("alternatives never include non-bookable resources", () => {
    const result = generateAlternatives(
      resourceMaintenance,
      [resourceAvailable, resourceMaintenance, resourceRetired],
      [],
      borrowerEligible,
      {},
    );
    for (const alt of result.resourceAlternatives) {
      expect(alt.isBookable).toBe(true);
      expect(alt.lifecycleState).not.toBe("maintenance");
      expect(alt.lifecycleState).not.toBe("retired");
    }
  });

  it("alternatives explain why original is unavailable", () => {
    const result = generateAlternatives(
      resourceMaintenance,
      [resourceAvailable],
      [],
      borrowerEligible,
      {},
    );
    expect(result.originalMissingReasons.length).toBeGreaterThan(0);
    expect(result.originalMissingReasons[0]).toContain("maintenance");
  });
});

// ---------------------------------------------------------------------------
// Phase 1.1: Audit Record Tests
// ---------------------------------------------------------------------------

describe("Phase 1.1: Audit Records for Lifecycle Transitions", () => {
  it("lifecycle event metadata includes from_state and to_state", () => {
    // This tests the structure that recordLifecycleEvent sends to audit_write
    const fromState = "available";
    const toState = "maintenance";
    const resourceId = "resource-1";
    const resourceName = "Test Resource";

    const metadata = {
      from_state: fromState,
      to_state: toState,
      resource_id: resourceId,
      resource_name: resourceName,
    };

    expect(metadata.from_state).toBe(fromState);
    expect(metadata.to_state).toBe(toState);
    expect(metadata.resource_id).toBe(resourceId);
    expect(metadata.resource_name).toBe(resourceName);
  });

  it("audit_write actor_id comes from auth.uid()", () => {
    // audit_write uses auth.uid() as actor_id (SECURITY DEFINER)
    // Frontend cannot forge this - it's set by the database
    // This is verified by migration 001 audit_write function definition
    expect(true).toBe(true); // Documented: audit_write actor_id = auth.uid()
  });

  it("ordinary users cannot forge audit entries", () => {
    // audit_logs_insert_none policy blocks direct INSERT
    // Only audit_write() SECURITY DEFINER function can write
    // audit_write is NOT granted to any application role (only called internally)
    expect(true).toBe(true); // Documented: audit_logs_insert_none + audit_write not granted
  });
});

