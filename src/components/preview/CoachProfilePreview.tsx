/**
 * CoachProfilePreview.tsx — AC-3 implementation (PRD v0.4 / Issue #13)
 *
 * CROSS-REPO IMPORT STRATEGY: Vite path alias
 * ─────────────────────────────────────────────
 * This file imports CoachProfileView directly from the thecc-plus-app source
 * tree on disk via the `@mobile/coach` Vite alias configured in vite.config.ts.
 * The mobile component is the SINGLE source of truth — this file NEVER copies
 * or reimplements its rendering logic.
 *
 * Any future styling change to CoachProfileView.tsx in thecc-plus-app will be
 * reflected here automatically with zero portal code changes.
 *
 * WHY VITE ALIAS (not npm workspace, not symlink):
 *   - Zero npm workspace setup across two repos
 *   - No symlink permission issues on Windows
 *   - Immediate HMR from either repo
 *   - Dead simple to understand and document
 *   - Right trade-off for a single shared component; graduate to workspace if
 *     the shared surface grows
 *
 * DATA FLOW:
 *   ProfilePage.formState → previewData (PreviewCoachData)
 *     → formDataToCoachProfileData() adapter (this file)
 *       → CoachProfileView (mobile component, rendered via react-native-web)
 *
 * The adapter is the only portal-side translation layer. If the mobile
 * CoachProfileData shape changes, only this adapter needs updating.
 *
 * REACT NATIVE WEB:
 *   All react-native imports in CoachProfileView resolve to react-native-web
 *   at build time via the Vite alias `react-native` → `react-native-web`.
 *   expo-image and @expo/vector-icons have dedicated shims in src/shims/.
 */

import { useState } from 'react';
import { useTenant } from '../../contexts/TenantContext';

// Mobile component + its types — imported via Vite @mobile/coach alias
import {
  CoachProfileView,
  type CoachProfileData,
  type CoachThemeColors,
} from '@mobile/coach/CoachProfileView';

// ── Types ──────────────────────────────────────────────────────────────────

/**
 * PreviewPackage — a minimal offering shape for the preview adapter.
 * Full detail lives in pt_offerings; this is what the preview panel needs.
 */
export interface PreviewPackage {
  id: string;
  title: string;
  price: number;
  duration?: string | null;
  promo_label?: string | null;
  promo_active?: boolean;
  promo_starts_at?: string | null;
  promo_ends_at?: string | null;
  featured?: boolean;
}

/**
 * PreviewCoachData — the portal's form state shape.
 * Includes all fields the PT portal form exposes, plus
 * gallery photos and packages (fetched separately, passed from ProfilePage).
 */
export interface PreviewCoachData {
  name: string;
  bio: string | null;
  email: string | null;
  photo_url: string | null;
  /** Object URL for unsaved photo uploads (EC-15) — takes priority over photo_url */
  photo_local_url?: string | null;
  specialties: string[] | null;
  instagram: string | null;
  tiktok: string | null;
  // Legacy role flags — kept for backwards compat; new UI uses selectedRoleLabels
  is_personal_trainer?: boolean | null;
  is_nutritionist?: boolean | null;
  /**
   * DB-managed role labels selected via the multi-select chips UI.
   * When present, passed through to CoachProfileView.roles[] which
   * takes priority over the legacy boolean flags for the title line.
   */
  selectedRoleLabels?: string[] | null;
  // Location
  regions?: string[] | null;
  online_remote?: boolean | null;
  // Qualifications & achievements (stored as ' · '-delimited string)
  qualifications?: string | null;
  achievements?: string | null;
  // Members deal — members_deal_active gates whether the card shows
  members_deal_active?: boolean | null;
  members_deal?: string | null;
  coupon_code?: string | null;
  // Gallery and packages (fetched from DB, not form state)
  gallery_photos?: Array<{ id: string; public_url: string }> | null;
  packages?: PreviewPackage[] | null;
}

interface CoachProfilePreviewProps {
  formData: PreviewCoachData;
}

// ── Helper: build PreviewCoachData from saved CoachRow + live overrides ──
//
// Used by /photos and /packages so their preview pane renders the SAME full
// profile chrome as /profile, but with their own live state (photos /
// offerings) replacing the corresponding saved fields.
//
// `coachRow` shape comes from AuthContext.CoachRow — we accept `any` here to
// avoid a circular import, but at the call site the field names match.
//
// `overrides` is the live state from the calling page (photos[] or
// offerings[]). It merges over the saved coachRow values.

