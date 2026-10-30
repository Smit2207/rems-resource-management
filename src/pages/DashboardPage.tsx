import { NavLink } from "react-router-dom";
import { PageLayout } from "../components/PageLayout";

export default function DashboardPage() {
  return (
    <PageLayout>
      <div className="card">
        <h2 className="text-xl font-bold mb-4">Dashboard</h2>
        <p className="text-secondary-text">
          Welcome to the Resource Sharing Platform. Browse resources, manage
          your bookings, and track incidents.
        </p>
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <NavLink to="/resources" className="btn-primary">
            Browse Resources
          </NavLink>
          <NavLink to="/bookings" className="btn-primary">
            My Bookings
          </NavLink>
          <NavLink to="/incidents" className="btn-primary">
            Incidents
          </NavLink>
        </div>
      </div>
    </PageLayout>
  );
}
