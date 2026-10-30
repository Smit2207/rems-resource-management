import * as React from "react";
import { supabase } from "../lib/supabase";
import type { AppUser } from "../lib/auth";
import { mapProfile } from "../lib/auth";

export function useAuth() {
  const [user, setUser] = React.useState<AppUser | null>(null);
  const [loading, setLoading] = React.useState(true);
  const mountedRef = React.useRef(true);

  React.useEffect(() => {
    mountedRef.current = true;
    const load = async () => {
      const { data } = await supabase.auth.getSession();
      const u = data.session?.user ?? null;
      if (u && mountedRef.current) {
        loadProfile(u.id);
      } else if (mountedRef.current) {
        setUser(null);
        setLoading(false);
      }
    };
    load();
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mountedRef.current) return;
      const u = session?.user ?? null;
      if (u) {
        await loadProfile(u.id);
      } else {
        setUser(null);
        setLoading(false);
      }
    });
    return () => {
      mountedRef.current = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const loadProfile = React.useCallback(async (id: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", id)
      .single();
    if (!mountedRef.current) return;
    if (error || !data) {
      setUser(null);
    } else {
      setUser(mapProfile(data));
    }
    setLoading(false);
  }, []);

  return { user, loading };
}
