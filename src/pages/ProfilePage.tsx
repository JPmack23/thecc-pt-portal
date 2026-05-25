/**
 * ProfilePage — Issue #12
 *
 * PT can edit their profile: display name, bio, photo, contact email,
 * specialties (tags), Instagram handle, TikTok handle, role chips
 * (multi-select from coach_roles table), regions (NZ multi-select),
 * online/remote toggle, and members deal (toggle + offer text + coupon code).
 *
 * Desktop (≥1024px): split-panel layout — form left, live mobile preview right.
 * Mobile (<1024px): single column + floating "Preview" button (bottom modal).
 *
 * Data flow:
 *   - Loads from AuthContext.coachRow on mount (already fetched at login)
 *   - Edits held in local formState — preview reads from formState directly (no DB round-trip)
 *   - Photo upload creates a local object URL for the preview immediately (EC-15)
 *   - On save: PATCH coaches row via Supabase JS client (RLS: auth_user_id match)
 *   - Role assignments: diff selectedRoleIds vs original, INSERT new, DELETE removed
 *   - When members_deal_active is OFF: members_deal and coupon_code saved as NULL
 *   - Toast on success / error
 *
 * Updated 2026-05-25 (coach-roles feature):
 *   - "Your role" toggles replaced with multi-select chips from coach_roles table
 *   - Legacy is_personal_trainer / is_nutritionist booleans still saved (not dropped yet)
 */

import React, { useEffect, useRef, useState } from 'react';
import AvatarEditor, { type AvatarEditorRef } from 'react-avatar-editor';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import { supabase } from '../lib/supabase';
import { PreviewPanel } from '../components/preview/CoachProfilePreview';
import type { PreviewCoachData, PreviewPackage } from '../components/preview/CoachProfilePreview';
import { PortalLayout } from '../components/PortalLayout';

// ── Constants ──────────────────────────────────────────────────────────────

const MAX_BIO = 500;
const MAX_SPECIALTIES = 5;
const MAX_SPECIALTY_LEN = 30;
const IG_REGEX = /^[a-zA-Z0-9._]{1,30}$/;
const TT_REGEX = /^[a-zA-Z0-9._]{1,24}$/;