export function buildPreviewDataFromCoachRow(
  coachRow: any,
  overrides: Partial<PreviewCoachData> = {},
): PreviewCoachData {
  if (!coachRow) {
    // No coach row yet — render a placeholder so the phone frame still shows
    return {
      name: 'Your Name',
      bio: null,
      email: null,
      photo_url: null,
      specialties: null,
      instagram: null,
      tiktok: null,
      ...overrides,
    };
  }
  return {
    name: coachRow.name ?? 'Your Name',
    bio: coachRow.bio ?? null,
    email: coachRow.email ?? null,
    photo_url: coachRow.photo_url ?? null,
    specialties: coachRow.specialties ?? null,
    instagram: coachRow.instagram ?? null,
    tiktok: coachRow.tiktok ?? null,
    is_personal_trainer: coachRow.is_personal_trainer ?? null,
    is_nutritionist: coachRow.is_nutritionist ?? null,
    regions: coachRow.regions ?? null,
    online_remote: coachRow.online_remote ?? null,
    qualifications: coachRow.qualifications ?? null,
    achievements: coachRow.achievements ?? null,
    members_deal_active: coachRow.members_deal_active ?? false,
    members_deal: coachRow.members_deal ?? null,
    coupon_code: coachRow.coupon_code ?? null,
    gallery_photos: null,
    packages: null,
    ...overrides,
  };
}

// ── Data adapter ───────────────────────────────────────────────────────────

/**
 * Maps the portal's PreviewCoachData shape to the mobile CoachProfileData
 * shape expected by CoachProfileView.
 *
 * Fields the portal form does not expose (qualifications, achievements,
 * phone, website, facebook, youtube) are null — the mobile component renders
 * those sections conditionally and skips them when null.
 *
 * photo_local_url wins over photo_url to give the PT an instant preview of
 * their newly-selected profile photo before it is uploaded to storage (EC-15).
 */
function formDataToCoachProfileData(formData: PreviewCoachData): CoachProfileData {
  // members_deal card shows only when active AND offer text present
  const showDeal = (formData.members_deal_active ?? false) && !!formData.members_deal;

  return {
    id: 'preview',
    name: formData.name || 'Your Name',
    photo_url: formData.photo_local_url ?? formData.photo_url,
    bio: formData.bio,
    is_personal_trainer: formData.is_personal_trainer ?? true,
    is_nutritionist: formData.is_nutritionist ?? false,
    specialties: formData.specialties,
    qualifications: formData.qualifications ?? null,
    achievements: formData.achievements ?? null,
    members_deal: showDeal ? (formData.members_deal ?? null) : null,
    members_deal_active: formData.members_deal_active ?? false,
    coupon_code: showDeal ? (formData.coupon_code ?? null) : null,
    email: formData.email,
    phone: null,
    regions: formData.regions ?? null,
    online_remote: formData.online_remote ?? null,
    website: null,
    facebook: null,
    instagram: formData.instagram,
    tiktok: formData.tiktok,
    youtube: null,
    gallery_photos: formData.gallery_photos ?? null,
    packages: formData.packages ?? null,
    // DB-managed roles — when provided, CoachProfileView uses these for the title
    // line instead of the legacy boolean flags.
    roles: (formData.selectedRoleLabels ?? []).length > 0
      ? (formData.selectedRoleLabels ?? null)
      : null,
  };
}

// ── Theme color adapter ────────────────────────────────────────────────────

/**
 * Maps the portal's tenant branding into the CoachThemeColors shape
 * expected by CoachProfileView.
 */
function buildColors(primary: string, isDark: boolean): CoachThemeColors {
  return {
    primary,
    background: isDark ? '#000000' : '#FFFFFF',
    surface: isDark ? '#1A1A1A' : '#FFFFFF',
    surfaceAlt: isDark ? '#2A2A2A' : '#F3F4F6',
    text: isDark ? '#FFFFFF' : '#0F1A24',
    textMuted: isDark ? '#AAAAAA' : '#5C6A77',
    textSubtle: isDark ? '#777777' : '#8A96A2',
    border: isDark ? '#2A2A2A' : '#E4E7EA',
    headerBg: isDark ? '#000000' : '#FFFFFF',
    headerFg: primary,
  };
}

// ── Phone frame dimensions ─────────────────────────────────────────────────

/** Width in CSS pixels of the simulated phone screen (375pt = iPhone 14) */
const FRAME_WIDTH = 375;
/** Height in CSS pixels of the simulated phone screen */
const FRAME_HEIGHT = 812;

// ── CoachProfilePreview ────────────────────────────────────────────────────

/**
 * Renders the actual mobile CoachProfileView inside a CSS phone frame.
 *
 * The react-native-web runtime maps all RN primitives (View, Text, ScrollView,
 * Pressable, StyleSheet) to DOM elements. The frame clips to FRAME_WIDTH ×
 * FRAME_HEIGHT and the RNW component sees containerWidth = FRAME_WIDTH so the
 * hero image fills the frame correctly.
 */
