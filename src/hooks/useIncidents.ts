import { useState, useCallback, useEffect } from "react";
import { supabase } from "../lib/supabase";
import type { Database } from "../lib/supabase";

type Incident = Database["public"]["Tables"]["incidents"]["Row"];

export function useIncidents() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("incidents")
      .select("*, booking:bookings(resource:resources(name))")
      .order("created_at", { ascending: false });
    if (error) setError(error.message);
    else setIncidents(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { incidents, loading, error, reload: load };
}

type Notification = Database["public"]["Tables"]["notifications"]["Row"];

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) setError(error.message);
    else setNotifications(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const markRead = async (id: string) => {
    const { error } = await supabase.rpc("mark_notification_read", {
      p_notification_id: id,
    });
    if (error) throw error;
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  return { notifications, loading, error, reload: load, markRead };
}
