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

import { useState } from 'react';
import { PreviewPanel } from '../components/preview/CoachProfilePreview';
import type { PreviewCoachData } from '../components/preview/CoachProfilePreview';

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
  // Role flags
  is_personal_trainer: false,
  is_nutritionist: true,
  // Location
  regions: ['Auckland', 'Waikato'],
  online_remote: true,
  // Members deal — toggled ON for the mock so the card is visible
  members_deal_active: true,
  members_deal: '20% off your first 3 sessions',
  coupon_code: 'THECC20',
  // Mock gallery photos (using placeholder images)
  gallery_photos: [
    { id: 'g1', public_url: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=560&q=80' },
    { id: 'g2', public_url: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=560&q=80' },
    { id: 'g3', public_url: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=560&q=80' },
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

export default function DevPreviewPage() {
  const [formData, setFormData] = useState<PreviewCoachData>(MOCK_COACH);

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

        <div className="flex gap-8 items-start">
          {/* Quick edit controls */}
          <div className="flex-1 space-y-4">
            <h1 className="text-text text-xl font-bold">Mock Form State</h1>

            <label className="block">
              <span className="text-text-muted text-xs uppercase tracking-wide">Name</span>
              <input
                className="mt-1 w-full bg-surface border border-border rounded-xl px-3 py-2 text-text text-sm"
                value={formData.name}
                onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
              />
            </label>

            <label className="block">
              <span className="text-text-muted text-xs uppercase tracking-wide">Bio</span>
              <textarea
                className="mt-1 w-full bg-surface border border-border rounded-xl px-3 py-2 text-text text-sm resize-none"
                rows={4}
                value={formData.bio ?? ''}
                onChange={(e) => setFormData((p) => ({ ...p, bio: e.target.value || null }))}
              />
            </label>

            <label className="block">
              <span className="text-text-muted text-xs uppercase tracking-wide">Photo URL</span>
              <input
                className="mt-1 w-full bg-surface border border-border rounded-xl px-3 py-2 text-text text-sm"
                value={formData.photo_url ?? ''}
                onChange={(e) => setFormData((p) => ({ ...p, photo_url: e.target.value || null }))}
              />
            </label>

            {/* Role flags */}
            <div className="space-y-2">
              <span className="text-text-muted text-xs uppercase tracking-wide block">Role flags</span>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.is_personal_trainer ?? false}
                  onChange={(e) => setFormData((p) => ({ ...p, is_personal_trainer: e.target.checked }))}
                  className="rounded"
                />
                <span className="text-text text-sm">Personal Trainer</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.is_nutritionist ?? false}
                  onChange={(e) => setFormData((p) => ({ ...p, is_nutritionist: e.target.checked }))}
                  className="rounded"
                />
                <span className="text-text text-sm">Nutritionist</span>
              </label>
            </div>

            {/* Members deal toggle */}
            <div className="space-y-2">
              <span className="text-text-muted text-xs uppercase tracking-wide block">Members deal</span>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.members_deal_active ?? false}
                  onChange={(e) => setFormData((p) => ({ ...p, members_deal_active: e.target.checked }))}
                  className="rounded"
                />
                <span className="text-text text-sm">Deal active</span>
              </label>
              <input
                className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-text text-sm"
                value={formData.members_deal ?? ''}
                placeholder="Deal description"
                onChange={(e) => setFormData((p) => ({ ...p, members_deal: e.target.value || null }))}
              />
              <input
                className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-text text-sm font-mono"
                value={formData.coupon_code ?? ''}
                placeholder="Coupon code"
                onChange={(e) => setFormData((p) => ({ ...p, coupon_code: e.target.value || null }))}
              />
            </div>

            {/* Online toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.online_remote ?? false}
                onChange={(e) => setFormData((p) => ({ ...p, online_remote: e.target.checked }))}
                className="rounded"
              />
              <span className="text-text text-sm">Online / Remote</span>
            </label>

            <div className="text-text-subtle text-xs border border-border rounded-xl p-3">
              Gallery: {formData.gallery_photos?.length ?? 0} photos · Packages: {formData.packages?.length ?? 0}
              <br />Edit packages/gallery in the mock data at top of this file.
            </div>
          </div>

          {/* Preview panel */}
          <PreviewPanel formData={formData} />
        </div>
      </div>
    </div>
  );
}
