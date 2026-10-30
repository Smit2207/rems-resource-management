import { useParams, useNavigate, Link } from "react-router-dom";
import { useState } from "react";
import { useBookings, decideBooking } from "../hooks/useBookings";
import { PageLayout } from "../components/PageLayout";
import { Card } from "../components/Card";
import { FormField } from "../components/Common";
import { StatusBadge } from "../components/StatusBadge";
import { formatDateTime } from "../lib/utils";

export default function BookingReviewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { bookings, reload } = useBookings();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);

  const booking = bookings.find((b: any) => b.id === id) as any;

  async function handleDecide(decision: "approve" | "reject") {
    setError("");
    setLoading(true);
    try {
      await (decideBooking as any)(
        id,
        decision,
        decision === "reject" ? (rejectReason || null) : undefined
      );
      reload();
      navigate("/bookings");
    } catch (e: any) {
      setError(e.message || "Could not process decision");
    } finally {
      setLoading(false);
    }
  }

  if (!booking) return <div className="page">Booking not found.</div>;
  if (booking.status !== "Pending") {
    return (
      <PageLayout>
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <span className="h-5 w-5 rounded-full bg-forest flex items-center justify-center text-white text-xs font-bold">
              !
            </span>
            <h1 className="font-bold text-dark">Booking Request</h1>
          </div>
          <p className="text-muted">
            This request has already been{" "}
            <StatusBadge status={booking.status} />.
          </p>
          {booking.rejection_reason && (
            <p className="mt-2 text-sm text-muted">
              Reason: {booking.rejection_reason}
            </p>
          )}
          <Link to="/bookings" className="btn-primary mt-4">Back to bookings</Link>
        </Card>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <span className="h-5 w-5 rounded-full bg-amber-50 flex items-center justify-center text-amber-600 text-xs font-bold">
            !
          </span>
          <h1 className="font-bold text-dark">Review Booking Request</h1>
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
          <div className="p-3 rounded border border-border">
            <div className="flex justify-between items-start mb-2">
              <span className="font-medium text-dark">Start Time</span>
              <span className="text-xs text-muted">Booking start</span>
            </div>
            <p className="text-sm">{formatDateTime(booking.start_time)}</p>
          </div>
          <div className="p-3 rounded border border-border">
            <div className="flex justify-between items-start mb-2">
              <span className="font-medium text-dark">End Time</span>
              <span className="text-xs text-muted">Booking end</span>
            </div>
            <p className="text-sm">{formatDateTime(booking.end_time)}</p>
          </div>
        </div>

        {rejecting && (
          <FormField label="Rejection reason (required)">
            <textarea
              className="input"
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              required
            />
          </FormField>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => handleDecide("approve")}
            className="btn-primary flex-1"
            disabled={loading}
          >
            Approve
          </button>
          <button
            onClick={() => setRejecting(true)}
            className="btn-ghost flex-1 text-rose-600 hover:bg-rose-50"
            disabled={loading}
          >
            Reject
          </button>
        </div>
        {rejecting && (
          <button
            onClick={() => handleDecide("reject")}
            className="btn-primary mt-3 w-full"
            disabled={loading || !rejectReason.trim()}
          >
            Confirm Reject
          </button>
        )}
        {error && <div className="mt-4 p-3 rounded bg-rose-50 border border-rose-100 text-rose-700 text-sm">{error}</div>}
      </Card>
    </PageLayout>
  );
}
