import {
  Activity,
  Leaf,
  AlertTriangle,
} from "lucide-react";
import { useBookings } from "../hooks/useBookings";
import { useResources } from "../hooks/useResources";
import { PageLayout } from "../components/PageLayout";
import { Card } from "../components/Card";
import { EmptyState } from "../components/Common";
import { formatDateTime } from "../lib/utils";
import type { Database } from "../lib/supabase";

type Resource = Database["public"]["Tables"]["resources"]["Row"];

export default function ImpactLedgerPage() {
  const { bookings, loading: bookingsLoading } = useBookings();
  const { resources, loading: resourcesLoading } = useResources();

  if (bookingsLoading || resourcesLoading) {
    return (
      <PageLayout>
        <div className="flex flex-col items-center justify-center py-20 text-center text-muted">
          Loading data…
        </div>
      </PageLayout>
    );
  }

  const resourceMap = new Map<string, Resource>();
  resources.forEach((r) => resourceMap.set(r.id, r));

  const resourceStats = Array.from(resourceMap.entries()).map(([id, r]) => {
    const resBookings = bookings.filter((b) => b.resource_id === id);
    const checkoutCount = resBookings.filter((b) => b.status === "Checked Out").length;
    const completedCount = resBookings.filter((b) => b.status === "Completed").length;
    const totalCount = resBookings.length;

    const estimatedHandlingMinutes = checkoutCount * 15;
    const estimatedUsageHours = checkoutCount * 1;
    const estimatedCO2eKg = checkoutCount * 0.5;

    return {
      resource: r,
      totalBookings: totalCount,
      checkouts: checkoutCount,
      completions: completedCount,
      estimatedHandlingMinutes,
      estimatedUsageHours,
      estimatedCO2eKg,
      lastUsed: resBookings.length > 0
        ? resBookings.reduce((latest, b) => (b.updated_at > latest.updated_at ? b : latest), resBookings[0])
        : null,
    };
  });

  resourceStats.sort((a, b) => b.checkouts - a.checkouts);

  const totalCheckouts = resourceStats.reduce((sum, s) => sum + s.checkouts, 0);
  const totalCO2e = resourceStats.reduce((sum, s) => sum + s.estimatedCO2eKg, 0);
  const totalUsageHours = resourceStats.reduce((sum, s) => sum + s.estimatedUsageHours, 0);

  return (
    <PageLayout>
      <div className="max-w-5xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-dark">
              <Activity className="mr-2 h-5 w-5 text-forest" /> Resource Impact Ledger
            </h1>
            <p className="text-muted">
              Usage statistics and estimated operational impact per resource.
              <span className="text-rose-600">All environmental impact figures are estimates only</span> —
              they are illustrative and not based on measured utility or sensor data.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card className="p-4">
            <div className="text-sm text-muted">Total Resources</div>
            <div className="text-2xl font-bold text-dark">{resources.length}</div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-muted">Total Checkouts</div>
            <div className="text-2xl font-bold text-dark">{totalCheckouts}</div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-muted">Est. Usage Hours</div>
            <div className="text-2xl font-bold text-dark">{totalUsageHours.toFixed(0)}</div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-muted">Est. CO₂e (kg)</div>
            <div className="text-2xl font-bold text-dark">{totalCO2e.toFixed(1)}</div>
          </Card>
        </div>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-dark">
              <Leaf className="mr-2 h-4 w-4" /> Per-Resource Impact
            </h2>
          </div>
          {resourceStats.length === 0 ? (
            <EmptyState title="No resource data" description="No resources have been added yet." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted">
                    <th className="pb-3">Resource</th>
                    <th className="pb-3">Type</th>
                    <th className="pb-3">Location</th>
                    <th className="pb-3">Checkouts</th>
                    <th className="pb-3">Completions</th>
                    <th className="pb-3">Est. Usage (hrs)</th>
                    <th className="pb-3">Est. CO₂e (kg)</th>
                    <th className="pb-3">Last Used</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {resourceStats.map((s) => (
                    <tr key={s.resource.id} className="hover:bg-forest/5 transition-colors">
                      <td className="pb-2">
                        <span className="font-medium text-dark">{s.resource.name}</span>
                      </td>
                      <td className="pb-2 text-xs text-muted">{s.resource.type}</td>
                      <td className="pb-2 text-xs text-muted">{s.resource.location || "—"}</td>
                      <td className="pb-2">{s.checkouts}</td>
                      <td className="pb-2">{s.completions}</td>
                      <td className="pb-2">{s.estimatedUsageHours.toFixed(1)}</td>
                      <td className="pb-2">{s.estimatedCO2eKg.toFixed(1)}</td>
                      <td className="pb-2 text-xs text-muted">
                        {s.lastUsed ? formatDateTime(s.lastUsed.updated_at) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="mt-6 p-4 rounded bg-amber/50 border border-amber/100 text-xs text-amber-700">
          <AlertTriangle className="mr-2 h-4 w-4" />
          <strong>Estimate disclaimer:</strong> Impact figures are rough estimates for illustrative
          purposes only. Each checkout is assumed to consume ~1 hour of resource use and produce
          ~0.5 kg CO₂e. No real utility meters, sensors, or environmental data sources are
          connected to this system. Do not use these figures for reporting or compliance.
        </div>
      </div>
    </PageLayout>
  );
}
