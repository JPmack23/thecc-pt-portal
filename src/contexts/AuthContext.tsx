/**
 * AuthContext
 *
 * Wraps Supabase auth. Exposes:
 *   - session / user (null when unauthenticated)
 *   - coachRow    — the coaches table row for the authenticated PT (null until resolved)
 *   - coachStatus — 'loading' | 'found' | 'not_setup' (no coaches row for this user)
 *   - signOut()
 *
 * On session change, immediately looks up the coaches row to determine
 * whether the authenticated user has been set up as a PT.
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { useTenant } from './TenantContext';

export interface CoachRow {
  id: string;
  name: string;
  email: string | null;
  bio: string | null;
  photo_url: string | null;
  specialties: string[] | null;
  instagram: string | null;
  tiktok: string | null;
  auth_user_id: string;
  api_client_id: string;
  // Extended preview fields — read by /photos and /packages so their preview
  // panes show the same full profile chrome as /profile does, just with the
  // page-specific section reflecting live edits.
  is_personal_trainer: boolean | null;
  is_nutritionist: boolean | null;
  regions: string[] | null;
  online_remote: boolean | null;
  qualifications: string | null;
  achievements: string | null;
  members_deal: string | null;
  coupon_code: string | null;
  members_deal_active: boolean | null;
}

type CoachStatus = 'loading' | 'found' | 'not_setup';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  coachRow: CoachRow | null;
  coachStatus: CoachStatus;
  authLoading: boolean;
  /** True when the authenticated user has the organisation_admin role for this tenant. */
  isOrgAdmin: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  coachRow: null,
  coachStatus: 'loading',
  authLoading: true,
  isOrgAdmin: false,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { tenant } = useTenant();
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [coachRow, setCoachRow] = useState<CoachRow | null>(null);
  const [coachStatus, setCoachStatus] = useState<CoachStatus>('loading');
  const [authLoading, setAuthLoading] = useState(true);
  const [isOrgAdmin, setIsOrgAdmin] = useState(false);

  const resolveCoachRow = async (userId: string, apiClientId: string) => {
    setCoachStatus('loading');

    // Run both queries in parallel — coach row + org_admin role check
    const [coachRes, roleRes] = await Promise.all([
      supabase
        .from('coaches')
        .select(
          'id, name, email, bio, photo_url, specialties, instagram, tiktok, auth_user_id, api_client_id,' +
          ' is_personal_trainer, is_nutritionist, regions, online_remote, qualifications, achievements,' +
          ' members_deal, coupon_code, members_deal_active',
        )
        .eq('auth_user_id', userId)
        .eq('api_client_id', apiClientId)
        .maybeSingle(),
      supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .eq('role', 'organisation_admin')
        .maybeSingle(),
    ]);

    if (coachRes.error) {
      console.error('[AuthContext] coaches lookup error:', coachRes.error);
      setCoachStatus('not_setup');
      return;
    }

    if (coachRes.data) {
      // Cast via unknown — the Supabase select string is constructed across
      // lines so the inferred row type is opaque to TS, but the field list
      // matches CoachRow exactly.
      setCoachRow(coachRes.data as unknown as CoachRow);
      setCoachStatus('found');
    } else {
      setCoachStatus('not_setup');
    }

    // Set org admin flag (true if user_roles row exists for organisation_admin)
    setIsOrgAdmin(!!roleRes.data);
  };

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      setAuthLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // When session + tenant are both resolved, look up the coaches row
  useEffect(() => {
    if (!user || !tenant) {
      if (!user) {
        setCoachRow(null);
        setCoachStatus('loading');
      }
      return;
    }
    resolveCoachRow(user.id, tenant.api_client_id);
  }, [user?.id, tenant?.api_client_id]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setCoachRow(null);
    setCoachStatus('loading');
    setIsOrgAdmin(false);
  };

  return (
    <AuthContext.Provider value={{ session, user, coachRow, coachStatus, authLoading, isOrgAdmin, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
