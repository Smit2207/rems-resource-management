import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { incidentSchema } from "../lib/validations";
import { Plus } from "lucide-react";
import { useBookings, reportIncident } from "../hooks/useBookings";
import { useIncidents } from "../hooks/useIncidents";
import { PageLayout } from "../components/PageLayout";
import { Card } from "../components/Card";
import { FormField } from "../components/Common";
import { StatusBadge } from "../components/StatusBadge";
import { formatDateTime } from "../lib/utils";
import { EmptyState } from "../components/Common";

export default function IncidentsPage() {
  const { bookings } = useBookings();
  const { incidents, loading } = useIncidents();
  const [error, setError] = useState("");

  const form = useForm<any>({
    resolver: zodResolver(incidentSchema) as any,
    defaultValues: { bookingId: "", type: "damage", description: "" },
  });

  async function handleSubmit(values: any) {
    setError("");
    try {
      await reportIncident(values.bookingId, values.type, values.description);
      form.reset();
    } catch (e: any) {
      setError(e.message || "Could not report incident");
    }
  }

  const myBookings = bookings.filter(
    (b: any) => b.status === "Checked Out" || b.status === "Returned"
  );

  if (loading) return (
    <PageLayout>
      <div className="flex flex-col items-center justify-center py-20 text-center text-muted">
        Loading incidents…
      </div>
    </PageLayout>
  );

  return (
    <PageLayout>
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1">
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <Plus className="h-5 w-5 text-forest" />
              <h1 className="text-xl font-bold text-dark">Report an Incident</h1>
            </div>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              <FormField label="Related booking">
                <select className="input" {...form.register("bookingId")} required>
                  <option value="">Select a checked-out or returned booking</option>
                  {myBookings.map((b: any) => (
                    <option key={b.id} value={b.id}>
                      {b.resource?.name || "Resource"} —{" "}
                      {formatDateTime(b.start_time)} to {formatDateTime(b.end_time)}
                    </option>
                  ))}
                </select>
                {form.formState.errors.bookingId && (
                  <p className="text-sm text-rose-600">
                    {String(form.formState.errors.bookingId?.message)}
                  </p>
                )}
              </FormField>
              <FormField label="Type">
                <select className="input" {...form.register("type")} required>
                  <option value="damage">Damage</option>
                  <option value="missing_accessories">Missing accessories</option>
                  <option value="late_return">Late return</option>
                  <option value="scheduling_conflict">Scheduling conflict</option>
                  <option value="safety_concern">Safety concern</option>
                </select>
              </FormField>
              <FormField label="Description">
                <textarea
                  className="input"
                  rows={4}
                  {...form.register("description")}
                  required
                />
                {form.formState.errors.description && (
                  <p className="text-sm text-rose-600">
                    {String(form.formState.errors.description?.message)}
                  </p>
                )}
              </FormField>
              {error && (
                <div className="p-3 rounded bg-rose-50 border border-rose-100 text-rose-700 text-sm">
                  {error}
                </div>
              )}
              <button className="btn-primary w-full">Report Incident</button>
            </form>
          </Card>
        </div>
        <div className="lg:w-96">
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <span className="h-5 w-5 rounded-full bg-forest flex items-center justify-center text-white text-xs font-bold">
                I
              </span>
              <h2 className="font-bold text-dark">My Incidents</h2>
            </div>
            {incidents.length === 0 ? (
              <EmptyState
                title="No incidents reported yet"
                description="Report an issue with a checked-out or returned resource."
              />
            ) : (
              <div className="space-y-3">
                {incidents.map((inc: any) => (
                  <Card key={inc.id} className="p-4">
                    <div className="flex justify-between mb-2">
                      <div>
                        <h3 className="font-bold text-dark">
                          {inc.type.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
                        </h3>
                        <p className="text-xs text-muted">
                          Booking #{inc.booking_id?.slice(-6) || "—"}
                        </p>
                      </div>
                      <StatusBadge status={inc.status} />
                    </div>
                    <p className="text-sm text-muted mb-2">
                      {inc.description}
                    </p>
                    {inc.resolution_notes && (
                      <div className="mt-2 p-2 rounded bg-forest/5 border border-forest/10 text-forest-700 text-sm">
                        <strong>Resolution:</strong> {inc.resolution_notes}
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </PageLayout>
  );
}
