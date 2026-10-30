import { createBrowserRouter, RouterProvider, Outlet } from "react-router-dom";
import { Navbar } from "../components/Navbar";
import { ProtectedRoute, RoleGuard } from "../components/ProtectedRoute";
import LoginPage from "./LoginPage";
import RegisterPage from "./RegisterPage";
import DashboardPage from "./DashboardPage";
import ResourcesPage from "./ResourcesPage";
import ResourceCreatePage from "./ResourceCreatePage";
import ResourcesMinePage from "./ResourcesMinePage";
import ResourceDetailPage from "./ResourceDetailPage";
import ResourceEditPage from "./ResourceEditPage";
import ResourceBookPage from "./ResourceBookPage";
import BookingsPage from "./BookingsPage";
import BookingReviewPage from "./BookingReviewPage";
import BookingCheckoutPage from "./BookingCheckoutPage";
import BookingReturnPage from "./BookingReturnPage";
import IncidentsPage from "./IncidentsPage";
import IncidentReviewPage from "./IncidentReviewPage";
import NotificationsPage from "./NotificationsPage";
import AuditPage from "./AuditPage";
import ManagerPage from "./ManagerPage";
import ProfilePage from "./ProfilePage";
import NotFoundPage from "./NotFoundPage";

export function MainLayout() {
  return (
    <>
      <Navbar />
      <div className="page">
        <div className="container">
          <Outlet />
        </div>
      </div>
    </>
  );
}

const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    path: "/register",
    element: <RegisterPage />,
  },
  {
    path: "/",
    element: <ProtectedRoute />,
    children: [
      {
        path: "",
        element: <MainLayout />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: "dashboard", element: <DashboardPage /> },
          { path: "resources", element: <ResourcesPage /> },
          { path: "resources/create", element: <ResourceCreatePage /> },
          { path: "resources/mine", element: <ResourcesMinePage /> },
          { path: "resources/:id", element: <ResourceDetailPage /> },
          { path: "resources/:id/edit", element: <ResourceEditPage /> },
          { path: "resources/:id/book", element: <ResourceBookPage /> },
          { path: "bookings", element: <BookingsPage /> },
          { path: "bookings/:id/review", element: <BookingReviewPage /> },
          { path: "bookings/:id/checkout", element: <BookingCheckoutPage /> },
          { path: "bookings/:id/return", element: <BookingReturnPage /> },
          { path: "incidents", element: <IncidentsPage /> },
          { path: "incidents/:id/review", element: <IncidentReviewPage /> },
          { path: "notifications", element: <NotificationsPage /> },
          { path: "profile", element: <ProfilePage /> },
          {
            path: "audit",
            element: (
              <RoleGuard allowedRoles={["manager", "admin"]}>
                <AuditPage />
              </RoleGuard>
            ),
          },
          {
            path: "manager",
            element: (
              <RoleGuard allowedRoles={["manager", "admin"]}>
                <ManagerPage />
              </RoleGuard>
            ),
          },
          { path: "*", element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
