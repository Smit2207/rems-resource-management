import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useBookings, cancelBooking } from "../hooks/useBookings";
import { StatusBadge } from "../components/StatusBadge";
import { PageLayout } from "../components/PageLayout";
import { Card } from "../components/Card";
import { EmptyState } from "../components/Common";
import { formatDateTime } from "../lib/utils";
import { Calendar, AlertCircle } from "lucide-react";

export default function BookingsPage() {
  const { user } = useAuth();
  const { bookings, loading, error, reload } = useBookings();

  const isManager = user && (user.role === "manager" || user.role === "admin");
  const ownBookings = user
    ? bookings.filter((b: any) => b.borrower_id === user.id)
    : [];
  const ownerRequests = isManager
    ? bookings.filter((b: any) => b.resource?.owner_id === user.id || b.borrower_id !== user.id)
    : [];

  if (loading) return (
    <PageLayout>
      <div className="flex flex-col items-center justify-center py-20 text-center text-muted">
        Loading…
      </div>
    </PageLayout>
  );
  if (error) return (
    <PageLayout>
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="p-4 rounded bg-rose-50 border border-rose-100 text-rose-700 text-sm mb-4 flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      </div>
    </PageLayout>
  );

  async function handleCancel(id: string) {
    if (!window.confirm("Cancel this booking request?")) return;
    try {
      await cancelBooking(id);
      reload();
    } catch (e: any) {
      alert(e.message || "Could not cancel booking");
    }
  }

  return (
    <PageLayout>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Calendar className="h-6 w-6 text-forest" />
          <h1 className="text-xl font-bold text-dark">
            {isManager ? "Booking Requests" : "My Bookings"}
          </h1>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {!isManager && (
          <Card className="mb-6">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="font-bold text-dark">My Bookings</h2>
            </div>
            {ownBookings.length === 0 ? (
              <EmptyState
                title="No bookings yet"
                description="Browse resources and request a booking."
              />
            ) : (
              <div className="space-y-3">
                {ownBookings.map((b: any) => (
                  <Card key={b.id} className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-bold text-dark">
                        {b.resource?.name || "Resource"}
                      </h3>
                      <StatusBadge status={b.status} />
                      {b.status === "Checked Out" &&
                        b.expected_return_at &&
                        new Date(b.expected_return_at) < new Date() && (
                          <span className="text-xs text-rose-600 font-medium">
                            Overdue
                          </span>
                        )}
                    </div>
                    <p className="text-sm text-muted mb-2">
                      {formatDateTime(b.start_time)} – {formatDateTime(b.end_time)}
                    </p>
                    {b.rejection_reason && (
                      <p className="text-sm text-rose-600 mb-2">
                        Rejected: {b.rejection_reason}
                      </p>
                    )}
                    <div className="flex gap-2">
                      {b.status === "Pending" && (
                        <button
                          onClick={() => handleCancel(b.id)}
                          className="btn-outline text-sm text-rose-600 hover:bg-rose-50"
                        >
                          Cancel
                        </button>
                      )}
                      <Link
                        to={`/bookings/${b.id}/return`}
                        className="btn-outline text-sm"
                      >
                        Details
                      </Link>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </Card>
        )}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="font-bold text-dark">
              {isManager ? "All Requests" : "Requests for My Resources"}
            </h2>
          </div>
          {ownerRequests.length === 0 ? (
            <EmptyState
              title="No requests"
              description="Borrowers will request your resources here."
            />
          ) : (
            <div className="space-y-3">
              {ownerRequests.map((b: any) => (
                <Card key={b.id} className="p-4">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-dark">
                      {b.resource?.name || "Resource"}
                    </h3>
                    <StatusBadge status={b.status} />
                    {b.status === "Checked Out" &&
                      b.expected_return_at &&
                      new Date(b.expected_return_at) < new Date() && (
                        <span className="text-xs text-rose-600 font-medium">
                          Overdue
                        </span>
                      )}
                  </div>
                  <p className="text-sm text-muted mb-2">
                    Borrower: {b.borrower?.full_name || "—"} —{" "}
                    {formatDateTime(b.start_time)} – {formatDateTime(b.end_time)}
                  </p>
                  {b.status === "Pending" && (
                    <Link
                      to={`/bookings/${b.id}/review`}
                      className="btn-primary w-full text-sm"
                    >
                      Review Request
                    </Link>
                  )}
                </Card>
              ))}
            </div>
          )}
        </Card>
      </div>
    </PageLayout>
  );
}
