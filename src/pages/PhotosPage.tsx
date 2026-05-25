/**
 * PhotosPage — My Photos
 *
 * PTs upload additional gallery photos here. These appear in the THECC+ mobile
 * app when a member taps the PT's profile.
 *
 * Rules:
 *   - Max 10 photos
 *   - Photos stored at coach-photos/{coach_id}/{uuid}.{ext} in Supabase storage
 *   - DB row: coach_photos (coach_id, storage_path, public_url, display_order)
 *   - Delete removes from both storage and DB
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import { supabase } from '../lib/supabase';
import { PortalLayout } from '../components/PortalLayout';

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
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

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

  // ── Upload ─────────────────────────────────────────────────────────────

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !coachRow?.id) return;

      // Reset input so same file can be re-selected after delete
      e.target.value = '';

      if (photos.length >= MAX_PHOTOS) {
        showToast(`Maximum ${MAX_PHOTOS} photos allowed`, 'error');
        return;
      }

      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
      const filename = `${crypto.randomUUID()}.${ext}`;
      const storagePath = `coach-photos/${coachRow.id}/${filename}`;

      setUploading(true);

      // Upload to storage
      const { error: storageError } = await supabase.storage
        .from('coach-photos')
        .upload(storagePath, file, { upsert: false, contentType: file.type });

      if (storageError) {
        showToast('Upload failed — ' + storageError.message, 'error');
        setUploading(false);
        return;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('coach-photos')
        .getPublicUrl(storagePath);

      const publicUrl = urlData.publicUrl;

      // Insert DB row
      const { error: dbError } = await supabase.from('coach_photos').insert({
        coach_id: coachRow.id,
        storage_path: storagePath,
        public_url: publicUrl,
        display_order: photos.length,
      });

      if (dbError) {
        // Clean up orphaned storage file
        await supabase.storage.from('coach-photos').remove([storagePath]);
        showToast('Failed to save photo record', 'error');
        setUploading(false);
        return;
      }

      showToast('Photo added', 'success');
      await loadPhotos();
      setUploading(false);
    },
    [coachRow?.id, photos.length, showToast, loadPhotos],
  );

  // ── Delete ─────────────────────────────────────────────────────────────

  const handleDelete = useCallback(
    async (photo: CoachPhoto) => {
      setDeletingId(photo.id);

      // Remove from storage
      const { error: storageError } = await supabase.storage
        .from('coach-photos')
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

  // ── Render ─────────────────────────────────────────────────────────────

  const canAddMore = photos.length < MAX_PHOTOS;

  return (
    <PortalLayout>
      <div className="max-w-3xl mx-auto px-6 py-10">
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
            {photos.map((photo) => (
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
                {/* Delete overlay */}
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
