import { NavLink, useNavigate } from "react-router-dom";
import { useState } from "react";
import {
  ShieldAlert,
  User,
  BookOpen,
  Building,
  Calendar,
  Bell,
  ClipboardList,
  Clock,
  Menu,
  X,
  ArrowRight,
  Search,
  Scale,
  Activity,
  MapPin,
  Package,
  AlertTriangle,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { signOut } from "../lib/auth";

type NavItem = {
  label: string;
  to: string;
  icon: React.ElementType;
  isPrimary?: boolean;
};

const authItems: NavItem[] = [
  { label: "Browse Resources", to: "/resources", icon: BookOpen },
  { label: "Sign In", to: "/login", icon: User },
  { label: "Get Started", to: "/register", icon: ArrowRight, isPrimary: true },
];

const roleItems: Record<string, NavItem[]> = {
  student: [
    { label: "Browse Resources", to: "/resources", icon: BookOpen },
    { label: "My Bookings", to: "/bookings", icon: Calendar },
    { label: "Incidents", to: "/incidents", icon: ShieldAlert },
    { label: "Notifications", to: "/notifications", icon: Bell },
    { label: "Profile", to: "/profile", icon: User },
    { label: "Waiting List", to: "/waiting-list", icon: Clock },
    { label: "Matchmaker", to: "/matchmaker", icon: Search },
    { label: "FairShare", to: "/fairshare", icon: Scale },
    { label: "Impact Ledger", to: "/impact-ledger", icon: Activity },
    { label: "Trust Passport", to: "/trust-passport", icon: ShieldAlert },
    { label: "Demand Radar", to: "/demand-radar", icon: AlertTriangle },
    { label: "Mission Kits", to: "/mission-kits", icon: Package },
    { label: "Campus Map", to: "/campus-map", icon: MapPin },
  ],
  manager: [
    { label: "Browse Resources", to: "/resources", icon: BookOpen },
    { label: "My Bookings", to: "/bookings", icon: Calendar },
    { label: "Incidents", to: "/incidents", icon: ShieldAlert },
    { label: "Notifications", to: "/notifications", icon: Bell },
    { label: "Profile", to: "/profile", icon: User },
    { label: "Waiting List", to: "/waiting-list", icon: Clock },
    { label: "Matchmaker", to: "/matchmaker", icon: Search },
    { label: "FairShare", to: "/fairshare", icon: Scale },
    { label: "Impact Ledger", to: "/impact-ledger", icon: Activity },
    { label: "Trust Passport", to: "/trust-passport", icon: ShieldAlert },
    { label: "Demand Radar", to: "/demand-radar", icon: AlertTriangle },
    { label: "Mission Kits", to: "/mission-kits", icon: Package },
    { label: "Campus Map", to: "/campus-map", icon: MapPin },
    { label: "Manager", to: "/manager", icon: ClipboardList },
    { label: "Audit", to: "/audit", icon: Building },
  ],
  admin: [
    { label: "Browse Resources", to: "/resources", icon: BookOpen },
    { label: "My Bookings", to: "/bookings", icon: Calendar },
    { label: "Incidents", to: "/incidents", icon: ShieldAlert },
    { label: "Notifications", to: "/notifications", icon: Bell },
    { label: "Profile", to: "/profile", icon: User },
    { label: "Waiting List", to: "/waiting-list", icon: Clock },
    { label: "Matchmaker", to: "/matchmaker", icon: Search },
    { label: "FairShare", to: "/fairshare", icon: Scale },
    { label: "Impact Ledger", to: "/impact-ledger", icon: Activity },
    { label: "Trust Passport", to: "/trust-passport", icon: ShieldAlert },
    { label: "Demand Radar", to: "/demand-radar", icon: AlertTriangle },
    { label: "Mission Kits", to: "/mission-kits", icon: Package },
    { label: "Campus Map", to: "/campus-map", icon: MapPin },
    { label: "Manager", to: "/manager", icon: ClipboardList },
    { label: "Audit", to: "/audit", icon: Building },
  ],
};

export function Navbar() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (loading) return null;

  const isAuthenticated = !!user;
  const items = isAuthenticated ? roleItems[user.role || "student"] : authItems;

  return (
    <nav className="sticky top-0 z-20 border-b border-border bg-ivory/90 backdrop-blur-md">
      <div className="container flex items-center justify-between px-4 py-3">
        <NavLink
          to="/"
          className={({ isActive }) =>
            `flex items-center gap-2 font-bold text-lg tracking-tight ${isActive ? "text-forest" : "text-dark"}`
          }
        >
          <span className="rounded bg-forest px-2 py-0.5 text-white text-xs font-bold">U</span>
          Unlock<span className="text-muted"> Underused</span>
        </NavLink>

        <div className="hidden md:flex items-center gap-6">
          {items.map((item) => {
            if (item.isPrimary) {
              return (
                <button
                  key={item.to}
                  onClick={() => navigate(item.to)}
                  className="btn-primary text-sm px-4 py-2"
                >
                  {item.label}
                </button>
              );
            }
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/resources"}
                className={({ isActive }) =>
                  `text-sm font-medium px-3 py-2 rounded-md transition-colors ${
                    isActive
                      ? "bg-forest text-white"
                      : "text-muted hover:bg-forest/5 hover:text-dark"
                  }`
                }
              >
                <item.icon className="mr-2 h-4 w-4" /> {item.label}
              </NavLink>
            );
          })}
          {isAuthenticated && (
            <button
              onClick={async () => {
                await signOut();
                navigate("/login", { replace: true });
              }}
              className="text-sm font-medium text-muted hover:text-rose-600"
            >
              Sign out
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 md:hidden">
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="text-muted hover:text-forest"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          {isAuthenticated && (
            <button className="flex items-center gap-2 text-xs font-medium text-muted hover:text-dark">
              <User className="h-4 w-4" /> {user.fullName || user.email}
            </button>
          )}
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-border bg-white">
          <div className="px-4 py-4 space-y-2">
            {items.map((item) => {
              if (item.isPrimary) {
                return (
                  <button
                    key={item.to}
                    onClick={() => {
                      navigate(item.to);
                      setMobileOpen(false);
                    }}
                    className="w-full text-left btn-primary text-sm px-3 py-2 rounded-md"
                  >
                    {item.label}
                  </button>
                );
              }
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/resources"}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    `block text-sm font-medium px-3 py-2 rounded-md transition-colors ${
                      isActive
                        ? "bg-forest text-white"
                        : "text-muted hover:bg-forest/5 hover:text-dark"
                    }`
                  }
                >
                  <item.icon className="mr-2 h-4 w-4" /> {item.label}
                </NavLink>
              );
            })}
            {isAuthenticated && (
              <button
                onClick={async () => {
                  await signOut();
                  navigate("/login", { replace: true });
                  setMobileOpen(false);
                }}
                className="w-full text-left text-sm font-medium text-muted hover:text-rose-600 px-3 py-2 rounded-md"
              >
                Sign out
              </button>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
