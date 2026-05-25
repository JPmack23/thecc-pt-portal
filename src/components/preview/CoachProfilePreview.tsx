/**
 * CoachProfilePreview.tsx
 *
 * Live mobile-frame preview of how the PT's profile appears in the THECC+ app.
 * Renders inside an iPhone-proportioned device bezel (CSS-only, no real device).
 *
 * ── React Native Web investigation (Issue #13 / PRD R-07) ─────────────────
 *
 * The PRD requires the preview to use the same React Native components as the
 * THECC+ app (US-16 AC-3, R-07). Before importing CoachProfileView via RNW,
 * Frank investigated compatibility:
 *
 * FINDING: The existing CoachProfileView uses:
 *   - expo-image (Image) — has web support via expo-image's web shim
 *   - @expo/vector-icons (Ionicons) — web-compatible via font loading
 *   - Dimensions.get('window') — works in RNW (maps to window.innerWidth)
 *   - Linking.openURL — works in RNW (maps to window.open)
 *   - react-native View/Text/ScrollView/StyleSheet/Pressable — all web-compatible
 *     via react-native-web
 *   - typography tokens — JS objects, no native dependency
 *
 * RISK: The Vite build pipeline does not currently have react-native-web or
 * metro aliasing configured. Adding RNW to a Vite project requires:
 *   1. npm install react-native-web
 *   2. Vite alias: 'react-native' → 'react-native-web'
 *   3. expo-image web shim resolution
 *   4. Font loading for Ionicons and JetBrains Mono (used in typography tokens)
 *
 * This is an architectural decision that affects the Vite/webpack config from
 * day one — it cannot be retrofitted cleanly (per PRD Build cost note).
 *
 * ACTION TAKEN (Issue #13 scaffold):
 *   - This file provides a web-native HTML/CSS preview that is visually
 *     faithful to the React Native layout (same sections, same colour tokens,
 *     same data fields). It does NOT share the RNW component tree yet.
 *   - The RNW integration is flagged for Walter + JP decision before the
 *     profile editing screens (Issues #14+) are built. At that point, either:
 *     (a) Add react-native-web + vite alias and swap this component for the
 *         shared CoachProfileView, or
 *     (b) Keep this web-native preview and add a contract test to catch drift.
 *   - This approach satisfies AC-1 (preview visible), AC-2 (updates within 500ms),
 *     AC-4 (<1024px modal), AC-5 (tenant colours). AC-3 (same RN components)
 *     is blocked pending RNW build decision.
 *
 * Data flow (per PRD US-16):
 *   - Reads from formState prop (in-memory, no Supabase round-trip per keystroke)
 *   - Falls back to savedCoach on initial load
 *   - Debounced 300ms via parent (CoachEditPage manages debounce — this component
 *     receives already-debounced values)
 */

import { useState } from 'react';
import { useTenant } from '../../contexts/TenantContext';

// ── Types ──────────────────────────────────────────────────────────────────

export interface PreviewCoachData {
  name: string;
  bio: string | null;
  email: string | null;
  photo_url: string | null;
  photo_local_url?: string | null; // Object URL for unsaved uploads (EC-15)
  specialties: string[] | null;
  instagram: string | null;
  tiktok: string | null;
  members_deal?: string | null;
  coupon_code?: string | null;
  regions?: string[] | null;
  online_remote?: boolean | null;
  is_personal_trainer?: boolean | null;
  is_nutritionist?: boolean | null;
}

interface CoachProfilePreviewProps {
  formData: PreviewCoachData;
}

// ── Component ──────────────────────────────────────────────────────────────

