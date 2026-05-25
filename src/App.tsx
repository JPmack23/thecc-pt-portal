/**
 * App.tsx
 *
 * Root of the PT portal. Wraps everything in:
 *   TenantProvider  → resolves hostname → branding
 *   AuthProvider    → Supabase session + coaches row
 *   Router          → page routing
 *
 * Route guard logic:
 *   - Tenant loading  → spinner
 *   - Tenant error    → PortalNotFoundPage
 *   - Unauthenticated → /login
 *   - Authenticated but no coaches row (not_setup) → NotSetupPage
 *   - Authenticated + coaches row → dashboard and other PT pages
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { TenantProvider, useTenant } from './contexts/TenantContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import PortalNotFoundPage from './pages/PortalNotFoundPage';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ProfilePage from './pages/ProfilePage';
import PackagesPage from './pages/PackagesPage';
import PhotosPage from './pages/PhotosPage';
import NotSetupPage from './pages/NotSetupPage';
import InviteExpiredPage from './pages/InviteExpiredPage';

// ── Global loading spinner ─────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-2 border-zinc-700 border-t-yellow-400 rounded-full animate-spin" />
        <span className="text-zinc-500 text-sm">Loading portal...</span>
      </div>
    </div>
  );
}

// ── Inner app — rendered once tenant context is resolved ───────────────────

function PortalRoutes() {
  const { tenant, loading: tenantLoading, error: tenantError } = useTenant();
  const { session, coachStatus, authLoading } = useAuth();

  // Tenant resolving
  if (tenantLoading) return <LoadingScreen />;

  // Tenant not found or network error
  if (tenantError || !tenant) {
    return <PortalNotFoundPage reason={tenantError ?? 'tenant_not_found'} />;
  }

  // Auth still resolving — keep the spinner brief
  if (authLoading) return <LoadingScreen />;

  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={
        session ? <Navigate to="/dashboard" replace /> : <LoginPage />
      } />
      <Route path="/invite-expired" element={<InviteExpiredPage />} />

      {/* Protected routes */}
      <Route path="/dashboard" element={
        !session
          ? <Navigate to="/login" replace />
          : coachStatus === 'loading'
          ? <LoadingScreen />
          : coachStatus === 'not_setup'
          ? <NotSetupPage />
          : <DashboardPage />
      } />

      {/* PT self-service pages — Issues #12, #14, #15 */}
      <Route path="/profile" element={
        !session
          ? <Navigate to="/login" replace />
          : coachStatus === 'loading'
          ? <LoadingScreen />
          : coachStatus === 'not_setup'
          ? <NotSetupPage />
          : <ProfilePage />
      } />
      <Route path="/photos" element={
        !session
          ? <Navigate to="/login" replace />
          : coachStatus === 'loading'
          ? <LoadingScreen />
          : coachStatus === 'not_setup'
          ? <NotSetupPage />
          : <PhotosPage />
      } />
      <Route path="/packages" element={
        !session
          ? <Navigate to="/login" replace />
          : coachStatus === 'loading'
          ? <LoadingScreen />
          : coachStatus === 'not_setup'
          ? <NotSetupPage />
          : <PackagesPage />
      } />

      {/* Default redirect */}
      <Route path="/" element={
        session ? <Navigate to="/dashboard" replace /> : <Navigate to="/login" replace />
      } />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

// ── Root ───────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <TenantProvider>
      <BrowserRouter>
        <AuthProvider>
          <PortalRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TenantProvider>
  );
}
