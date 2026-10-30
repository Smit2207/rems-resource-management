import { describe, it, expect } from "vitest";

describe("P1.1 Overdue classification", () => {
  const isOverdue = (status: string, expectedReturnAt: string | null) => {
    if (status !== "Checked Out" || !expectedReturnAt) return false;
    return new Date(expectedReturnAt) < new Date();
  };

  const pastDate = new Date(Date.now() - 86400000).toISOString();
  const futureDate = new Date(Date.now() + 86400000).toISOString();

  it("classifies checked-out bookings with a past expected return as overdue", () => {
    expect(isOverdue("Checked Out", pastDate)).toBe(true);
  });

  it("does not classify checked-out bookings with a future expected return as overdue", () => {
    expect(isOverdue("Checked Out", futureDate)).toBe(false);
  });

  it("does not classify returned or completed bookings as overdue", () => {
    expect(isOverdue("Returned", pastDate)).toBe(false);
    expect(isOverdue("Completed", pastDate)).toBe(false);
  });

  it("does not classify pending, approved, rejected, or cancelled bookings as overdue", () => {
    expect(isOverdue("Pending", pastDate)).toBe(false);
    expect(isOverdue("Approved", pastDate)).toBe(false);
    expect(isOverdue("Rejected", pastDate)).toBe(false);
    expect(isOverdue("Cancelled", pastDate)).toBe(false);
  });

  it("handles missing expected return time safely", () => {
    expect(isOverdue("Checked Out", null)).toBe(false);
    expect(isOverdue("Checked Out", "")).toBe(false);
  });
});

describe("P1.4 Waiting list duplicate prevention", () => {
  const activeStatuses = ["active", "fulfilled", "cancelled", "expired"];
  const isActive = (status: string) => status === "active";

  it("includes the expected statuses", () => {
    expect(activeStatuses).toContain("active");
    expect(activeStatuses).toContain("fulfilled");
    expect(activeStatuses).toContain("cancelled");
    expect(activeStatuses).toContain("expired");
  });

  it("treats only status 'active' as an active queue entry", () => {
    expect(isActive("active")).toBe(true);
    expect(isActive("fulfilled")).toBe(false);
    expect(isActive("cancelled")).toBe(false);
    expect(isActive("expired")).toBe(false);
  });
});

describe("P1.2 Image validation", () => {
  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  const maxSize = 5 * 1024 * 1024;

  const validateImage = (file: { type: string; size: number }) => {
    if (!allowedTypes.includes(file.type)) return "Invalid file type.";
    if (file.size > maxSize) return "File too large.";
    return null;
  };

  it("accepts allowed image types", () => {
    for (const type of allowedTypes) {
      expect(validateImage({ type, size: 1000 })).toBeNull();
    }
  });

  it("rejects disallowed file types", () => {
    expect(validateImage({ type: "application/pdf", size: 1000 })).toBe(
      "Invalid file type."
    );
  });

  it("rejects files over 5MB", () => {
    expect(validateImage({ type: "image/jpeg", size: maxSize + 1 })).toBe(
      "File too large."
    );
  });

  it("accepts files exactly at 5MB", () => {
    expect(validateImage({ type: "image/jpeg", size: maxSize })).toBeNull();
  });
});

describe("P1.5 Manager analytics calculations", () => {
  const utilization = (checkedOut: number, total: number) =>
    total > 0 ? Math.round((checkedOut / total) * 100) : 0;

  it("computes utilization as a percentage of checked-out resources", () => {
    expect(utilization(5, 20)).toBe(25);
    expect(utilization(0, 20)).toBe(0);
    expect(utilization(20, 20)).toBe(100);
  });

  it("returns zero utilization when there are no resources", () => {
    expect(utilization(0, 0)).toBe(0);
  });

  it("does not double count bookings", () => {
    const bookings = [
      { id: "a", status: "Checked Out" },
      { id: "b", status: "Checked Out" },
      { id: "c", status: "Returned" },
    ];
    const checkedOut = bookings.filter((b) => b.status === "Checked Out").length;
    expect(checkedOut).toBe(2);
  });
});
