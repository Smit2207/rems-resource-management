import { useParams } from "react-router-dom";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { bookingSchema } from "../lib/validations";
import { useResources } from "../hooks/useResources";
import { createBooking } from "../hooks/useBookings";
import { PageLayout } from "../components/PageLayout";
import { Card } from "../components/Card";
import { FormField } from "../components/Common";
import { Mail } from "lucide-react";

export default function ResourceBookPage() {
  const { id } = useParams();
  const { resources, reload } = useResources();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const resource = resources.find((r) => r.id === id);

  const form = useForm<{ startTime: string; endTime: string }>({
    resolver: zodResolver(bookingSchema) as any,
    defaultValues: { startTime: "", endTime: "" },
  });

  async function handleSubmit(values: { startTime: string; endTime: string }) {
    setError("");
    setMessage("");
    setLoading(true);
    try {
      await createBooking(resource!.id, values.startTime, values.endTime);
      setMessage("Booking request submitted. The owner will review it.");
      form.reset();
      reload();
    } catch (e: any) {
      setError(e.message || "Could not submit booking request");
    } finally {
      setLoading(false);
    }
  }

  if (!resource) return <div className="page">Resource not found.</div>;

  return (
    <PageLayout>
      <div className="max-w-2xl">
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Mail className="h-5 w-5 text-forest" />
            <h1 className="font-bold text-dark">{resource.name}</h1>
          </div>
          <p className="text-muted mb-4">{resource.location || "—"}</p>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField label="Start date & time">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                <input
                  type="datetime-local"
                  className="input pl-9"
                  {...form.register("startTime")}
                  required
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
            <button className="btn-primary w-full" disabled={loading}>
              {loading ? "Submitting…" : "Request Booking"}
            </button>
          </form>
          <p className="mt-4 text-sm text-muted">
            Your request will be reviewed by the resource owner. Overlapping
            approved bookings are prevented automatically.
          </p>
        </Card>
      </div>
    </PageLayout>
  );
}