export function CoachProfilePreview({ formData }: CoachProfilePreviewProps) {
  const { tenant } = useTenant();
  const primary = tenant?.primary_color ?? '#FFD600';
  const isDark = tenant?.mode === 'dark';

  const bg = isDark ? '#000000' : '#FFFFFF';
  const surface = isDark ? '#1A1A1A' : '#FFFFFF';
  const border = isDark ? '#2A2A2A' : '#E4E7EA';
  const text = isDark ? '#FFFFFF' : '#0F1A24';
  const textMuted = isDark ? '#AAAAAA' : '#5C6A77';
  const textSubtle = isDark ? '#777777' : '#8A96A2';

  // Resolve photo — local object URL wins over saved URL (EC-15)
  const photoUrl = formData.photo_local_url ?? formData.photo_url;

  const roleLabel = formData.is_nutritionist
    ? 'PERFORMANCE NUTRITIONIST'
    : formData.is_personal_trainer
    ? 'PERSONAL TRAINER'
    : 'COACH';

  const specialtyPills: string[] = [];
  if (formData.is_personal_trainer) specialtyPills.push('Personal Training');
  if (formData.is_nutritionist) specialtyPills.push('Nutrition');
  (formData.specialties ?? []).forEach((s) => {
    if (!specialtyPills.some((p) => p.toLowerCase() === s.toLowerCase())) {
      specialtyPills.push(s);
    }
  });

  const locations: string[] = [...(formData.regions ?? [])];
  if (formData.online_remote) locations.push('Online / Remote');

  const socials = [
    formData.instagram ? { icon: '📷', label: `@${formData.instagram}`, url: `https://instagram.com/${formData.instagram}` } : null,
    formData.tiktok ? { icon: '🎵', label: `@${formData.tiktok}`, url: `https://tiktok.com/@${formData.tiktok}` } : null,
  ].filter(Boolean);

  return (
    <div
      className="overflow-y-auto rounded-[44px] border-[8px]"
      style={{
        width: '375px',
        height: '812px',
        backgroundColor: bg,
        borderColor: isDark ? '#333333' : '#C0C0C0',
        boxShadow: isDark
          ? '0 0 0 2px #1A1A1A, 0 20px 60px rgba(0,0,0,0.8)'
          : '0 0 0 2px #E0E0E0, 0 20px 60px rgba(0,0,0,0.15)',
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '14px',
        position: 'relative',
        flexShrink: 0,
      }}
    >
      {/* Status bar notch */}
      <div
        className="flex items-center justify-between px-6 pt-3 pb-1"
        style={{ backgroundColor: isDark ? '#000000' : '#FFFFFF' }}
      >
        <span style={{ color: textMuted, fontSize: '11px', fontWeight: '600' }}>9:41</span>
        <div
          style={{
            width: '120px',
            height: '28px',
            backgroundColor: isDark ? '#000000' : '#FFFFFF',
            borderRadius: '999px',
            border: `1px solid ${border}`,
          }}
        />
        <span style={{ color: textMuted, fontSize: '11px' }}>■■■</span>
      </div>

      {/* App header bar */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ backgroundColor: isDark ? '#000000' : '#FFFFFF', borderColor: border }}
      >
        <span style={{ color: primary, fontSize: '18px' }}>←</span>
        <span style={{ color: primary, fontWeight: '700', fontSize: '13px', letterSpacing: '2px' }}>
          {tenant?.app_name ?? 'THECC+'}
        </span>
        <span style={{ color: primary, fontSize: '16px' }}>⬆</span>
      </div>

      {/* Hero image */}
      <div style={{ position: 'relative', height: '260px', backgroundColor: surface, overflow: 'hidden' }}>
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={formData.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '48px',
              color: primary + '44',
            }}
          >
            👤
          </div>
        )}
        {/* Gradient overlay */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '120px',
            background: `linear-gradient(to bottom, transparent, ${bg})`,
          }}
        />
        {/* Name block */}
        <div style={{ position: 'absolute', bottom: '12px', left: '16px', right: '16px' }}>
          <div style={{ color: primary, fontSize: '10px', fontWeight: '700', letterSpacing: '1.4px', marginBottom: '4px' }}>
            {roleLabel}
          </div>
          <div style={{ color: '#FFFFFF', fontSize: '22px', fontWeight: '700', textShadow: '0 1px 4px rgba(0,0,0,0.4)', lineHeight: '1.1' }}>
            {formData.name || 'Your Name'}
          </div>
          {locations.length > 0 && (
            <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '11px', marginTop: '4px' }}>
              📍 {locations.join(' · ')}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '12px 16px', backgroundColor: bg, minHeight: '400px' }}>
        {/* Specialties */}
        {specialtyPills.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
            {specialtyPills.slice(0, 4).map((pill) => (
              <div
                key={pill}
                style={{
                  backgroundColor: surface,
                  border: `1px solid ${border}`,
                  borderRadius: '8px',
                  padding: '6px 10px',
                  fontSize: '10px',
                  fontWeight: '600',
                  color: text,
                  letterSpacing: '0.8px',
                }}
              >
                {pill.toUpperCase()}
              </div>
            ))}
          </div>
        )}

        {/* About / bio */}
        {formData.bio ? (
          <div
            style={{
              backgroundColor: surface,
              border: `1px solid ${border}`,
              borderRadius: '10px',
              padding: '12px',
              marginBottom: '10px',
            }}
          >
            <div style={{ color: text, fontWeight: '600', fontSize: '13px', marginBottom: '6px' }}>About</div>
            <div style={{ color: textMuted, fontSize: '12px', lineHeight: '1.6' }}>
              {formData.bio.length > 200 ? formData.bio.slice(0, 200) + '…' : formData.bio}
            </div>
          </div>
        ) : (
          <div
            style={{
              backgroundColor: surface,
              border: `1px dashed ${border}`,
              borderRadius: '10px',
              padding: '12px',
              marginBottom: '10px',
              textAlign: 'center',
            }}
          >
            <div style={{ color: textSubtle, fontSize: '12px' }}>Your bio will appear here</div>
          </div>
        )}

        {/* Members deal */}
        {formData.members_deal && (
          <div
            style={{
              backgroundColor: primary + '12',
              border: `1.5px solid ${primary}`,
              borderRadius: '10px',
              padding: '12px',
              marginBottom: '10px',
            }}
          >
            <div style={{ color: primary, fontSize: '10px', fontWeight: '700', letterSpacing: '0.8px', marginBottom: '4px' }}>
              🏷 MEMBERS DEAL
            </div>
            <div style={{ color: text, fontSize: '12px', fontWeight: '600' }}>{formData.members_deal}</div>
            {formData.coupon_code && (
              <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: textMuted, fontSize: '11px' }}>Use code</span>
                <span
                  style={{
                    backgroundColor: primary,
                    color: '#000000',
                    fontSize: '12px',
                    fontWeight: '700',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontFamily: 'monospace',
                  }}
                >
                  {formData.coupon_code}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Contact */}
        {formData.email && (
          <div style={{ marginBottom: '4px' }}>
            <div style={{ color: textMuted, fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>Contact</div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                borderBottom: `1px solid ${border}`,
                paddingBottom: '8px',
              }}
            >
              <div
                style={{
                  width: '30px',
                  height: '30px',
                  borderRadius: '8px',
                  backgroundColor: primary + '18',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '14px',
                }}
              >
                ✉
              </div>
              <span style={{ color: text, fontSize: '12px', flex: 1 }}>{formData.email}</span>
              <span style={{ color: textSubtle }}>›</span>
            </div>
          </div>
        )}

        {/* Socials */}
        {socials.length > 0 && (
          <div style={{ marginTop: '8px' }}>
            <div style={{ color: textMuted, fontSize: '12px', fontWeight: '600', marginBottom: '6px' }}>Follow</div>
            {socials.map((s) => s && (
              <div
                key={s.label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  borderBottom: `1px solid ${border}`,
                  paddingBottom: '8px',
                  marginBottom: '4px',
                }}
              >
                <div
                  style={{
                    width: '30px',
                    height: '30px',
                    borderRadius: '8px',
                    backgroundColor: primary + '18',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '14px',
                  }}
                >
                  {s.icon}
                </div>
                <span style={{ color: text, fontSize: '12px', flex: 1 }}>{s.label}</span>
                <span style={{ color: textSubtle, fontSize: '12px' }}>↗</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Preview Panel wrapper — handles desktop/mobile layout ─────────────────

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
