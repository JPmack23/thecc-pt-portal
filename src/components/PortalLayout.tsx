/**
 * PortalLayout
 *
 * Shared chrome for all authenticated PT portal pages.
 * Renders the top nav (logo, page links, sign-out) then a scrollable main area.
 *
 * Used by: DashboardPage, ProfilePage, DealsPage, PackagesPage.
 */

import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';

interface PortalLayoutProps {
  children: React.ReactNode;
}

export function PortalLayout({ children }: PortalLayoutProps) {
  const { signOut, coachRow, isOrgAdmin } = useAuth();
  const { tenant } = useTenant();
  const primary = tenant?.primary_color ?? '#FFD600';
  const currentPath = window.location.pathname;

  const navLinks = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/profile', label: 'My Profile' },
    { href: '/photos', label: 'My Photos' },
    { href: '/packages', label: 'My Packages' },
    // org_admin only — not shown to regular PTs
    ...(isOrgAdmin ? [{ href: '/admin/roles', label: 'Manage Roles' }] : []),
  ];

  return (
    <div className="min-h-screen bg-canvas">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-canvas border-b border-border px-4 sm:px-6 py-3 flex items-center gap-4">
        {/* Logo / app name */}
        <a href="/dashboard" className="flex items-center gap-2 flex-shrink-0">
          {tenant?.logo_url ? (
            <img
              src={tenant.logo_url}
              alt={tenant.app_name}
              className="h-7 object-contain"
              style={{ border: 'none', borderRadius: 0, background: 'none', padding: 0, boxShadow: 'none' }}
            />
          ) : (
            <span className="text-text font-bold text-base">{tenant?.app_name ?? 'Coach Portal'}</span>
          )}
        </a>

        {/* Nav links — hidden on mobile, shown on sm+ */}
        <nav className="hidden sm:flex items-center gap-1 flex-1 ml-4">
          {navLinks.map(({ href, label }) => {
            const active = currentPath === href;
            return (
              <a
                key={href}
                href={href}
                className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                style={active
                  ? { backgroundColor: primary + '20', color: primary }
                  : { color: 'var(--color-text-muted)' }
                }
              >
                {label}
              </a>
            );
          })}
        </nav>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2">
            {coachRow?.photo_url ? (
              <img
                src={coachRow.photo_url}
                alt={coachRow.name}
                className="w-7 h-7 rounded-full object-cover border"
                style={{ borderColor: primary }}
              />
            ) : (
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border"
                style={{ borderColor: primary, backgroundColor: primary + '20', color: primary }}
              >
                {coachRow?.name?.charAt(0) ?? '?'}
              </div>
            )}
            <span className="text-text-muted text-sm">{coachRow?.name?.split(' ')[0]}</span>
          </div>
          <button
            onClick={signOut}
            className="text-text-subtle text-sm hover:text-text transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Mobile nav strip */}
      <div className="sm:hidden border-b border-border bg-canvas px-4 py-2 flex gap-2 overflow-x-auto">
        {navLinks.map(({ href, label }) => {
          const active = currentPath === href;
          return (
            <a
              key={href}
              href={href}
              className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={active
                ? { backgroundColor: primary + '20', color: primary }
                : { color: 'var(--color-text-muted)' }
              }
            >
              {label}
            </a>
          );
        })}
      </div>

      {/* Page content */}
      <main>{children}</main>
    </div>
  );
}
