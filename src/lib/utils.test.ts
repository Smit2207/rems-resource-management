import { describe, it, expect } from "vitest";
import { formatDateTime, formatDate, capitalize, statusLabel, cn } from "../lib/utils";

describe("utils", () => {
  describe("capitalize", () => {
    it("capitalizes first letter", () => {
      expect(capitalize("hello")).toBe("Hello");
    });
    it("handles empty string", () => {
      expect(capitalize("")).toBe("");
    });
  });

  describe("statusLabel", () => {
    it("converts snake_case to Title Case", () => {
      expect(statusLabel("checked_out")).toBe("Checked Out");
      expect(statusLabel("under_review")).toBe("Under Review");
    });
  });

  describe("formatDate", () => {
    it("returns dash for null", () => {
      expect(formatDate(null)).toBe("-");
    });
    it("formats a date string", () => {
      const result = formatDate("2026-01-15T10:00:00Z");
      expect(result).not.toBe("-");
    });
  });

  describe("formatDateTime", () => {
    it("returns dash for null", () => {
      expect(formatDateTime(null)).toBe("-");
    });
  });

  describe("cn", () => {
    it("merges classes", () => {
      expect(cn("a", "b")).toBe("a b");
    });
  });
});
