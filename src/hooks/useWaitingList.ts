import { useState, useCallback, useEffect } from "react";
import { supabase } from "../lib/supabase";
import type { Database } from "../lib/supabase";

type WaitingListEntry = Database["public"]["Tables"]["waiting_list"]["Row"];

export function useWaitingList() {
  const [entries, setEntries] = useState<WaitingListEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("waiting_list")
      .select("*, resource:resources(name)")
      .order("created_at", { ascending: false });
    if (error) setError(error.message);
    else setEntries((data ?? []) as WaitingListEntry[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const join = async (
    resourceId: string,
    startTime: string,
    endTime: string
  ) => {
    const { error } = await supabase.rpc("add_waiting_list_entry", {
      p_resource_id: resourceId,
      p_start_time: startTime,
      p_end_time: endTime,
    });
    if (error) throw error;
    await load();
  };

  const leave = async (entryId: string) => {
    const { error } = await supabase.rpc("cancel_waiting_list_entry", {
      p_waiting_list_id: entryId,
    });
    if (error) throw error;
    await load();
  };

  return { entries, loading, error, reload: load, join, leave };
}
