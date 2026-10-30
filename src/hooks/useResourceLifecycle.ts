/**
 * Resource Lifecycle Intelligence hook.
 *
 * Manages resource lifecycle state with validated transitions.
 * All state changes are recorded in audit_logs for traceability.
 *
 * Lifecycle states:
 *   draft              - Resource created but not yet verified
 *   pending_verification - Awaiting manager verification
 *   available          - Ready to be booked
 *   reserved           - Has future Approved/Checked Out booking
 *   checked_out        - Currently checked out
 *   return_review      - Returned, awaiting owner confirmation
 *   maintenance        - Under maintenance
 *   investigation      - Under investigation due to incident
 *   retired            - No longer available
 *
 * Lifecycle state is SEPARATE from booking status. A resource can have
 * a lifecycle state while individual bookings have their own states.
 */

import { useCallback, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Database } from "../lib/supabase";
import {
  computeLifecycleState,
  isLifecycleBookable,
  lifecycleLabel,
  LIFECYCLE_VARIANTS,
} from "../lib/eligibility";

type Resource = Database["public"]["Tables"]["resources"]["Row"];
type Booking = Database["public"]["Tables"]["bookings"]["Row"];

/**
 * Allowed lifecycle state transitions.
 * Key = from state, Value = set of allowed to states.
 */
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  draft: ["pending_verification", "retired"],
  pending_verification: ["available", "retired"],
  available: ["reserved", "maintenance", "investigation", "retired"],
  reserved: ["available", "checked_out", "maintenance", "investigation", "retired"],
  checked_out: ["return_review", "maintenance", "investigation", "retired"],
  return_review: ["available", "maintenance", "investigation", "retired"],
  maintenance: ["available", "investigation", "retired"],
  investigation: ["available", "maintenance", "retired"],
  retired: [], // Terminal state
};

/**
 * Check if a lifecycle transition is allowed.
 */
