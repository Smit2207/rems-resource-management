import { supabase } from "./supabase";

export type UserRole = "student" | "manager" | "admin";

export interface AppUser {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  institution: string | null;
  department: string | null;
  yearOfStudy: number | null;
  studentStaffId: string | null;
  trainingCompleted: string[];
}

export function mapProfile(row: any): AppUser {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name ?? null,
    role: (row.role ?? "student") as UserRole,
    institution: row.institution ?? null,
    department: row.department ?? null,
    yearOfStudy: row.year_of_study ?? null,
    studentStaffId: row.student_staff_id ?? null,
    trainingCompleted: row.training_completed ?? [],
  };
}

export async function getProfile(): Promise<AppUser | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  if (error || !data) return null;
  return mapProfile(data);
}

export async function signUp(email: string, password: string, fullName: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });
  return { data, error };
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  return { data, error };
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  return { error };
}

export async function resendConfirmation(email: string) {
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
  });
  return { error };
}

export function onAuthStateChange(callback: (user: any) => void) {
  return supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null);
  });
}