const NZ_REGIONS = [
  'Auckland',
  'Bay of Plenty',
  'Canterbury',
  'Gisborne',
  'Hawke\'s Bay',
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

// ── Types ──────────────────────────────────────────────────────────────────

/** A role as loaded from coach_roles */
interface CoachRoleOption {
  id: string;
  label: string;
  sort_order: number;
  is_active: boolean;
}

interface FormState {
  name: string;
  bio: string;
  email: string;
  instagram: string;
  tiktok: string;
  specialtyInput: string;
  specialties: string[];
  photo_url: string | null;
  photo_local_url: string | null; // Object URL for preview (EC-15)
  photo_file: File | null;        // File pending upload
  // Legacy role flags — still saved alongside new role_assignments to avoid
  // breaking anything depending on the boolean columns (not dropped yet).
  is_personal_trainer: boolean;
  is_nutritionist: boolean;
  // DB-managed role assignments — set of coach_role IDs the PT has selected
  selectedRoleIds: Set<string>;
  // Location
  regions: string[];
  online_remote: boolean;
  // Qualifications & achievements
  qualifications: string;
  achievements: string;
  // Members deal
  members_deal_active: boolean;
  members_deal: string;
  coupon_code: string;
}

// ── Toast component ────────────────────────────────────────────────────────

function Toast({ message, type, onDismiss }: { message: string; type: 'success' | 'error'; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  const { tenant } = useTenant();
  const primary = tenant?.primary_color ?? '#FFD600';

  return (
    <div
      className="fixed top-4 right-4 z-50 rounded-xl px-4 py-3 text-sm font-medium shadow-lg flex items-center gap-2 max-w-xs"
      style={
        type === 'success'
          ? { backgroundColor: primary, color: '#000000' }
          : { backgroundColor: '#ef4444', color: '#ffffff' }
      }
    >
      <span>{type === 'success' ? '✓' : '✕'}</span>
      <span>{message}</span>
    </div>
  );
}

// ── Profile form ──────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { coachRow, user } = useAuth();
  const { tenant } = useTenant();
  const primary = tenant?.primary_color ?? '#FFD600';

  const fileInputRef = useRef<HTMLInputElement>(null);
  const avatarEditorRef = useRef<AvatarEditorRef>(null);

  // Crop modal state
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [cropScale, setCropScale] = useState(1);
  const [cropModalOpen, setCropModalOpen] = useState(false);

  // Coach offerings — loaded for the preview panel (read-only here, edited on PackagesPage)
  const [coachOfferings, setCoachOfferings] = useState<PreviewPackage[]>([]);

  // Coach gallery photos — loaded for the preview panel (read-only here, edited on PhotosPage)
  // So /profile renders the FULL profile preview including gallery, matching what
  // members actually see in the mobile app.
  const [coachGalleryPhotos, setCoachGalleryPhotos] = useState<Array<{ id: string; public_url: string }>>([]);

  // Gallery photo count — for the "Next: add gallery photos" nudge
  const [galleryPhotoCount, setGalleryPhotoCount] = useState<number | null>(null);

  // DB-managed coach role options (loaded from coach_roles table for this tenant)
  const [roleOptions, setRoleOptions] = useState<CoachRoleOption[]>([]);
  const [roleOptionsLoading, setRoleOptionsLoading] = useState(false);
  // Track original role IDs so we can diff on save
  const [originalRoleIds, setOriginalRoleIds] = useState<Set<string>>(new Set());

  const [form, setForm] = useState<FormState>({
    name: '',
    bio: '',
    email: '',
    instagram: '',
    tiktok: '',
    specialtyInput: '',
    specialties: [],
    photo_url: null,
    photo_local_url: null,
    photo_file: null,
    is_personal_trainer: false,
    is_nutritionist: false,
    selectedRoleIds: new Set(),
    regions: [],
    online_remote: false,
    qualifications: '',
    achievements: '',
    members_deal_active: false,
    members_deal: '',
    coupon_code: '',
  });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Initialise form from coachRow once available
  useEffect(() => {
    if (!coachRow) return;
    const row = coachRow as any; // coachRow type may not include all new columns yet
    setForm((prev) => ({
      ...prev,
      name: row.name ?? '',
      bio: row.bio ?? '',
      email: row.email ?? user?.email ?? '',
      instagram: row.instagram ?? '',
      tiktok: row.tiktok ?? '',
      specialtyInput: '',
      specialties: row.specialties ?? [],
      photo_url: row.photo_url ?? null,
      photo_local_url: null,
      photo_file: null,
      is_personal_trainer: row.is_personal_trainer ?? false,
      is_nutritionist: row.is_nutritionist ?? false,
      regions: row.regions ?? [],
      online_remote: row.online_remote ?? false,
      qualifications: row.qualifications ? row.qualifications.split(' · ').join('\n') : '',
      achievements: row.achievements ? row.achievements.split(' · ').join('\n') : '',
      members_deal_active: row.members_deal_active ?? false,
      members_deal: row.members_deal ?? '',
      coupon_code: row.coupon_code ?? '',
      // selectedRoleIds loaded separately by the roles useEffect below
    }));
  }, [coachRow?.id]);

  // Load role options for this tenant + current assignments for this coach
  useEffect(() => {
    if (!coachRow?.id || !tenant?.api_client_id) return;

    setRoleOptionsLoading(true);

    Promise.all([
      // Available roles for this tenant (active only, sorted)
      supabase
        .from('coach_roles')
        .select('id, label, sort_order, is_active')
        .eq('api_client_id', tenant.api_client_id)
        .eq('is_active', true)
        .order('sort_order', { ascending: true }),

      // This coach's current assignments
      supabase
        .from('coach_role_assignments')
        .select('coach_role_id')
        .eq('coach_id', coachRow.id),
    ])
      .then(([rolesRes, assignmentsRes]) => {
        if (rolesRes.error) {
          console.error('[ProfilePage] role options fetch error:', rolesRes.error);
        } else {
          setRoleOptions(rolesRes.data ?? []);
        }

        if (!assignmentsRes.error && assignmentsRes.data) {
          const ids = new Set(assignmentsRes.data.map((a: any) => a.coach_role_id as string));
          setOriginalRoleIds(ids);
          setForm((prev) => ({ ...prev, selectedRoleIds: new Set(ids) }));
        }
      })
      .finally(() => setRoleOptionsLoading(false));
  }, [coachRow?.id, tenant?.api_client_id]);

  // ── Preview data (live from formState — no DB round-trip) ─────────────────

  // Derive ordered labels from selected role IDs for the preview
  const selectedRoleLabels = roleOptions
    .filter((r) => form.selectedRoleIds.has(r.id))
    .map((r) => r.label);

  const previewData: PreviewCoachData = {
    name: form.name || 'Your Name',
    bio: form.bio || null,
    email: form.email || null,
    photo_url: form.photo_url,
    photo_local_url: form.photo_local_url,
    specialties: form.specialties.length > 0 ? form.specialties : null,
    instagram: form.instagram.trim() || null,
    tiktok: form.tiktok.trim() || null,
    is_personal_trainer: form.is_personal_trainer,
    is_nutritionist: form.is_nutritionist,
    // DB-managed roles → drive the title line in the mobile preview
    selectedRoleLabels: selectedRoleLabels.length > 0 ? selectedRoleLabels : null,
    regions: form.regions.length > 0 ? form.regions : null,
    online_remote: form.online_remote || null,
    // Qualifications & achievements — use · join format for the mobile component
    qualifications: form.qualifications.trim().split('\n').map((s) => s.trim()).filter(Boolean).join(' · ') || null,
    achievements: form.achievements.trim().split('\n').map((s) => s.trim()).filter(Boolean).join(' · ') || null,
    // Pass members deal fields — mobile component decides whether to render
    members_deal_active: form.members_deal_active,
    members_deal: form.members_deal_active && form.members_deal.trim() ? form.members_deal.trim() : null,
    coupon_code: form.members_deal_active && form.coupon_code.trim() ? form.coupon_code.trim() : null,
    // Gallery photos — fetched read-only for the preview so /profile shows
    // the full mobile-app rendering. Editing happens on /photos.
    gallery_photos: coachGalleryPhotos,
    packages: coachOfferings,
  };

  // ── Handlers ──────────────────────────────────────────────────────────────

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset so the same file can be re-selected after Cancel
    e.target.value = '';
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setFieldErrors((prev) => ({ ...prev, photo: 'Photo must be under 5MB.' }));
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setFieldErrors((prev) => ({ ...prev, photo: 'Only JPEG, PNG, or WebP photos are supported.' }));
      return;
    }

    // Open crop modal instead of using raw file directly
    setCropFile(file);
    setCropScale(1);
    setCropModalOpen(true);
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.photo;
      return next;
    });
  }

  /**
   * Called when the PT clicks "Save" in the crop modal.
   * Converts the cropped canvas to a 400×500 portrait JPEG blob,
   * creates an object URL for the preview, and stores the blob as
   * a File ready for upload on form save.
   */
  async function handleCropSave() {
    const editor = avatarEditorRef.current;
    if (!editor || !cropFile) return;

    // AvatarEditor.getImageScaledToCanvas() returns the cropped canvas at its
    // configured dimensions (400×500 for portrait 4:5).
    const canvas = editor.getImageScaledToCanvas();

    // toBlob is async — wrap in a Promise
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.92)
    );

    if (!blob) return;

    // Revoke any previous local object URL to avoid memory leak
    if (form.photo_local_url) URL.revokeObjectURL(form.photo_local_url);

    const croppedFile = new File([blob], 'profile.jpg', { type: 'image/jpeg' });
    const localUrl = URL.createObjectURL(blob);

    setForm((prev) => ({
      ...prev,
      photo_file: croppedFile,
      photo_local_url: localUrl,
      photo_url: prev.photo_url, // keep saved URL until upload completes
    }));

    setCropModalOpen(false);
    setCropFile(null);
  }

  function handleCropCancel() {
    setCropModalOpen(false);
    setCropFile(null);
  }

  function addSpecialty() {
    const tag = form.specialtyInput.trim();
    if (!tag) return;
    if (tag.length > MAX_SPECIALTY_LEN) {
      setFieldErrors((prev) => ({ ...prev, specialtyInput: `Max ${MAX_SPECIALTY_LEN} characters.` }));
      return;
    }
    if (form.specialties.length >= MAX_SPECIALTIES) {
      setFieldErrors((prev) => ({ ...prev, specialtyInput: `Maximum ${MAX_SPECIALTIES} specialties.` }));
      return;
    }
    if (form.specialties.map((s) => s.toLowerCase()).includes(tag.toLowerCase())) {
      setFieldErrors((prev) => ({ ...prev, specialtyInput: 'Already added.' }));
      return;
    }
    setForm((prev) => ({ ...prev, specialties: [...prev.specialties, tag], specialtyInput: '' }));
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.specialtyInput;
      return next;
    });
  }

  function removeSpecialty(tag: string) {
    setForm((prev) => ({ ...prev, specialties: prev.specialties.filter((s) => s !== tag) }));
  }

  function toggleRegion(region: string) {
    setForm((prev) => {
      const has = prev.regions.includes(region);
      return {
        ...prev,
        regions: has ? prev.regions.filter((r) => r !== region) : [...prev.regions, region],
      };
    });
  }

  function toggleRole(roleId: string) {
    setForm((prev) => {
      const next = new Set(prev.selectedRoleIds);
      if (next.has(roleId)) {
        next.delete(roleId);
      } else {
        next.add(roleId);
      }
      return { ...prev, selectedRoleIds: next };
    });
    // Clear role error on any toggle interaction
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.roles;
      return next;
    });
  }

  function validate(): boolean {
    const errors: Record<string, string> = {};
    if (!form.name.trim()) errors.name = 'Display name is required.';
    if (form.bio.length > MAX_BIO) errors.bio = `Bio must be ${MAX_BIO} characters or fewer.`;
    if (form.instagram.trim() && !IG_REGEX.test(form.instagram.trim())) {
      errors.instagram = 'Invalid Instagram handle. Use only letters, numbers, periods, or underscores (max 30).';
    }
    if (form.tiktok.trim() && !TT_REGEX.test(form.tiktok.trim())) {
      errors.tiktok = 'Invalid TikTok handle. Use only letters, numbers, periods, or underscores (max 24).';
    }
    // At least one role must be selected (only enforce when role options have loaded)
    if (roleOptions.length > 0 && form.selectedRoleIds.size === 0) {
      errors.roles = 'Please select at least one role.';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function uploadPhoto(file: File, coachId: string): Promise<string | null> {
    // The crop modal always produces a JPEG blob (profile.jpg).
    // We pin the path to .jpg so future uploads overwrite the same file.
    const path = `coach-photos/${coachId}/profile.jpg`;

    const { error: uploadErr } = await supabase.storage
      .from('assets')
      .upload(path, file, { upsert: true, contentType: 'image/jpeg' });

    if (uploadErr) {
      console.error('[ProfilePage] photo upload error:', uploadErr);
      return null;
    }

    const { data } = supabase.storage.from('assets').getPublicUrl(path);
    return data.publicUrl;
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    if (!coachRow) return;

    setSaving(true);
    try {
      let newPhotoUrl = form.photo_url;

      // Upload photo if changed
      if (form.photo_file) {
        const uploaded = await uploadPhoto(form.photo_file, coachRow.id);
        if (uploaded) {
          newPhotoUrl = uploaded;
          // Revoke the local object URL now that we have the CDN URL
          if (form.photo_local_url) URL.revokeObjectURL(form.photo_local_url);
        } else {
          setToast({ message: 'Photo upload failed — profile saved without new photo.', type: 'error' });
        }
      }

      const payload = {
        name: form.name.trim(),
        bio: form.bio.trim() || null,
        email: form.email.trim() || null,
        instagram: form.instagram.trim().replace(/^@/, '') || null,
        tiktok: form.tiktok.trim().replace(/^@/, '') || null,
        specialties: form.specialties.length > 0 ? form.specialties : null,
        photo_url: newPhotoUrl,
        // Role flags
        is_personal_trainer: form.is_personal_trainer,
        is_nutritionist: form.is_nutritionist,
        // Location
        regions: form.regions,
        online_remote: form.online_remote,
        // Qualifications & achievements — join lines with ' · ' for DB storage
        qualifications: form.qualifications.trim().split('\n').map((s) => s.trim()).filter(Boolean).join(' · ') || null,
        achievements: form.achievements.trim().split('\n').map((s) => s.trim()).filter(Boolean).join(' · ') || null,
        // Members deal — clear text columns when toggle is off
        members_deal_active: form.members_deal_active,
        members_deal: form.members_deal_active ? (form.members_deal.trim() || null) : null,
        coupon_code: form.members_deal_active ? (form.coupon_code.trim() || null) : null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('coaches')
        .update(payload)
        .eq('id', coachRow.id)
        .eq('auth_user_id', user!.id);

      if (error) {
        console.error('[ProfilePage] save error:', error);
        setToast({ message: 'Failed to save profile. Please try again.', type: 'error' });
        return;
      }

      // ── Persist role assignments (diff vs original) ──────────────────
      const toAdd = [...form.selectedRoleIds].filter((id) => !originalRoleIds.has(id));
      const toRemove = [...originalRoleIds].filter((id) => !form.selectedRoleIds.has(id));

      const roleErrors: string[] = [];

      if (toAdd.length > 0) {
        const { error: addErr } = await supabase
          .from('coach_role_assignments')
          .insert(toAdd.map((coach_role_id) => ({ coach_id: coachRow.id, coach_role_id })));
        if (addErr) {
          console.error('[ProfilePage] role assignments insert error:', addErr);
          roleErrors.push('Some roles could not be added.');
        }
      }

      if (toRemove.length > 0) {
        const { error: removeErr } = await supabase
          .from('coach_role_assignments')
          .delete()
          .eq('coach_id', coachRow.id)
          .in('coach_role_id', toRemove);
        if (removeErr) {
          console.error('[ProfilePage] role assignments delete error:', removeErr);
          roleErrors.push('Some roles could not be removed.');
        }
      }

      // Commit new role IDs as the new "original" baseline
      if (roleErrors.length === 0) {
        setOriginalRoleIds(new Set(form.selectedRoleIds));
      }

      // Update local form state with the new photo URL and cleared deal text (if toggle was off)
      setForm((prev) => ({
        ...prev,
        photo_url: newPhotoUrl,
        photo_local_url: null,
        photo_file: null,
        instagram: payload.instagram ?? '',
        tiktok: payload.tiktok ?? '',
        members_deal: payload.members_deal ?? '',
        coupon_code: payload.coupon_code ?? '',
      }));

      if (roleErrors.length > 0) {
        setToast({ message: `Profile saved with warnings: ${roleErrors.join(' ')}`, type: 'error' });
      } else {
        setToast({ message: 'Profile saved successfully.', type: 'success' });
      }
    } finally {
      setSaving(false);
    }
  }

  // ── Offerings: fetch for preview panel ────────────────────────────────────

  useEffect(() => {
    if (!coachRow?.id) return;
    supabase
      .from('pt_offerings')
      .select('id, label, price_nzd, duration_label, promo_label, promo_active, promo_starts_at, promo_ends_at, featured_on_carousel')
      .eq('coach_id', coachRow.id)
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .then(({ data }) => {
        if (!data) return;
        setCoachOfferings(
          data.map((o: any) => ({
            id: o.id,
            title: o.label,
            price: o.price_nzd,
            duration: o.duration_label ?? undefined,
            promo_label: o.promo_label ?? undefined,
            promo_active: o.promo_active ?? false,
            promo_starts_at: o.promo_starts_at ?? undefined,
            promo_ends_at: o.promo_ends_at ?? undefined,
            featured: o.featured_on_carousel ?? false,
          }))
        );
      });
  }, [coachRow?.id]);

  // ── Gallery photos: fetch for preview panel + count for "Next: add gallery" nudge ──

  useEffect(() => {
    if (!coachRow?.id) return;
    supabase
      .from('coach_photos')
      .select('id, public_url')
      .eq('coach_id', coachRow.id)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (data) setCoachGalleryPhotos(data as Array<{ id: string; public_url: string }>);
      });
  }, [coachRow?.id]);

  useEffect(() => {
    if (!coachRow?.id) return;
    supabase
      .from('coach_photos')
      .select('id', { count: 'exact', head: true })
      .eq('coach_id', coachRow.id)
      .then(({ count }) => {
        setGalleryPhotoCount(count ?? 0);
      });
  }, [coachRow?.id]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const photoDisplay = form.photo_local_url ?? form.photo_url;
  const bioCount = form.bio.length;

  return (
    <PortalLayout>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      )}

      {/* ── Photo crop modal ─────────────────────────────────────────── */}
      {cropModalOpen && cropFile && (
        <CropModal
          file={cropFile}
          editorRef={avatarEditorRef}
          scale={cropScale}
          onScaleChange={setCropScale}
          onSave={handleCropSave}
          onCancel={handleCropCancel}
          primary={primary}
        />
      )}

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Page heading */}
        <div className="mb-8">
          <h1 className="text-text text-2xl font-bold">My Profile</h1>
          <p className="text-text-muted text-sm mt-1">
            This is how your clients see you in the app.
          </p>
        </div>

        {/* Split panel layout */}
        <div className="flex gap-8 items-start">
          {/* ── Left: form ─────────────────────────────────────────────── */}
          <form onSubmit={handleSave} className="flex-1 min-w-0 space-y-6">

            {/* Photo upload */}
            <div className="bg-surface rounded-2xl border border-border p-6">
              <h2 className="text-text font-semibold text-sm mb-4 uppercase tracking-wide">Profile photo</h2>
              <div className="flex items-center gap-5">
                <div
                  className="w-20 h-20 rounded-full overflow-hidden border-2 flex-shrink-0 bg-surface-alt flex items-center justify-center"
                  style={{ borderColor: primary }}
                >
                  {photoDisplay ? (
                    <img src={photoDisplay} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-text-subtle text-2xl">👤</span>
                  )}
                </div>
                <div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 rounded-lg text-sm font-semibold border border-border text-text-muted hover:text-text hover:border-primary transition-colors"
                  >
                    {photoDisplay ? 'Change photo' : 'Upload photo'}
                  </button>
                  <p className="text-text-subtle text-xs mt-1.5">JPEG, PNG or WebP · max 5MB</p>
                  {fieldErrors.photo && (
                    <p className="text-red-400 text-xs mt-1">{fieldErrors.photo}</p>
                  )}
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handlePhotoChange}
                className="hidden"
              />
            </div>

            {/* Display name */}
            <div className="bg-surface rounded-2xl border border-border p-6 space-y-4">
              <h2 className="text-text font-semibold text-sm mb-1 uppercase tracking-wide">Basic info</h2>

              <FormField label="Display name" error={fieldErrors.name} required>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setField('name', e.target.value)}
                  placeholder="e.g. Sam Williams"
                  maxLength={80}
                  className="w-full bg-surface-alt border border-border rounded-xl px-4 py-3 text-text placeholder-text-subtle text-sm focus:outline-none focus:ring-2"
                  style={{ '--tw-ring-color': primary } as React.CSSProperties}
                />
              </FormField>

              {/* Bio */}
              <FormField
                label={`About / Bio (${bioCount}/${MAX_BIO})`}
                error={fieldErrors.bio}
              >
                <textarea
                  value={form.bio}
                  onChange={(e) => setField('bio', e.target.value)}
                  placeholder="Tell your clients what you do and what makes you different…"
                  rows={4}
                  maxLength={MAX_BIO + 10}
                  className="w-full bg-surface-alt border border-border rounded-xl px-4 py-3 text-text placeholder-text-subtle text-sm focus:outline-none focus:ring-2 resize-none"
                  style={{ '--tw-ring-color': primary } as React.CSSProperties}
                />
                {bioCount > MAX_BIO && (
                  <p className="text-red-400 text-xs mt-1">Trim to {MAX_BIO} characters.</p>
                )}
              </FormField>

              {/* Contact email */}
              <FormField label="Contact email" hint="Shown on your profile — can differ from your login email." error={fieldErrors.email}>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setField('email', e.target.value)}
                  placeholder="you@example.com"
                  className="w-full bg-surface-alt border border-border rounded-xl px-4 py-3 text-text placeholder-text-subtle text-sm focus:outline-none focus:ring-2"
                  style={{ '--tw-ring-color': primary } as React.CSSProperties}
                />
              </FormField>
            </div>

            {/* Specialties */}
            <div className="bg-surface rounded-2xl border border-border p-6">
              <h2 className="text-text font-semibold text-sm mb-4 uppercase tracking-wide">
                Specialties <span className="text-text-subtle normal-case font-normal">(up to {MAX_SPECIALTIES})</span>
              </h2>

              <div className="flex flex-wrap gap-2 mb-3">
                {form.specialties.map((tag) => (
                  <span
                    key={tag}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border"
                    style={{ borderColor: primary + '60', color: primary, backgroundColor: primary + '10' }}
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeSpecialty(tag)}
                      className="leading-none opacity-60 hover:opacity-100 ml-0.5"
                    >
                      ×
                    </button>
                  </span>
                ))}
                {form.specialties.length === 0 && (
                  <span className="text-text-subtle text-xs">No specialties added yet.</span>
                )}
              </div>

              {form.specialties.length < MAX_SPECIALTIES && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={form.specialtyInput}
                    onChange={(e) => setField('specialtyInput', e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); addSpecialty(); }
                    }}
                    placeholder="e.g. Strength, HIIT, Nutrition"
                    maxLength={MAX_SPECIALTY_LEN}
                    className="flex-1 bg-surface-alt border border-border rounded-xl px-3 py-2 text-text placeholder-text-subtle text-sm focus:outline-none focus:ring-2"
                    style={{ '--tw-ring-color': primary } as React.CSSProperties}
                  />
                  <button
                    type="button"
                    onClick={addSpecialty}
                    className="px-3 py-2 rounded-xl text-sm font-semibold border border-border text-text-muted hover:text-text transition-colors"
                  >
                    Add
                  </button>
                </div>
              )}
              {fieldErrors.specialtyInput && (
                <p className="text-red-400 text-xs mt-2">{fieldErrors.specialtyInput}</p>
              )}
            </div>

            {/* Role chips — multi-select from coach_roles table */}
            <div className="bg-surface rounded-2xl border border-border p-6">
              <h2 className="text-text font-semibold text-sm mb-1 uppercase tracking-wide">Your role</h2>
              <p className="text-text-subtle text-xs mb-4">
                Select all that apply — the title shown under your name is derived from these.
              </p>

              {roleOptionsLoading ? (
                <div className="flex flex-wrap gap-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-8 w-32 rounded-full bg-surface-alt animate-pulse" />
                  ))}
                </div>
              ) : roleOptions.length === 0 ? (
                <p className="text-text-subtle text-xs">No roles configured for this portal yet.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {roleOptions.map((role) => {
                    const selected = form.selectedRoleIds.has(role.id);
                    return (
                      <button
                        key={role.id}
                        type="button"
                        onClick={() => toggleRole(role.id)}
                        className="px-4 py-1.5 rounded-full text-xs font-semibold border transition-colors"
                        style={
                          selected
                            ? { backgroundColor: primary, borderColor: primary, color: '#000000' }
                            : { backgroundColor: 'transparent', borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }
                        }
                      >
                        {role.label}
                      </button>
                    );
                  })}
                </div>
              )}

              {fieldErrors.roles && (
                <p className="text-red-400 text-xs mt-3">{fieldErrors.roles}</p>
              )}
            </div>

            {/* Regions */}
            <div className="bg-surface rounded-2xl border border-border p-6">
              <h2 className="text-text font-semibold text-sm mb-1 uppercase tracking-wide">Where you work</h2>
              <p className="text-text-subtle text-xs mb-4">Select all regions you service in person.</p>

              <div className="flex flex-wrap gap-2 mb-4">
                {NZ_REGIONS.map((region) => {
                  const selected = form.regions.includes(region);
                  return (
                    <button
                      key={region}
                      type="button"
                      onClick={() => toggleRegion(region)}
                      className="px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors"
                      style={
                        selected
                          ? { backgroundColor: primary, borderColor: primary, color: '#000000' }
                          : { backgroundColor: 'transparent', borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }
                      }
                    >
                      {region}
                    </button>
                  );
                })}
              </div>

              <ToggleRow
                label="Online / Remote"
                description="You work with clients outside your region or online"
                checked={form.online_remote}
                onChange={(v) => setField('online_remote', v)}
                primary={primary}
              />
            </div>

            {/* Members deal */}
            <div className="bg-surface rounded-2xl border border-border p-6 space-y-4">
              <h2 className="text-text font-semibold text-sm mb-1 uppercase tracking-wide">Members deal</h2>
              <p className="text-text-subtle text-xs -mt-2">Offer something exclusive to THECC+ members.</p>

              <ToggleRow
                label="Offer a members-only deal"
                description="Show a special offer card on your profile"
                checked={form.members_deal_active}
                onChange={(v) => setField('members_deal_active', v)}
                primary={primary}
              />

              {form.members_deal_active && (
                <div className="space-y-4 pt-2">
                  <FormField label="Deal description" hint='e.g. "20% off your first 3 sessions"'>
                    <input
                      type="text"
                      value={form.members_deal}
                      onChange={(e) => setField('members_deal', e.target.value)}
                      placeholder="20% off your first 3 sessions"
                      maxLength={120}
                      className="w-full bg-surface-alt border border-border rounded-xl px-4 py-3 text-text placeholder-text-subtle text-sm focus:outline-none focus:ring-2"
                      style={{ '--tw-ring-color': primary } as React.CSSProperties}
                    />
                  </FormField>
                  <FormField label="Coupon code" hint='e.g. "THECC20" — shown in a badge on your profile'>
                    <input
                      type="text"
                      value={form.coupon_code}
                      onChange={(e) => setField('coupon_code', e.target.value.toUpperCase())}
                      placeholder="THECC20"
                      maxLength={20}
                      className="w-full bg-surface-alt border border-border rounded-xl px-4 py-3 text-text placeholder-text-subtle text-sm font-mono focus:outline-none focus:ring-2"
                      style={{ '--tw-ring-color': primary } as React.CSSProperties}
                    />
                  </FormField>
                </div>
              )}
            </div>

            {/* Qualifications */}
            <div className="bg-surface rounded-2xl border border-border p-6 space-y-4">
              <div>
                <h2 className="text-text font-semibold text-sm mb-1 uppercase tracking-wide">Qualifications</h2>
                <p className="text-text-subtle text-xs">One per line. Shown as a bullet list on your profile.</p>
              </div>
              <textarea
                value={form.qualifications}
                onChange={(e) => setField('qualifications', e.target.value)}
                rows={4}
                maxLength={600}
                placeholder={`Bachelor of Sport Science\nNZRD Registered Dietitian\nLevel 3 Strength Coach`}
                className="w-full bg-surface-alt border border-border rounded-xl px-4 py-3 text-text placeholder-text-subtle text-sm focus:outline-none focus:ring-2 resize-none"
                style={{ '--tw-ring-color': primary } as React.CSSProperties}
              />
            </div>

            {/* Achievements */}
            <div className="bg-surface rounded-2xl border border-border p-6 space-y-4">
              <div>
                <h2 className="text-text font-semibold text-sm mb-1 uppercase tracking-wide">Achievements</h2>
                <p className="text-text-subtle text-xs">One per line. Shown with a trophy icon on your profile.</p>
              </div>
              <textarea
                value={form.achievements}
                onChange={(e) => setField('achievements', e.target.value)}
                rows={4}
                maxLength={600}
                placeholder={`Former NZ representative netballer\nCoach of the Year 2025\nFinisher — Tarawera Ultramarathon`}
                className="w-full bg-surface-alt border border-border rounded-xl px-4 py-3 text-text placeholder-text-subtle text-sm focus:outline-none focus:ring-2 resize-none"
                style={{ '--tw-ring-color': primary } as React.CSSProperties}
              />
            </div>

            {/* Social handles */}
            <div className="bg-surface rounded-2xl border border-border p-6 space-y-4">
              <h2 className="text-text font-semibold text-sm mb-1 uppercase tracking-wide">Social handles</h2>

              <FormField label="Instagram" hint="Without the @ — e.g. yourhandle" error={fieldErrors.instagram}>
                <div className="flex items-center bg-surface-alt border border-border rounded-xl overflow-hidden">
                  <span className="px-3 text-text-subtle text-sm border-r border-border py-3">@</span>
                  <input
                    type="text"
                    value={form.instagram}
                    onChange={(e) => setField('instagram', e.target.value.replace(/^@/, ''))}
                    placeholder="yourhandle"
                    maxLength={30}
                    className="flex-1 bg-transparent px-3 py-3 text-text placeholder-text-subtle text-sm focus:outline-none"
                  />
                </div>
              </FormField>

              <FormField label="TikTok" hint="Without the @ — e.g. yourhandle" error={fieldErrors.tiktok}>
                <div className="flex items-center bg-surface-alt border border-border rounded-xl overflow-hidden">
                  <span className="px-3 text-text-subtle text-sm border-r border-border py-3">@</span>
                  <input
                    type="text"
                    value={form.tiktok}
                    onChange={(e) => setField('tiktok', e.target.value.replace(/^@/, ''))}
                    placeholder="yourhandle"
                    maxLength={24}
                    className="flex-1 bg-transparent px-3 py-3 text-text placeholder-text-subtle text-sm focus:outline-none"
                  />
                </div>
              </FormField>
            </div>

            {/* Save */}
            <div className="flex flex-col items-end gap-3 pb-8">
              <button
                type="submit"
                disabled={saving}
                className="px-8 py-3 rounded-xl font-semibold text-sm transition-opacity disabled:opacity-50"
                style={{ backgroundColor: primary, color: '#000000' }}
              >
                {saving ? 'Saving…' : 'Save profile'}
              </button>
              {/* Gallery nudge — only show when PT has zero gallery photos */}
              {galleryPhotoCount === 0 && (
                <a
                  href="/photos"
                  className="text-sm font-medium underline"
                  style={{ color: primary }}
                >
                  Next: add gallery photos →
                </a>
              )}
            </div>
          </form>

          {/* ── Right: live preview panel ───────────────────────────────── */}
          <PreviewPanel formData={previewData} />
        </div>

      </div>
    </PortalLayout>
  );
}

