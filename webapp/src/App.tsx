import { lazy, Suspense } from "react";
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
import { RouteFallback } from "@/components/RouteFallback";

const Index = lazy(() => import("./pages/Index"));
const Events = lazy(() => import("./pages/Events"));
const EventDetail = lazy(() => import("./pages/EventDetail"));
const Venues = lazy(() => import("./pages/Venues"));
const VenueEdit = lazy(() => import("./pages/VenueEdit"));
const VenueDetail = lazy(() => import("./pages/VenueDetail"));
const People = lazy(() => import("./pages/People"));
const PersonEdit = lazy(() => import("./pages/PersonEdit"));
const Team = lazy(() => import("./pages/Team"));
const Calendars = lazy(() => import("./pages/Calendars"));
const ProductionPlanner = lazy(() => import("./pages/ProductionPlanner"));
const ProductionPlanTaskPage = lazy(() => import("./pages/ProductionPlanTaskPage"));
const Schedule = lazy(() => import("./pages/Schedule"));
const Staffing = lazy(() => import("./pages/Staffing"));
const TimeTracking = lazy(() => import("./pages/TimeTracking"));
const TimeReport = lazy(() => import("./pages/TimeReport"));
const Login = lazy(() => import("./pages/Login"));
const AcceptInvite = lazy(() => import("./pages/AcceptInvite"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const SetupOrg = lazy(() => import("./pages/SetupOrg"));
const SelectOrg = lazy(() => import("./pages/SelectOrg"));
const Account = lazy(() => import("./pages/Account"));
const Roles = lazy(() => import("./pages/Roles"));
const Tours = lazy(() => import("./pages/Tours"));
const TourDetail = lazy(() => import("./pages/TourDetail"));
const PublicTourSchedule = lazy(() => import("./pages/PublicTourSchedule"));
const PersonalTourView = lazy(() => import("./pages/PersonalTourView"));
const AdminDashboard = lazy(() => import("./pages/admin/Dashboard"));
const AdminOrgs = lazy(() => import("./pages/admin/Orgs"));
const AdminOrgDetail = lazy(() => import("./pages/admin/OrgDetail"));
const AdminPricing = lazy(() => import("./pages/admin/Pricing"));
const AdminUsers = lazy(() => import("./pages/admin/Users"));
const SiteContentAdmin = lazy(() => import("./pages/admin/SiteContent"));
const Frontpage = lazy(() => import("./pages/Frontpage"));
const PublicPricing = lazy(() => import("./pages/PublicPricing"));
const PublicFeatures = lazy(() => import("./pages/PublicFeatures"));
const PublicRoleFeatures = lazy(() => import("./pages/PublicRoleFeatures"));
const LegalPage = lazy(() => import("./pages/LegalPage"));

/** Opt into React Router v7 behaviors early — removes dev-only future-flag console warnings. */
const ROUTER_FUTURE = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <BrowserRouter future={ROUTER_FUTURE}>
        <Toaster />
        <AppErrorBoundary>
        <Suspense fallback={<RouteFallback />}>
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
            path="/signup"
            element={
              <GuestRoute>
                <Login />
              </GuestRoute>
            }
          />
          <Route
            path="/accept-invite"
            element={
              <PublicLayout pageTitleOverride="Invitation">
                <AcceptInvite />
              </PublicLayout>
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
            path="/features"
            element={
              <PublicLayout>
                <PublicFeatures />
              </PublicLayout>
            }
          />
          <Route
            path="/features/:roleSlug"
            element={
              <PublicLayout>
                <PublicRoleFeatures />
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
                  <EventDetail />
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
            path="/venues/:id/edit"
            element={
              <ProtectedRoute>
                <Layout>
                  <VenueEdit />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/venues/:id"
            element={
              <ProtectedRoute>
                <Layout>
                  <VenueDetail />
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
            path="/people/:id/edit"
            element={
              <ProtectedRoute>
                <Layout>
                  <PersonEdit />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/teams"
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
            path="/production"
            element={
              <ProtectedRoute>
                <Layout>
                  <ProductionPlanner />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/production/:productionId/task/:lineId"
            element={
              <ProtectedRoute>
                <Layout>
                  <ProductionPlanTaskPage />
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
            path="/time"
            element={
              <ProtectedRoute>
                <Layout>
                  <TimeTracking />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/staffing"
            element={
              <ProtectedRoute>
                <Layout>
                  <Staffing />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/time/reports"
            element={
              <ProtectedRoute>
                <Layout>
                  <TimeReport />
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

          {/* Public tour share links (no login required) */}
          <Route path="/t/:token" element={<PublicTourSchedule />} />
          <Route path="/p/:personalToken" element={<PersonalTourView />} />

          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
        </AppErrorBoundary>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
