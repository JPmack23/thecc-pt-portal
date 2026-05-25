/**
 * NotSetupPage
 *
 * Shown when the authenticated user does not have a coaches row for this tenant.
 * i.e. they authenticated successfully but have not been set up as a PT yet.
 */

import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';

export default function NotSetupPage() {
  const { signOut } = useAuth();
  const { tenant } = useTenant();

  return (
    <div className="min-h-screen bg-canvas flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="bg-surface rounded-2xl border border-border p-8 text-center">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl"
            style={{ backgroundColor: (tenant?.primary_color ?? '#FFD600') + '20' }}
          >
            <span style={{ color: tenant?.primary_color ?? '#FFD600' }}>?</span>
          </div>
          <h1 className="text-text text-xl font-bold mb-2">You haven't been set up yet</h1>
          <p className="text-text-muted text-sm leading-relaxed mb-6">
            Contact your administrator to get access to the Coach Portal.
            Once they've set you up, you'll be able to manage your profile and deals.
          </p>
          <button
            onClick={signOut}
            className="text-text-muted text-sm hover:text-text transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
