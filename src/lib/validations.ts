import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const registerSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z
    .string()
    .min(6, "Password must be at least 6 characters")
    .max(128, "Password is too long"),
  confirmPassword: z.string(),
  fullName: z.string().min(2, "Full name is required"),
  role: z.enum(["student", "manager", "admin"]).default("student"),
  institution: z.string().min(1, "Institution is required"),
  department: z.string().optional(),
  yearOfStudy: z
    .string()
    .refine((val) => !val || /^\d+$/.test(val), "Year must be a number")
    .optional(),
  studentStaffId: z.string().optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

export const resourceSchema = z.object({
  name: z.string().min(2, "Resource name is required"),
  description: z.string().min(1, "Description is required"),
  type: z.enum(["equipment", "space"]),
  categoryId: z.string().uuid("Select a category"),
  location: z.string().min(1, "Location is required"),
  capacity: z
    .string()
    .refine((val) => !val || /^\d+$/.test(val), "Capacity must be a number")
    .optional(),
  eligibilityDepartment: z.string().optional(),
  eligibilityMinYear: z
    .string()
    .refine((val) => !val || /^\d+$/.test(val), "Year must be a number")
    .optional(),
  requiredTraining: z.boolean().default(false),
  trainingRequired: z.string().optional(),
  supervisionRequired: z.boolean().default(false),
  usageRules: z.string().optional(),
  depositAmount: z
    .string()
    .refine((val) => !val || /^\d+(\.\d+)?$/.test(val), "Enter a valid amount")
    .optional(),
  depositConditions: z.string().optional(),
  status: z.enum(["active", "disabled", "maintenance"]),
});

export type ResourceInput = z.infer<typeof resourceSchema>;

export const bookingSchema = z.object({
  startTime: z.string().min(1, "Start time is required"),
  endTime: z.string().min(1, "End time is required"),
});

export type BookingInput = z.infer<typeof bookingSchema>;

export const incidentSchema = z.object({
  bookingId: z.string().uuid(),
  type: z.enum([
    "damage",
    "missing_accessories",
    "late_return",
    "scheduling_conflict",
    "safety_concern",
  ]),
  description: z.string().min(10, "Please describe the incident"),
});

export type IncidentInput = z.infer<typeof incidentSchema>;

export const checkoutSchema = z.object({
  checkoutCondition: z.string().min(1, "Condition is required"),
  accessoriesIncluded: z.array(z.string()).default([]),
  expectedReturnAt: z.string().min(1, "Expected return time is required"),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;

export const returnSchema = z.object({
  returnCondition: z.string().min(1, "Condition is required"),
  missingAccessories: z.array(z.string()).default([]),
  damageNotes: z.string().optional(),
});

export type ReturnInput = z.infer<typeof returnSchema>;

export const bookingStatuses = [
  "Pending",
  "Approved",
  "Rejected",
  "Cancelled",
  "Checked Out",
  "Returned",
  "Completed",
] as const;

export const incidentTypes = [
  "damage",
  "missing_accessories",
  "late_return",
  "scheduling_conflict",
  "safety_concern",
] as const;
