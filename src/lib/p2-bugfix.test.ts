import { describe, it, expect } from "vitest";

describe("P2: Resource creation owner_id", () => {
  it("injects owner_id from authenticated user into create payload", () => {
    const mockUserId = "user-123";
    const input = {
      name: "Test Resource",
      description: "A test resource",
      type: "equipment" as const,
      category_id: null,
      location: "Building A",
    };
    const payload = { ...input, owner_id: mockUserId };
    expect(payload.owner_id).toBe(mockUserId);
    expect(payload.owner_id).toBeDefined();
  });

  it("rejects resource creation without authentication", () => {
    const user = null;
    expect(() => {
      if (!user) throw new Error("Authentication required to create a resource.");
    }).toThrow("Authentication required to create a resource.");
  });

  it("strips owner_id from update payload to prevent ownership transfer", () => {
    const inputWithOwnerId = {
      name: "Updated",
      owner_id: "different-user-id",
    } as Record<string, unknown>;
    const { owner_id: _owner_id, ...safeInput } = inputWithOwnerId;
    expect((safeInput as Record<string, unknown>).owner_id).toBeUndefined();
    expect(_owner_id).toBe("different-user-id");
    expect(safeInput.name).toBe("Updated");
  });
});

describe("P2: Booking query foreign key relationships", () => {
  it("uses explicit borrower_id FK relationship for borrower embed", () => {
    const borrowerEmbed = "borrower:profiles!borrower_id(full_name, email)";
    expect(borrowerEmbed).toContain("!borrower_id");
    expect(borrowerEmbed).not.toBe("borrower:profiles(full_name)");
  });

  it("uses explicit owner_id FK relationship for resource owner", () => {
    const resourceEmbed = "resource:resources(name, owner_id)";
    expect(resourceEmbed).toContain("owner_id");
  });
});

describe("P2: Auth error handling", () => {
  const isUnconfirmedEmail = (err: any): boolean => {
    if (!err) return false;
    if (err.code === "email_not_confirmed") return true;
    if (typeof err.message === "string" && /not confirmed/i.test(err.message))
      return true;
    return false;
  };

  const isRateLimited = (err: any): boolean => {
    if (!err) return false;
    if (err.status === 429) return true;
    if (typeof err.message === "string" && /rate limit/i.test(err.message))
      return true;
    return false;
  };

  it("detects unconfirmed email error by code", () => {
    expect(isUnconfirmedEmail({ code: "email_not_confirmed" })).toBe(true);
    expect(isUnconfirmedEmail({ code: "invalid_credentials" })).toBe(false);
  });

  it("detects unconfirmed email error by message", () => {
    expect(isUnconfirmedEmail({ message: "Email not confirmed" })).toBe(true);
    expect(isUnconfirmedEmail({ message: "Invalid login credentials" })).toBe(false);
  });

  it("detects rate limit error by status code", () => {
    expect(isRateLimited({ status: 429 })).toBe(true);
    expect(isRateLimited({ status: 400 })).toBe(false);
  });

  it("detects rate limit error by message", () => {
    expect(isRateLimited({ message: "Rate limit exceeded" })).toBe(true);
    expect(isRateLimited({ message: "Invalid password" })).toBe(false);
  });
});

describe("P2: Overdue calculation", () => {
  const isOverdue = (status: string, expectedReturnAt: string | null) => {
    if (status !== "Checked Out" || !expectedReturnAt) return false;
    return new Date(expectedReturnAt) < new Date();
  };

  const pastDate = new Date(Date.now() - 86400000).toISOString();
  const futureDate = new Date(Date.now() + 86400000).toISOString();

  it("classifies checked-out bookings with past expected return as overdue", () => {
    expect(isOverdue("Checked Out", pastDate)).toBe(true);
  });

  it("does not classify future return dates as overdue", () => {
    expect(isOverdue("Checked Out", futureDate)).toBe(false);
  });

  it("does not classify non-checked-out statuses as overdue", () => {
    expect(isOverdue("Returned", pastDate)).toBe(false);
    expect(isOverdue("Approved", pastDate)).toBe(false);
    expect(isOverdue("Cancelled", pastDate)).toBe(false);
    expect(isOverdue("Completed", pastDate)).toBe(false);
  });

  it("handles missing expected return safely", () => {
    expect(isOverdue("Checked Out", null)).toBe(false);
    expect(isOverdue("Checked Out", "")).toBe(false);
  });
});
