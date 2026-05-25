/**
 * DevPreviewPage — local dev only
 *
 * A standalone page that renders the CoachProfilePreview with mock data,
 * bypassing auth entirely. This exists ONLY for local screenshot/testing
 * of the RNW preview component.
 *
 * Safety:
 *   - Only mounted when VITE_DEV_AUTH_BYPASS === 'true' (see App.tsx)
 *   - The env var is set in .env.local only — Vercel env vars do NOT include it
 *   - In production this route is simply never registered in the router
 *   - This file imports no credentials or real user data
 *
 * Usage: http://localhost:5173/dev-preview
 */

import React, { useState } from 'react';
import { PreviewPanel } from '../components/preview/CoachProfilePreview';
import type { PreviewCoachData } from '../components/preview/CoachProfilePreview';

// ── Constants (mirror ProfilePage.tsx) ────────────────────────────────────

const MAX_SPECIALTIES = 5;
const MAX_SPECIALTY_LEN = 30;

// Mock role options (mirrors the THECC+ seed data so dev preview works without DB calls)
const MOCK_ROLE_OPTIONS = [
  { id: 'r1', label: 'Personal Trainer' },
  { id: 'r2', label: 'Nutritionist' },
  { id: 'r3', label: 'Strength & Conditioning Coach' },
  { id: 'r4', label: 'Pilates Instructor' },
  { id: 'r5', label: 'Yoga Teacher' },
  { id: 'r6', label: 'Mindset / Mental Performance Coach' },
  { id: 'r7', label: 'Recovery Specialist' },
  { id: 'r8', label: 'Wellness Coach' },
  { id: 'r9', label: 'Postnatal Coach' },
  { id: 'r10', label: 'Run Coach' },
];

const NZ_REGIONS = [
  'Auckland',
  'Bay of Plenty',
  'Canterbury',
  'Gisborne',
  "Hawke's Bay",
  'Manawatū-Whanganui',
  'Marlborough',
  'Nelson',
  'Northland',
  'Otago',
  'Southland',
  'Taranaki',
  'Tasman',
  'Waikato',
  'Wellington',
  'West Coast',
];

// ── Mock data ──────────────────────────────────────────────────────────────
//
// Gallery: Sarah Henderson (coach_id e2333ede-08fb-4e80-9d26-72cf5cbfa7e1)
// has 1 real photo in coach_photos. Padded with 2 nutrition-themed Unsplash
// photos (meal prep, fresh ingredients) — no gym/bodybuilding.

