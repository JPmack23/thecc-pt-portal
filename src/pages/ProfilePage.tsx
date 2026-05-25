/**
 * ProfilePage — Issue #12
 *
 * PT can edit their profile: display name, bio, photo, contact email,
 * specialties (tags), Instagram handle, TikTok handle, role flags
 * (personal trainer / nutritionist), regions (NZ multi-select),
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
 *   - When members_deal_active is OFF: members_deal and coupon_code saved as NULL
 *   - Toast on success / error
 *
 * My Photos section (bottom of page):
 *   - Up to 10 additional gallery photos per coach
 *   - Uploads to branding-assets bucket at coach-photos/{coach_id}/{filename}
 *   - Stored in coach_photos table (RLS: auth_user_id match via coaches join)
 *   - Delete removes from storage + table
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import { supabase } from '../lib/supabase';
import { PreviewPanel } from '../components/preview/CoachProfilePreview';
import type { PreviewCoachData, PreviewPackage } from '../components/preview/CoachProfilePreview';
import { PortalLayout } from '../components/PortalLayout';

// ── Constants ──────────────────────────────────────────────────────────────

const MAX_BIO = 500;
const MAX_SPECIALTIES = 5;
const MAX_GALLERY_PHOTOS = 10;
const GALLERY_BUCKET = 'branding-assets';
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

interface CoachPhoto {
  id: string;
  storage_path: string;
  public_url: string;
  created_at: string;
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
  // Role flags
  is_personal_trainer: boolean;
  is_nutritionist: boolean;
  // Location
  regions: string[];
  online_remote: boolean;
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
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [galleryPhotos, setGalleryPhotos] = useState<CoachPhoto[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryUploading, setGalleryUploading] = useState(false);
  const [galleryError, setGalleryError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Coach offerings — loaded for the preview panel (read-only here, edited on PackagesPage)
  const [coachOfferings, setCoachOfferings] = useState<PreviewPackage[]>([]);
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
    regions: [],
    online_remote: false,
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
    setForm({
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
      members_deal_active: row.members_deal_active ?? false,
      members_deal: row.members_deal ?? '',
      coupon_code: row.coupon_code ?? '',
    });
  }, [coachRow?.id]);

  // ── Preview data (live from formState — no DB round-trip) ─────────────────

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
    regions: form.regions.length > 0 ? form.regions : null,
    online_remote: form.online_remote || null,
    // Pass members deal fields — mobile component decides whether to render
    members_deal_active: form.members_deal_active,
    members_deal: form.members_deal_active && form.members_deal.trim() ? form.members_deal.trim() : null,
    coupon_code: form.members_deal_active && form.coupon_code.trim() ? form.coupon_code.trim() : null,
    // Gallery photos and packages come from saved DB state (passed via galleryPhotos/coachOfferings below)
    gallery_photos: galleryPhotos,
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
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setFieldErrors((prev) => ({ ...prev, photo: 'Photo must be under 5MB.' }));
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setFieldErrors((prev) => ({ ...prev, photo: 'Only JPEG, PNG, or WebP photos are supported.' }));
      return;
    }

    const localUrl = URL.createObjectURL(file);
    setForm((prev) => ({
      ...prev,
      photo_file: file,
      photo_local_url: localUrl,
      photo_url: prev.photo_url, // Keep saved URL until upload completes
    }));
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.photo;
      return next;
    });
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
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function uploadPhoto(file: File, coachId: string): Promise<string | null> {
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `coach-photos/${coachId}/profile.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from('assets')
      .upload(path, file, { upsert: true, contentType: file.type });

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

      setToast({ message: 'Profile saved successfully.', type: 'success' });
    } finally {
      setSaving(false);
    }
  }

  // ── Gallery: fetch on mount / when coachRow loads ─────────────────────────

  const fetchGalleryPhotos = useCallback(async (coachId: string) => {
    setGalleryLoading(true);
    try {
      const { data, error } = await supabase
        .from('coach_photos')
        .select('id, storage_path, public_url, created_at')
        .eq('coach_id', coachId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('[ProfilePage] gallery fetch error:', error);
        setGalleryError('Could not load gallery photos.');
      } else {
        setGalleryPhotos(data ?? []);
      }
    } finally {
      setGalleryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (coachRow?.id) fetchGalleryPhotos(coachRow.id);
  }, [coachRow?.id, fetchGalleryPhotos]);

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

  // ── Gallery: upload ────────────────────────────────────────────────────────

  async function handleGalleryUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset input so the same file can be re-selected after deletion
    e.target.value = '';
    if (!file || !coachRow) return;

    if (galleryPhotos.length >= MAX_GALLERY_PHOTOS) {
      setGalleryError(`Maximum ${MAX_GALLERY_PHOTOS} photos reached.`);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setGalleryError('Photo must be under 5MB.');
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setGalleryError('Only JPEG, PNG, or WebP photos are supported.');
      return;
    }

    setGalleryError(null);
    setGalleryUploading(true);
    try {
      const ext = file.name.split('.').pop() ?? 'jpg';
      const filename = `${Date.now()}.${ext}`;
      const storagePath = `coach-photos/${coachRow.id}/${filename}`;

      const { error: uploadErr } = await supabase.storage
        .from(GALLERY_BUCKET)
        .upload(storagePath, file, { upsert: false, contentType: file.type });

      if (uploadErr) {
        console.error('[ProfilePage] gallery upload error:', uploadErr);
        setGalleryError('Upload failed. Please try again.');
        return;
      }

      const { data: urlData } = supabase.storage
        .from(GALLERY_BUCKET)
        .getPublicUrl(storagePath);

      const { data: row, error: insertErr } = await supabase
        .from('coach_photos')
        .insert({ coach_id: coachRow.id, storage_path: storagePath, public_url: urlData.publicUrl })
        .select('id, storage_path, public_url, created_at')
        .single();

      if (insertErr || !row) {
        console.error('[ProfilePage] gallery insert error:', insertErr);
        // Clean up orphaned storage object
        await supabase.storage.from(GALLERY_BUCKET).remove([storagePath]);
        setGalleryError('Failed to save photo. Please try again.');
        return;
      }

      setGalleryPhotos((prev) => [...prev, row]);
    } finally {
      setGalleryUploading(false);
    }
  }

  // ── Gallery: delete ────────────────────────────────────────────────────────

  async function handleGalleryDelete(photo: CoachPhoto) {
    setDeletingId(photo.id);
    try {
      // Remove from storage first
      const { error: storageErr } = await supabase.storage
        .from(GALLERY_BUCKET)
        .remove([photo.storage_path]);

      if (storageErr) {
        console.error('[ProfilePage] gallery storage delete error:', storageErr);
        // Proceed to delete the DB row regardless — orphaned files are recoverable
      }

      const { error: dbErr } = await supabase
        .from('coach_photos')
        .delete()
        .eq('id', photo.id);

      if (dbErr) {
        console.error('[ProfilePage] gallery db delete error:', dbErr);
        setGalleryError('Failed to delete photo. Please try again.');
        return;
      }

      setGalleryPhotos((prev) => prev.filter((p) => p.id !== photo.id));
    } finally {
      setDeletingId(null);
    }
  }

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

            {/* Role flags */}
            <div className="bg-surface rounded-2xl border border-border p-6 space-y-4">
              <h2 className="text-text font-semibold text-sm mb-1 uppercase tracking-wide">Your role</h2>
              <p className="text-text-subtle text-xs -mt-2">Both can apply — this controls the title shown under your name.</p>

              <ToggleRow
                label="Personal Trainer"
                description="Shown as 'PERSONAL TRAINER' on your profile"
                checked={form.is_personal_trainer}
                onChange={(v) => setField('is_personal_trainer', v)}
                primary={primary}
              />
              <ToggleRow
                label="Nutritionist"
                description="Shown as 'PERFORMANCE NUTRITIONIST' when active (takes priority)"
                checked={form.is_nutritionist}
                onChange={(v) => setField('is_nutritionist', v)}
                primary={primary}
              />
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
            <div className="flex justify-end pb-8">
              <button
                type="submit"
                disabled={saving}
                className="px-8 py-3 rounded-xl font-semibold text-sm transition-opacity disabled:opacity-50"
                style={{ backgroundColor: primary, color: '#000000' }}
              >
                {saving ? 'Saving…' : 'Save profile'}
              </button>
            </div>
          </form>

          {/* ── Right: live preview panel ───────────────────────────────── */}
          <PreviewPanel formData={previewData} />
        </div>

        {/* ── My Photos section ─────────────────────────────────────────── */}
        <div className="mt-10">
          <div className="mb-4">
            <h2 className="text-text text-xl font-bold">My Photos</h2>
            <p className="text-text-muted text-sm mt-1">
              Add up to {MAX_GALLERY_PHOTOS} photos to your profile gallery. JPEG, PNG or WebP · max 5MB each.
            </p>
          </div>

          <div className="bg-surface rounded-2xl border border-border p-6">
            {/* Error banner */}
            {galleryError && (
              <div className="mb-4 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-red-400 text-sm flex items-center justify-between">
                <span>{galleryError}</span>
                <button
                  type="button"
                  onClick={() => setGalleryError(null)}
                  className="ml-3 opacity-60 hover:opacity-100 text-lg leading-none"
                >
                  ×
                </button>
              </div>
            )}

            {/* Loading skeleton */}
            {galleryLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="aspect-square rounded-xl bg-surface-alt animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {/* Existing photos */}
                {galleryPhotos.map((photo) => (
                  <div key={photo.id} className="relative group aspect-square rounded-xl overflow-hidden border border-border bg-surface-alt">
                    <img
                      src={photo.public_url}
                      alt="Gallery photo"
                      className="w-full h-full object-cover"
                    />
                    {/* Delete overlay */}
                    <button
                      type="button"
                      onClick={() => handleGalleryDelete(photo)}
                      disabled={deletingId === photo.id}
                      className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/50 transition-colors"
                      aria-label="Delete photo"
                    >
                      {deletingId === photo.id ? (
                        <svg className="w-5 h-5 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                      ) : (
                        <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-red-500 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold shadow-lg">
                          ✕
                        </span>
                      )}
                    </button>
                  </div>
                ))}

                {/* Upload tile — shown when under the limit */}
                {galleryPhotos.length < MAX_GALLERY_PHOTOS && (
                  <button
                    type="button"
                    onClick={() => galleryInputRef.current?.click()}
                    disabled={galleryUploading}
                    className="aspect-square rounded-xl border-2 border-dashed border-border hover:border-primary/60 flex flex-col items-center justify-center gap-2 text-text-subtle hover:text-text-muted transition-colors disabled:opacity-50"
                    style={{ '--tw-border-opacity': '1' } as React.CSSProperties}
                  >
                    {galleryUploading ? (
                      <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                    ) : (
                      <>
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                        </svg>
                        <span className="text-xs font-medium">Add photo</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            )}

            {/* Photo count */}
            {!galleryLoading && (
              <p className="text-text-subtle text-xs mt-4">
                {galleryPhotos.length} / {MAX_GALLERY_PHOTOS} photos
              </p>
            )}
          </div>

          {/* Hidden file input for gallery */}
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleGalleryUpload}
            className="hidden"
          />
        </div>
      </div>
    </PortalLayout>
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
