import { Routes, Route, Navigate } from "react-router-dom";
import { Navbar } from "./components/Navbar";
import { ProtectedRoute, RoleGuard } from "./components/ProtectedRoute";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ResourcesPage from "./pages/ResourcesPage";
import ResourceCreatePage from "./pages/ResourceCreatePage";
import ResourcesMinePage from "./pages/ResourcesMinePage";
import ResourceDetailPage from "./pages/ResourceDetailPage";
import ResourceEditPage from "./pages/ResourceEditPage";
import BookingsPage from "./pages/BookingsPage";
import ResourceBookPage from "./pages/ResourceBookPage";
import BookingReviewPage from "./pages/BookingReviewPage";
import BookingCheckoutPage from "./pages/BookingCheckoutPage";
import BookingReturnPage from "./pages/BookingReturnPage";
import IncidentsPage from "./pages/IncidentsPage";
import IncidentReviewPage from "./pages/IncidentReviewPage";
import NotificationsPage from "./pages/NotificationsPage";
import WaitingListPage from "./pages/WaitingListPage";
import AuditPage from "./pages/AuditPage";
import ManagerPage from "./pages/ManagerPage";
import ProfilePage from "./pages/ProfilePage";
import DashboardPage from "./pages/DashboardPage";
import MatchmakerPage from "./pages/MatchmakerPage";
import FairSharePage from "./pages/FairSharePage";
import ImpactLedgerPage from "./pages/ImpactLedgerPage";
import TrustPassportPage from "./pages/TrustPassportPage";
import DemandRadarPage from "./pages/DemandRadarPage";
import MissionKitsPage from "./pages/MissionKitsPage";
import CampusMapPage from "./pages/CampusMapPage";
import NotFoundPage from "./pages/NotFoundPage";

export default function App() {
  return (
    <>
      <Navbar />
      <Routes>
        {/* Public routes - no authentication required */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* Protected routes - authentication required */}
        <Route element={<ProtectedRoute />}>
          <Route index element={<Navigate to="/resources" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="resources" element={<ResourcesPage />} />
          <Route path="resources/create" element={<ResourceCreatePage />} />
          <Route path="resources/mine" element={<ResourcesMinePage />} />
          <Route path="resources/:id" element={<ResourceDetailPage />} />
          <Route path="resources/:id/edit" element={<ResourceEditPage />} />
          <Route path="resources/:id/book" element={<ResourceBookPage />} />
          <Route path="bookings" element={<BookingsPage />} />
          <Route path="bookings/:id/review" element={<BookingReviewPage />} />
          <Route path="bookings/:id/checkout" element={<BookingCheckoutPage />} />
          <Route path="bookings/:id/return" element={<BookingReturnPage />} />
          <Route path="incidents" element={<IncidentsPage />} />
          <Route path="incidents/:id/review" element={<IncidentReviewPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="waiting-list" element={<WaitingListPage />} />
          <Route
            path="audit"
            element={
              <RoleGuard allowedRoles={["manager", "admin"]}>
                <AuditPage />
              </RoleGuard>
            }
          />
          <Route
            path="manager"
            element={
              <RoleGuard allowedRoles={["manager", "admin"]}>
                <ManagerPage />
              </RoleGuard>
            }
          />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="matchmaker" element={<MatchmakerPage />} />
          <Route path="fairshare" element={<FairSharePage />} />
          <Route path="impact-ledger" element={<ImpactLedgerPage />} />
          <Route path="trust-passport" element={<TrustPassportPage />} />
          <Route path="demand-radar" element={<DemandRadarPage />} />
          <Route path="mission-kits" element={<MissionKitsPage />} />
          <Route path="campus-map" element={<CampusMapPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </>
  );
}