// ── CropModal ─────────────────────────────────────────────────────────────

/**
 * Photo crop modal using react-avatar-editor.
 *
 * Output dimensions: 400×500px portrait JPEG (4:5 aspect ratio).
 *   - The circular thumbnail masks a centred square from the top-centre → face renders well.
 *   - The mobile hero is screenWidth × 1.25 → 4:5 source maps 1:1, no letterboxing.
 *   - One crop works for both surfaces.
 *
 * The editor is configured with a circular crop guide (borderRadius=200) so the
 * PT can see exactly how their photo will appear as a circular avatar.
 */

interface CropModalProps {
  file: File;
  editorRef: React.RefObject<AvatarEditorRef | null>;
  scale: number;
  onScaleChange: (v: number) => void;
  onSave: () => void;
  onCancel: () => void;
  primary: string;
}

function CropModal({ file, editorRef, scale, onScaleChange, onSave, onCancel, primary }: CropModalProps) {
  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div
        className="bg-surface rounded-2xl border border-border p-6 flex flex-col items-center gap-5 shadow-2xl"
        style={{ maxWidth: '420px', width: '100%' }}
      >
        <div>
          <h2 className="text-text text-base font-semibold text-center">Position your photo</h2>
          <p className="text-text-subtle text-xs text-center mt-1">
            Drag to reposition. Use the slider to zoom.
          </p>
        </div>

        {/* AvatarEditor — 4:5 portrait (320×400) display, outputs 400×500 */}
        <div className="rounded-2xl overflow-hidden border border-border">
          <AvatarEditor
            ref={editorRef}
            image={file}
            width={320}
            height={400}
            border={24}
            borderRadius={160}
            color={[0, 0, 0, 0.55]}
            scale={scale}
            rotate={0}
            style={{ display: 'block' }}
          />
        </div>

        {/* Zoom slider */}
        <div className="w-full flex items-center gap-3">
          <span className="text-text-subtle text-xs w-4">1×</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={scale}
            onChange={(e) => onScaleChange(parseFloat(e.target.value))}
            className="flex-1 accent-current"
            style={{ accentColor: primary }}
          />
          <span className="text-text-subtle text-xs w-4">3×</span>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3 w-full">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-border text-text-muted hover:text-text transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-opacity"
            style={{ backgroundColor: primary, color: '#000000' }}
          >
            Save photo
          </button>
        </div>
      </div>
    </div>
  );
}

// ── FormField helper ───────────────────────────────────────────────────────

function FormField({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-text-muted text-xs font-medium mb-1.5 uppercase tracking-wide">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-text-subtle text-xs mt-1">{hint}</p>}
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  );
}

// ── ToggleRow helper ───────────────────────────────────────────────────────

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  primary,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  primary: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-text text-sm font-medium leading-tight">{label}</p>
        {description && <p className="text-text-subtle text-xs mt-0.5 leading-tight">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none"
        style={{ backgroundColor: checked ? primary : 'var(--color-border)' }}
      >
        <span
          className="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200"
          style={{ transform: checked ? 'translateX(20px)' : 'translateX(0)' }}
        />
      </button>
    </div>
  );
}
