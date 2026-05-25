-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260525013100_create_coach_photos
--
-- Stores additional gallery photos uploaded by PTs via the portal.
-- These photos appear in the THECC+ mobile app when a member taps a PT profile.
-- Photos are stored in Supabase storage at coach-photos/{coach_id}/{filename}.
--
-- Schema:
--   id            — primary key
--   coach_id      — FK → coaches, cascades on delete
--   storage_path  — full storage path (used for deletions)
--   public_url    — public CDN URL (used for display)
--   display_order — ordering within the gallery (default 0)
--   created_at    — auto timestamp
--
-- RLS:
--   PT:           ALL on own rows (coaches.auth_user_id = auth.uid())
--   Members:      SELECT (scoped to active coaches in their org)
--   super_admin:  ALL
--
-- GRANTs: anon / authenticated / service_role — enforced Oct 30 2026
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS coach_photos (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id        uuid        NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  storage_path    text        NOT NULL,
  public_url      text        NOT NULL,
  display_order   integer     NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coach_photos_coach_id_idx
  ON coach_photos (coach_id, display_order);

ALTER TABLE coach_photos ENABLE ROW LEVEL SECURITY;

-- PT manages their own photos
CREATE POLICY "PT can manage own coach photos"
  ON coach_photos FOR ALL
  USING (
    coach_id IN (
      SELECT id FROM coaches WHERE auth_user_id = auth.uid()
    )
  );

-- Members can view photos of active coaches in their org
CREATE POLICY "Members can view coach photos"
  ON coach_photos FOR SELECT
  USING (
    coach_id IN (
      SELECT c.id
      FROM coaches c
      JOIN api_clients ac ON ac.id = c.api_client_id
      WHERE c.is_active = true
        AND ac.organisation_id = (
          SELECT get_user_organisation_id(auth.uid())
        )
    )
  );

-- Super admins manage all
CREATE POLICY "Super admins can manage all coach photos"
  ON coach_photos FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));

-- ── GRANTs ────────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, DELETE ON coach_photos TO anon;
GRANT SELECT, INSERT, DELETE ON coach_photos TO authenticated;
GRANT ALL ON coach_photos TO service_role;