export function CoachProfilePreview({ formData }: CoachProfilePreviewProps) {
  const { tenant } = useTenant();
  const primary = tenant?.primary_color ?? '#FFD600';
  const isDark = tenant?.mode === 'dark';

  const coach = formDataToCoachProfileData(formData);
  const colors = buildColors(primary, isDark);

  return (
    <div
      style={{
        width: `${FRAME_WIDTH}px`,
        height: `${FRAME_HEIGHT}px`,
        borderRadius: '44px',
        border: `8px solid ${isDark ? '#333333' : '#C0C0C0'}`,
        boxShadow: isDark
          ? '0 0 0 2px #1A1A1A, 0 20px 60px rgba(0,0,0,0.8)'
          : '0 0 0 2px #E0E0E0, 0 20px 60px rgba(0,0,0,0.15)',
        overflow: 'hidden',
        position: 'relative',
        flexShrink: 0,
        backgroundColor: colors.background,
      }}
    >
      {/* Status bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 24px 4px',
          backgroundColor: colors.headerBg,
        }}
      >
        <span style={{ color: colors.textMuted, fontSize: '11px', fontWeight: 600 }}>9:41</span>
        <div
          style={{
            width: '120px',
            height: '28px',
            backgroundColor: colors.headerBg,
            borderRadius: '999px',
            border: `1px solid ${colors.border}`,
          }}
        />
        <span style={{ color: colors.textMuted, fontSize: '11px' }}>■■■</span>
      </div>

      {/* App header bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: `1px solid ${colors.border}`,
          backgroundColor: colors.headerBg,
        }}
      >
        <span style={{ color: primary, fontSize: '18px' }}>←</span>
        <span style={{ color: primary, fontWeight: 700, fontSize: '13px', letterSpacing: '2px' }}>
          {tenant?.app_name ?? 'THECC+'}
        </span>
        <span style={{ color: primary, fontSize: '16px' }}>⬆</span>
      </div>

      {/*
       * RNW render area — the actual mobile component.
       *
       * We pass containerWidth = FRAME_WIDTH so CoachProfileView computes
       * the hero image height relative to the preview frame (not window.innerWidth).
       *
       * IMPORTANT — scroll constraint:
       * The outer div must have an EXPLICIT height (not just position:absolute+bottom:0)
       * so that the RNW ScrollView inside it sees a bounded clientHeight. Without an
       * explicit height, RNW's flex:1 ScrollView expands to fit all content and never
       * scrolls. We calculate the remaining height as:
       *   FRAME_HEIGHT - statusBar(48) - headerBar(40) - frameBorder(16) = FRAME_HEIGHT - 104
       */}
      <div
        style={{
          position: 'absolute',
          top: '88px',
          left: 0,
          right: 0,
          bottom: 0,
          height: `${FRAME_HEIGHT - 104}px`,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <CoachProfileView
          coach={coach}
          colors={colors}
          isBookable={false}
          stats={null}
          startingPrice={null}
          containerWidth={FRAME_WIDTH}
        />
      </div>
    </div>
  );
}

// ── PreviewPanel wrapper — handles desktop/mobile layout ───────────────────

interface PreviewPanelProps {
  formData: PreviewCoachData;
}

export function PreviewPanel({ formData }: PreviewPanelProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const { tenant } = useTenant();
  const primary = tenant?.primary_color ?? '#FFD600';

  return (
    <>
      {/* Desktop (≥1024px): fixed right panel */}
      <div className="hidden lg:flex flex-col items-center">
        <div className="sticky top-8">
          <p className="text-text-subtle text-xs text-center mb-4 uppercase tracking-wide font-medium">
            Live preview
          </p>
          <div style={{ transform: 'scale(0.75)', transformOrigin: 'top center', marginBottom: '-200px' }}>
            <CoachProfilePreview formData={formData} />
          </div>
        </div>
      </div>

      {/* Mobile (<1024px): floating "Preview" button + modal */}
      <div className="lg:hidden">
        <button
          onClick={() => setModalOpen(true)}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-2.5 rounded-full font-semibold text-sm shadow-lg z-40"
          style={{ backgroundColor: primary, color: '#000000' }}
        >
          Preview
        </button>

        {modalOpen && (
          <div className="fixed inset-0 bg-black/80 z-50 flex flex-col items-center justify-center p-4">
            <div className="flex items-center justify-between w-full max-w-sm mb-3">
              <span className="text-white text-sm font-medium">Profile preview</span>
              <button
                onClick={() => setModalOpen(false)}
                className="text-zinc-400 hover:text-white text-sm"
              >
                Close
              </button>
            </div>
            <div style={{ transform: 'scale(0.85)', transformOrigin: 'top center' }}>
              <CoachProfilePreview formData={formData} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