export function isValidTransition(
  from: string,
  to: string,
): boolean {
  const allowed = ALLOWED_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

/**
 * Get human-readable reason for why a transition is not allowed.
 */
export function transitionNotAllowedReason(from: string, to: string): string {
  return `Cannot transition from ${lifecycleLabel(from)} to ${lifecycleLabel(to)}.`;
}

interface UseResourceLifecycleProps {
  resource: Resource | null;
  bookings: Booking[];
}

/**
 * Hook for managing resource lifecycle state.
 */
export function useResourceLifecycle({
  resource,
  bookings,
}: UseResourceLifecycleProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Compute current effective lifecycle state
  const lifecycleState = resource
    ? computeLifecycleState(resource, bookings)
    : "unknown";
  const isBookable = isLifecycleBookable(lifecycleState);

  /**
   * Record a lifecycle event in audit_logs.
   * This is the auditable record of every state change.
   */
  const recordLifecycleEvent = useCallback(
    async (
      action: string,
      reason: string,
      metadata?: Record<string, unknown>,
    ) => {
      if (!resource) return;

      setLoading(true);
      setError(null);
      try {
        const { error } = await supabase.rpc("audit_write", {
          p_action: action,
          p_entity_type: "resource",
          p_entity_id: resource.id,
          p_reason: reason,
          p_metadata: metadata ?? null,
        });
        if (error) throw error;
      } catch (e: any) {
        setError(e.message || "Could not record lifecycle event");
      } finally {
        setLoading(false);
      }
    },
    [resource],
  );

  /**
   * Server-enforced availability check via check_resource_availability RPC.
   * Considers lifecycle state AND booking overlaps. This is the source of truth;
   * frontend isTimeRangeAvailable() is advisory only.
   */
  const checkAvailability = useCallback(
    async (
      resourceId: string,
      startTime: string,
      endTime: string,
    ): Promise<{ available: boolean; error?: string }> => {
      setLoading(true);
      setError(null);
      try {
        const { data, error } = await supabase.rpc(
          "check_resource_availability",
          {
            p_resource_id: resourceId,
            p_start_time: startTime,
            p_end_time: endTime,
          },
        );
        if (error) throw error;
        return { available: !!data, error: undefined };
      } catch (e: any) {
        setError(e.message || "Availability check failed");
        return { available: false, error: e.message };
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  /**
   * Server-enforced eligibility check via check_borrower_eligibility RPC.
   * Only the borrower themselves or manager/admin may check another user's
   * eligibility. This is the source of truth; frontend checkEligibility() is
   * advisory only.
   */
  const checkEligibility = useCallback(
    async (resourceId: string, borrowerId: string): Promise<{
      eligible: boolean;
      error?: string;
    }> => {
      setLoading(true);
      setError(null);
      try {
        const { data, error } = await supabase.rpc(
          "check_borrower_eligibility",
          {
            p_resource_id: resourceId,
            p_borrower_id: borrowerId,
          },
        );
        if (error) throw error;
        return { eligible: !!data, error: undefined };
      } catch (e: any) {
        setError(e.message || "Eligibility check failed");
        return { eligible: false, error: e.message };
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  /**
   * Get effective lifecycle state via get_resource_lifecycle_state RPC.
   * Server-enforced; considers lifecycle state AND bookings.
   */
  const getLifecycleState = useCallback(
    async (resourceId: string): Promise<{
      state: string | null;
      error?: string;
    }> => {
      setLoading(true);
      setError(null);
      try {
        const { data, error } = await supabase.rpc(
          "get_resource_lifecycle_state",
          {
            p_resource_id: resourceId,
          },
        );
        if (error) throw error;
        return { state: data ?? null, error: undefined };
      } catch (e: any) {
        setError(e.message || "Lifecycle state check failed");
        return { state: null, error: e.message };
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  /**
   * Transition a resource to a new lifecycle state.
   * Validates the transition, updates the database, and records an audit event.
   * Only managers/admins can perform lifecycle transitions.
   */
  const transitionTo = useCallback(
    async (newState: string, reason: string) => {
      if (!resource) {
        setError("No resource selected");
        return false;
      }

      const currentState = computeLifecycleState(resource, bookings);

      if (!isValidTransition(currentState, newState)) {
        setError(transitionNotAllowedReason(currentState, newState));
        return false;
      }

      setLoading(true);
      setError(null);

      try {
        // Update the resource lifecycle_state in the database
        const { error: updateError } = await supabase
          .from("resources")
          .update({ lifecycle_state: newState })
          .eq("id", resource.id)
          .select()
          .single();

        if (updateError) throw updateError;

        // Record the lifecycle event in audit_logs
        await recordLifecycleEvent(
          `resource.lifecycle.${newState}`,
          reason,
          {
            from_state: currentState,
            to_state: newState,
            resource_id: resource.id,
            resource_name: resource.name,
          },
        );

        return true;
      } catch (e: any) {
        setError(e.message || "Could not transition resource lifecycle");
        return false;
      } finally {
        setLoading(false);
      }
    },
    [resource, bookings, recordLifecycleEvent],
  );

  /**
   * Mark a resource as under maintenance.
   */
  const setMaintenance = useCallback(
    (reason: string) =>
      transitionTo("maintenance", reason),
    [transitionTo],
  );

  /**
   * Mark a resource as under investigation.
   */
  const setInvestigation = useCallback(
    (reason: string) =>
      transitionTo("investigation", reason),
    [transitionTo],
  );

  /**
   * Return a resource to available state.
   */
  const setAvailable = useCallback(
    (reason: string) =>
      transitionTo("available", reason),
    [transitionTo],
  );

  /**
   * Retire a resource (terminal state).
   */
  const retire = useCallback(
    (reason: string) =>
      transitionTo("retired", reason),
    [transitionTo],
  );

  /**
   * Get the color variant for the current lifecycle state badge.
   */
  const lifecycleVariant = LIFECYCLE_VARIANTS[lifecycleState] ?? "badge-maintenance";

  return {
    lifecycleState,
    lifecycleLabel: lifecycleLabel(lifecycleState),
    lifecycleVariant,
    isBookable,
    loading,
    error,
    isValidTransition,
    transitionTo,
    setMaintenance,
    setInvestigation,
    setAvailable,
    retire,
    recordLifecycleEvent,
    checkAvailability,
    checkEligibility,
    getLifecycleState,
  };
}
