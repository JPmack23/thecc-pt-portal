/**
 * InviteExpiredPage
 *
 * Shown when a PT clicks an expired invite link.
 * Routes: /invite-expired
 */

import { useTenant } from '../contexts/TenantContext';

export default function InviteExpiredPage() {
  const { tenant } = useTenant();

  return (
    <div className="min-h-screen bg-canvas flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="bg-surface rounded-2xl border border-border p-8 text-center">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl"
            style={{
              backgroundColor: (tenant?.primary_color ?? '#FFD600') + '20',
              color: tenant?.primary_color ?? '#FFD600',
            }}
          >
            &#x23F0;
          </div>
          <h1 className="text-text text-xl font-bold mb-2">This invite link has expired</h1>
          <p className="text-text-muted text-sm leading-relaxed">
            Invite links are valid for 48 hours.{' '}
            We've let your administrator know — a new link will be on its way shortly.
          </p>
          <div className="mt-6 pt-6 border-t border-border">
            <p className="text-text-subtle text-xs">
              Got a fresh link? Go ahead and{' '}
              <a href="/login" className="underline" style={{ color: tenant?.primary_color ?? '#FFD600' }}>
                sign in
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
