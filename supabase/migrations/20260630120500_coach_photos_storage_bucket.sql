-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260630120500_coach_photos_storage_bucket
--
-- Creates a dedicated `coach-photos` storage bucket with folder-owner RLS, so
-- coach gallery uploads no longer co-mingle with brand assets in `branding-assets`.
--
-- WHY THIS IS A FUNCTIONAL FIX, NOT JUST HYGIENE (verified live 2026-06-30):
--   The existing `branding-assets` INSERT policy requires the writer to be an
--   `organisation_admin`/`super_admin` AND auth.uid() = foldername[1]. Gallery
--   uploads write to `coach-photos/{coach_id}/...`, where foldername[1] is the
--   literal string "coach-photos" — never an auth uid — so the folder check can
--   never pass for a normal coach. Today the ONLY two coaches with gallery photos
--   are an org_admin and a super_admin (the only roles the policy lets through).
--   A regular coach literally cannot upload a gallery photo. This bucket fixes
--   that with a coach-scoped (not admin-scoped) write policy.
--
-- BUCKET LAYOUT (new uploads): coach-photos/{coach_id}/{uuid}.jpg
--   → (storage.foldername(name))[1] = coach_id
--   A coach may write to folders for coach rows they own (coaches.auth_user_id = auth.uid()).
--
-- SELECT is public (bucket is public) so the THECC+ member app's public CDN URLs
-- resolve without auth — same as branding-assets does today. NO fail-open write.
--
-- EXISTING 18 FILES: deliberately NOT moved by this migration. They live in the
-- public `branding-assets` bucket and their public_url values keep resolving.
-- A physical move is handled separately (optional copy script — see report); the
-- portal switches NEW uploads to this bucket. Old URLs never break.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Create the bucket (public read; bytes are non-sensitive gallery images)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'coach-photos',
  'coach-photos',
  true,
  5242880, -- 5 MB, matches the portal's MAX_FILE_SIZE_BYTES
  ARRAY['image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 2. RLS policies on storage.objects scoped to this bucket.
--    (storage.objects already has RLS enabled globally.)

-- Public read — member app + portal display via public CDN URL
DROP POLICY IF EXISTS "Public read coach photos" ON storage.objects;
CREATE POLICY "Public read coach photos"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'coach-photos');

-- Coach writes only into folders for coach rows they own.
-- foldername[1] is the coach_id; it must map to a coaches row owned by this user.
DROP POLICY IF EXISTS "Coach inserts own coach photos" ON storage.objects;
CREATE POLICY "Coach inserts own coach photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'coach-photos'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.coaches WHERE auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Coach updates own coach photos" ON storage.objects;
CREATE POLICY "Coach updates own coach photos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'coach-photos'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.coaches WHERE auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'coach-photos'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.coaches WHERE auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Coach deletes own coach photos" ON storage.objects;
CREATE POLICY "Coach deletes own coach photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'coach-photos'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.coaches WHERE auth_user_id = auth.uid()
    )
  );

-- Super admin manages everything in the bucket (support / moderation)
DROP POLICY IF EXISTS "Super admin manages coach photos bucket" ON storage.objects;
CREATE POLICY "Super admin manages coach photos bucket"
  ON storage.objects FOR ALL
  TO authenticated
  USING (
    bucket_id = 'coach-photos' AND has_role(auth.uid(), 'super_admin'::app_role)
  )
  WITH CHECK (
    bucket_id = 'coach-photos' AND has_role(auth.uid(), 'super_admin'::app_role)
  );
