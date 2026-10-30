import { useParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { Mail, ShieldAlert, AlertTriangle } from "lucide-react";
import { useResources } from "../hooks/useResources";
import { createBooking } from "../hooks/useBookings";
import { StatusBadge } from "../components/StatusBadge";
import { PageLayout } from "../components/PageLayout";
import { Card } from "../components/Card";
import { EmptyState, FormField } from "../components/Common";
import { formatDateTime } from "../lib/utils";
import { bookingSchema } from "../lib/validations";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "../lib/supabase";
import { useResourceLifecycle } from "../hooks/useResourceLifecycle";
import {
  generateAlternatives,
  type AlternativesResult,
  formatAlternativeReason,
} from "../lib/alternatives";
import { checkEligibility } from "../lib/eligibility";
import { useAuth } from "../hooks/useAuth";

export default function ResourceDetailPage() {
  const { id } = useParams();
  const { resources, reload } = useResources();
  const { user } = useAuth();

  const [booking, setBooking] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [alternatives, setAlternatives] = useState<AlternativesResult | null>(
    null,
  );
  const [showAlternatives, setShowAlternatives] = useState(false);

  const resource = resources.find((r) => r.id === id);

  const form = useForm<{ startTime: string; endTime: string }>({
    resolver: zodResolver(bookingSchema),
    defaultValues: { startTime: "", endTime: "" },
  });

  const lifecycle = useResourceLifecycle({
    resource: resource ?? null,
    bookings: booking ? [booking] : [],
  });

  async function loadBookings() {
    if (!resource) return;
    const { data } = await supabase
      .from("bookings")
      .select("*")
      .eq("resource_id", resource.id)
      .order("start_time", { ascending: true });
    setBooking(data && data.length ? data[0] : null);
  }

  async function handleSubmit(values: { startTime: string; endTime: string }) {
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      await createBooking(resource!.id, values.startTime, values.endTime);
      setMessage("Booking request submitted. The owner will review it.");
      form.reset();
      await loadBookings();
      reload();
    } catch (e: any) {
      setError(e.message || "Could not submit booking request");
    } finally {
      setLoading(false);
    }
  }

  const [owner, setOwner] = useState<any>(null);

  useEffect(() => {
    if (!resource) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, role")
        .eq("id", resource.owner_id)
        .single();
      setOwner(data);
    })();
  }, [resource?.owner_id]);

  // Recompute alternatives when resource, bookings, or user changes
  useEffect(() => {
    if (!resource || !user) return;

    const allBookings = booking ? [booking] : [];
    const altResult = generateAlternatives(
      resource,
      resources,
      allBookings,
      user as any,
      {
        startTime: form.getValues("startTime") || undefined,
        endTime: form.getValues("endTime") || undefined,
        quantity: 1,
        location: resource.location || undefined,
        tags: resource.tags || undefined,
        categoryId: resource.category_id || undefined,
        type: resource.type,
      },
    );
    setAlternatives(altResult);
  }, [resource, booking, user, resources, form.getValues("startTime"), form.getValues("endTime")]);

  if (!resource) return <div className="page">Resource not found.</div>;

  const lifecycleState = lifecycle.lifecycleState;

  // Determine if booking is blocked and why
  const bookingBlocked =
    resource.status !== "active" ||
    !lifecycle.isBookable ||
    (user !== null &&
      !checkEligibility(resource, {
        id: user.id,
        email: "",
        fullName: "",
        role: user.role,
        institution: "",
        department: "",
        year_of_study: null,
        student_staff_id: null,
        training_completed: [],
        created_at: "",
      } as any));

  return (
    <PageLayout>
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1">
          <Card>
            <div className="flex flex-col lg:flex-row gap-6">
              <div className="flex-1">
                {resource.image_url ? (
                  <img
                    src={resource.image_url}
                    alt={resource.name}
                    className="w-full h-64 object-cover rounded-xl mb-4"
                  />
                ) : (
                  <div className="w-full h-64 rounded-xl bg-[#F3F4F6] flex items-center justify-center mb-4">
                    <span className="text-xs text-muted">No image</span>
                  </div>
                )}
                <div className="flex items-center gap-2 mb-2">
                  <h1 className="text-2xl font-bold text-dark">
                    {resource.name}
                  </h1>
                  <StatusBadge status={lifecycleState} />
                </div>
                <p className="text-muted mb-4">{resource.description}</p>
                <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                  <div>
                    <span className="block text-muted">Type</span>
                    <span className="text-dark">{resource.type}</span>
                  </div>
                  <div>
                    <span className="block text-muted">Location</span>
                    <div className="flex items-center gap-2">
                      <span className="text-dark">{resource.location}</span>
                    </div>
                  </div>
                  <div>
                    <span className="block text-muted">Capacity</span>
                    <span className="text-dark">
                      {resource.capacity != null ? resource.capacity : "—"}
                    </span>
                  </div>
                  <div>
                    <span className="block text-muted">Owner</span>
                    <span className="text-dark">
                      {owner?.full_name || "—"}
                    </span>
                  </div>
                </div>
                {resource.tags && resource.tags.length > 0 && (
                  <div className="mb-4">
                    <span className="block text-muted text-xs">Tags</span>
                    <div className="flex flex-wrap gap-2">
                      {resource.tags.map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-1 rounded bg-forest/5 text-forest text-xs border border-forest/10"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="mb-4">
                  <span className="block text-muted text-xs">Lifecycle</span>
                  <span className={`text-sm font-medium ${lifecycleVariantColor(lifecycleState)}`}>
                    {lifecycle.lifecycleLabel}
                  </span>
                </div>
                {resource.required_training && resource.training_required && (
                  <div className="mb-4 p-3 rounded bg-amber-50 border border-amber-100">
                    <ShieldAlert className="mr-2 h-4 w-4 text-amber-700" />
                    <span className="text-amber-700 text-sm">
                      Training required: {resource.training_required}
                    </span>
                  </div>
                )}
                {lifecycle.loading && (
                  <div className="mb-4 text-xs text-muted">Checking lifecycle…</div>
                )}
                {lifecycle.error && (
                  <div className="mb-4 p-3 rounded bg-rose-50 text-rose-700 text-sm">
                    {lifecycle.error}
                  </div>
                )}
              </div>
              <div className="lg:w-80">
                <Card className="border">
                  <h3 className="font-bold mb-4">Book this resource</h3>

                  {bookingBlocked && (
                    <div className="mb-4 p-3 rounded bg-rose-50 border border-rose-100">
                      <AlertTriangle className="mr-2 h-4 w-4 text-rose-600" />
                      <span className="text-rose-600 text-sm">
                        {bookingBlockedReason(resource, lifecycle, user)}
                      </span>
                    </div>
                  )}

                  {!showAlternatives && alternatives && !lifecycle.isBookable && (
                    <div className="mb-4 p-3 rounded bg-forest/5 border border-forest/10">
                      <div className="flex items-start gap-2 mb-2">
                        <AlertTriangle className="mt-0.5 h-4 w-4 text-forest-700" />
                        <span className="text-forest-700 text-sm font-medium">
                          This resource is not available for your request.
                        </span>
                      </div>
                      <button
                        onClick={() => setShowAlternatives(true)}
                        className="btn-outline text-sm text-forest hover:bg-forest/5"
                      >
                        View alternatives
                      </button>
                    </div>
                  )}

                  {showAlternatives && alternatives && (
                    <AlternativesPanel
                      alternatives={alternatives}
                      onClose={() => setShowAlternatives(false)}
                      onSelectTime={(start, end) => {
                        form.setValue("startTime", start);
                        form.setValue("endTime", end);
                        setShowAlternatives(false);
                      }}
                    />
                  )}

                  <form
                    onSubmit={form.handleSubmit(handleSubmit)}
                    className="space-y-4"
                  >
                    <FormField label="Start date & time">
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                        <input
                          type="datetime-local"
                          className="input pl-9"
                          {...form.register("startTime")}
                          required
                          disabled={bookingBlocked}
                        />
                        {form.formState.errors.startTime && (
                          <p className="text-sm text-rose-600">
                            {form.formState.errors.startTime.message}
                          </p>
                        )}
                      </div>
                    </FormField>
                    <FormField label="End date & time">
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                        <input
                          type="datetime-local"
                          className="input pl-9"
                          {...form.register("endTime")}
                          required
                          disabled={bookingBlocked}
                        />
                        {form.formState.errors.endTime && (
                          <p className="text-sm text-rose-600">
                            {form.formState.errors.endTime.message}
                          </p>
                        )}
                      </div>
                    </FormField>
                    {error && (
                      <div className="p-3 rounded bg-rose-50 border border-rose-100 text-rose-700 text-sm">
                        {error}
                      </div>
                    )}
                    {message && (
                      <div className="p-3 rounded bg-forest/5 border border-forest/10 text-forest-700 text-sm">
                        {message}
                      </div>
                    )}
                    <button
                      className="btn-primary w-full"
                      disabled={loading || bookingBlocked}
                    >
                      {loading ? "Submitting…" : "Request Booking"}
                    </button>
                  </form>
                  <p className="mt-2 text-sm text-muted">
                    Your request will be reviewed by the resource owner.
                    Overlapping approved bookings are prevented automatically.
                  </p>
                </Card>
              </div>
            </div>
          </Card>
        </div>

        <div className="lg:w-80">
          <Card>
            <h3 className="font-bold mb-4">Recent bookings</h3>
            {!booking ? (
              <EmptyState
                title="No bookings yet"
                description="Be the first to request this resource."
              />
            ) : (
              <div className="space-y-3">
                <div className="p-3 rounded border">
                  <div className="flex justify-between items-start mb-2">
                    <div className="text-sm font-medium text-dark">
                      {formatDateTime(booking.start_time)} –{" "}
                      {formatDateTime(booking.end_time)}
                    </div>
                    <StatusBadge status={booking.status} />
                    {booking.status === "Checked Out" &&
                      booking.expected_return_at &&
                      new Date(booking.expected_return_at) < new Date() && (
                        <span className="text-xs text-rose-600 font-medium">
                          Overdue
                        </span>
                      )}
                  </div>
                  {booking.expected_return_at && (
                    <p className="text-sm text-muted mb-1">
                      Expected return:{formatDateTime(booking.expected_return_at)}
                    </p>
                  )}
                  {booking.rejection_reason && (
                    <p className="text-sm text-muted mt-1">
                      {booking.rejection_reason}
                    </p>
                  )}
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </PageLayout>
  );
}

function lifecycleVariantColor(state: string): string {
  const variants: Record<string, string> = {
    draft: "text-amber-700",
    pending_verification: "text-amber-700",
    available: "text-emerald-600",
    reserved: "text-indigo-600",
    checked_out: "text-indigo-600",
    return_review: "text-amber-700",
    maintenance: "text-rose-600",
    investigation: "text-rose-600",
    retired: "text-rose-600",
  };
  return variants[state] ?? "text-muted";
}

function bookingBlockedReason(
  resource: any,
  lifecycle: any,
  user: { id: string; role: string } | null,
): string {
  if (resource.status !== "active") {
    return `Resource status is ${resource.status}.`;
  }
  if (!lifecycle.isBookable) {
    return `Resource lifecycle is ${lifecycle.lifecycleLabel}.`;
  }
  if (user) {
    // Simple eligibility check inline
    const missing: string[] = [];
    if (
      resource.eligibility_department &&
      // Can't check department without user profile, skip detailed check
      false
    ) {
      missing.push("department mismatch");
    }
    if (missing.length > 0) return missing.join(", ");
  }
  return "Resource is not available for booking.";
}

/**
 * Alternatives panel displayed when the original resource is not bookable.
 */
function AlternativesPanel({
  alternatives,
  onClose,
  onSelectTime,
}: {
  alternatives: AlternativesResult;
  onClose: () => void;
  onSelectTime: (start: string, end: string) => void;
}) {
  return (
    <Card className="border">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-dark">Smart Alternatives</h3>
        <button
          onClick={onClose}
          className="text-xs text-muted hover:text-forest"
        >
          Close
        </button>
      </div>

      {alternatives.originalMissingReasons.length > 0 && (
        <div className="mb-4 p-3 rounded bg-rose-50 border border-rose-100 text-rose-700 text-sm">
          <p className="mb-2">
            <strong>Why the original resource is not available:</strong>
          </p>
          <ul className="list-disc list-inside space-y-1">
            {alternatives.originalMissingReasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {alternatives.resourceAlternatives.length > 0 && (
        <div className="mb-4">
          <h4 className="font-bold text-dark text-sm mb-2">
            Alternative Resources
          </h4>
          <div className="space-y-3">
            {alternatives.resourceAlternatives.map((alt) => (
              <div
                key={alt.resource.id}
                className="p-3 rounded border border-forest/10 bg-forest/5"
              >
                <div className="flex justify-between items-start mb-1">
                  <h4 className="font-bold text-dark">{alt.resource.name}</h4>
                  <span
                    className={`text-xs font-medium ${
                      alt.isBookable
                        ? "text-emerald-600"
                        : "text-rose-600"
                    }`}
                  >
                    {alt.isBookable ? "Available" : "Not bookable"}
                  </span>
                </div>
                <p className="text-xs text-muted mb-2">
                  {formatAlternativeReason(alt)}
                </p>
                {alt.resource.location && (
                  <p className="text-xs text-muted mb-2">
                    {alt.resource.location}
                  </p>
                )}
                {alt.isBookable && (
                  <button
                    onClick={() => {
                      // Select this alternative resource - would navigate to its detail page
                      onClose();
                    }}
                    className="text-xs text-forest font-medium hover:underline"
                  >
                    Select this resource
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {alternatives.timeAlternatives.length > 0 && (
        <div className="mb-4">
          <h4 className="font-bold text-dark text-sm mb-2">
            Alternative Time Slots
          </h4>
          <div className="space-y-2">
            {alternatives.timeAlternatives.map((ta, i) => (
              <button
                key={i}
                onClick={() => onSelectTime(ta.startTime, ta.endTime)}
                className={`w-full text-left px-3 py-2 rounded border ${
                  ta.isAvailable
                    ? "border-forest/20 text-forest hover:bg-forest/5"
                    : "border-border text-muted hover:bg-rose-5"
                }`}
              >
                <div className="flex justify-between">
                  <span className="text-sm text-dark">
                    {new Date(ta.startTime).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })} –{" "}
                    {new Date(ta.endTime).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span className="text-xs">
                    {ta.isAvailable ? "Available" : "Taken"}
                  </span>
                </div>
                <p className="text-xs text-muted">{ta.reason}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {alternatives.waitingListEligible && (
        <div className="mt-3 p-3 rounded bg-amber-50 border border-amber-100">
          <p className="text-sm text-amber-700">
            You&rsquo;re eligible to join the waiting list for this resource.
          </p>
        </div>
      )}

      {alternatives.resourceAlternatives.length === 0 &&
        alternatives.timeAlternatives.length === 0 && (
          <div className="p-3 rounded bg-rose-50 text-rose-700 text-sm">
            No alternatives found for your requested criteria.
          </div>
        )}
    </Card>
  );
}
