import {
  Users,
  Scale,
  AlertTriangle,
  Info,
} from "lucide-react";
import { useBookings } from "../hooks/useBookings";
import { useResources } from "../hooks/useResources";
import { useAuth } from "../hooks/useAuth";
import { PageLayout } from "../components/PageLayout";
import { Card } from "../components/Card";
import { EmptyState } from "../components/Common";

export default function FairSharePage() {
  const { bookings, loading: bookingsLoading } = useBookings();
  const { loading: resourcesLoading } = useResources();
  const { user } = useAuth();

  if (bookingsLoading || resourcesLoading) {
    return (
      <PageLayout>
        <div className="flex flex-col items-center justify-center py-20 text-center text-muted">
          Loading data…
        </div>
      </PageLayout>
    );
  }

  const userBookingCounts = new Map<string, { count: number; name: string }>();
  const resourceUsageCounts = new Map<string, { count: number; name: string }>();

  bookings.forEach((b) => {
    const borrowerId = b.borrower_id;
    const existing = userBookingCounts.get(borrowerId) || { count: 0, name: borrowerId.slice(0, 8) };
    userBookingCounts.set(borrowerId, { count: existing.count + 1, name: existing.name });

    const resId = b.resource_id;
    const existingRes = resourceUsageCounts.get(resId) || { count: 0, name: resId.slice(0, 8) };
    resourceUsageCounts.set(resId, { count: existingRes.count + 1, name: existingRes.name });
  });

  const totalUsers = userBookingCounts.size;
  const totalBookings = bookings.length;
  const avgBookingsPerUser = totalUsers > 0 ? totalBookings / totalUsers : 0;

  const fairnessData = Array.from(userBookingCounts.entries()).map(([id, data]) => {
    const ratio = avgBookingsPerUser > 0 ? data.count / avgBookingsPerUser : 0;
    let status: "under" | "average" | "over";
    if (ratio < 0.5) status = "under";
    else if (ratio > 1.5) status = "over";
    else status = "average";
    return {
      id,
      name: data.name,
      count: data.count,
      ratio,
      status,
    };
  });

  fairnessData.sort((a, b) => b.count - a.count);

  const underusedResources = Array.from(resourceUsageCounts.entries())
    .filter(([, data]) => data.count === 0 || data.count === 1)
    .map(([id, data]) => ({ id, name: data.name, count: data.count }));

  const overusedResources = Array.from(resourceUsageCounts.entries())
    .filter(([, data]) => data.count >= 5)
    .map(([id, data]) => ({ id, name: data.name, count: data.count }));

  const currentUser = user ? userBookingCounts.get(user.id) : null;
  const currentUserRatio = currentUser
    ? avgBookingsPerUser > 0
      ? currentUser.count / avgBookingsPerUser
      : 0
    : 0;

  return (
    <PageLayout>
      <div className="max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-dark">
              <Scale className="mr-2 h-5 w-5 text-forest" /> FairShare Engine
            </h1>
            <p className="text-muted">
              Fairness-aware recommendations based on resource usage and booking history.
              All figures are estimates derived from existing booking records.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="p-4">
            <div className="text-sm text-muted">Total Bookings</div>
            <div className="text-2xl font-bold text-dark">{totalBookings}</div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-muted">Active Borrowers</div>
            <div className="text-2xl font-bold text-dark">{totalUsers}</div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-muted">Avg Bookings per User</div>
            <div className="text-2xl font-bold text-dark">{avgBookingsPerUser.toFixed(1)}</div>
          </Card>
        </div>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-dark">Your Fair Share</h2>
          </div>
          <div className="p-4 rounded bg-forest/5 border border-forest/10">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-dark">Your bookings</span>
              <span className="text-sm font-bold text-dark">
                {currentUser ? currentUser.count : 0}
              </span>
            </div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-dark">Platform average</span>
              <span className="text-sm font-bold text-dark">
                {avgBookingsPerUser.toFixed(1)}
              </span>
            </div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-dark">Your ratio</span>
              <span className={`text-sm font-bold ${currentUserRatio < 0.5 ? "text-emerald-600" : currentUserRatio > 1.5 ? "text-rose-600" : "text-muted"}`}>
                {currentUserRatio.toFixed(2)}x
              </span>
            </div>
            <p className="text-sm text-muted mt-3">
              {currentUserRatio < 0.5
                ? "You are using fewer resources than average. Consider booking more if you need them."
                : currentUserRatio > 1.5
                ? "You are using more resources than average. Consider leaving room for others."
                : "Your usage is close to the platform average."}
            </p>
          </div>
        </Card>

        <Card className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-dark">
              <Users className="mr-2 h-4 w-4" /> Borrower Fairness
            </h2>
          </div>
          {fairnessData.length === 0 ? (
            <EmptyState title="No booking data" description="No bookings have been recorded yet." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted">
                    <th className="pb-3">Borrower</th>
                    <th className="pb-3">Bookings</th>
                    <th className="pb-3">Vs. Average</th>
                    <th className="pb-3">Fairness Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {fairnessData.map((f) => (
                    <tr key={f.id} className="hover:bg-forest/5 transition-colors">
                      <td className="pb-2">{f.name}</td>
                      <td className="pb-2">{f.count}</td>
                      <td className="pb-2">{f.ratio.toFixed(2)}x</td>
                      <td className="pb-2">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${
                            f.status === "under"
                              ? "bg-emerald/10 text-emerald-700"
                              : f.status === "over"
                              ? "bg-rose/10 text-rose-700"
                              : "bg-muted/50 text-muted"
                          }`}
                        >
                          {f.status === "under" ? "Under-used" : f.status === "over" ? "High usage" : "Average"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-muted mt-3">
            Fairness status: "under" = below 50% of average, "average" = 50–150% of average,
            "over" = above 150% of average. The platform enforces a maximum of 2 active
            bookings per user to prevent hoarding.
          </p>
        </Card>

        <Card className="mt-6">
          <div className="flex flex-col lg:flex-row gap-6 items-start">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-4">
                <h2 className="font-bold text-dark">
                  <ClockIcon className="mr-2 h-4 w-4" /> Underused Resources
                </h2>
              </div>
              {underusedResources.length === 0 ? (
                <p className="text-muted text-sm">No underused resources found.</p>
              ) : (
                <div className="space-y-2">
                  {underusedResources.map((r) => (
                    <div key={r.id} className="p-3 rounded border border-border flex justify-between items-center">
                      <div>
                        <span className="font-medium text-dark">{r.name}</span>
                        <p className="text-xs text-muted">{r.count} booking{r.count === 1 ? "" : "s"}</p>
                      </div>
                      <span className="text-xs text-emerald-600 font-medium">Underused</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="lg:w-1/3 min-w-0">
              <div className="flex items-center gap-2 mb-4">
                <h2 className="font-bold text-dark">
                  <AlertTriangle className="mr-2 h-4 w-4 text-amber-600" /> Heavily Used
                </h2>
              </div>
              {overusedResources.length === 0 ? (
                <p className="text-muted text-sm">No heavily used resources found.</p>
              ) : (
                <div className="space-y-2">
                  {overusedResources.map((r) => (
                    <div key={r.id} className="p-3 rounded border border-border flex justify-between items-center">
                      <div>
                        <span className="font-medium text-dark">{r.name}</span>
                        <p className="text-xs text-muted">{r.count} booking{r.count === 1 ? "" : "s"}</p>
                      </div>
                      <span className="text-xs text-rose-600 font-medium">High demand</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Card>

        <div className="mt-6 p-4 rounded bg-muted/50 border border-border/50 text-xs text-muted">
          <Info className="mr-2 h-4 w-4" />
          <strong>How FairShare works:</strong> Fairness is measured by comparing each borrower's
          total booking count against the platform average. The booking system already limits
          each user to 2 active bookings (Pending, Approved, or Checked Out) via the
          create_booking RPC. These statistics are descriptive only — they do not affect
          booking eligibility or priority.
        </div>
      </div>
    </PageLayout>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="10"></circle>
      <polyline points="12 6 12 12 16 14"></polyline>
    </svg>
  );
}
