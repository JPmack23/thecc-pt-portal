/**
 * ProfilePage — Issue #12
 *
 * PT can edit their profile: display name, bio, photo, contact email,
 * specialties (tags), Instagram handle, TikTok handle.
 *
 * Desktop (≥1024px): split-panel layout — form left, live mobile preview right.
 * Mobile (<1024px): single column + floating "Preview" button (bottom modal).
 *
 * Data flow:
 *   - Loads from AuthContext.coachRow on mount (already fetched at login)
 *   - Edits held in local formState — preview reads from formState directly (no DB round-trip)
 *   - Photo upload creates a local object URL for the preview immediately (EC-15)
 *   - On save: PATCH coaches row via Supabase JS client (RLS: auth_user_id match)
 *   - Toast on success / error
 */

import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import { supabase } from '../lib/supabase';
import { PreviewPanel } from '../components/preview/CoachProfilePreview';
import type { PreviewCoachData } from '../components/preview/CoachProfilePreview';
import { PortalLayout } from '../components/PortalLayout';

// ── Constants ──────────────────────────────────────────────────────────────

const MAX_BIO = 500;
const MAX_SPECIALTIES = 5;
const MAX_SPECIALTY_LEN = 30;
const IG_REGEX = /^[a-zA-Z0-9._]{1,30}$/;
const TT_REGEX = /^[a-zA-Z0-9._]{1,24}$/;

// ── Types ──────────────────────────────────────────────────────────────────

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
  });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Initialise form from coachRow once available
  useEffect(() => {
    if (!coachRow) return;
    setForm({
      name: coachRow.name ?? '',
      bio: coachRow.bio ?? '',
      email: coachRow.email ?? user?.email ?? '',
      instagram: coachRow.instagram ?? '',
      tiktok: coachRow.tiktok ?? '',
      specialtyInput: '',
      specialties: coachRow.specialties ?? [],
      photo_url: coachRow.photo_url ?? null,
      photo_local_url: null,
      photo_file: null,
    });
  }, [coachRow?.id]);

  // ── Preview data (debounced 300ms via formState — no DB round-trip) ──────

  const previewData: PreviewCoachData = {
    name: form.name || 'Your Name',
    bio: form.bio || null,
    email: form.email || null,
    photo_url: form.photo_url,
    photo_local_url: form.photo_local_url,
    specialties: form.specialties.length > 0 ? form.specialties : null,
    instagram: form.instagram.trim() || null,
    tiktok: form.tiktok.trim() || null,
    is_personal_trainer: true,
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

      // Update local form state with the new photo URL
      setForm((prev) => ({
        ...prev,
        photo_url: newPhotoUrl,
        photo_local_url: null,
        photo_file: null,
        instagram: payload.instagram ?? '',
        tiktok: payload.tiktok ?? '',
      }));

      setToast({ message: 'Profile saved successfully.', type: 'success' });
    } finally {
      setSaving(false);
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
