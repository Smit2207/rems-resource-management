import { describe, it, expect } from "vitest";
import { loginSchema, registerSchema } from "../lib/validations";

describe("validations", () => {
  describe("loginSchema", () => {
    it("accepts valid login", () => {
      const result = loginSchema.safeParse({ email: "a@b.com", password: "password123" });
      expect(result.success).toBe(true);
    });
    it("rejects invalid email", () => {
      const result = loginSchema.safeParse({ email: "not-email", password: "password123" });
      expect(result.success).toBe(false);
    });
    it("rejects short password", () => {
      const result = loginSchema.safeParse({ email: "a@b.com", password: "short" });
      expect(result.success).toBe(false);
    });
  });

  describe("registerSchema", () => {
    it("accepts valid registration", () => {
      const result = registerSchema.safeParse({
        email: "a@b.com",
        password: "password123",
        confirmPassword: "password123",
        fullName: "Test User",
        role: "student",
        institution: "Test College",
      });
      expect(result.success).toBe(true);
    });
    it("rejects invalid email", () => {
      const result = registerSchema.safeParse({
        email: "not-email",
        password: "password123",
        confirmPassword: "password123",
        fullName: "Test User",
        role: "student",
        institution: "Test College",
      });
      expect(result.success).toBe(false);
    });
    it("rejects short password", () => {
      const result = registerSchema.safeParse({
        email: "a@b.com",
        password: "short",
        confirmPassword: "short",
        fullName: "Test User",
        role: "student",
        institution: "Test College",
      });
      expect(result.success).toBe(false);
    });
  });
});
