import { useState } from "react";
import {
  MapPin,
  Building2,
  Info,
} from "lucide-react";
import { useResources } from "../hooks/useResources";
import { useBookings } from "../hooks/useBookings";
import { PageLayout } from "../components/PageLayout";
import { Card } from "../components/Card";
import { EmptyState } from "../components/Common";
import { isLifecycleBookable, lifecycleLabel } from "../lib/eligibility";
import type { Database } from "../lib/supabase";

type Resource = Database["public"]["Tables"]["resources"]["Row"];

export default function CampusMapPage() {
  const { resources, loading: resourcesLoading } = useResources();
  const { bookings, loading: bookingsLoading } = useBookings();

  const [viewMode, setViewMode] = useState<"list" | "grid">("grid");
  const [locValue, setLocValue] = useState("");

  if (resourcesLoading || bookingsLoading) {
    return (
      <PageLayout>
        <div className="flex flex-col items-center justify-center py-20 text-center text-muted">
          Loading campus resources…
        </div>
      </PageLayout>
    );
  }

  const resourceMap = new Map<string, Resource>();
  resources.forEach((r) => resourceMap.set(r.id, r));

  const campusResources = resources.map((r) => {
    const resBookings = bookings.filter((b) => b.resource_id === r.id);
    const isCheckedOut = resBookings.some((b) => b.status === "Checked Out");
    const hasApproved = resBookings.some((b) => b.status === "Approved");
    const isAvailable =
      isLifecycleBookable(r.lifecycle_state || "available") && !isCheckedOut;
    return {
      ...r,
      isAvailable,
      isCheckedOut,
      hasApproved,
    };
  });

  const locations = Array.from(
    new Set(campusResources.filter((r) => r.location).map((r) => r.location))
  ).sort();

  const filtered = locValue
    ? campusResources.filter((r) => r.location === locValue)
    : campusResources;

  const availableCount = filtered.filter((r) => r.isAvailable).length;
  const checkedOutCount = filtered.filter((r) => r.isCheckedOut).length;

  return (
    <PageLayout>
      <div className="max-w-5xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-dark">
              <MapPin className="mr-2 h-5 w-5 text-forest" /> Campus Resource Map
            </h1>
            <p className="text-muted">
              Visualize resource locations and availability across campus.
              This is a list/grid view of resources grouped by location.
            </p>
          </div>
        </div>

        <Card className="mb-6">
          <div className="flex flex-col lg:flex-row gap-4 items-start">
            <div className="flex-1 min-w-0">
              <label className="label block text-sm font-medium mb-1">
                Filter by location
              </label>
              <select
                className="input w-full"
                value={locValue}
                onChange={(e) => setLocValue(e.target.value)}
              >
                <option value="">All locations</option>
                {locations.map((loc) => (
                  <option key={loc} value={String(loc)}>
                    {loc}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 mt-4 lg:mt-0">
              <button
                onClick={() => setViewMode("grid")}
                className={`btn-ghost px-3 py-2 rounded-md border ${viewMode === "grid" ? "bg-forest text-white border-forest" : ""}`}
              >
                <Building2 className="mr-1.5 h-4 w-4" /> Grid
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`btn-ghost px-3 py-2 rounded-md border ${viewMode === "list" ? "bg-forest text-white border-forest" : ""}`}
              >
                <ListIcon className="mr-1.5 h-4 w-4" /> List
              </button>
            </div>
          </div>
          {locValue && (
            <div className="mt-4 p-3 rounded bg-forest/5 border border-forest/10">
              <h3 className="font-bold text-dark">{locValue}</h3>
              <p className="text-sm text-muted">
                {availableCount} available • {checkedOutCount} checked out of {filtered.length} resources
              </p>
            </div>
          )}
          <div className="mt-4 flex gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>Available</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-500"></span>
              <span>Checked Out</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              <span>Has Approved Booking</span>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-dark">
              {filtered.length} campus resource{filtered.length !== 1 ? "s" : ""}
            </h2>
          </div>
          {filtered.length === 0 ? (
            <EmptyState
              title="No resources found"
              description="Try adjusting the location filter or add resources first."
            />
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((r) => (
                <ResourceCard key={r.id} resource={r} />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted">
                    <th className="pb-3">Resource</th>
                    <th className="pb-3">Location</th>
                    <th className="pb-3">Type</th>
                    <th className="pb-3">Capacity</th>
                    <th className="pb-3">Lifecycle</th>
                    <th className="pb-3">Availability</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((r) => {
                    const available = r.isAvailable;
                    const checkedOut = r.isCheckedOut;
                    return (
                      <tr key={r.id} className="hover:bg-forest/5 transition-colors">
                        <td className="pb-2">
                          <span className="font-medium text-dark">{r.name}</span>
                        </td>
                        <td className="pb-2 text-xs text-muted">{r.location || "—"}</td>
                        <td className="pb-2 text-xs text-muted">{r.type}</td>
                        <td className="pb-2 text-xs text-muted">
                          {r.capacity != null ? r.capacity : "—"}
                        </td>
                        <td className="pb-2 text-xs text-muted">
                          {lifecycleLabel(r.lifecycle_state || "available")}
                        </td>
                        <td className="pb-2">
                          <span
                            className={`text-xs font-bold ${
                              available
                                ? "text-emerald-600"
                                : checkedOut
                                ? "text-rose-600"
                                : "text-amber-600"
                            }`}
                          >
                            {available ? "Available" : checkedOut ? "Checked Out" : "Booked"}
                          </span>
                        </td>
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
          <strong>About the Campus Map:</strong> This view shows all resources organized by
          location with their current availability. Availability is determined by lifecycle
          state and whether the resource currently has a Checked Out booking. This is a
          read-only visualization — to book a resource, go to its detail page from Browse
          Resources.
        </div>
      </div>
    </PageLayout>
  );
}

function ResourceCard({ resource }: { resource: any }) {
  const available = resource.isAvailable;
  const checkedOut = resource.isCheckedOut;
  return (
    <div
      className={`card p-4 hover:border-forest transition-colors ${available ? "border-forest/20" : checkedOut ? "border-rose/20" : "border-amber/20"}`}
    >
      <div className="flex justify-between items-start mb-2">
        <h3 className="font-bold text-dark">{resource.name}</h3>
        <span
          className={`text-xs font-bold px-2 py-0.5 rounded ${available ? "bg-emerald/10 text-emerald-700" : checkedOut ? "bg-rose/10 text-rose-700" : "bg-amber/10 text-amber-700"}`}
        >
          {available ? "Available" : checkedOut ? "Checked Out" : "Booked"}
        </span>
      </div>
      <p className="text-sm text-muted mb-3">
        {resource.description || "No description available"}
      </p>
      <div className="space-y-1 text-xs mb-3">
        <div className="flex justify-between">
          <span className="text-muted">Location:</span>
          <span className="text-dark">{resource.location || "—"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">Type:</span>
          <span className="text-dark">{resource.type}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">Capacity:</span>
          <span className="text-dark">{resource.capacity != null ? resource.capacity : "—"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">Lifecycle:</span>
          <span className="text-dark">{lifecycleLabel(resource.lifecycle_state || "available")}</span>
        </div>
      </div>
      {resource.tags && resource.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {resource.tags.map((tag: string) => (
            <span
              key={tag}
              className="px-2 py-1 rounded bg-forest/5 text-forest text-xs border border-forest/10"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ListIcon({ className }: { className?: string }) {
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
      <line x1="8" y1="6" x2="21" y2="6"></line>
      <line x1="8" y1="12" x2="21" y2="12"></line>
      <line x1="8" y1="18" x2="21" y2="18"></line>
      <line x1="3" y1="6" x2="3.01" y2="6"></line>
      <line x1="3" y1="12" x2="3.01" y2="12"></line>
      <line x1="3" y1="18" x2="3.01" y2="18"></line>
    </svg>
  );
}
