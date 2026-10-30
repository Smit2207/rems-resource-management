import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { PageLayout } from "../components/PageLayout";
import { Card } from "../components/Card";
import { useBookings } from "../hooks/useBookings";
import { useIncidents } from "../hooks/useIncidents";
import { Link } from "react-router-dom";
import { StatusBadge } from "../components/StatusBadge";
import { formatDateTime } from "../lib/utils";
import { Activity, TrendingUp, AlertCircle, Building } from "lucide-react";

type BookingWithResource = {
  id: string;
  resource_id: string;
  borrower_id: string;
  status: string;
  start_time: string;
  end_time: string;
  rejection_reason: string | null;
  requested_at: string;
  decided_at: string | null;
  decided_by: string | null;
  checkout_at: string | null;
  checkout_by: string | null;
  checkout_condition: string | null;
  accessories_included: string[] | null;
  expected_return_at: string | null;
  return_at: string | null;
  return_by: string | null;
  return_condition: string | null;
  missing_accessories: string[] | null;
  damage_notes: string | null;
  created_at: string;
  updated_at: string;
  resource?: {
    name: string | null;
    owner_id: string | null;
  };
  borrower?: {
    full_name: string | null;
  };
};

export default function ManagerPage() {
  const { bookings, loading: bookingsLoading, error: bookingsError, reload: reloadBookings } = useBookings();
  const { incidents, loading: incidentsLoading, error: incidentsError, reload: reloadIncidents } = useIncidents();
  const [resources, setResources] = useState<any[]>([]);
  const [resourcesLoading, setResourcesLoading] = useState(true);
  const [resourcesError, setResourcesError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const loadResources = async () => {
      setResourcesLoading(true);
      try {
        const { data, error } = await supabase
          .from("resources")
          .select("id, name, status, type, created_at")
          .order("created_at", { ascending: false });
        if (error) throw error;
        if (mounted) setResources(data ?? []);
      } catch (err: any) {
        if (mounted) setResourcesError(err.message || "Failed to load resources");
      } finally {
        if (mounted) setResourcesLoading(false);
      }
    };
    loadResources();
    return () => {
      mounted = false;
    };
  }, []);

  const loading = bookingsLoading || incidentsLoading || resourcesLoading;
  const error = bookingsError || incidentsError || resourcesError;

  const totalResources = resources.length;
  const activeResources = resources.filter((r) => r.status === "active").length;
  const pendingRequests = bookings.filter((b) => b.status === "Pending").length;
  const activeBookings = bookings.filter(
    (b) => b.status === "Approved" || b.status === "Checked Out"
  ).length;
  const overdueBookings = bookings.filter(
    (b) => b.status === "Checked Out" && b.expected_return_at && new Date(b.expected_return_at) < new Date()
  ).length;
  const openIncidents = incidents.filter(
    (i) => i.status === "open" || i.status === "under_review"
  ).length;

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const checkedOutCount = bookings.filter((b) => b.status === "Checked Out").length;
  const utilization = totalResources > 0
    ? Math.round((checkedOutCount / totalResources) * 100)
    : 0;
  const recentActivity = bookings.filter(
    (b) => new Date(b.created_at || 0) >= thirtyDaysAgo
  ).slice(0, 8);
  const resolvedIncidents = incidents.filter((i) => i.status === "resolved").length;

  if (loading) return (
    <PageLayout>
      <div className="flex flex-col items-center justify-center py-20 text-center text-muted">
        Loading dashboard…
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
        <button
          onClick={() => {
            reloadBookings();
            reloadIncidents();
            window.location.reload();
          }}
          className="btn-primary"
        >
          Retry
        </button>
      </div>
    </PageLayout>
  );

  const overdueList = bookings
    .filter(
      (b) => b.status === "Checked Out" && b.expected_return_at && new Date(b.expected_return_at) < new Date()
    )
    .slice(0, 5);

  const openIncidentList = incidents
    .filter((i) => i.status === "open" || i.status === "under_review")
    .slice(0, 5);

  return (
    <PageLayout>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Building className="h-6 w-6 text-forest" />
          <h1 className="text-xl font-bold text-dark">Manager Dashboard</h1>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card className="p-4">
          <div className="text-sm text-muted">Total Resources</div>
          <div className="text-2xl font-bold text-dark">{totalResources}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted">Active Resources</div>
          <div className="text-2xl font-bold text-dark">{activeResources}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted">Pending Requests</div>
          <div className="text-2xl font-bold text-dark">{pendingRequests}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted">Active Bookings</div>
          <div className="text-2xl font-bold text-dark">{activeBookings}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted">Overdue Bookings</div>
          <div className={`text-2xl font-bold ${overdueBookings > 0 ? "text-rose-600" : "text-forest"}`}>
            {overdueBookings}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted">Open Incidents</div>
          <div className={`text-2xl font-bold ${openIncidents > 0 ? "text-rose-600" : "text-forest"}`}>
            {openIncidents}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted">Resource Utilization</div>
          <div className={`text-2xl font-bold ${utilization > 0 ? "text-forest" : "text-muted"}`}>
            {utilization}%
          </div>
          <div className="text-xs text-muted mt-1">
            {checkedOutCount} of {totalResources} resources checked out
          </div>
        </Card>
      </div>

      {overdueBookings > 0 && (
        <Card className="mb-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="h-5 w-5 rounded-full bg-rose-50 flex items-center justify-center text-rose-600 text-xs font-bold">
              !
            </span>
            <h2 className="font-bold text-dark">Overdue Bookings</h2>
          </div>
          <div className="space-y-2">
            {overdueList.map((b) => (
              <div key={b.id} className="p-3 border rounded-lg">
                <div className="flex justify-between items-start mb-1">
                  <span className="font-medium text-dark">
                    {(b as BookingWithResource).resource?.name || "Resource"}
                  </span>
                  <span className="text-xs text-rose-600 font-medium">Overdue</span>
                </div>
                <p className="text-sm text-muted">
                  Expected {formatDateTime(b.expected_return_at || "")}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-3">
            <Link to="/bookings" className="btn-primary w-full">
              View All Bookings
            </Link>
          </div>
        </Card>
      )}

      {openIncidents > 0 && (
        <Card className="mb-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="h-5 w-5 rounded-full bg-amber-50 flex items-center justify-center text-amber-600 text-xs font-bold">
              !
            </span>
            <h2 className="font-bold text-dark">Open Incidents</h2>
          </div>
          <div className="space-y-2">
            {openIncidentList.map((i) => (
              <div key={i.id} className="p-3 border rounded-lg">
                <div className="flex justify-between items-start mb-1">
                  <span className="font-medium text-dark">{i.type}</span>
                  <span className={`text-xs font-medium ${i.status === "open" ? "text-rose-600" : "text-amber-600"}`}>
                    {i.status}
                  </span>
                </div>
                <p className="text-sm text-muted">{i.description}</p>
              </div>
            ))}
          </div>
          <div className="mt-3">
            <Link to="/incidents" className="btn-primary w-full">
              View All Incidents
            </Link>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">
        <div className="lg:col-span-2">
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <Activity className="h-5 w-5 text-forest" />
              <h2 className="font-bold text-dark">Recent Booking Activity (last 30 days)</h2>
            </div>
            {recentActivity.length === 0 ? (
              <p className="text-muted">No booking activity in the last 30 days.</p>
            ) : (
              <div className="space-y-3">
                {recentActivity.map((b) => (
                  <div key={b.id} className="p-3 border rounded-lg">
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-medium text-dark">
                        {((b as BookingWithResource).resource?.name) || "Resource"}
                      </span>
                      <StatusBadge status={b.status} />
                    </div>
                    <p className="text-sm text-muted">
                      Borrower: {((b as any).borrower?.full_name) || "—"} &middot;
                      {formatDateTime(b.created_at || "")}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
        <div className="lg:col-span-1">
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="h-5 w-5 text-forest" />
              <h2 className="font-bold text-dark">Incident Outcomes</h2>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center p-2 rounded bg-rose-50">
                <span className="text-sm text-muted">Open / Under review</span>
                <span className="text-sm font-bold text-rose-600">{openIncidents}</span>
              </div>
              <div className="flex justify-between items-center p-2 rounded bg-forest/5">
                <span className="text-sm text-muted">Resolved</span>
                <span className="text-sm font-bold text-forest">{resolvedIncidents}</span>
              </div>
              <div className="flex justify-between items-center p-2 rounded bg-amber-50">
                <span className="text-sm text-muted">Total incidents</span>
                <span className="text-sm font-bold text-amber-700">{incidents.length}</span>
              </div>
            </div>
            <div className="mt-3">
              <Link to="/incidents" className="btn-primary w-full text-sm">
                Review Incidents
              </Link>
            </div>
          </Card>
          <Card className="mt-6">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="font-bold text-dark">Quick Actions</h2>
            </div>
            <div className="space-y-2">
              <Link to="/bookings" className="btn-primary w-full">
                Review Booking Requests
              </Link>
              <Link to="/resources/mine" className="btn-primary w-full">
                Manage Resources
              </Link>
              <Link to="/incidents" className="btn-primary w-full">
                Review Incidents
              </Link>
              <Link to="/audit" className="btn-primary w-full">
                View Audit History
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </PageLayout>
  );
}
