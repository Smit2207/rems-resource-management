import { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Package,
  Plus,
  Trash2,
  Info,
} from "lucide-react";
import { PageLayout } from "../components/PageLayout";
import { Card } from "../components/Card";
import { EmptyState, FormField } from "../components/Common";
import type { Database } from "../lib/supabase";

type MissionKit = Database["public"]["Tables"]["mission_kits"]["Row"];
type MissionKitItem = Database["public"]["Tables"]["mission_kit_items"]["Row"];

export default function MissionKitsPage() {
  const [kits, setKits] = useState<MissionKit[]>([]);
  const [kitItems, setKitItems] = useState<MissionKitItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedKit, setSelectedKit] = useState<MissionKit | null>(null);
  const [creating, setCreating] = useState(false);
  const [newKitName, setNewKitName] = useState("");
  const [newKitDesc, setNewKitDesc] = useState("");
  const [newKitPurpose, setNewKitPurpose] = useState("");
  const [newKitPublic, setNewKitPublic] = useState(false);

  const loadKits = useCallback(async () => {
    setError(null);
    try {
      const { data, error: err } = await (globalThis as any).supabase.rpc(
        "get_my_mission_kits",
        {}
      );
      if (err) throw err;
      setKits(data ?? []);
    } catch (e: any) {
      setError(e.message || "Could not load mission kits");
    }
  }, []);

  const loadKitItems = useCallback(async (kitId: string) => {
    try {
      const { data, error: err } = await (globalThis as any).supabase
        .from("mission_kit_items")
        .select("*, resource:resources(name, type, location, status, lifecycle_state)")
        .eq("kit_id", kitId)
        .order("added_at", { ascending: false });
      if (err) throw err;
      setKitItems(data ?? []);
    } catch (e: any) {
      setError(e.message || "Could not load kit items");
    }
  }, []);

  const handleSelectKit = (kit: MissionKit) => {
    setSelectedKit(kit);
    loadKitItems(kit.id);
  };

  const handleCreateKit = async () => {
    if (!newKitName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const { error: err } = await (globalThis as any).supabase.rpc(
        "create_mission_kit",
        {
          p_name: newKitName.trim(),
          p_description: newKitDesc.trim() || null,
          p_purpose: newKitPurpose.trim() || null,
          p_is_public: newKitPublic,
        }
      );
      if (err) throw err;
      setNewKitName("");
      setNewKitDesc("");
      setNewKitPurpose("");
      setNewKitPublic(false);
      await loadKits();
    } catch (e: any) {
      setError(e.message || "Could not create mission kit");
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteKit = async (kitId: string) => {
    if (!window.confirm("Delete this mission kit? This cannot be undone.")) return;
    try {
      const { error: err } = await (globalThis as any).supabase.rpc(
        "delete_mission_kit",
        { p_kit_id: kitId }
      );
      if (err) throw err;
      setSelectedKit(null);
      setKitItems([]);
      await loadKits();
    } catch (e: any) {
      setError(e.message || "Could not delete mission kit");
    }
  };

  const handleRemoveItem = async (resourceId: string) => {
    if (!selectedKit) return;
    try {
      const { error: err } = await (globalThis as any).supabase.rpc(
        "remove_kit_item",
        {
          p_kit_id: selectedKit.id,
          p_resource_id: resourceId,
        }
      );
      if (err) throw err;
      await loadKitItems(selectedKit.id);
    } catch (e: any) {
      setError(e.message || "Could not remove item from kit");
    }
  };

  return (
    <PageLayout>
      <div className="max-w-5xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-dark">
              <Package className="mr-2 h-5 w-5 text-forest" /> Mission Kits
            </h1>
            <p className="text-muted">
              Reusable groups of resources for common tasks. Create kits for fieldwork,
              lab workshops, event setup, or any recurring activity.
            </p>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded bg-rose-50 border border-rose-100 text-rose-700 text-sm mb-4">
            {error}
          </div>
        )}

        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Plus className="h-4 w-4 text-forest" />
            <h2 className="font-bold text-dark">Create a New Kit</h2>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); handleCreateKit(); }} className="space-y-4">
            <FormField label="Kit name">
              <input
                className="input"
                value={newKitName}
                onChange={(e) => setNewKitName(e.target.value)}
                required
              />
            </FormField>
            <FormField label="Description (optional)">
              <input
                className="input"
                value={newKitDesc}
                onChange={(e) => setNewKitDesc(e.target.value)}
                placeholder="e.g. Weekly biology lab kit"
              />
            </FormField>
            <FormField label="Purpose (optional)">
              <input
                className="input"
                value={newKitPurpose}
                onChange={(e) => setNewKitPurpose(e.target.value)}
                placeholder="e.g. fieldwork, lab_workshop, event_setup"
              />
            </FormField>
            <div className="flex items-start gap-3 mb-2">
              <input
                id="isPublic"
                type="checkbox"
                checked={newKitPublic}
                onChange={() => setNewKitPublic(!newKitPublic)}
              />
              <label htmlFor="isPublic" className="text-sm text-dark cursor-pointer">
                Make this kit public (other users can view it)
              </label>
            </div>
            <button type="submit" className="btn-primary w-full" disabled={creating}>
              {creating ? "Creating…" : "Create Kit"}
            </button>
          </form>
        </Card>

        <div className="flex flex-col lg:flex-row gap-6">
          <div className="lg:w-1/3 space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="font-bold text-dark">Your Kits</h2>
            </div>
            {kits.length === 0 ? (
              <EmptyState
                title="No mission kits yet"
                description="Create your first kit above to group resources for common tasks."
              />
            ) : (
              <div className="space-y-3">
                {kits.map((kit) => (
                  <div
                    key={kit.id}
                    onClick={() => handleSelectKit(kit)}
                    className={`p-3 rounded border cursor-pointer transition-colors ${
                      selectedKit?.id === kit.id
                        ? "bg-forest/5 border-forest"
                        : "border-border hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-medium text-dark">{kit.name}</span>
                      {kit.is_public && (
                        <span className="text-xs text-emerald-600">Public</span>
                      )}
                    </div>
                    <p className="text-xs text-muted">{kit.description || "No description"}</p>
                    <p className="text-xs text-muted">{kit.purpose || "No purpose set"}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="lg:flex-1 min-w-0">
            {!selectedKit ? (
              <EmptyState
                title="Select a kit"
                description="Select a kit from the list to view and manage its resources."
              />
            ) : (
              <div className="space-y-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="font-bold text-dark">{selectedKit.name}</h2>
                    <p className="text-sm text-muted">
                      {selectedKit.description || "No description"}
                      {selectedKit.purpose && ` • Purpose: ${selectedKit.purpose}`}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDeleteKit(selectedKit.id)}
                    className="text-xs text-rose-600 hover:text-rose-800 font-medium"
                  >
                    <Trash2 className="mr-1 h-4 w-4" /> Delete Kit
                  </button>
                </div>

                <Card>
                  <div className="flex items-center gap-2 mb-4">
                    <h3 className="font-bold text-dark">Kit Resources</h3>
                  </div>
                  {kitItems.length === 0 ? (
                    <EmptyState
                      title="No resources in this kit"
                      description="Add resources from the Browse Resources page, or create kit items directly."
                      action={
                        <Link to="/resources" className="btn-primary text-sm">
                          Browse Resources
                        </Link>
                      }
                    />
                  ) : (
                    <div className="space-y-3">
                      {kitItems.map((item) => {
                        const res = (item as any).resource;
                        return (
                          <div
                            key={item.id}
                            className="p-3 rounded border border-border flex justify-between items-center"
                          >
                            <div>
                              <span className="font-medium text-dark">
                                {res?.name || "Unknown Resource"}
                              </span>
                              <p className="text-xs text-muted">
                                {res?.type || "—"} • {res?.location || "—"}
                                {res?.lifecycle_state && ` • ${res.lifecycle_state}`}
                              </p>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-muted">Qty: {item.quantity}</span>
                              <button
                                onClick={() => handleRemoveItem(res?.id || item.resource_id)}
                                className="text-xs text-rose-600 hover:text-rose-800 font-medium"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>

                <div className="mt-6 p-4 rounded bg-muted/50 border border-border/50 text-xs text-muted">
                  <Info className="mr-2 h-4 w-4" />
                  <strong>How Mission Kits work:</strong> Kits are reusable groups of resources
                  owned by the user who created them. Kit owners (and managers/admins) can add
                  or remove resources. Public kits are visible to all authenticated users.
                  Kit membership does not reserve resources — each resource still requires its
                  own booking through the normal booking workflow.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
