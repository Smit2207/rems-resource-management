import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Search, Plus, Building2, X, RefreshCw, AlertCircle } from "lucide-react";
import { useResources } from "../hooks/useResources";
import { StatusBadge } from "../components/StatusBadge";
import { PageLayout } from "../components/PageLayout";
import { Card } from "../components/Card";
import { EmptyState } from "../components/Common";

type SortOption = "newest" | "name" | "capacity";

export default function ResourcesPage() {
  const { resources, categories, loading, error } = useResources();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [type, setType] = useState("");
  const [sort, setSort] = useState<SortOption>("newest");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => {
      if (searchRef.current) clearTimeout(searchRef.current);
    };
  }, [search]);

  const filtered = resources.filter((r: any) => {
    if (debouncedSearch && !r.name.toLowerCase().includes(debouncedSearch.toLowerCase())) return false;
    if (category && r.category_id !== category) return false;
    if (type && r.type !== type) return false;
    return true;
  });

  const sorted = [...filtered].sort((a: any, b: any) => {
    if (sort === "name") {
      return (a.name || "").localeCompare(b.name || "");
    }
    if (sort === "capacity") {
      return (b.capacity ?? 0) - (a.capacity ?? 0);
    }
    return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
  });

  const activeFilters = [
    { label: "Search", value: debouncedSearch, clear: () => setSearch("") },
    { label: "Category", value: categories.find((c) => c.id === category)?.name || category, clear: () => setCategory("") },
    { label: "Type", value: type || "", clear: () => setType("") },
  ].filter((f) => f.value);

  if (loading) return (
    <PageLayout>
      <div className="flex flex-col items-center justify-center py-20 text-center text-muted">
        Loading resources…
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
          onClick={() => window.location.reload()}
          className="btn-primary"
        >
          Try again
        </button>
      </div>
    </PageLayout>
  );

  return (
    <PageLayout>
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-6">
            <Building2 className="h-6 w-6 text-forest" />
            <h1 className="text-2xl font-bold text-dark">Browse Resources</h1>
          </div>
          <div className="flex flex-wrap gap-4 mb-6">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
              <input
                className="input pl-9"
                placeholder="Search resources by name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">All types</option>
              <option value="equipment">Equipment</option>
              <option value="space">Space</option>
            </select>
            <select className="input" value={sort} onChange={(e) => setSort(e.target.value as SortOption)}>
              <option value="newest">Sort: Newest first</option>
              <option value="name">Sort: Name (A-Z)</option>
              <option value="capacity">Sort: Capacity (high to low)</option>
            </select>
          </div>

          {activeFilters.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-6">
              {activeFilters.map((f, i) => (
                <div
                  key={i}
                  className="inline-flex items-center gap-2 rounded-md bg-lime/20 px-3 py-1.5 text-xs font-medium text-forest border border-lime/40"
                >
                  <span>{f.label}: {f.value}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      f.clear();
                    }}
                    className="text-forest/80 hover:text-forest"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => {
                  setSearch("");
                  setCategory("");
                  setType("");
                  setSort("newest");
                }}
                className="text-xs font-medium text-forest underline underline-offset-4 hover:text-forest/80"
              >
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Reset filters
              </button>
            </div>
          )}

          <Link to="/resources/create" className="btn-primary inline-flex items-center gap-2">
            <Plus className="h-4 w-4" /> Add Resource
          </Link>
        </div>
        <div className="hidden lg:block text-right text-xs text-muted">
          {sorted.length} resource{sorted.length !== 1 ? "s" : ""} matching filters
        </div>
      </div>

      <div className="card">
        {sorted.length === 0 ? (
          <EmptyState
            title="No resources found"
            description="Try adjusting your search or filters."
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sorted.map((r) => (
              <Link
                key={r.id}
                to={`/resources/${r.id}`}
                className="block"
              >
                <Card className="hover:border-forest transition-colors cursor-pointer group">
                  <div className="relative mb-3">
                    {r.image_url ? (
                      <img
                        src={r.image_url}
                        alt={r.name}
                        className="w-full h-32 object-cover rounded-lg"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-32 rounded-lg bg-[#F3F4F6] flex items-center justify-center">
                        <span className="text-xs text-muted">No image</span>
                      </div>
                    )}
                    {r.status !== "active" && (
                      <div className="absolute top-2 right-2">
                        <StatusBadge status={r.status} />
                      </div>
                    )}
                  </div>
                  <div className="mb-3">
                    <span className="text-xs font-medium text-muted uppercase tracking-wider">
                      {r.type}
                    </span>
                  </div>
                  <h3 className="font-bold text-dark mb-1 group-hover:text-forest">{r.name}</h3>
                  {r.location && <p className="text-sm text-muted mb-3">{r.location}</p>}
                  <div className="flex items-center justify-between">
                    <StatusBadge status={r.lifecycle_state || r.status} />
                    <span className="text-xs text-muted">
                      {r.capacity != null ? `Capacity: ${r.capacity}` : ""}
                    </span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </PageLayout>
  );
}
