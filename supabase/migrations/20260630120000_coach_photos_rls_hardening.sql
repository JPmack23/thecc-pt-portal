-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260630120000_coach_photos_rls_hardening
--
-- Hardens RLS on public.coach_photos before the portal carries a 1team.deals
-- subdomain (multi-tenant readiness).
--
-- Two problems fixed (verified against live prod 2026-06-30):
--
--   1. CROSS-TENANT LEAK — a second SELECT policy "Members can view photos"
--      with USING (true) lets ANY authenticated user read EVERY tenant's coach
--      photos. We drop it. The correctly tenant-scoped policy
--      "Members can view coach photos" (same-org active coaches only) is kept,
--      so the THECC+ member app read path is unaffected.
--
--   2. DUPLICATE POLICIES — the live table has redundant pairs:
--        "PT can manage own coach photos"      + "PT manages own photos"   (identical)
--        "Super admins can manage all coach photos" + "Super admin manages all photos"
--      We collapse each pair to a single canonical policy.
--
-- Net result — exactly 3 policies remain:
--   • PT manages own rows        (coaches.auth_user_id = auth.uid())
--   • Super admin manages all    (has_role super_admin)
--   • Members read same-org rows  (tenant-scoped SELECT)
--
-- No data change. RLS only. Idempotent (DROP IF EXISTS + recreate).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Drop the permissive cross-tenant SELECT policy (the leak)
DROP POLICY IF EXISTS "Members can view photos" ON public.coach_photos;

-- 2. De-duplicate: drop the redundant twins, keep one canonical of each
DROP POLICY IF EXISTS "PT manages own photos"                ON public.coach_photos;
DROP POLICY IF EXISTS "Super admin manages all photos"       ON public.coach_photos;

-- 3. Recreate canonical policies idempotently (drop-then-create so re-runs are safe
--    and the definitions are pinned by this migration regardless of prior drift).

DROP POLICY IF EXISTS "PT can manage own coach photos" ON public.coach_photos;
CREATE POLICY "PT can manage own coach photos"
  ON public.coach_photos FOR ALL
  USING (
    coach_id IN (
      SELECT id FROM public.coaches WHERE auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    coach_id IN (
      SELECT id FROM public.coaches WHERE auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Super admins can manage all coach photos" ON public.coach_photos;
CREATE POLICY "Super admins can manage all coach photos"
  ON public.coach_photos FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "Members can view coach photos" ON public.coach_photos;
CREATE POLICY "Members can view coach photos"
  ON public.coach_photos FOR SELECT
  USING (
    coach_id IN (
      SELECT c.id
      FROM public.coaches c
      JOIN public.api_clients ac ON ac.id = c.api_client_id
      WHERE c.is_active = true
        AND ac.organisation_id = (SELECT get_user_organisation_id(auth.uid()))
    )
  );
