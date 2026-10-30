import { useParams, Link } from "react-router-dom";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { returnSchema } from "../lib/validations";
import { useBookings, recordReturn, confirmReturn } from "../hooks/useBookings";
import { PageLayout } from "../components/PageLayout";
import { Card } from "../components/Card";
import { FormField } from "../components/Common";
import { StatusBadge } from "../components/StatusBadge";
import { formatDateTime } from "../lib/utils";
import { useAuth } from "../hooks/useAuth";

export default function BookingReturnPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { bookings, reload } = useBookings();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const booking = bookings.find((b: any) => b.id === id) as any;
  const isOwner = booking?.resource?.owner_id === user?.id;
  const isBorrower = booking?.borrower_id === user?.id;

  const form = useForm<{
    returnCondition: string;
    missingAccessories: string[];
    damageNotes: string;
  }>({
    resolver: zodResolver(returnSchema) as any,
    defaultValues: {
      returnCondition: "Good",
      missingAccessories: [],
      damageNotes: "",
    },
  });

  async function handleReturn(values: any) {
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const v = values as any;
      const missing = (v.missingAccessories || [])
        .filter(Boolean)
        .map((s: string) => s.trim());
      await (recordReturn as any)(id, v.returnCondition, missing, v.damageNotes ? v.damageNotes : undefined);
      setMessage("Return recorded. The owner will confirm to complete the booking.");
      reload();
    } catch (e: any) {
      setError(e.message || "Could not record return");
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    setError("");
    setLoading(true);
    try {
      await (confirmReturn as any)(id);
      setMessage("Return confirmed. Booking completed.");
      reload();
    } catch (e: any) {
      setError(e.message || "Could not confirm return");
    } finally {
      setLoading(false);
    }
  }

  if (!booking) return <div className="page">Booking not found.</div>;

  return (
    <PageLayout>
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <span className="h-5 w-5 rounded-full bg-forest flex items-center justify-center text-white text-xs font-bold">
            !
          </span>
          <h1 className="font-bold text-dark">Return Resource</h1>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div className="p-3 rounded border border-border">
            <div className="flex justify-between items-start mb-2">
              <span className="font-medium text-dark">Resource</span>
              <span className="text-xs text-muted">Resource name</span>
            </div>
            <p className="text-sm">{booking.resource?.name || "—"}</p>
          </div>
          <div className="p-3 rounded border border-border">
            <div className="flex justify-between items-start mb-2">
              <span className="font-medium text-dark">Borrower</span>
              <span className="text-xs text-muted">Borrower name</span>
            </div>
            <p className="text-sm">{booking.borrower?.full_name || "—"}</p>
          </div>
        </div>
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-muted">
            Checked out {formatDateTime(booking.checkout_at)} — expected{" "}
            {formatDateTime(booking.expected_return_at)}
          </p>
        </div>

        {booking.status === "Checked Out" && isBorrower && (
          <>
            <form onSubmit={form.handleSubmit(handleReturn)} className="space-y-4 mb-6">
              <FormField label="Condition on return">
                <select className="input" {...form.register("returnCondition")} required>
                  <option value="Good">Good</option>
                  <option value="Fair">Fair</option>
                  <option value="Poor">Poor</option>
                  <option value="Damaged">Damaged</option>
                </select>
              </FormField>
              <FormField label="Missing accessories (comma separated)">
                <input className="input" {...form.register("missingAccessories")} />
              </FormField>
              <FormField label="Damage notes (optional)">
                <textarea className="input" rows={2} {...form.register("damageNotes")} />
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
                {loading ? "Recording…" : "Record Return"}
              </button>
            </form>
          </>
        )}

        {booking.status === "Returned" && isOwner && (
          <>
            <p className="text-sm text-muted mb-3">
              Borrower recorded the return on {formatDateTime(booking.return_at)}.
            </p>
            <button onClick={handleConfirm} className="btn-primary" disabled={loading}>
              {loading ? "Confirming…" : "Confirm Return → Completed"}
            </button>
            {error && (
              <div className="mt-3 p-3 rounded bg-rose-50 border border-rose-100 text-rose-700 text-sm">
                {error}
              </div>
            )}
          </>
        )}

        {(booking.status === "Completed" || (booking.status === "Returned" && !isOwner)) && (
          <p className="text-sm text-muted">
            Booking status: <StatusBadge status={booking.status} />
          </p>
        )}

        <Link to="/bookings" className="mt-4 btn-primary inline-block">
          Back to bookings
        </Link>
      </Card>
    </PageLayout>
  );
}
