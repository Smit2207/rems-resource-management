import { useResources } from "../hooks/useResources";
import { Link } from "react-router-dom";
import { StatusBadge } from "../components/StatusBadge";
import { PageLayout } from "../components/PageLayout";
import { Card } from "../components/Card";
import { EmptyState } from "../components/Common";
import { useAuth } from "../hooks/useAuth";
import { Plus, AlertCircle } from "lucide-react";

export default function ResourcesMinePage() {
  const { user } = useAuth();
  const { resources, loading, error } = useResources();

  if (loading) return (
    <PageLayout>
      <div className="flex flex-col items-center justify-center py-20 text-center text-muted">
        Loading…
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
      </div>
    </PageLayout>
  );

  const mine = resources.filter((r: any) => r.owner_id === user?.id);

  return (
    <PageLayout>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Plus className="h-6 w-6 text-forest" />
          <h1 className="text-xl font-bold text-dark">My Resources</h1>
        </div>
      </div>
      <Card>
        {mine.length === 0 ? (
          <EmptyState
            title="No resources yet"
            description="Create your first resource to get started."
            action={
              <Link to="/resources/create" className="btn-primary">
                Create Resource
              </Link>
            }
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {mine.map((r) => (
              <Card key={r.id}>
                <div className="relative mb-3">
                  {r.image_url ? (
                    <img
                      src={r.image_url}
                      alt={r.name}
                      className="w-full h-32 object-cover rounded-lg"
                    />
                  ) : (
                    <div className="w-full h-32 rounded-lg bg-[#F3F4F6] flex items-center justify-center">
                      <span className="text-xs text-muted">No image</span>
                    </div>
                  )}
                </div>
                <h3 className="font-bold text-dark mb-1">{r.name}</h3>
                <p className="text-sm text-muted mb-3">
                  {r.location || "—"}
                </p>
                <StatusBadge status={r.status} />
                <div className="mt-4 flex gap-2">
                  <Link
                    to={`/resources/${r.id}/edit`}
                    className="btn-outline text-sm flex-1"
                  >
                    Edit
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Card>
    </PageLayout>
  );
}
