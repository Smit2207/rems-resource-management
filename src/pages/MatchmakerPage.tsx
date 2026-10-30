import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Search,
} from "lucide-react";
import { useResources } from "../hooks/useResources";
import { useBookings } from "../hooks/useBookings";
import { useAuth } from "../hooks/useAuth";
import { matchResources, filterBookable } from "../lib/matchmaker";
import { checkEligibility, isLifecycleBookable, lifecycleLabel } from "../lib/eligibility";
import { PageLayout } from "../components/PageLayout";
import { Card } from "../components/Card";
import { EmptyState } from "../components/Common";
import type { Database } from "../lib/supabase";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export default function MatchmakerPage() {
  const { resources, categories, loading: resourcesLoading } = useResources();
  const { bookings, loading: bookingsLoading } = useBookings();
  const { user } = useAuth();

  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [type, setType] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [quantity, setQuantity] = useState("");
  const [location, setLocation] = useState("");
  const [bookableOnly, setBookableOnly] = useState(true);
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const borrower = user ? {
    id: user.id,
    email: user.email,
    full_name: user.fullName,
    role: user.role,
    institution: user.institution,
    department: user.department,
    year_of_study: user.yearOfStudy,
    student_staff_id: user.studentStaffId,
    training_completed: user.trainingCompleted,
    created_at: "",
  } as unknown as Profile : null;

  const runMatchmaker = useCallback(() => {
    setLoading(true);
    setError(null);
    try {
      const matched = matchResources(
        resources,
        bookings,
        borrower,
        {
          description: description || undefined,
          categoryId: categoryId || undefined,
          type: type || undefined,
          tags: tags.length > 0 ? tags : undefined,
          startTime: startTime || undefined,
          endTime: endTime || undefined,
          quantity: quantity ? Number(quantity) : undefined,
          location: location || undefined,
          borrower,
          limit: 50,
        },
      );

      const filtered = bookableOnly ? filterBookable(matched) : matched;
      setResults(filtered);
    } catch (e: any) {
      setError(e.message || "Matchmaker search failed");
    } finally {
      setLoading(false);
    }
  }, [resources, bookings, borrower, description, categoryId, type, tags, startTime, endTime, quantity, location, bookableOnly]);

  useEffect(() => {
    runMatchmaker();
  }, [runMatchmaker]);

  const [tagValue, setTagValue] = useState("");

  const addTag = () => {
    const t = tagValue.trim();
    if (t && !tags.includes(t)) {
      setTags([...tags, t]);
      setTagValue("");
    }
  };

  const removeTag = (t: string) => {
    setTags(tags.filter((x) => x !== t));
  };

  if (resourcesLoading || bookingsLoading) {
    return (
      <PageLayout>
        <div className="flex flex-col items-center justify-center py-20 text-center text-muted">
          Loading resources…
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="lg:w-1/3 space-y-6">
          <Card>
            <h2 className="font-bold text-dark text-lg mb-4">
              <Search className="mr-2 h-4 w-4" /> Smart Matchmaker
            </h2>
            <p className="text-sm text-muted mb-4">
              Describe what you need and get ranked, explainable resource recommendations.
            </p>

            <div className="space-y-4">
              <div>
                <label className="label block text-sm font-medium mb-1">What do you need?</label>
                <input
                  className="input w-full"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. microscope for lab work, meeting room for 10 people"
                />
              </div>

              <div>
                <label className="label block text-sm font-medium mb-1">Category</label>
                <select
                  className="input w-full"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                >
                  <option value="">Any category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label block text-sm font-medium mb-1">Type</label>
                <select className="input w-full" value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="">Any type</option>
                  <option value="equipment">Equipment</option>
                  <option value="space">Space</option>
                </select>
              </div>

              <div>
                <label className="label block text-sm font-medium mb-1">Location</label>
                <input
                  className="input w-full"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Building A, Room 101"
                />
              </div>

              <div>
                <label className="label block text-sm font-medium mb-1">Required quantity</label>
                <input
                  type="number"
                  className="input w-full"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="1"
                />
              </div>

              <div>
                <label className="label block text-sm font-medium mb-1">Preferred time</label>
                <div className="flex gap-2">
                  <input
                    type="datetime-local"
                    className="input flex-1"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                  <input
                    type="datetime-local"
                    className="input flex-1"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="label block text-sm font-medium mb-1">Tags</label>
                <div className="flex gap-2">
                  <input
                    className="input flex-1"
                    value={tagValue}
                    onChange={(e) => setTagValue(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addTag()}
                    placeholder="Add a tag…"
                  />
                  <button
                    onClick={addTag}
                    className="btn-primary px-4"
                  >
                    Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {tags.map((t) => (
                    <span
                      key={t}
                      className="px-2 py-1 rounded bg-forest/10 text-forest text-xs border border-forest/20 flex items-center gap-1"
                    >
                      {t}
                      <button
                        onClick={() => removeTag(t)}
                        className="text-forest/60 hover:text-forest"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="bookableOnly"
                  type="checkbox"
                  checked={bookableOnly}
                  onChange={() => setBookableOnly(!bookableOnly)}
                />
                <label htmlFor="bookableOnly" className="text-sm text-dark cursor-pointer">
                  Show only bookable resources
                </label>
              </div>

              <button
                onClick={runMatchmaker}
                className="btn-primary w-full"
                disabled={loading}
              >
                {loading ? "Searching…" : "Find Resources"}
              </button>
            </div>
          </Card>
        </div>

        <div className="lg:flex-1 min-w-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-dark text-lg">
              {results.length} match{results.length !== 1 ? "es" : ""}
            </h2>
            {bookableOnly && (
              <span className="text-xs text-muted">
                Filtered to bookable resources only
              </span>
            )}
          </div>

          {error && (
            <div className="p-3 rounded bg-rose-50 border border-rose-100 text-rose-700 text-sm mb-4">
              {error}
            </div>
          )}

          {results.length === 0 ? (
            <EmptyState
              title="No matching resources"
              description="Try adjusting your search criteria or uncheck 'Show only bookable resources'."
            />
          ) : (
            <div className="space-y-3">
              {results.map((r) => {
                const resource = r.resource;
                const isEligible = borrower
                  ? checkEligibility(resource, borrower as unknown as Profile)
                  : true;
                return (
                  <Card key={resource.id} className="hover:border-forest transition-colors">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <Link
                          to={`/resources/${resource.id}`}
                          className="font-bold text-dark hover:text-forest text-lg"
                        >
                          {resource.name}
                        </Link>
                        <div className="flex items-center gap-1 mt-1">
                          <span className={`text-xs font-medium ${isLifecycleBookable(r.lifecycleState) ? "text-emerald-600" : "text-rose-600"}`}>
                            {lifecycleLabel(r.lifecycleState)}
                          </span>
                          {r.type && (
                            <span className="text-xs text-muted">{r.type}</span>
                          )}
                        </div>
                      </div>
                      <span className="text-xs font-bold px-2 py-1 rounded bg-forest/10 text-forest border border-forest/20">
                        Score: {r.score}
                      </span>
                    </div>
                    {resource.description && (
                      <p className="text-sm text-muted mb-3">{resource.description}</p>
                    )}
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs text-muted space-y-1">
                        {resource.location && <span>📍 {resource.location}</span>}
                        {resource.capacity != null && <span>Capacity: {resource.capacity}</span>}
                        {resource.tags && resource.tags.length > 0 && (
                          <span>
                            Tags: {resource.tags.slice(0, 3).join(", ")}
                            {resource.tags.length > 3 && ` +${resource.tags.length - 3} more`}
                          </span>
                        )}
                      </div>
                    </div>

                    {r.matchReasons.length > 0 && (
                      <div className="mb-2 p-2 rounded bg-forest/5 border border-forest/10">
                        <div className="text-xs font-medium text-forest-700 mb-1">Why it matches:</div>
                        <ul className="list-disc list-inside text-xs text-forest-600 space-y-0.5">
                          {r.matchReasons.map((reason: string, i: number) => (
                            <li key={i}>{reason}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {!isEligible && (
                      <div className="mb-2 p-2 rounded bg-rose-50 border border-rose-100">
                        <div className="text-xs font-medium text-rose-700 mb-1">Not eligible:</div>
                        <ul className="list-disc list-inside text-xs text-rose-600 space-y-0.5">
                          {r.missingReasons.map((reason: string, i: number) => (
                            <li key={i}>{reason}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {!isLifecycleBookable(r.lifecycleState) && (
                      <div className="mb-3 p-2 rounded bg-amber-50 border border-amber-100">
                        <div className="text-xs font-medium text-amber-700">
                          Not currently bookable: {lifecycleLabel(r.lifecycleState)}
                        </div>
                      </div>
                    )}

                    <Link
                      to={`/resources/${resource.id}/book`}
                      className={`btn-${isLifecycleBookable(r.lifecycleState) && isEligible ? "primary" : "outline"} w-full text-sm ${!isLifecycleBookable(r.lifecycleState) || !isEligible ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      {isLifecycleBookable(r.lifecycleState) && isEligible ? "Request Booking" : "View Details"}
                    </Link>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </PageLayout>
  );
}
