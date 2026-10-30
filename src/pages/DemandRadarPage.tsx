import {
  AlertTriangle,
  Building2,
  Info,
} from "lucide-react";
import { useBookings } from "../hooks/useBookings";
import { useResources } from "../hooks/useResources";
import { useWaitingList } from "../hooks/useWaitingList";
import { PageLayout } from "../components/PageLayout";
import { Card } from "../components/Card";
import { EmptyState } from "../components/Common";
import type { Database } from "../lib/supabase";

type Resource = Database["public"]["Tables"]["resources"]["Row"];

export default function DemandRadarPage() {
  const { bookings, loading: bookingsLoading } = useBookings();
  const { resources, loading: resourcesLoading } = useResources();
  const { entries, loading: waitingLoading } = useWaitingList();

  if (bookingsLoading || resourcesLoading || waitingLoading) {
    return (
      <PageLayout>
        <div className="flex flex-col items-center justify-center py-20 text-center text-muted">
          Loading demand data…
        </div>
      </PageLayout>
    );
  }

  const resourceMap = new Map<string, Resource>();
  resources.forEach((r) => resourceMap.set(r.id, r));

  const resourceDemand = Array.from(resourceMap.entries()).map(([id, r]) => {
    const resBookings = bookings.filter((b) => b.resource_id === id);
    const pendingCount = resBookings.filter((b) => b.status === "Pending").length;
    const approvedCount = resBookings.filter((b) => b.status === "Approved").length;
    const checkoutCount = resBookings.filter((b) => b.status === "Checked Out").length;
    const totalCount = resBookings.length;

    const waitingEntries = entries.filter((e) => e.resource_id === id);
    const activeWaiting = waitingEntries.filter((e) => e.status === "active").length;

    const demandScore = pendingCount * 3 + approvedCount * 2 + checkoutCount * 2 + activeWaiting * 3;

    const isShortage = demandScore >= 5 && (checkoutCount === 0 || activeWaiting > 0);
    const isUnderused = totalCount === 0 || (totalCount <= 1 && activeWaiting === 0);

    return {
      resource: r,
      pending: pendingCount,
      approved: approvedCount,
      checkedOut: checkoutCount,
      totalBookings: totalCount,
      activeWaiting: activeWaiting,
      demandScore,
      isShortage,
      isUnderused,
    };
  });

  resourceDemand.sort((a, b) => b.demandScore - a.demandScore);

  const shortages = resourceDemand.filter((d) => d.isShortage);
  const underused = resourceDemand.filter((d) => d.isUnderused);
  const totalPending = bookings.filter((b) => b.status === "Pending").length;
  const totalActiveWaiting = entries.filter((e) => e.status === "active").length;

  return (
    <PageLayout>
      <div className="max-w-5xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-dark">
              <AlertTriangle className="mr-2 h-5 w-5 text-forest" /> Demand Radar
            </h1>
            <p className="text-muted">
              Identify resource shortages, demand patterns, and underused equipment.
              All insights are descriptive estimates based on historical booking data.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card className="p-4">
            <div className="text-sm text-muted">Resource Shortages</div>
            <div className="text-2xl font-bold text-dark text-rose-600">{shortages.length}</div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-muted">Underused Resources</div>
            <div className="text-2xl font-bold text-dark text-amber-600">{underused.length}</div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-muted">Pending Requests</div>
            <div className="text-2xl font-bold text-dark">{totalPending}</div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-muted">Active Waiting List</div>
            <div className="text-2xl font-bold text-dark">{totalActiveWaiting}</div>
          </Card>
        </div>

        {shortages.length > 0 && (
          <Card className="mb-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="h-5 w-5 rounded-full bg-rose-50 flex items-center justify-center text-rose-600 text-xs font-bold">
                !
              </span>
              <h2 className="font-bold text-dark">Potential Shortages</h2>
            </div>
            <p className="text-sm text-muted mb-3">
              These resources have high demand scores and may be difficult to book.
            </p>
            <div className="space-y-2">
              {shortages.map((d) => (
                <div key={d.resource.id} className="p-3 rounded border border-rose-100 bg-rose/5">
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-medium text-dark">{d.resource.name}</span>
                    <span className="text-xs font-bold text-rose-600">Shortage risk</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs mt-1">
                    <div>
                      <span className="text-muted">Pending: {d.pending}</span>
                    </div>
                    <div>
                      <span className="text-muted">Waiting: {d.activeWaiting}</span>
                    </div>
                    <div>
                      <span className="text-muted">Checked out: {d.checkedOut}</span>
                    </div>
                  </div>
                  <p className="text-xs text-rose-600 mt-1">
                    Demand score: {d.demandScore}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        )}

        {underused.length > 0 && (
          <Card className="mb-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="h-5 w-5 rounded-full bg-amber-50 flex items-center justify-center text-amber-600 text-xs font-bold">
                Clock
              </span>
              <h2 className="font-bold text-dark">Underused Resources</h2>
            </div>
            <p className="text-sm text-muted mb-3">
              These resources have little or no booking activity and may be candidates
              for reallocation or maintenance review.
            </p>
            <div className="space-y-2">
              {underused.map((d) => (
                <div key={d.resource.id} className="p-3 rounded border border-amber-100 bg-amber/5">
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-medium text-dark">{d.resource.name}</span>
                    <span className="text-xs font-bold text-amber-600">Underused</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs mt-1">
                    <div>
                      <span className="text-muted">Bookings: {d.totalBookings}</span>
                    </div>
                    <div>
                      <span className="text-muted">Checkouts: {d.checkedOut}</span>
                    </div>
                    <div>
                      <span className="text-muted">Waiting: {d.activeWaiting}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-dark">
              <Building2 className="mr-2 h-4 w-4" /> Resource Demand Ranking
            </h2>
          </div>
          {resourceDemand.length === 0 ? (
            <EmptyState title="No demand data" description="No bookings or resources have been recorded yet." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted">
                    <th className="pb-3">Resource</th>
                    <th className="pb-3">Demand Score</th>
                    <th className="pb-3">Pending</th>
                    <th className="pb-3">Approved</th>
                    <th className="pb-3">Checked Out</th>
                    <th className="pb-3">Waiting List</th>
                    <th className="pb-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {resourceDemand.map((d) => {
                    let status: string;
                    let statusClass: string;
                    if (d.isShortage) {
                      status = "Shortage risk";
                      statusClass = "text-rose-600 font-medium";
                    } else if (d.isUnderused) {
                      status = "Underused";
                      statusClass = "text-amber-600 font-medium";
                    } else {
                      status = "Normal";
                      statusClass = "text-emerald-600 font-medium";
                    }
                    return (
                      <tr key={d.resource.id} className="hover:bg-forest/5 transition-colors">
                        <td className="pb-2">{d.resource.name}</td>
                        <td className="pb-2">{d.demandScore}</td>
                        <td className="pb-2">{d.pending}</td>
                        <td className="pb-2">{d.approved}</td>
                        <td className="pb-2">{d.checkedOut}</td>
                        <td className="pb-2">{d.activeWaiting}</td>
                        <td className="pb-2"><span className={statusClass}>{status}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="mt-6 p-4 rounded bg-muted/50 border border-border/50 text-xs text-muted">
          <Info className="mr-2 h-4 w-4" />
          <strong>How Demand Radar works:</strong> Demand scores combine pending requests
          (×3), active waiting list entries (×3), approved bookings (×2), and checkouts
          (×2). Shortage risk is flagged when demand score ≥ 5 with active waiting entries
          or no current availability. Underused resources have ≤ 1 booking and no waiting
          list entries. These are descriptive insights only — they do not change booking
          eligibility or priority.
        </div>
      </div>
    </PageLayout>
  );
}
