import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { PublicLayout } from "@/components/PublicLayout";
import { AdminLayout, AdminRoute } from "@/components/AdminLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { GuestRoute } from "@/components/GuestRoute";
import Index from "./pages/Index";
import Events from "./pages/Events";
import NewEvent from "./pages/NewEvent";
import EventDetail from "./pages/EventDetail";
import Venues from "./pages/Venues";
import People from "./pages/People";
import Team from "./pages/Team";
import Calendars from "./pages/Calendars";
import Schedule from "./pages/Schedule";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import SetupOrg from "./pages/SetupOrg";
import SelectOrg from "./pages/SelectOrg";
import Account from "./pages/Account";
import Roles from "./pages/Roles";
import Tours from "./pages/Tours";
import TourDetail from "./pages/TourDetail";
import PublicTourSchedule from "./pages/PublicTourSchedule";
import PersonalTourView from "./pages/PersonalTourView";
import AdminDashboard from "./pages/admin/Dashboard";
import AdminOrgs from "./pages/admin/Orgs";
import AdminOrgDetail from "./pages/admin/OrgDetail";
import AdminPricing from "./pages/admin/Pricing";
import AdminUsers from "./pages/admin/Users";
import SiteContentAdmin from "./pages/admin/SiteContent";
import Frontpage from "./pages/Frontpage";
import PublicPricing from "./pages/PublicPricing";
import LegalPage from "./pages/LegalPage";

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AppErrorBoundary>
        <Routes>
          {/* Guest-only routes */}
          <Route
            path="/login"
            element={
              <GuestRoute>
                <Login />
              </GuestRoute>
            }
          />
          <Route
            path="/forgot-password"
            element={
              <GuestRoute>
                <ForgotPassword />
              </GuestRoute>
            }
          />
          <Route
            path="/reset-password"
            element={
              <GuestRoute>
                <ResetPassword />
              </GuestRoute>
            }
          />

          {/* Auth required but no org needed */}
          <Route
            path="/setup-org"
            element={
              <ProtectedRoute requireOrg={false}>
                <SetupOrg />
              </ProtectedRoute>
            }
          />
          <Route
            path="/select-org"
            element={
              <ProtectedRoute requireOrg={false}>
                <SelectOrg />
              </ProtectedRoute>
            }
          />

          {/* Public marketing/legal routes (same shell as admin: left nav + logo) */}
          <Route
            path="/"
            element={
              <PublicLayout>
                <Frontpage />
              </PublicLayout>
            }
          />
          <Route
            path="/pricing"
            element={
              <PublicLayout>
                <PublicPricing />
              </PublicLayout>
            }
          />
          <Route
            path="/terms-of-service"
            element={
              <PublicLayout>
                <LegalPage />
              </PublicLayout>
            }
          />
          <Route
            path="/privacy-policy"
            element={
              <PublicLayout>
                <LegalPage />
              </PublicLayout>
            }
          />
          <Route
            path="/refund-policy"
            element={
              <PublicLayout>
                <LegalPage />
              </PublicLayout>
            }
          />
          {/* Protected routes with sidebar layout */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Layout>
                  <Index />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/events"
            element={
              <ProtectedRoute>
                <Layout>
                  <Events />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/events/new"
            element={
              <ProtectedRoute>
                <Layout>
                  <NewEvent />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/events/:id"
            element={
              <ProtectedRoute>
                <Layout>
                  <EventDetail />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/venues"
            element={
              <ProtectedRoute>
                <Layout>
                  <Venues />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/people"
            element={
              <ProtectedRoute>
                <Layout>
                  <People />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/team"
            element={
              <ProtectedRoute>
                <Layout>
                  <Team />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/roles"
            element={
              <ProtectedRoute>
                <Layout>
                  <Roles />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/calendars"
            element={
              <ProtectedRoute>
                <Layout>
                  <Calendars />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/schedule"
            element={
              <ProtectedRoute>
                <Layout>
                  <Schedule />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/tours"
            element={
              <ProtectedRoute>
                <Layout>
                  <Tours />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/tours/:id"
            element={
              <ProtectedRoute>
                <Layout>
                  <TourDetail />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/billing"
            element={
              <ProtectedRoute>
                <Navigate to="/account#billing" replace />
              </ProtectedRoute>
            }
          />
          <Route
            path="/account"
            element={
              <ProtectedRoute>
                <Layout>
                  <Account />
                </Layout>
              </ProtectedRoute>
            }
          />

          {/* Admin routes */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <AdminRoute>
                  <AdminLayout>
                    <AdminDashboard />
                  </AdminLayout>
                </AdminRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/orgs"
            element={
              <ProtectedRoute>
                <AdminRoute>
                  <AdminLayout>
                    <AdminOrgs />
                  </AdminLayout>
                </AdminRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/orgs/:id"
            element={
              <ProtectedRoute>
                <AdminRoute>
                  <AdminLayout>
                    <AdminOrgDetail />
                  </AdminLayout>
                </AdminRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/pricing"
            element={
              <ProtectedRoute>
                <AdminRoute>
                  <AdminLayout>
                    <AdminPricing />
                  </AdminLayout>
                </AdminRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/users"
            element={
              <ProtectedRoute>
                <AdminRoute>
                  <AdminLayout>
                    <AdminUsers />
                  </AdminLayout>
                </AdminRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/site-content"
            element={
              <ProtectedRoute>
                <AdminRoute>
                  <AdminLayout>
                    <SiteContentAdmin />
                  </AdminLayout>
                </AdminRoute>
              </ProtectedRoute>
            }
          />

          {/* Protected share routes during private rollout */}
          <Route
            path="/t/:token"
            element={
              <ProtectedRoute>
                <PublicTourSchedule />
              </ProtectedRoute>
            }
          />
          <Route
            path="/p/:personalToken"
            element={
              <ProtectedRoute>
                <PersonalTourView />
              </ProtectedRoute>
            }
          />

          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </AppErrorBoundary>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
