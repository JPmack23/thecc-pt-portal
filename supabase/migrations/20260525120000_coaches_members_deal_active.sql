-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260525120000_coaches_members_deal_active
--
-- Adds members_deal_active boolean to coaches so PTs can toggle their
-- members-only deal on/off without wiping the offer text and coupon code.
--
-- When members_deal_active = false:
--   - The members deal card is hidden in the mobile app
--   - The portal form hides the offer/code inputs
--   - On save the offer/code columns are cleared to NULL
--
-- GRANTs: anon / authenticated / service_role — enforced Oct 30 2026
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE coaches
  ADD COLUMN IF NOT EXISTS members_deal_active boolean NOT NULL DEFAULT false;

-- ── GRANTs ────────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON coaches TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON coaches TO authenticated;
GRANT ALL ON coaches TO service_role;
