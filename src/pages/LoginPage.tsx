/**
 * LoginPage
 *
 * Email OTP flow — consistent with the THECC+ member app login.
 *   Step 1: Enter email → Supabase sends 6-digit OTP
 *   Step 2: Enter 6-digit code → authenticated session
 *
 * Branding loaded from TenantContext — zero hardcoded brand values.
 */

import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useTenant } from '../contexts/TenantContext';

type Step = 'email' | 'otp';

export default function LoginPage() {
  const { tenant } = useTenant();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError(null);

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        shouldCreateUser: false, // PTs must be invited — no self-registration
      },
    });

    setLoading(false);

    if (otpError) {
      // Supabase returns a generic error when email doesn't exist and shouldCreateUser=false
      setError('We could not find an account with that email. Please check you are using the email your invitation was sent to.');
      return;
    }

    setStep('otp');
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp.trim() || otp.length !== 6) return;
    setLoading(true);
    setError(null);

    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: otp.trim(),
      type: 'email',
    });

    setLoading(false);

    if (verifyError) {
      setError('That code is incorrect or has expired. Please try again.');
      return;
    }

    // Auth state change handled by AuthContext — router will redirect
  };

  const logoUrl = tenant?.logo_url;
  const portalTitle = tenant?.portal_title ?? 'Coach Portal';

  return (
    <div className="min-h-screen bg-canvas flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo / wordmark */}
        <div className="flex flex-col items-center mb-10">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={portalTitle}
              className="h-14 mb-4 object-contain"
              style={{ border: 'none', borderRadius: 0, background: 'none', padding: 0, boxShadow: 'none' }}
            />
          ) : (
            <div
              className="h-14 w-14 rounded-full flex items-center justify-center mb-4 font-bold text-2xl"
              style={{ backgroundColor: tenant?.primary_color ?? '#FFD600', color: '#000000' }}
            >
              {portalTitle.charAt(0)}
            </div>
          )}
          <h1 className="text-text text-2xl font-bold tracking-tight">{portalTitle}</h1>
          <p className="text-text-muted text-sm mt-1">Coach Portal</p>
        </div>

        {/* Card */}
        <div className="bg-surface rounded-2xl border border-border p-6">
          {step === 'email' ? (
            <>
              <h2 className="text-text text-lg font-semibold mb-1">Welcome, Coach</h2>
              <p className="text-text-muted text-sm mb-6">
                Enter your email to receive a sign-in code.
              </p>
              <form onSubmit={handleSendOtp} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-text-muted text-xs font-medium mb-1.5 uppercase tracking-wide">
                    Email address
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    autoComplete="email"
                    className="w-full bg-surface-alt border border-border rounded-xl px-4 py-3 text-text placeholder-text-subtle text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                {error && (
                  <p className="text-sm text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={loading || !email.trim()}
                  className="w-full py-3 rounded-xl font-semibold text-sm transition-opacity disabled:opacity-50"
                  style={{ backgroundColor: tenant?.primary_color ?? '#FFD600', color: '#000000' }}
                >
                  {loading ? 'Sending...' : 'Send sign-in code'}
                </button>
              </form>
            </>
          ) : (
            <>
              <h2 className="text-text text-lg font-semibold mb-1">Enter your code</h2>
              <p className="text-text-muted text-sm mb-6">
                We sent a 6-digit code to <span className="text-text font-medium">{email}</span>.
              </p>
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <div>
                  <label htmlFor="otp" className="block text-text-muted text-xs font-medium mb-1.5 uppercase tracking-wide">
                    Sign-in code
                  </label>
                  <input
                    id="otp"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="123456"
                    required
                    autoComplete="one-time-code"
                    className="w-full bg-surface-alt border border-border rounded-xl px-4 py-3 text-text placeholder-text-subtle text-sm text-center tracking-widest text-lg font-mono focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                {error && (
                  <p className="text-sm text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={loading || otp.length !== 6}
                  className="w-full py-3 rounded-xl font-semibold text-sm transition-opacity disabled:opacity-50"
                  style={{ backgroundColor: tenant?.primary_color ?? '#FFD600', color: '#000000' }}
                >
                  {loading ? 'Verifying...' : 'Verify code'}
                </button>

                <button
                  type="button"
                  onClick={() => { setStep('email'); setError(null); setOtp(''); }}
                  className="w-full text-text-muted text-sm hover:text-text transition-colors"
                >
                  Use a different email
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-text-subtle text-xs text-center mt-6">
          Having trouble? Contact your administrator.
        </p>
      </div>
    </div>
  );
}
