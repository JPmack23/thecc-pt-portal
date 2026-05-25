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
  name: 'Sarah Mitchell',
  bio: 'Performance nutrition coach helping athletes and everyday people unlock their potential through food. Former New Zealand representative netballer. I work with you to build sustainable habits that fuel your training and your life.',
  email: 'sarah@example.com',
  // Sarah Henderson's actual photo from the THECC+ Supabase coaches table
  photo_url: 'https://pzqwvblyuxezfgjxnbbn.supabase.co/storage/v1/object/public/branding-assets/coaches/sarah-henderson.jpg',
  photo_local_url: null,
  specialties: ['Strength', 'Weight Loss', 'Meal Planning'],
  instagram: 'sarahmitchellfit',
  tiktok: 'sarahmitchell',
  members_deal: '20% off your first 3 sessions',
  coupon_code: 'THECC20',
  regions: ['Auckland', 'Waikato'],
  online_remote: true,
  is_personal_trainer: false,
  is_nutritionist: true,
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
            <label className="block">
              <span className="text-text-muted text-xs uppercase tracking-wide">Members deal</span>
              <input
                className="mt-1 w-full bg-surface border border-border rounded-xl px-3 py-2 text-text text-sm"
                value={formData.members_deal ?? ''}
                onChange={(e) => setFormData((p) => ({ ...p, members_deal: e.target.value || null }))}
              />
            </label>
          </div>

          {/* Preview panel */}
          <PreviewPanel formData={formData} />
        </div>
      </div>
    </div>
  );
}
