/**
 * TenantContext
 *
 * On mount, resolves the current hostname to a tenant by calling
 * api-v1-tenant-config. Stores the resolved branding and api_client_id
 * so every downstream component can use them without re-fetching.
 *
 * Hostname resolution order:
 *   1. ?__hostname=... query param (non-production Vercel preview override)
 *   2. VITE_DEV_HOSTNAME env var (local dev)
 *   3. window.location.hostname (production / real CNAME)
 */

import React, { createContext, useContext, useEffect, useState } from 'react';

export interface TenantConfig {
  api_client_id: string;
  app_name: string;
  primary_color: string;
  secondary_color: string;
  logo_url: string | null;
  portal_title: string;
  mode: 'light' | 'dark';
}

interface TenantContextValue {
  tenant: TenantConfig | null;
  loading: boolean;
  error: 'tenant_not_found' | 'network_error' | null;
}

const TenantContext = createContext<TenantContextValue>({
  tenant: null,
  loading: true,
  error: null,
});

const SUPABASE_FUNCTIONS_URL =
  import.meta.env.VITE_SUPABASE_FUNCTIONS_URL ??
  'https://pzqwvblyuxezfgjxnbbn.supabase.co/functions/v1';

// The api-v1-tenant-config function is deployed with verify_jwt = true, so the
// Supabase API gateway rejects header-less requests with 401 before the function
// runs. This is the FIRST call the portal makes — before any user is signed in —
// so we send the public anon key explicitly. The anon key already ships in the
// client bundle (it's public by design), so this leaks nothing; it just makes the
// bootstrap call deterministic instead of relying on undefined gateway behaviour.
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

function resolveHostname(): string {
  // 1. Query param override (Vercel preview testing)
  const params = new URLSearchParams(window.location.search);
  const queryOverride = params.get('__hostname');
  if (queryOverride) return queryOverride;

  // 2. Env var (local dev)
  const envHostname = import.meta.env.VITE_DEV_HOSTNAME;
  if (envHostname) return envHostname;

  // 3. Real hostname
  return window.location.hostname;
}

/** Apply tenant CSS custom properties to :root so Tailwind tokens resolve. */
function applyTenantTheme(config: TenantConfig) {
  const root = document.documentElement;
  const isDark = config.mode === 'dark';

  root.style.setProperty('--color-primary', config.primary_color);
  // Primary foreground: black on yellow (#FFD600), white on dark primaries
  const primHex = config.primary_color.replace('#', '');
  const r = parseInt(primHex.substring(0, 2), 16);
  const g = parseInt(primHex.substring(2, 4), 16);
  const b = parseInt(primHex.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  root.style.setProperty('--color-primary-fg', luminance > 0.5 ? '#000000' : '#FFFFFF');

  root.style.setProperty('--color-secondary', config.secondary_color);

  if (isDark) {
    root.style.setProperty('--color-canvas', '#000000');
    root.style.setProperty('--color-surface', '#1A1A1A');
    root.style.setProperty('--color-surface-alt', '#111111');
    root.style.setProperty('--color-border', '#2A2A2A');
    root.style.setProperty('--color-text', '#FFFFFF');
    root.style.setProperty('--color-text-muted', '#AAAAAA');
    root.style.setProperty('--color-text-subtle', '#777777');
  } else {
    root.style.setProperty('--color-canvas', '#FFFFFF');
    root.style.setProperty('--color-surface', '#FFFFFF');
    root.style.setProperty('--color-surface-alt', '#F5F7F9');
    root.style.setProperty('--color-border', '#E4E7EA');
    root.style.setProperty('--color-text', '#0F1A24');
    root.style.setProperty('--color-text-muted', '#5C6A77');
    root.style.setProperty('--color-text-subtle', '#8A96A2');
  }

  // Set document title
  document.title = config.portal_title ? `${config.portal_title} — Coach Portal` : 'Coach Portal';
}

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const [tenant, setTenant] = useState<TenantConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<TenantContextValue['error']>(null);

  useEffect(() => {
    const hostname = resolveHostname();
    const params = new URLSearchParams(window.location.search);
    const isOverride = params.get('__hostname') !== null;

    // Build URL — pass __hostname as query param when using override
    const url = new URL(`${SUPABASE_FUNCTIONS_URL}/api-v1-tenant-config`);
    url.searchParams.set('hostname', hostname);
    if (isOverride) {
      url.searchParams.set('__hostname', hostname);
    }

    fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        // Required because the function is deployed with verify_jwt = true.
        // Public anon key — safe to send pre-auth (it ships in the bundle).
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    })
      .then(async (res) => {
        if (res.status === 404) {
          setError('tenant_not_found');
          return;
        }
        if (!res.ok) {
          setError('network_error');
          return;
        }
        const body = await res.json();
        const config: TenantConfig = body.data;
        applyTenantTheme(config);
        setTenant(config);
      })
      .catch(() => {
        setError('network_error');
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  return (
    <TenantContext.Provider value={{ tenant, loading, error }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  return useContext(TenantContext);
}