const MOCK_COACH: PreviewCoachData = {
  name: 'Sarah Henderson',
  bio: 'Performance nutrition coach helping athletes and everyday people unlock their potential through food. Former New Zealand representative netballer. I work with you to build sustainable habits that fuel your training and your life.',
  email: 'sarah@example.com',
  // Sarah Henderson's actual photo from the THECC+ Supabase coaches table
  photo_url: 'https://pzqwvblyuxezfgjxnbbn.supabase.co/storage/v1/object/public/branding-assets/coaches/sarah-henderson.jpg',
  photo_local_url: null,
  specialties: ['Strength', 'Weight Loss', 'Meal Planning'],
  instagram: 'sarahmitchellfit',
  tiktok: 'sarahmitchell',
  // Legacy role flags (kept for backwards compat but overridden by selectedRoleLabels)
  is_personal_trainer: false,
  is_nutritionist: true,
  // DB-managed roles — these two are pre-selected in the mock for Sarah
  selectedRoleLabels: ['Nutritionist', 'Wellness Coach'],
  // Location
  regions: ['Auckland', 'Waikato'],
  online_remote: true,
  // Qualifications & achievements — Sarah-realistic data (· join format for mobile component)
  qualifications: 'Bachelor of Sport Science (Massey) · NZRD Registered Dietitian · Level 2 Pilates Instructor',
  achievements: 'Former NZ representative netballer · NZ Sport Nutrition Award 2024 · Podcast guest — The Wellness Diaries',
  // Members deal — toggled ON for the mock so the card is visible
  members_deal_active: true,
  members_deal: '20% off your first 3 sessions',
  coupon_code: 'THECC20',
  // Gallery: 1 real DB photo + 2 nutrition-themed Unsplash padders
  gallery_photos: [
    {
      id: '443fd1e8-7007-4428-9a0e-2d38720d4423',
      public_url: 'https://1team.supabase.co/storage/v1/object/public/branding-assets/coach-photos/e2333ede-08fb-4e80-9d26-72cf5cbfa7e1/1779678619199.png',
    },
    // Nutrition-themed padders (no gym/bodybuilding)
    { id: 'pad1', public_url: 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=560&q=80' }, // meal prep bowls
    { id: 'pad2', public_url: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=560&q=80' }, // fresh ingredients / salad
  ],
  // Mock packages — one with an active promo, one plain, one featured
  packages: [
    {
      id: 'p1',
      title: '12-Week Transformation',
      price: 899,
      duration: '12 weeks · 3 sessions/week',
      promo_label: 'BUY 10 GET 5 FREE',
      promo_active: true,
      promo_starts_at: null,
      promo_ends_at: null,
      featured: true,
    },
    {
      id: 'p2',
      title: 'Single Session',
      price: 120,
      duration: '60 min',
      promo_active: false,
      featured: false,
    },
    {
      id: 'p3',
      title: 'Nutrition Audit',
      price: 249,
      duration: '90 min + written report',
      promo_active: false,
      featured: false,
    },
  ],
};

// ── Dev preview page ───────────────────────────────────────────────────────

export default function DevPreviewPage() {
  const [formData, setFormData] = useState<PreviewCoachData>(MOCK_COACH);
  const [specialtyInput, setSpecialtyInput] = useState('');
  const [specialtyError, setSpecialtyError] = useState('');

  // Role chip multi-select — mirrors what ProfilePage does with selectedRoleIds
  // Pre-select r2 (Nutritionist) and r8 (Wellness Coach) to match MOCK_COACH.selectedRoleLabels
  const [selectedRoleIds, setSelectedRoleIds] = useState<Set<string>>(new Set(['r2', 'r8']));

  function toggleMockRole(roleId: string) {
    setSelectedRoleIds((prev) => {
      const next = new Set(prev);
      if (next.has(roleId)) {
        next.delete(roleId);
      } else {
        next.add(roleId);
      }
      // Derive labels from the current set and push to formData
      const labels = MOCK_ROLE_OPTIONS
        .filter((r) => next.has(r.id))
        .map((r) => r.label);
      setFormData((p) => ({ ...p, selectedRoleLabels: labels.length > 0 ? labels : null }));
      return next;
    });
  }

  // ── Specialty helpers ────────────────────────────────────────────────────

  function addSpecialty() {
    const tag = specialtyInput.trim();
    if (!tag) return;
    const current = formData.specialties ?? [];
    if (tag.length > MAX_SPECIALTY_LEN) {
      setSpecialtyError(`Max ${MAX_SPECIALTY_LEN} characters.`);
      return;
    }
    if (current.length >= MAX_SPECIALTIES) {
      setSpecialtyError(`Maximum ${MAX_SPECIALTIES} specialties.`);
      return;
    }
    if (current.map((s) => s.toLowerCase()).includes(tag.toLowerCase())) {
      setSpecialtyError('Already added.');
      return;
    }
    setFormData((p) => ({ ...p, specialties: [...current, tag] }));
    setSpecialtyInput('');
    setSpecialtyError('');
  }

  function removeSpecialty(tag: string) {
    setFormData((p) => ({ ...p, specialties: (p.specialties ?? []).filter((s) => s !== tag) }));
  }

  function toggleRegion(region: string) {
    setFormData((p) => {
      const current = p.regions ?? [];
      const has = current.includes(region);
      return { ...p, regions: has ? current.filter((r) => r !== region) : [...current, region] };
    });
  }

  return (
    <div className="min-h-screen bg-canvas p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 p-4 rounded-xl border border-yellow-500/30 bg-yellow-500/10">
          <p className="text-yellow-400 text-sm font-semibold">
            DEV PREVIEW MODE — Only visible in local dev (VITE_DEV_AUTH_BYPASS=true)
          </p>
          <p className="text-text-subtle text-xs mt-1">
            This page is not registered in the router when the env var is absent.
          </p>
        </div>

        <div className="flex gap-8 items-start" style={{ minHeight: 0 }}>
          {/* ── Mock form controls ──────────────────────────────────────── */}
          {/*
           * Scroll fix: RNW injects `overflow: hidden` on html/body which
           * blocks page-level scroll. We make the left column independently
           * scrollable so all form fields are reachable on 1366×768.
           * calc(100vh - 10rem) = viewport minus banner + headings + outer padding (~160px).
           */}
          <div
            className="flex-1 space-y-6 pb-8"
            style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 10rem)', paddingRight: '4px' }}
          >
            <h1 className="text-text text-xl font-bold">Mock Form State</h1>

            {/* ── Basic info ── */}
            <MockSection label="Basic info">
              <MockField label="Name">
                <input
                  className="mt-1 w-full bg-surface border border-border rounded-xl px-3 py-2 text-text text-sm"
                  value={formData.name}
                  onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                />
              </MockField>

              <MockField label="Bio">
                <textarea
                  className="mt-1 w-full bg-surface border border-border rounded-xl px-3 py-2 text-text text-sm resize-none"
                  rows={4}
                  value={formData.bio ?? ''}
                  onChange={(e) => setFormData((p) => ({ ...p, bio: e.target.value || null }))}
                />
              </MockField>

              <MockField label="Contact email">
                <input
                  type="email"
                  className="mt-1 w-full bg-surface border border-border rounded-xl px-3 py-2 text-text text-sm"
                  value={formData.email ?? ''}
                  onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value || null }))}
                />
              </MockField>

              <MockField label="Photo URL">
                <input
                  className="mt-1 w-full bg-surface border border-border rounded-xl px-3 py-2 text-text text-sm"
                  value={formData.photo_url ?? ''}
                  onChange={(e) => setFormData((p) => ({ ...p, photo_url: e.target.value || null }))}
                />
              </MockField>
            </MockSection>

            {/* ── Specialties ── */}
            <MockSection label={`Specialties (up to ${MAX_SPECIALTIES})`}>
              <div className="flex flex-wrap gap-2 mb-2">
                {(formData.specialties ?? []).map((tag) => (
                  <span
                    key={tag}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border border-border text-text-muted bg-surface"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeSpecialty(tag)}
                      className="leading-none opacity-60 hover:opacity-100"
                    >
                      ×
                    </button>
                  </span>
                ))}
                {(formData.specialties ?? []).length === 0 && (
                  <span className="text-text-subtle text-xs">No specialties added yet.</span>
                )}
              </div>
              {(formData.specialties ?? []).length < MAX_SPECIALTIES && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={specialtyInput}
                    onChange={(e) => { setSpecialtyInput(e.target.value); setSpecialtyError(''); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSpecialty(); } }}
                    placeholder="e.g. Strength, HIIT, Nutrition"
                    maxLength={MAX_SPECIALTY_LEN}
                    className="flex-1 bg-surface border border-border rounded-xl px-3 py-2 text-text text-sm placeholder-text-subtle"
                  />
                  <button
                    type="button"
                    onClick={addSpecialty}
                    className="px-3 py-2 rounded-xl text-sm border border-border text-text-muted hover:text-text transition-colors"
                  >
                    Add
                  </button>
                </div>
              )}
              {specialtyError && <p className="text-red-400 text-xs mt-1">{specialtyError}</p>}
            </MockSection>

            {/* ── Role chips (DB-managed, mocked without DB calls) ── */}
            <MockSection label="Roles (multi-select chips)">
              <div className="flex flex-wrap gap-2">
                {MOCK_ROLE_OPTIONS.map((role) => {
                  const selected = selectedRoleIds.has(role.id);
                  return (
                    <button
                      key={role.id}
                      type="button"
                      onClick={() => toggleMockRole(role.id)}
                      className="px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors"
                      style={
                        selected
                          ? { backgroundColor: '#FFD600', borderColor: '#FFD600', color: '#000000' }
                          : { backgroundColor: 'transparent', borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }
                      }
                    >
                      {role.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-text-subtle text-xs mt-2">
                Selected: {selectedRoleIds.size === 0 ? 'none (falls back to legacy booleans)' : [...selectedRoleIds].map((id) => MOCK_ROLE_OPTIONS.find((r) => r.id === id)?.label).join(', ')}
              </p>
            </MockSection>

            {/* ── Regions ── */}
            <MockSection label="Regions (where you work)">
              <div className="flex flex-wrap gap-2">
                {NZ_REGIONS.map((region) => {
                  const selected = (formData.regions ?? []).includes(region);
                  return (
                    <button
                      key={region}
                      type="button"
                      onClick={() => toggleRegion(region)}
                      className="px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors"
                      style={
                        selected
                          ? { backgroundColor: '#FFD600', borderColor: '#FFD600', color: '#000000' }
                          : { backgroundColor: 'transparent', borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }
                      }
                    >
                      {region}
                    </button>
                  );
                })}
              </div>
            </MockSection>

            {/* ── Online / Remote ── */}
            <MockSection label="Location mode">
              <MockToggle
                label="Online / Remote"
                checked={formData.online_remote ?? false}
                onChange={(v) => setFormData((p) => ({ ...p, online_remote: v }))}
              />
            </MockSection>

            {/* ── Members deal ── */}
            <MockSection label="Members deal">
              <MockToggle
                label="Deal active"
                checked={formData.members_deal_active ?? false}
                onChange={(v) => setFormData((p) => ({ ...p, members_deal_active: v }))}
              />
              {formData.members_deal_active && (
                <div className="space-y-2 pt-1">
                  <MockField label="Offer text">
                    <input
                      className="mt-1 w-full bg-surface border border-border rounded-xl px-3 py-2 text-text text-sm"
                      value={formData.members_deal ?? ''}
                      placeholder='e.g. "20% off your first 3 sessions"'
                      onChange={(e) => setFormData((p) => ({ ...p, members_deal: e.target.value || null }))}
                    />
                  </MockField>
                  <MockField label="Coupon code">
                    <input
                      className="mt-1 w-full bg-surface border border-border rounded-xl px-3 py-2 text-text text-sm font-mono"
                      value={formData.coupon_code ?? ''}
                      placeholder="THECC20"
                      onChange={(e) => setFormData((p) => ({ ...p, coupon_code: e.target.value.toUpperCase() || null }))}
                    />
                  </MockField>
                </div>
              )}
            </MockSection>

            {/* ── Qualifications ── */}
            <MockSection label="Qualifications (one per line in real form; · joined for preview)">
              <MockField label="Qualifications">
                <textarea
                  className="mt-1 w-full bg-surface border border-border rounded-xl px-3 py-2 text-text text-sm resize-none"
                  rows={3}
                  value={
                    // Convert · back to newlines for display in the mock textarea
                    (formData.qualifications ?? '').split(' · ').join('\n')
                  }
                  placeholder={`Bachelor of Sport Science (Massey)\nNZRD Registered Dietitian\nLevel 2 Pilates Instructor`}
                  onChange={(e) =>
                    setFormData((p) => ({
                      ...p,
                      qualifications:
                        e.target.value
                          .split('\n')
                          .map((s) => s.trim())
                          .filter(Boolean)
                          .join(' · ') || null,
                    }))
                  }
                />
              </MockField>
            </MockSection>

            {/* ── Achievements ── */}
            <MockSection label="Achievements (one per line in real form; · joined for preview)">
              <MockField label="Achievements">
                <textarea
                  className="mt-1 w-full bg-surface border border-border rounded-xl px-3 py-2 text-text text-sm resize-none"
                  rows={3}
                  value={
                    (formData.achievements ?? '').split(' · ').join('\n')
                  }
                  placeholder={`Former NZ representative netballer\nNZ Sport Nutrition Award 2024\nPodcast guest — The Wellness Diaries`}
                  onChange={(e) =>
                    setFormData((p) => ({
                      ...p,
                      achievements:
                        e.target.value
                          .split('\n')
                          .map((s) => s.trim())
                          .filter(Boolean)
                          .join(' · ') || null,
                    }))
                  }
                />
              </MockField>
            </MockSection>

            {/* ── Social handles ── */}
            <MockSection label="Social handles">
              <MockField label="Instagram (without @)">
                <input
                  className="mt-1 w-full bg-surface border border-border rounded-xl px-3 py-2 text-text text-sm"
                  value={formData.instagram ?? ''}
                  placeholder="yourhandle"
                  onChange={(e) => setFormData((p) => ({ ...p, instagram: e.target.value.replace(/^@/, '') || null }))}
                />
              </MockField>
              <MockField label="TikTok (without @)">
                <input
                  className="mt-1 w-full bg-surface border border-border rounded-xl px-3 py-2 text-text text-sm"
                  value={formData.tiktok ?? ''}
                  placeholder="yourhandle"
                  onChange={(e) => setFormData((p) => ({ ...p, tiktok: e.target.value.replace(/^@/, '') || null }))}
                />
              </MockField>
            </MockSection>

            {/* ── Read-only info ── */}
            <div className="text-text-subtle text-xs border border-border rounded-xl p-3">
              Gallery: {formData.gallery_photos?.length ?? 0} photos (1 real DB photo + 2 nutrition padders) · Packages: {formData.packages?.length ?? 0}
              <br />Edit packages/gallery in MOCK_COACH at top of this file.
            </div>
          </div>

          {/* ── Phone preview panel ─────────────────────────────────────── */}
          <PreviewPanel formData={formData} />
        </div>
      </div>
    </div>
  );
}

// ── Local helper components ────────────────────────────────────────────────

function MockSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border rounded-2xl p-4 space-y-3">
      <span className="text-text-muted text-xs uppercase tracking-wide font-semibold block">{label}</span>
      {children}
    </div>
  );
}

function MockField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-text-subtle text-xs">{label}</span>
      {children}
    </label>
  );
}

function MockToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <div
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200"
        style={{ backgroundColor: checked ? '#FFD600' : 'var(--color-border)' }}
      >
        <span
          className="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200"
          style={{ transform: checked ? 'translateX(20px)' : 'translateX(0)' }}
        />
      </div>
      <span className="text-text text-sm">{label}</span>
    </label>
  );
}
