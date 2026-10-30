import { useState } from "react";
import { useResources } from "../hooks/useResources";
import { useWaitingList } from "../hooks/useWaitingList";
import { PageLayout } from "../components/PageLayout";
import { Card } from "../components/Card";
import { EmptyState, FormField } from "../components/Common";
import { formatDateTime } from "../lib/utils";
import { Clock } from "lucide-react";

export default function WaitingListPage() {
  const { resources } = useResources();
  const { entries, loading, error, reload, join, leave } = useWaitingList();
  const [joinResourceId, setJoinResourceId] = useState("");
  const [joinStartTime, setJoinStartTime] = useState("");
  const [joinEndTime, setJoinEndTime] = useState("");
  const [joinError, setJoinError] = useState("");
  const [joining, setJoining] = useState(false);

  const joinableResources = resources.filter(
    (r: any) => r.status === "active"
  );

  if (loading) return (
    <PageLayout>
      <div className="flex flex-col items-center justify-center py-20 text-center text-secondary-text">
        Loading waiting list…
      </div>
    </PageLayout>
  );
  if (error) return (
    <PageLayout>
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-lg font-medium text-rose-700 mb-2">{error}</p>
        <button onClick={() => reload()} className="btn-primary">
          Try again
        </button>
      </div>
    </PageLayout>
  );

  const activeEntries = entries.filter((e) => e.status === "active");
  const otherEntries = entries.filter((e) => e.status !== "active");

  async function handleJoin() {
    if (!joinResourceId || !joinStartTime || !joinEndTime) return;
    if (new Date(joinEndTime) <= new Date(joinStartTime)) {
      setJoinError("End time must be after start time.");
      return;
    }
    setJoinError("");
    setJoining(true);
    try {
      await join(joinResourceId, joinStartTime, joinEndTime);
      setJoinResourceId("");
      setJoinStartTime("");
      setJoinEndTime("");
      reload();
    } catch (e: any) {
      setJoinError(e.message || "Could not join waiting list");
    } finally {
      setJoining(false);
    }
  }

  async function handleLeave(id: string) {
    if (!window.confirm("Leave this waiting list?")) return;
    try {
      await leave(id);
      reload();
    } catch (e: any) {
      alert(e.message || "Could not leave waiting list");
    }
  }

  return (
    <PageLayout>
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-6">
            <div className="h-6 w-6 rounded-full bg-accent flex items-center justify-center text-white text-xs font-bold">
              WL
            </div>
            <h1 className="text-xl font-bold text-primary-text">My Waiting List</h1>
          </div>
          <Card>
            <h2 className="font-bold mb-4">Join a waiting list</h2>
            <p className="text-secondary-text text-sm mb-4">
              Join a resource&rsquo;s waiting list when it is unavailable or fully booked during your
              preferred period. You will be able to request a booking when it becomes available.
            </p>
            <FormField label="Resource">
              <select
                className="input"
                value={joinResourceId}
                onChange={(e) => setJoinResourceId(e.target.value)}
              >
                <option value="">Select a resource</option>
                {joinableResources.map((r: any) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Preferred start date & time">
              <input
                type="datetime-local"
                className="input"
                value={joinStartTime}
                onChange={(e) => setJoinStartTime(e.target.value)}
                required
              />
            </FormField>
            <FormField label="Preferred end date & time">
              <input
                type="datetime-local"
                className="input"
                value={joinEndTime}
                onChange={(e) => setJoinEndTime(e.target.value)}
                required
              />
            </FormField>
            {joinError && (
              <div className="mb-3 p-3 rounded bg-rose-50 text-rose-700 text-sm">
                {joinError}
              </div>
            )}
            <button
              onClick={handleJoin}
              className="btn-primary w-full"
              disabled={joining || !joinResourceId || !joinStartTime || !joinEndTime}
            >
              {joining ? "Joining…" : "Join Waiting List"}
            </button>
            <p className="text-xs text-secondary-text mt-3">
              One active entry per resource. You can leave a waiting list at any time.
            </p>
          </Card>
        </div>
        <div className="flex-1 min-w-0">
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <Clock className="h-5 w-5 text-accent" />
              <h2 className="font-bold text-primary-text">Your active entries</h2>
            </div>
            {activeEntries.length === 0 ? (
              <EmptyState
                title="No active waiting-list entries"
                description="Join a waiting list above to be notified when a resource becomes available."
              />
            ) : (
              <div className="space-y-3">
                {activeEntries.map((e) => (
                  <div
                    key={e.id}
                    className="p-4 border rounded-lg flex justify-between items-start"
                  >
                    <div>
                      <h3 className="font-bold text-primary-text">
                        {(e as any).resource?.name || "Resource"}
                      </h3>
                      <p className="text-sm text-secondary-text">
                        Joined {formatDateTime(e.created_at)}
                      </p>
                      <p className="text-xs text-secondary-text mt-1">
                        Status: Active &middot; Position in queue is not guaranteed
                      </p>
                    </div>
                    <button
                      onClick={() => handleLeave(e.id)}
                      className="btn-ghost text-sm text-rose-600"
                    >
                      Leave
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>
          {otherEntries.length > 0 && (
            <Card className="mt-6">
              <div className="flex items-center gap-2 mb-4">
                <span className="h-5 w-5 rounded-full bg-secondary-text/10 flex items-center justify-center text-secondary-text text-xs">
                  H
                </span>
                <h2 className="font-bold text-primary-text">Past entries</h2>
              </div>
              <div className="space-y-3">
                {otherEntries.map((e) => (
                  <div key={e.id} className="p-3 border rounded-lg text-sm">
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-medium text-primary-text">
                        {(e as any).resource?.name || "Resource"}
                      </span>
                      <span className="text-xs text-secondary-text uppercase">
                        {e.status}
                      </span>
                    </div>
                    <p className="text-secondary-text">
                      {formatDateTime(e.created_at)}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </PageLayout>
  );
}
