import { useState, useCallback, useEffect } from "react";
import { supabase } from "../lib/supabase";
import type { Database } from "../lib/supabase";

type Booking = Database["public"]["Tables"]["bookings"]["Row"];

/**
 * Booking row as returned by the bookings queries in this hook,
 * which join the related resource and borrower profile.
 */
export type BookingWithResource = Booking & {
  resource: {
    name: string;
    location: string | null;
    type: string | null;
    owner_id: string;
  } | null;
  borrower: {
    full_name: string;
  } | null;
};

export async function createBooking(
  resourceId: string,
  startTime: string,
  endTime: string
) {
  const { data, error } = await supabase.rpc("create_booking", {
    p_resource_id: resourceId,
    p_start_time: startTime,
    p_end_time: endTime,
  });
  if (error) throw error;
  return data as string;
}

export async function decideBooking(
  bookingId: string,
  decision: "approve" | "reject",
  reason?: string
) {
  const { error } = await supabase.rpc("decide_booking", {
    p_booking_id: bookingId,
    p_decision: decision,
    p_reason: reason ?? null,
  });
  if (error) throw error;
}

export async function recordCheckout(
  bookingId: string,
  condition: string,
  accessories: string[],
  expectedReturnAt: string
) {
  const { error } = await supabase.rpc("record_checkout", {
    p_booking_id: bookingId,
    p_condition: condition,
    p_accessories: accessories,
    p_expected_return_at: expectedReturnAt,
  });
  if (error) throw error;
}

export async function recordReturn(
  bookingId: string,
  condition: string,
  missingAccessories: string[],
  damageNotes?: string
) {
  const { error } = await supabase.rpc("record_return", {
    p_booking_id: bookingId,
    p_condition: condition,
    p_missing_accessories: missingAccessories,
    p_damage_notes: damageNotes ?? null,
  });
  if (error) throw error;
}

export async function confirmReturn(bookingId: string) {
  const { error } = await supabase.rpc("confirm_return", {
    p_booking_id: bookingId,
  });
  if (error) throw error;
}

export async function reportIncident(
  bookingId: string,
  type: string,
  description: string
) {
  const { data, error } = await supabase.rpc("report_incident", {
    p_booking_id: bookingId,
    p_type: type,
    p_description: description,
  });
  if (error) throw error;
  return data as string;
}

export async function resolveIncident(
  incidentId: string,
  status: "under_review" | "resolved",
  notes?: string
) {
  const { error } = await supabase.rpc("resolve_incident", {
    p_incident_id: incidentId,
    p_status: status,
    p_resolution_notes: notes ?? null,
  });
  if (error) throw error;
}

export async function cancelBooking(bookingId: string) {
  const { error } = await supabase.rpc("cancel_booking", {
    p_booking_id: bookingId,
  });
  if (error) throw error;
}

export async function fetchMyBookings() {
  const { data, error } = await supabase
    .from("bookings")
    .select("*, resource:resources(name, location, owner_id), borrower:profiles!borrower_id(full_name, email)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Booking[];
}

export async function fetchOwnerRequests() {
  const { data, error } = await supabase
    .from("bookings")
    .select("*, borrower:profiles!borrower_id(full_name, email, department, year_of_study), resource:resources(name)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Booking[];
}

export function useBookings() {
  const [bookings, setBookings] = useState<BookingWithResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("bookings")
      .select("*, resource:resources(name, location, type, owner_id), borrower:profiles!borrower_id(full_name)")
      .order("created_at", { ascending: false });
    if (error) setError(error.message);
    else setBookings((data ?? []) as BookingWithResource[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { bookings, loading, error, reload: load };
}
