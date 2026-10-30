import { useState, useCallback, useEffect } from "react";
import { supabase } from "../lib/supabase";
import type { Database } from "../lib/supabase";

type Resource = Database["public"]["Tables"]["resources"]["Row"];
type Category = Database["public"]["Tables"]["resource_categories"]["Row"];

export function useResources() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [rRes, cRes] = await Promise.all([
      supabase.from("resources").select("*").order("created_at", { ascending: false }),
      supabase.from("resource_categories").select("*").order("name"),
    ]);
    if (rRes.error) setError(rRes.error.message);
    else setResources(rRes.data ?? []);
    if (cRes.error) setError(cRes.error.message);
    else setCategories(cRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const create = async (input: any) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Authentication required to create a resource.");

    const payload = {
      ...input,
      owner_id: user.id,
    };
    const { data, error } = await supabase
      .from("resources")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    if (data) setResources((prev) => [data, ...prev]);
    return data;
  };

  const update = async (id: string, input: any) => {
    // Strip owner_id to prevent ownership transfer via frontend.
    const { owner_id: _owner_id, ...safeInput } = input;
    const { data, error } = await supabase
      .from("resources")
      .update({ ...safeInput, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    if (data) setResources((prev) => prev.map((r) => (r.id === id ? data : r)));
    return data;
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("resources").delete().eq("id", id);
    if (error) throw error;
    setResources((prev) => prev.filter((r) => r.id !== id));
  };

  return { resources, categories, loading, error, create, update, remove, reload: load };
}
