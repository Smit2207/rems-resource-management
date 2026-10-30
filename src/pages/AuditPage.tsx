import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { PageLayout } from "../components/PageLayout";
import { Card } from "../components/Card";
import { EmptyState } from "../components/Common";
import { formatDateTime } from "../lib/utils";
import { Filter, AlertCircle } from "lucide-react";

type AuditLog = {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("audit_logs")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(200);
        if (error) throw error;
        if (mounted) setLogs(data ?? []);
      } catch (err: any) {
        if (mounted) setError(err.message || "Failed to load audit logs");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const filteredLogs = logs.filter((log) => {
    if (actionFilter && !log.action.toLowerCase().includes(actionFilter.toLowerCase()))
      return false;
    if (entityFilter && !log.entity_type.toLowerCase().includes(entityFilter.toLowerCase()))
      return false;
    return true;
  });

  const uniqueActions = [...new Set(logs.map((l) => l.action))].sort();
  const uniqueEntities = [...new Set(logs.map((l) => l.entity_type))].sort();

  if (loading) return (
    <PageLayout>
      <div className="flex flex-col items-center justify-center py-20 text-center text-muted">
        Loading audit history…
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
            setError(null);
            setLoading(true);
            window.location.reload();
          }}
          className="btn-primary"
        >
          Retry
        </button>
      </div>
    </PageLayout>
  );

  return (
    <PageLayout>
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1">
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <Filter className="h-5 w-5 text-forest" />
              <h1 className="font-bold text-dark">Audit History</h1>
            </div>
            <p className="text-muted mb-4">
              All system actions are recorded here. Records are append-only
              and cannot be modified or deleted.
            </p>

            <div className="flex gap-3 mb-4">
              <div className="relative flex-1">
                <select
                  className="input"
                  value={actionFilter}
                  onChange={(e) => setActionFilter(e.target.value)}
                >
                  <option value="">All Actions</option>
                  {uniqueActions.map((a) => (
                    <option key={a} value={a}>
                      {a.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}
                    </option>
                  ))}
                </select>
              </div>
              <div className="relative flex-1">
                <select
                  className="input"
                  value={entityFilter}
                  onChange={(e) => setEntityFilter(e.target.value)}
                >
                  <option value="">All Entity Types</option>
                  {uniqueEntities.map((e) => (
                    <option key={e} value={e}>{e}</option>
                  ))}
                </select>
              </div>
            </div>

            {filteredLogs.length === 0 ? (
              <EmptyState
                title="No audit records"
                description="No audit records match the current filters."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted">
                      <th className="pb-3">Time</th>
                      <th className="pb-3">Actor</th>
                      <th className="pb-3">Action</th>
                      <th className="pb-3">Entity Type</th>
                      <th className="pb-3">Entity ID</th>
                      <th className="pb-3">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-forest/5 transition-colors">
                        <td className="pb-2">{formatDateTime(log.created_at)}</td>
                        <td className="pb-2">{log.actor_id || "system"}</td>
                        <td className="pb-2 font-medium">
                          {log.action.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}
                        </td>
                        <td className="pb-2">{log.entity_type}</td>
                        <td className="pb-2">{log.entity_id || "—"}</td>
                        <td className="pb-2">{log.reason || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-3 text-xs text-muted">
                  Showing {filteredLogs.length} of {logs.length} records
                </p>
              </div>
            )}
          </Card>
        </div>
        <div className="lg:w-96">
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <span className="h-5 w-5 rounded-full bg-forest flex items-center justify-center text-white text-xs font-bold">
                I
              </span>
              <h2 className="font-bold text-dark">About Audit Logs</h2>
            </div>
            <ul className="space-y-3 text-sm text-muted">
              <li>
                Every lifecycle action (booking requests, approvals,
                checkouts, returns, incidents) is automatically recorded.
              </li>
              <li>
                Audit records are append-only — they cannot be edited or
                deleted by any user role.
              </li>
              <li>
                Only managers and administrators can view this page.
              </li>
              <li>
                The actor field records the user who performed the action.
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </PageLayout>
  );
}
