import { useState, useEffect, useCallback } from "react";
import {
  ShieldAlert,
  RefreshCw,
  Info,
} from "lucide-react";
import { useBookings, type BookingWithResource } from "../hooks/useBookings";
import { supabase } from "../lib/supabase";
import { PageLayout } from "../components/PageLayout";
import { Card } from "../components/Card";
import { EmptyState } from "../components/Common";

interface ResourceSummary {
  name: string;
  location: string | null;
  type: string | null;
  owner_id: string;
}

interface Passport {
  resource_id: string;
  resource: ResourceSummary | null;
  bookings: BookingWithResource[];
  incidents: any[];
  checkouts: number;
  returns: number;
  incidentsCount: number;
  lastCondition: string | null;
  lastReturnCondition: string | null;
}

export default function TrustPassportPage() {
  const { bookings, loading: bookingsLoading, error: bookingsError } =
    useBookings();

  const [incidents, setIncidents] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Load incidents using the authenticated Supabase client.
  const loadIncidents = useCallback(async () => {
    try {
      const { data, error: err } = await supabase
        .from("incidents")
        .select(
          "*, booking:bookings(resource:resources(name, location, type, owner_id))",
        )
        .order("created_at", { ascending: false });
      if (err) throw err;
      setIncidents(data ?? []);
    } catch (e: any) {
      setError(e.message || "Could not load incidents");
    }
  }, []);

  useEffect(() => {
    loadIncidents();
  }, [loadIncidents]);

  if (bookingsLoading) {
    return (
      <PageLayout>
        <div className="flex flex-col items-center justify-center py-20 text-center text-muted">
          Loading booking history…
        </div>
      </PageLayout>
    );
  }

  // Build a per-resource trust passport from booking + incident history.
  const resourcePassports = new Map<string, Passport>();

  bookings.forEach((b) => {
    const resId = b.resource_id;
    const existing: Passport = resourcePassports.get(resId) || {
      resource_id: resId,
      resource: b.resource
        ? {
            name: b.resource.name,
            location: b.resource.location,
            type: b.resource.type,
            owner_id: b.resource.owner_id,
          }
        : null,
      bookings: [],
      incidents: [],
      checkouts: 0,
      returns: 0,
      incidentsCount: 0,
      lastCondition: null,
      lastReturnCondition: null,
    };
    existing.bookings.push(b);
    if (b.status === "Checked Out") existing.checkouts++;
    if (b.status === "Returned" || b.status === "Completed") existing.returns++;
    if (b.checkout_condition) existing.lastCondition = b.checkout_condition;
    if (b.return_condition) existing.lastReturnCondition = b.return_condition;
    resourcePassports.set(resId, existing);
  });

  // Merge incidents into passports
  incidents.forEach((inc) => {
    const bookingId = inc.booking_id;
    const booking = bookings.find((b) => b.id === bookingId);
    if (booking) {
      const resId = booking.resource_id;
      const passport = resourcePassports.get(resId);
      if (passport) {
        passport.incidents.push(inc);
        passport.incidentsCount++;
      }
    }
  });

  const passportArray = Array.from(resourcePassports.values()).sort(
    (a, b) => b.incidentsCount - a.incidentsCount || b.checkouts - a.checkouts
  );

  const hasError = bookingsError || error;

  return (
    <PageLayout>
      <div className="max-w-5xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-dark">
              <ShieldAlert className="mr-2 h-5 w-5 text-forest" /> Trust Passport
            </h1>
            <p className="text-muted">
              Condition history, handovers, and incident records per resource.
              The passport aggregates checkout/return conditions and reported incidents.
            </p>
          </div>
        </div>

        {hasError && (
          <div className="p-3 rounded bg-rose-50 border border-rose-100 text-rose-700 text-sm mb-4">
            {hasError}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="p-4">
            <div className="text-sm text-muted">Resources Tracked</div>
            <div className="text-2xl font-bold text-dark">{passportArray.length}</div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-muted">Total Checkouts</div>
            <div className="text-2xl font-bold text-dark">
              {passportArray.reduce((sum, p) => sum + p.checkouts, 0)}
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-muted">Total Returns</div>
            <div className="text-2xl font-bold text-dark">
              {passportArray.reduce((sum, p) => sum + p.returns, 0)}
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-muted">Total Incidents</div>
            <div className="text-2xl font-bold text-dark">
              {passportArray.reduce((sum, p) => sum + p.incidentsCount, 0)}
            </div>
          </Card>
        </div>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-dark">
              <RefreshCw className="mr-2 h-4 w-4" /> Resource Condition History
            </h2>
          </div>
          {passportArray.length === 0 ? (
            <EmptyState
              title="No resource history"
              description="No bookings have been recorded yet. Trust passports are built from booking and incident data."
            />
          ) : (
            <div className="space-y-3">
              {passportArray.map((p) => {
                const res = p.resource;
                const hasIncidents = p.incidentsCount > 0;
                const trustScore = Math.max(0, 100 - p.incidentsCount * 20);
                return (
                  <Card key={p.resource_id} className="p-4 border">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="font-bold text-dark">
                          {res?.name || "Unknown Resource"}
                        </h3>
                        <p className="text-xs text-muted">
                          {res?.location || "—"} • {res?.type || "—"}
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-bold text-muted">Trust Score</div>
                        <div className={`text-lg font-bold ${
                          trustScore >= 80 ? "text-emerald-600" :
                          trustScore >= 60 ? "text-amber-600" : "text-rose-600"
                        }`}>
                          {trustScore}/100
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3 text-xs">
                      <div className="p-2 rounded bg-muted/50">
                        <div className="text-xs text-muted">Checkouts</div>
                        <div className="text-sm font-bold">{p.checkouts}</div>
                      </div>
                      <div className="p-2 rounded bg-muted/50">
                        <div className="text-xs text-muted">Returns</div>
                        <div className="text-sm font-bold">{p.returns}</div>
                      </div>
                      <div className="p-2 rounded bg-muted/50">
                        <div className="text-xs text-muted">Incidents</div>
                        <div className="text-sm font-bold">{p.incidentsCount}</div>
                      </div>
                    </div>
                    {p.lastCondition && (
                      <div className="mb-2 p-2 rounded bg-forest/5 border border-forest/10">
                        <div className="text-xs font-medium text-forest-700 mb-1">Last checkout condition</div>
                        <div className="text-sm">{p.lastCondition}</div>
                      </div>
                    )}
                    {p.lastReturnCondition && (
                      <div className="mb-2 p-2 rounded bg-forest/5 border border-forest/10">
                        <div className="text-xs font-medium text-forest-700 mb-1">Last return condition</div>
                        <div className="text-sm">{p.lastReturnCondition}</div>
                      </div>
                    )}
                    {hasIncidents && (
                      <div className="mb-3">
                        <div className="text-xs font-medium text-rose-700 mb-1">Recent incidents:</div>
                        <div className="space-y-1">
                          {p.incidents.slice(0, 3).map((inc: any) => (
                            <div key={inc.id} className="text-xs text-rose-600">
                              • {inc.type.replace(/_/g, " ")} — {inc.description.slice(0, 60)}{inc.description.length > 60 ? "…" : ""}
                            </div>
                          ))}
                          {p.incidentsCount > 3 && (
                            <div className="text-xs text-muted mt-1">+ {p.incidentsCount - 3} more incident(s)</div>
                          )}
                        </div>
                      </div>
                    )}
                    {!hasIncidents && (
                      <div className="text-xs text-emerald-600 mt-2">No incidents reported.</div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </Card>

        <div className="mt-6 p-4 rounded bg-muted/50 border border-border/50 text-xs text-muted">
          <Info className="mr-2 h-4 w-4" />
          <strong>How the Trust Passport works:</strong> Each resource's passport is built from
          its booking history (checkout/return conditions) and incident records. Trust scores
          decrease with each reported incident (-20 points per incident) and are shown for
          reference only — they do not affect booking eligibility or resource availability.
        </div>
      </div>
    </PageLayout>
  );
}
