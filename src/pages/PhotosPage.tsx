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
 *
 * Updated v0.4.4 (2026-05-26):
 *   - Bulk upload path: "Add multiple" button + drag-and-drop
 *   - autoCropToBlob: pure Canvas API, 600×600 JPEG, centre-crop, no new deps
 *   - uploadBulk: pre-validate ALL files, cap enforcement, concurrent Promise.allSettled
 *   - Drag handlers on empty-state div and + slot; isDragging visual feedback
 *   - Hidden multi-file <input> via multiFileInputRef
 *   - bulkProgress state drives "Uploading X/Y…" label on the primary button
 *   - Single-file "Add photo" → crop modal flow completely unchanged
 *
 * Updated v0.4.5 (2026-05-26):
 *   - Drag-to-reorder via @dnd-kit/core + @dnd-kit/sortable (primary interaction)
 *   - Up/down arrow buttons retained as touch/keyboard fallback
 *   - Listeners attached to image element only — arrows and delete button cannot
 *     accidentally start a drag
 *   - Optimistic UI reorder with DB batch UPDATE; reverts to DB state on any failure
 *   - Visual feedback: scale(1.05) + shadow on the dragged tile; smooth slide for neighbours
 *   - cursor: grab on tile image, cursor: grabbing while dragging
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { type AvatarEditorRef } from 'react-avatar-editor';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import { supabase } from '../lib/supabase';
import { PortalLayout } from '../components/PortalLayout';
import { GalleryPhotoCropModal } from '../components/GalleryPhotoCropModal';
import { PreviewPanel, buildPreviewDataFromCoachRow } from '../components/preview/CoachProfilePreview';

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
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB cap on source uploads
const MAX_FILE_SIZE_LABEL = '5MB';
const ACCEPTED = 'image/jpeg,image/png,image/webp,image/heic';

// Accepted MIME set for format validation (mirrors the ACCEPTED string above)
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic']);

// ── Auto-crop utility (bulk path only — no react-avatar-editor) ───────────

/**
 * autoCropToBlob
 *
 * Takes a File, returns a Promise<Blob> of a 600×600 JPEG (quality 0.92),
 * centre-cropped to square. Pure browser Canvas API — no new dependencies.
 *
 * Falls back from OffscreenCanvas to a regular canvas element for Safari.
 */
async function autoCropToBlob(file: File): Promise<Blob> {
  const objectUrl = URL.createObjectURL(file);

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = objectUrl;
  });

  URL.revokeObjectURL(objectUrl);

  const side = Math.min(img.width, img.height);
  const sx = (img.width - side) / 2;
  const sy = (img.height - side) / 2;

  // Use OffscreenCanvas where available (Chrome, Firefox); fall back for Safari
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(600, 600);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, sx, sy, side, side, 0, 0, 600, 600);
    return await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
  } else {
    // Safari fallback
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 600;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, sx, sy, side, side, 0, 0, 600, 600);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('canvas.toBlob returned null'))),
        'image/jpeg',
        0.92,
      );
    });
  }
}

// ── SortablePhotoTile ──────────────────────────────────────────────────────
//
// Each tile in the photo grid. Uses useSortable to participate in dnd-kit's
// drag-to-reorder.
//
// IMPORTANT: drag listeners are applied to the <img> element only.
// The arrow buttons and delete button sit OUTSIDE the drag-handle area so
// clicking them never accidentally starts a drag.

interface SortablePhotoTileProps {
  photo: CoachPhoto;
  deletingId: string | null;
  onDelete: () => void;
}

function SortablePhotoTile({
  photo,
  deletingId,
  onDelete,
}: SortablePhotoTileProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: photo.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    // Lift the dragged tile above neighbours AND above the arrow-button cluster
    // (which uses z-10) so the dragged tile is unambiguously on top.
    zIndex: isDragging ? 50 : undefined,
    // Scale up + deepen shadow while dragging
    ...(isDragging && {
      transform: CSS.Transform.toString(transform)
        ? CSS.Transform.toString(transform) + ' scale(1.05)'
        : 'scale(1.05)',
      boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
    }),
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative group aspect-square rounded-2xl overflow-hidden border border-border bg-surface"
    >
      {/* ── Drag handle: the image itself ── */}
      {/* listeners spread here — NOT on the whole tile or the button layer */}
      <img
        {...attributes}
        {...listeners}
        src={photo.public_url}
        alt="Gallery photo"
        className="w-full h-full object-cover select-none"
        loading="lazy"
        draggable={false}
        style={{
          cursor: isDragging ? 'grabbing' : 'grab',
        }}
      />

      {/* ── Delete: small top-right button — pointer-events scoped to the
              button only so the rest of the tile stays a drag handle.
              Visual dim overlay is a sibling div with pointer-events:none. ── */}
      <div
        className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
      />
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        disabled={deletingId === photo.id}
        className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center rounded-md bg-black/70 text-white opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-100 hover:bg-red-600/90 z-20"
        aria-label="Delete photo"
        title="Remove photo"
      >
        {deletingId === photo.id ? (
          <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
        ) : (
          <span className="text-sm">🗑️</span>
        )}
      </button>
    </div>
  );
}

