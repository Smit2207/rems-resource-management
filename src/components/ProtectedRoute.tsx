import { Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useEffect } from "react";

export function ProtectedRoute() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) navigate("/login", { replace: true });
  }, [user, loading, navigate]);

  if (loading) return null;
  if (!user) return null;

  return <Outlet />;
}

export function RoleGuard({
  allowedRoles,
  children,
}: {
  allowedRoles: string[];
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }
    if (!allowedRoles.includes(user.role)) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, loading, allowedRoles, navigate]);

  if (loading) return null;
  if (!user || !allowedRoles.includes(user.role)) return null;

  return <div>{children}</div>;
}
