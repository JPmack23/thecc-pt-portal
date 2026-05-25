/**
 * PhotosPage — My Photos
 *
 * PTs upload additional gallery photos here. These appear in the THECC+ mobile
 * app when a member taps the PT's profile.
 *
 * Rules:
 *   - Max 10 photos
 *   - Photos stored in the public `branding-assets` Supabase bucket at
 *     path `coach-photos/{coach_id}/{uuid}.{ext}` (the path mimics a folder).
 *     A dedicated `coach-photos` bucket is a future cleanup — see follow-up
 *     notes in JP2ndbrain/Daily/2026-05-25.md.
 *   - DB row: coach_photos (coach_id, storage_path, public_url, display_order)
 *   - Delete removes from both storage and DB
 *
 * Updated v0.4.3 (2026-05-26):
 *   - Gallery crop modal: file pick → crop (1:1, 600×600 JPEG) → upload cropped blob
 *   - Live preview panel wired from existing photos[] + coachRow (no new DB queries)
 *   - Arrow buttons: opacity-40 (was 20), w-8 h-8 (was w-6 h-6) for tap comfort
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { type AvatarEditorRef } from 'react-avatar-editor';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import { supabase } from '../lib/supabase';
import { PortalLayout } from '../components/PortalLayout';
import { GalleryPhotoCropModal } from '../components/GalleryPhotoCropModal';
import { PreviewPanel, type PreviewCoachData } from '../components/preview/CoachProfilePreview';

// ── Types ──────────────────────────────────────────────────────────────────

interface CoachPhoto {
  id: string;
  storage_path: string;
  public_url: string;
  display_order: number;
  created_at: string;
}

// ── Toast ──────────────────────────────────────────────────────────────────

function Toast({
  message,
  type,
  onDismiss,
}: {
  message: string;
  type: 'success' | 'error';
  onDismiss: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  const { tenant } = useTenant();
  const primary = tenant?.primary_color ?? '#FFD600';

  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl text-sm font-medium shadow-xl"
      style={
        type === 'success'
          ? { backgroundColor: primary, color: '#000' }
          : { backgroundColor: '#ef4444', color: '#fff' }
      }
    >
      {message}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

const MAX_PHOTOS = 10;
const ACCEPTED = 'image/jpeg,image/png,image/webp,image/heic';

export default function PhotosPage() {
  const { coachRow } = useAuth();
  const { tenant } = useTenant();
  const primary = tenant?.primary_color ?? '#FFD600';

  const [photos, setPhotos] = useState<CoachPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reorderingId, setReorderingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Crop modal state
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [cropScale, setCropScale] = useState(1);
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const avatarEditorRef = useRef<AvatarEditorRef>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
  }, []);

  // ── Load photos ────────────────────────────────────────────────────────

  const loadPhotos = useCallback(async () => {
    if (!coachRow?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('coach_photos')
      .select('id, storage_path, public_url, display_order, created_at')
      .eq('coach_id', coachRow.id)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      showToast('Failed to load photos', 'error');
    } else {
      setPhotos(data ?? []);
    }
    setLoading(false);
  }, [coachRow?.id, showToast]);

  useEffect(() => {
    loadPhotos();
  }, [loadPhotos]);

  // ── File pick → open crop modal (defers upload until crop save) ────────

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !coachRow?.id) return;

      // Reset input so same file can be re-selected after cancel
      e.target.value = '';

      if (photos.length >= MAX_PHOTOS) {
        showToast(`Maximum ${MAX_PHOTOS} photos allowed`, 'error');
        return;
      }

      // Open crop modal — actual upload happens in handleCropSave
      setCropFile(file);
      setCropScale(1);
      setCropModalOpen(true);
    },
    [coachRow?.id, photos.length, showToast],
  );

  // ── Crop save → upload 600×600 JPEG blob ──────────────────────────────

  const handleCropSave = useCallback(async () => {
    const editor = avatarEditorRef.current;
    if (!editor || !cropFile || !coachRow?.id) return;

    // AvatarEditor.getImageScaledToCanvas() returns the canvas at its
    // configured dimensions (600×600 for the gallery square).
    const canvas = editor.getImageScaledToCanvas();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.92)
    );

    if (!blob) {
      showToast('Failed to process image', 'error');
      setCropModalOpen(false);
      setCropFile(null);
      return;
    }

    setCropModalOpen(false);
    setCropFile(null);

    // Upload the cropped 600×600 JPEG blob
    setUploading(true);

    const filename = `${crypto.randomUUID()}.jpg`;
    const storagePath = `coach-photos/${coachRow.id}/${filename}`;
    const croppedFile = new File([blob], filename, { type: 'image/jpeg' });

    const { error: storageError } = await supabase.storage
      .from('branding-assets')
      .upload(storagePath, croppedFile, { upsert: false, contentType: 'image/jpeg' });

    if (storageError) {
      showToast('Upload failed — ' + storageError.message, 'error');
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage
      .from('branding-assets')
      .getPublicUrl(storagePath);

    const publicUrl = urlData.publicUrl;

    const { error: dbError } = await supabase.from('coach_photos').insert({
      coach_id: coachRow.id,
      storage_path: storagePath,
      public_url: publicUrl,
      display_order: photos.length,
    });

    if (dbError) {
      // Clean up orphaned storage file
      await supabase.storage.from('branding-assets').remove([storagePath]);
      showToast('Failed to save photo record', 'error');
      setUploading(false);
      return;
    }

    showToast('Photo added', 'success');
    await loadPhotos();
    setUploading(false);
  }, [avatarEditorRef, cropFile, coachRow?.id, photos.length, showToast, loadPhotos]);

  const handleCropCancel = useCallback(() => {
    setCropModalOpen(false);
    setCropFile(null);
  }, []);

  // ── Delete ─────────────────────────────────────────────────────────────

  const handleDelete = useCallback(
    async (photo: CoachPhoto) => {
      setDeletingId(photo.id);

      // Remove from storage
      const { error: storageError } = await supabase.storage
        .from('branding-assets')
        .remove([photo.storage_path]);

      if (storageError) {
        // Non-fatal — file may have already been removed; continue to DB delete
        console.warn('[PhotosPage] storage remove failed:', storageError.message);
      }

      // Remove DB row
      const { error: dbError } = await supabase
        .from('coach_photos')
        .delete()
        .eq('id', photo.id);

      if (dbError) {
        showToast('Failed to delete photo', 'error');
      } else {
        showToast('Photo removed', 'success');
        setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
      }

      setDeletingId(null);
    },
    [showToast],
  );

  // ── Reorder ────────────────────────────────────────────────────────────

  const movePhoto = useCallback(
    async (photoId: string, direction: 'up' | 'down') => {
      const idx = photos.findIndex((p) => p.id === photoId);
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= photos.length) return;

      // Optimistic update
      const updated = [...photos];
      const tempOrder = updated[idx].display_order;
      updated[idx] = { ...updated[idx], display_order: updated[swapIdx].display_order };
      updated[swapIdx] = { ...updated[swapIdx], display_order: tempOrder };
      updated.sort((a, b) => a.display_order - b.display_order);
      setPhotos(updated);

      setReorderingId(photoId);

      // Persist both swapped rows
      await Promise.all([
        supabase
          .from('coach_photos')
          .update({ display_order: updated[swapIdx < idx ? idx : swapIdx].display_order })
          .eq('id', updated[swapIdx < idx ? idx : swapIdx].id),
        supabase
          .from('coach_photos')
          .update({ display_order: updated[swapIdx < idx ? swapIdx : idx].display_order })
          .eq('id', updated[swapIdx < idx ? swapIdx : idx].id),
      ]);

      setReorderingId(null);
    },
    [photos],
  );

  // ── Preview data (derived from existing state — no new Supabase queries) ─

  const previewData: PreviewCoachData = {
    name: (coachRow as any)?.name ?? 'Your Name',
    bio: (coachRow as any)?.bio ?? null,
    email: (coachRow as any)?.email ?? null,
    photo_url: (coachRow as any)?.photo_url ?? null,
    specialties: (coachRow as any)?.specialties ?? null,
    instagram: (coachRow as any)?.instagram ?? null,
    tiktok: (coachRow as any)?.tiktok ?? null,
    is_personal_trainer: (coachRow as any)?.is_personal_trainer ?? false,
    is_nutritionist: (coachRow as any)?.is_nutritionist ?? false,
    gallery_photos: photos.map((p) => ({ id: p.id, public_url: p.public_url })),
    packages: [],
  };

  // ── Render ─────────────────────────────────────────────────────────────

  const canAddMore = photos.length < MAX_PHOTOS;

  return (
    <PortalLayout>
      {/* Gallery crop modal */}
      {cropModalOpen && cropFile && (
        <GalleryPhotoCropModal
          file={cropFile}
          editorRef={avatarEditorRef}
          scale={cropScale}
          onScaleChange={setCropScale}
          onSave={handleCropSave}
          onCancel={handleCropCancel}
          primary={primary}
        />
      )}

      {/* Split-panel layout: max-w-6xl, left = grid + upload, right = preview */}
      <div className="max-w-6xl mx-auto px-6 py-10">
        {/* Left column */}
        <div className="flex gap-8 items-start">
          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="mb-8 flex items-start justify-between gap-4">
              <div>
                <h1 className="text-text text-2xl font-bold">My Photos</h1>
                <p className="text-text-muted text-sm mt-1">
                  Add gallery photos that members see when they view your profile in
                  the app. Up to {MAX_PHOTOS} photos.
                </p>
              </div>

              {/* Upload button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || !canAddMore}
                className="flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ backgroundColor: primary, color: '#000' }}
              >
                {uploading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                    Uploading…
                  </>
                ) : (
                  <>
                    <span className="text-lg leading-none">+</span>
                    Add photo
                  </>
                )}
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED}
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {/* Photo count */}
            <p className="text-text-subtle text-xs mb-5">
              {photos.length} / {MAX_PHOTOS} photos used
            </p>

            {/* Grid */}
            {loading ? (
              <div className="flex items-center justify-center h-48">
                <div
                  className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
                  style={{ borderColor: primary, borderTopColor: 'transparent' }}
                />
              </div>
            ) : photos.length === 0 ? (
              <div className="border border-dashed border-border rounded-2xl flex flex-col items-center justify-center h-48 gap-3 text-center px-6">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-xl font-bold"
                  style={{ backgroundColor: primary + '20', color: primary }}
                >
                  📷
                </div>
                <p className="text-text-muted text-sm">
                  No photos yet. Click{' '}
                  <button
                    className="underline font-medium"
                    style={{ color: primary }}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Add photo
                  </button>{' '}
                  to get started.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {photos.map((photo, idx) => (
                  <div
                    key={photo.id}
                    className="relative group aspect-square rounded-2xl overflow-hidden border border-border bg-surface"
                  >
                    <img
                      src={photo.public_url}
                      alt="Gallery photo"
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />

                    {/* Reorder arrows — top-left corner, always visible (no hover needed for mobile) */}
                    <div className="absolute top-2 left-2 flex flex-col gap-1 z-10">
                      <button
                        onClick={() => movePhoto(photo.id, 'up')}
                        disabled={idx === 0 || reorderingId === photo.id}
                        className="w-8 h-8 flex flex-col items-center justify-center rounded-md bg-black/60 text-white text-xs font-bold transition-opacity disabled:opacity-40 disabled:cursor-not-allowed hover:bg-black/80"
                        aria-label="Up"
                        title="Move up"
                      >
                        <span className="text-sm leading-none">↑</span>
                        <span className="text-[9px] leading-none mt-0.5 opacity-80">Up</span>
                      </button>
                      <button
                        onClick={() => movePhoto(photo.id, 'down')}
                        disabled={idx === photos.length - 1 || reorderingId === photo.id}
                        className="w-8 h-8 flex flex-col items-center justify-center rounded-md bg-black/60 text-white text-xs font-bold transition-opacity disabled:opacity-40 disabled:cursor-not-allowed hover:bg-black/80"
                        aria-label="Down"
                        title="Move down"
                      >
                        <span className="text-sm leading-none">↓</span>
                        <span className="text-[9px] leading-none mt-0.5 opacity-80">Dn</span>
                      </button>
                    </div>

                    {/* Delete overlay — centre, hover/tap */}
                    <button
                      onClick={() => handleDelete(photo)}
                      disabled={deletingId === photo.id}
                      className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-100"
                      aria-label="Delete photo"
                    >
                      {deletingId === photo.id ? (
                        <div className="w-6 h-6 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      ) : (
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-2xl">🗑️</span>
                          <span className="text-white text-xs font-medium">Remove</span>
                        </div>
                      )}
                    </button>
                  </div>
                ))}

                {/* Add more slot — shown when under limit */}
                {canAddMore && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="aspect-square rounded-2xl border border-dashed border-border flex flex-col items-center justify-center gap-2 transition-colors hover:border-primary disabled:opacity-40"
                    style={{ '--tw-border-opacity': 1 } as React.CSSProperties}
                  >
                    <span
                      className="text-3xl font-bold"
                      style={{ color: primary }}
                    >
                      +
                    </span>
                    <span className="text-text-muted text-xs">Add photo</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Right column: live preview panel */}
          <PreviewPanel formData={previewData} />
        </div>
      </div>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      )}
    </PortalLayout>
  );
}