export default function PhotosPage() {
  const { coachRow } = useAuth();
  const { tenant } = useTenant();
  const primary = tenant?.primary_color ?? '#FFD600';

  const [photos, setPhotos] = useState<CoachPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Crop modal state (single-file path — unchanged)
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [cropScale, setCropScale] = useState(1);
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const avatarEditorRef = useRef<AvatarEditorRef>(null);

  // ── v0.4.4 new state & refs ────────────────────────────────────────────
  const [isDragging, setIsDragging] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const multiFileInputRef = useRef<HTMLInputElement>(null);

  // Drag-leave counter: tracks enter/leave depth to avoid flicker on child elements
  const dragCounter = useRef(0);

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

  // ── Single-file path: pick → open crop modal ──────────────────────────
  // This is completely unchanged from v0.4.3.

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

      if (file.size > MAX_FILE_SIZE_BYTES) {
        const sizeMB = (file.size / 1024 / 1024).toFixed(1);
        showToast(`Photo is ${sizeMB}MB — please upload under ${MAX_FILE_SIZE_LABEL}`, 'error');
        return;
      }

      // Open crop modal — actual upload happens in handleCropSave
      setCropFile(file);
      setCropScale(1);
      setCropModalOpen(true);
    },
    [coachRow?.id, photos.length, showToast],
  );

  // ── Crop save → upload 600×600 JPEG blob (single-file path) ──────────

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

  // ── Bulk upload path (v0.4.4) ──────────────────────────────────────────

  /**
   * uploadBulk
   *
   * Handles multi-file upload (drag-and-drop or multi-file picker).
   * Steps:
   *  1. Trim to remaining slots (cap enforcement)
   *  2. Pre-validate ALL files (size + format)
   *  3. Concurrent autoCrop + upload via Promise.allSettled
   *  4. Single loadPhotos() call after all settle
   *  5. One toast summarising results
   */
  const uploadBulk = useCallback(
    async (files: File[]) => {
      if (!coachRow?.id) return;

      // Guard: prevent concurrent batches (e.g. user drops batch 2 mid-upload of batch 1).
      // Button disabled state prevents this via clicks, but drag-and-drop bypasses the button.
      if (uploading) {
        showToast('Already uploading — please wait for the current batch to finish', 'error');
        return;
      }

      // 1. Cap enforcement — take first N in drop order
      const slots = MAX_PHOTOS - photos.length;

      if (slots === 0) {
        showToast('Photo limit reached — delete a photo to add more', 'error');
        return;
      }

      let chosen = files;
      if (files.length > slots) {
        showToast(
          `Maximum ${MAX_PHOTOS} photos — only first ${slots} of your ${files.length} will be added`,
          'error',
        );
        chosen = files.slice(0, slots);
      }

      // 2. Pre-validate ALL chosen files before any upload
      for (const file of chosen) {
        if (file.size > MAX_FILE_SIZE_BYTES) {
          const sizeMB = (file.size / 1024 / 1024).toFixed(1);
          showToast(
            `"${file.name}" is ${sizeMB}MB — all photos must be under ${MAX_FILE_SIZE_LABEL}. Nothing was uploaded.`,
            'error',
          );
          return;
        }
        // HEIC blocked from bulk path: browser Canvas API can't decode HEIC on
        // Windows/Android, would silently fail with no useful explanation.
        // PT can still use single-file "Add photo" → crop modal for HEIC.
        if (file.type === 'image/heic') {
          showToast(
            `"${file.name}" is HEIC — bulk upload doesn't support HEIC yet. Please add HEIC photos one at a time using "Add photo", or convert to JPEG first.`,
            'error',
          );
          return;
        }
        if (!ACCEPTED_TYPES.has(file.type)) {
          showToast(
            `"${file.name}" is not a supported format. Use JPEG, PNG, or WebP for bulk upload. Nothing was uploaded.`,
            'error',
          );
          return;
        }
      }

      // 3. Start uploads
      setBulkProgress({ done: 0, total: chosen.length });
      setUploading(true);

      // Capture current photos.length for display_order base (closure safe — photos state here)
      const baseOrder = photos.length;

      const results = await Promise.allSettled(
        chosen.map(async (file, index) => {
          try {
            // Auto centre-crop to 600×600 JPEG
            const blob = await autoCropToBlob(file);

            const filename = `${crypto.randomUUID()}.jpg`;
            const storagePath = `coach-photos/${coachRow.id}/${filename}`;

            // Storage upload
            const { error: storageError } = await supabase.storage
              .from('branding-assets')
              .upload(storagePath, blob, { upsert: false, contentType: 'image/jpeg' });

            if (storageError) throw new Error(storageError.message);

            // Get public URL
            const { data: urlData } = supabase.storage
              .from('branding-assets')
              .getPublicUrl(storagePath);
            const publicUrl = urlData.publicUrl;

            // DB insert
            const { error: dbError } = await supabase.from('coach_photos').insert({
              coach_id: coachRow.id,
              storage_path: storagePath,
              public_url: publicUrl,
              display_order: baseOrder + index,
            });

            if (dbError) {
              // Clean up orphaned storage file
              await supabase.storage.from('branding-assets').remove([storagePath]);
              throw new Error(dbError.message);
            }

            return { filename: file.name };
          } finally {
            // Increment progress counter whether success or failure
            setBulkProgress((prev) =>
              prev ? { ...prev, done: prev.done + 1 } : null,
            );
          }
        }),
      );

      // 4. Tally results
      const succeeded = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.length - succeeded;

      // 5. Single reload
      setBulkProgress(null);
      setUploading(false);
      await loadPhotos();

      // 6. Surface result
      if (failed === 0) {
        showToast(
          `${succeeded} photo${succeeded === 1 ? '' : 's'} added`,
          'success',
        );
      } else if (succeeded === 0) {
        showToast('All photos failed to upload — try again', 'error');
      } else {
        showToast(
          `${succeeded} photo${succeeded === 1 ? '' : 's'} added, ${failed} failed`,
          'error',
        );
      }
    },
    [coachRow?.id, photos.length, uploading, showToast, loadPhotos],
  );

  // ── Drag handlers ──────────────────────────────────────────────────────

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current += 1;
    setIsDragging(true);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      dragCounter.current = 0;
      setIsDragging(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        uploadBulk(files);
      }
    },
    [uploadBulk],
  );

  // ── Multi-file picker onChange ─────────────────────────────────────────

  const handleMultiFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.length) {
        uploadBulk(Array.from(e.target.files));
        e.target.value = '';
      }
    },
    [uploadBulk],
  );

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

  // ── Drag-to-reorder (dnd-kit) ──────────────────────────────────────────

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Require the pointer to move 4px before a drag starts.
      // This prevents accidental drags when tapping arrow / delete buttons.
      activationConstraint: { distance: 4 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      // Block reorder during an active bulk upload — racing display_order
      // writes against insert-time display_order = baseOrder + index would
      // create duplicate or stale ordering values.
      if (uploading) return;

      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = photos.findIndex((p) => p.id === active.id);
      const newIndex = photos.findIndex((p) => p.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      // Optimistic UI reorder
      const reordered = arrayMove(photos, oldIndex, newIndex);
      setPhotos(reordered);

      // Compute the affected range — only rows whose display_order actually changed
      const start = Math.min(oldIndex, newIndex);
      const end = Math.max(oldIndex, newIndex);

      const updates = reordered.slice(start, end + 1).map((p, i) => ({
        id: p.id,
        display_order: start + i,
      }));

      // Run all updates in parallel (N concurrent UPDATEs, max 10)
      const results = await Promise.allSettled(
        updates.map((u) =>
          supabase
            .from('coach_photos')
            .update({ display_order: u.display_order })
            .eq('id', u.id),
        ),
      );

      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed > 0) {
        // Revert optimistic UI and reload authoritative state from DB
        showToast('Reorder failed — refreshing photos', 'error');
        await loadPhotos();
      }
    },
    [photos, uploading, showToast, loadPhotos],
  );

  // ── Preview data — full profile chrome with live gallery photos.
  // Same PreviewPanel as /profile; only the gallery section reflects live
  // edits on this page. Everything else reads from the saved coachRow.

  const previewData = buildPreviewDataFromCoachRow(coachRow, {
    gallery_photos: photos.map((p) => ({ id: p.id, public_url: p.public_url })),
  });

  // ── Render ─────────────────────────────────────────────────────────────

  const canAddMore = photos.length < MAX_PHOTOS;

  // Three-state label for the primary "Add photo" button
  const addPhotoLabel = bulkProgress
    ? `Uploading ${bulkProgress.done}/${bulkProgress.total}…`
    : uploading
      ? 'Uploading…'
      : null; // null → render the default "+ Add photo" markup below

  return (
    <PortalLayout>
      {/* Gallery crop modal (single-file path — unchanged) */}
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

      {/* Hidden multi-file input (bulk path) */}
      <input
        ref={multiFileInputRef}
        type="file"
        accept={ACCEPTED}
        multiple
        className="hidden"
        onChange={handleMultiFileChange}
      />

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
                <p className="text-text-subtle text-xs mt-2">
                  Recommended: square photos 1200×1200px or larger. JPEG, PNG, WebP, or HEIC. Max{' '}
                  {MAX_FILE_SIZE_LABEL} per photo. Multi-upload photos are center-cropped to square
                  automatically.
                </p>
              </div>

              {/* Button row: "Add photo" (single, crop modal) + "Add multiple" (bulk) */}
              <div className="flex-shrink-0 flex items-center gap-2">
                {/* Primary: Add photo — single-file, crop modal */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading || !canAddMore}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ backgroundColor: primary, color: '#000' }}
                >
                  {addPhotoLabel ? (
                    <>
                      <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                      {addPhotoLabel}
                    </>
                  ) : (
                    <>
                      <span className="text-lg leading-none">+</span>
                      Add photo
                    </>
                  )}
                </button>

                {/* Secondary: Add multiple — bulk path */}
                <button
                  onClick={() => multiFileInputRef.current?.click()}
                  disabled={uploading || !canAddMore}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border border-border text-text-muted hover:text-text transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span className="text-lg leading-none">+</span>
                  Add multiple
                </button>
              </div>

              {/* Hidden single-file input (single path — unchanged) */}
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED}
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {/* Photo count + drag instruction */}
            <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
              <p className="text-text-subtle text-xs">
                {photos.length} / {MAX_PHOTOS} photos used
              </p>
              {photos.length >= 2 && (
                <p className="text-text-subtle text-xs italic">
                  ↔ Drag photos to reorder them
                </p>
              )}
            </div>

            {/* Grid */}
            {loading ? (
              <div className="flex items-center justify-center h-48">
                <div
                  className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
                  style={{ borderColor: primary, borderTopColor: 'transparent' }}
                />
              </div>
            ) : photos.length === 0 ? (
              /* Empty state — also serves as the dropzone */
              <div
                className="border-2 border-dashed rounded-2xl flex flex-col items-center justify-center h-48 gap-3 text-center px-6 transition-all"
                style={{
                  borderColor: isDragging ? primary : undefined,
                  backgroundColor: isDragging ? primary + '10' : undefined,
                }}
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                {isDragging ? (
                  <p className="text-sm font-semibold" style={{ color: primary }}>
                    Drop photos to upload
                  </p>
                ) : (
                  <>
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
                      (single, with crop) or{' '}
                      <button
                        className="underline font-medium"
                        style={{ color: primary }}
                        onClick={() => multiFileInputRef.current?.click()}
                      >
                        Add multiple
                      </button>{' '}
                      (bulk, auto-cropped). Or drop photos here.
                      <br />
                      <span className="text-text-subtle text-xs">
                        Square photos work best — non-square images will be centre-cropped to a 1:1
                        square.
                      </span>
                    </p>
                  </>
                )}
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={photos.map((p) => p.id)}
                  strategy={rectSortingStrategy}
                >
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {photos.map((photo) => (
                      <SortablePhotoTile
                        key={photo.id}
                        photo={photo}
                        deletingId={deletingId}
                        onDelete={() => handleDelete(photo)}
                      />
                    ))}

                    {/* + Add slot — shown when under limit; also serves as dropzone */}
                    {canAddMore && (
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="aspect-square rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-all disabled:opacity-40"
                        style={{
                          borderColor: isDragging ? primary : undefined,
                          backgroundColor: isDragging ? primary + '10' : undefined,
                        }}
                        onDragEnter={handleDragEnter}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                      >
                        {isDragging ? (
                          <span className="text-sm font-semibold" style={{ color: primary }}>
                            Drop photos to upload
                          </span>
                        ) : (
                          <>
                            <span
                              className="text-3xl font-bold"
                              style={{ color: primary }}
                            >
                              +
                            </span>
                            <span className="text-text-muted text-xs">Add photo</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </SortableContext>
              </DndContext>
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
