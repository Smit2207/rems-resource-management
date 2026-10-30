-- 003_security_hardening.sql
-- Function execution permission hardening for the Resource Sharing Platform.
--
-- CREATE OR REPLACE FUNCTION preserves existing ACLs, so we must explicitly
-- REVOKE EXECUTE from PUBLIC/anon and GRANT to authenticated only where needed.
--
-- audit_write is intentionally NOT granted to any application role -- it is
-- called internally by other SECURITY DEFINER functions which run as the owner.
--
-- This migration is idempotent-safe: REVOKE/GRANT are safe to rerun.

-- ============================================================
-- Revoke EXECUTE from PUBLIC (covers anon and all roles)
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.audit_write(text, text, uuid, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_booking(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_booking(uuid, timestamptz, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.decide_booking(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_manager_or_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_notification_read(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_checkout(uuid, text, text[], timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_return(uuid, text, text[], text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.report_incident(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resolve_incident(uuid, text, text) FROM PUBLIC;

-- Also revoke explicitly from anon (defense in depth)
REVOKE EXECUTE ON FUNCTION public.audit_write(text, text, uuid, text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.cancel_booking(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_booking(uuid, timestamptz, timestamptz) FROM anon;
REVOKE EXECUTE ON FUNCTION public.decide_booking(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_manager_or_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_notification_read(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_checkout(uuid, text, text[], timestamptz) FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_return(uuid, text, text[], text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.report_incident(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.resolve_incident(uuid, text, text) FROM anon;

-- ============================================================
-- Grant EXECUTE to authenticated for frontend RPCs only
-- audit_write is intentionally NOT granted (internal helper only)
-- ============================================================
GRANT EXECUTE ON FUNCTION public.cancel_booking(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_booking(uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_booking(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_manager_or_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_checkout(uuid, text, text[], timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_return(uuid, text, text[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_incident(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_incident(uuid, text, text) TO authenticated;

-- ============================================================
-- Table-level privilege hardening
-- Revoke all table privileges from PUBLIC and anon; grant only what's needed.
-- RLS policies provide row-level filtering; table privileges control
-- which operations can even be attempted.
-- ============================================================
REVOKE ALL ON TABLE public.profiles FROM PUBLIC;
REVOKE ALL ON TABLE public.resource_categories FROM PUBLIC;
REVOKE ALL ON TABLE public.resources FROM PUBLIC;
REVOKE ALL ON TABLE public.bookings FROM PUBLIC;
REVOKE ALL ON TABLE public.incidents FROM PUBLIC;
REVOKE ALL ON TABLE public.notifications FROM PUBLIC;
REVOKE ALL ON TABLE public.audit_logs FROM PUBLIC;

REVOKE ALL ON TABLE public.profiles FROM anon;
REVOKE ALL ON TABLE public.resource_categories FROM anon;
REVOKE ALL ON TABLE public.resources FROM anon;
REVOKE ALL ON TABLE public.bookings FROM anon;
REVOKE ALL ON TABLE public.incidents FROM anon;
REVOKE ALL ON TABLE public.notifications FROM anon;
REVOKE ALL ON TABLE public.audit_logs FROM anon;

-- Grant SELECT to authenticated on read-only tables (RLS filters rows)
GRANT SELECT ON TABLE public.profiles TO authenticated;
GRANT SELECT ON TABLE public.resource_categories TO authenticated;
GRANT SELECT ON TABLE public.resources TO authenticated;
GRANT SELECT ON TABLE public.bookings TO authenticated;
GRANT SELECT ON TABLE public.incidents TO authenticated;
GRANT SELECT ON TABLE public.notifications TO authenticated;
GRANT SELECT ON TABLE public.audit_logs TO authenticated;

-- No INSERT/UPDATE/DELETE table grants to authenticated -- all writes go
-- through SECURITY DEFINER RPCs which run as the function owner.

-- ============================================================
-- End of 003_security_hardening.sql
-- ============================================================
