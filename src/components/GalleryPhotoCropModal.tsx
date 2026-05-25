/**
 * GalleryPhotoCropModal
 *
 * Photo crop modal for gallery uploads on PhotosPage.
 * Extracted from the profile crop modal in ProfilePage.tsx.
 *
 * Differences from the profile version:
 *   - Aspect: 1:1 square (300×300 display, 600×600 output)
 *   - borderRadius: 0 (square crop guide, not circular)
 *   - Output canvas: 600×600px JPEG at quality 0.92
 *
 * Props interface is intentionally identical to ProfilePage's CropModal so
 * the integration pattern looks the same at the call site.
 */

import React from 'react';
import AvatarEditor, { type AvatarEditorRef } from 'react-avatar-editor';

// ── Props ──────────────────────────────────────────────────────────────────

export interface GalleryPhotoCropModalProps {
  file: File;
  editorRef: React.RefObject<AvatarEditorRef | null>;
  scale: number;
  onScaleChange: (v: number) => void;
  onSave: () => void;
  onCancel: () => void;
  primary: string;
}

// ── Component ──────────────────────────────────────────────────────────────

export function GalleryPhotoCropModal({
  file,
  editorRef,
  scale,
  onScaleChange,
  onSave,
  onCancel,
  primary,
}: GalleryPhotoCropModalProps) {
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

        {/* AvatarEditor — 1:1 square (300×300) display, outputs 600×600 */}
        <div className="rounded-xl overflow-hidden border border-border">
          <AvatarEditor
            ref={editorRef}
            image={file}
            width={300}
            height={300}
            border={24}
            borderRadius={0}
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
