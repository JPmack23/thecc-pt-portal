/**
 * DashboardPage
 *
 * PT landing page after login. Shows profile snapshot and quick navigation
 * to deals and packages.
 *
 * Issue #10 scaffold — full feature implementation tracked in subsequent issues.
 */

import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import { PortalLayout } from '../components/PortalLayout';

export default function DashboardPage() {
  const { coachRow } = useAuth();
  const { tenant } = useTenant();

  const primaryColor = tenant?.primary_color ?? '#FFD600';

  return (
    <PortalLayout>
      <div className="max-w-3xl mx-auto px-6 py-10">
        {/* Welcome */}
        <div className="mb-10">
          <div className="flex items-center gap-4">
            {coachRow?.photo_url ? (
              <img
                src={coachRow.photo_url}
                alt={coachRow.name}
                className="w-16 h-16 rounded-full object-cover border-2"
                style={{ borderColor: primaryColor }}
              />
            ) : (
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold border-2"
                style={{ borderColor: primaryColor, backgroundColor: primaryColor + '20', color: primaryColor }}
              >
                {coachRow?.name?.charAt(0) ?? '?'}
              </div>
            )}
            <div>
              <h1 className="text-text text-2xl font-bold">
                Welcome back, {coachRow?.name?.split(' ')[0] ?? 'Coach'}
              </h1>
              <p className="text-text-muted text-sm mt-0.5">Manage your profile and deals</p>
            </div>
          </div>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <QuickCard
            title="My Profile"
            description="Update your bio, photo, and contact details"
            href="/profile"
            primaryColor={primaryColor}
          />
          <QuickCard
            title="My Deals"
            description="Publish exclusive deals for your clients"
            href="/deals"
            primaryColor={primaryColor}
          />
          <QuickCard
            title="My Packages"
            description="List your pricing and coaching packages"
            href="/packages"
            primaryColor={primaryColor}
          />
        </div>
      </div>
    </PortalLayout>
  );
}

function QuickCard({
  title,
  description,
  href,
  primaryColor,
}: {
  title: string;
  description: string;
  href: string;
  primaryColor: string;
}) {
  return (
    <a
      href={href}
      className="block bg-surface border border-border rounded-2xl p-5 hover:border-primary transition-colors group"
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 font-bold text-sm"
        style={{ backgroundColor: primaryColor + '20', color: primaryColor }}
      >
        {title.charAt(0)}
      </div>
      <h3 className="text-text font-semibold text-sm mb-1">{title}</h3>
      <p className="text-text-muted text-xs leading-relaxed">{description}</p>
    </a>
  );
}
