import { useParams, Link } from "react-router-dom";
import { useState } from "react";
import { useIncidents } from "../hooks/useIncidents";
import { resolveIncident } from "../hooks/useBookings";
import { PageLayout } from "../components/PageLayout";
import { Card } from "../components/Card";
import { FormField } from "../components/Common";
import { StatusBadge } from "../components/StatusBadge";
import { formatDateTime } from "../lib/utils";
import { AlertCircle } from "lucide-react";

export default function IncidentReviewPage() {
  const { id } = useParams();
  const incidentId = String(id);
  const { incidents, reload } = useIncidents();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const incident = incidents.find((i: any) => i.id === incidentId);

  async function handleResolve(status: "under_review" | "resolved") {
    setError("");
    setLoading(true);
    try {
      await resolveIncident(incidentId, status);
      reload();
    } catch (e: any) {
      setError(e.message || "Could not update incident");
    } finally {
      setLoading(false);
    }
  }

  if (!incident) return <div className="page">Incident not found.</div>;

  return (
    <PageLayout>
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <AlertCircle className="h-5 w-5 text-amber-600" />
          <h1 className="font-bold text-dark">Incident Review</h1>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div className="p-3 rounded border border-border">
            <div className="flex justify-between items-start mb-2">
              <span className="font-medium text-dark">Type</span>
              <span className="text-xs text-muted">Incident type</span>
            </div>
            <p className="text-sm">
              {incident.type.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
            </p>
          </div>
          <div className="p-3 rounded border border-border">
            <div className="flex justify-between items-start mb-2">
              <span className="font-medium text-dark">Status</span>
              <span className="text-xs text-muted">Current status</span>
            </div>
            <p className="text-sm">
              <StatusBadge status={incident.status} />
            </p>
          </div>
          <div className="p-3 rounded border border-border">
            <div className="flex justify-between items-start mb-2">
              <span className="font-medium text-dark">Reported</span>
              <span className="text-xs text-muted">Report date</span>
            </div>
            <p className="text-sm">{formatDateTime(incident.created_at)}</p>
          </div>
          <div className="p-3 rounded border border-border">
            <div className="flex justify-between items-start mb-2">
              <span className="font-medium text-dark">Booking</span>
              <span className="text-xs text-muted">Related booking</span>
            </div>
            <p className="text-sm">#{incident.booking_id?.slice(-6) || "—"}</p>
          </div>
        </div>
        <FormField label="Description">
          <textarea className="input" rows={3} defaultValue={incident.description} readOnly />
        </FormField>

        {incident.status === "open" && (
          <>
            <FormField label="Resolution notes">
              <textarea className="input" rows={3} id="notes" />
            </FormField>
            <div className="flex gap-3">
              <button
                onClick={() => handleResolve("under_review")}
                className="btn-ghost flex-1 text-amber-700 hover:bg-amber-50"
                disabled={loading}
              >
                Mark Under Review
              </button>
              <button
                onClick={() => handleResolve("resolved")}
                className="btn-primary flex-1"
                disabled={loading}
              >
                Mark Resolved
              </button>
            </div>
          </>
        )}
        {incident.status === "under_review" && (
          <>
            <FormField label="Resolution notes">
              <textarea className="input" rows={3} id="notes" />
            </FormField>
            <button
              onClick={() => handleResolve("resolved")}
              className="btn-primary w-full"
              disabled={loading}
            >
              Mark Resolved
            </button>
          </>
        )}
        {incident.status === "resolved" && (
          <p className="text-sm text-muted mt-2">
            Resolution: {incident.resolution_notes || "—"}
          </p>
        )}
        {error && (
          <div className="mt-4 p-3 rounded bg-rose-50 border border-rose-100 text-rose-700 text-sm">
            {error}
          </div>
        )}
        <Link to="/incidents" className="mt-4 btn-primary inline-block">
          Back to incidents
        </Link>
      </Card>
    </PageLayout>
  );
}
