/**
 * GalleryOnlyPreview.tsx
 *
 * A focused preview panel for the /photos page that renders ONLY the
 * gallery — not the full profile. The /photos editor is photos-only,
 * so the preview should match that scope.
 *
 * Differences from <PreviewPanel>:
 *   - No mobile CoachProfileView import (no role/bio/specialties/etc.)
 *   - Just a 3-column square tile grid (Instagram-style) of the photos
 *   - Smaller phone frame height (photos don't need 812px)
 *   - Same scale(0.75) on desktop, mobile modal pattern preserved
 *
 * Data flow:
 *   PhotosPage.photos[] → <GalleryOnlyPreview photos={...} />
 *     → renders square tiles inside a phone frame
 *
 * Why a separate component (not a "scoped" variant of CoachProfilePreview):
 *   The full preview imports the mobile CoachProfileView via RNW + shims —
 *   relatively heavy. The gallery is simple enough that a plain HTML grid
 *   in the phone frame is faster, lighter, and avoids accidentally
 *   rendering profile fields.
 */
import { useState } from 'react';
import { useTenant } from '../../contexts/TenantContext';

// ── Types ──────────────────────────────────────────────────────────────────

export interface GalleryPreviewPhoto {
  id: string;
  public_url: string;
}

interface GalleryOnlyPreviewProps {
  photos: GalleryPreviewPhoto[];
}

// ── Phone frame constants ──────────────────────────────────────────────────

const FRAME_WIDTH = 375;
const FRAME_HEIGHT = 600; // shorter than the full-profile preview (812)
const TILE_GAP = 1;
const TILE_SIZE = Math.floor((FRAME_WIDTH - TILE_GAP * 2) / 3);

// ── Phone frame component ──────────────────────────────────────────────────

function PhoneFrame({ photos, primary }: { photos: GalleryPreviewPhoto[]; primary: string }) {
  return (
    <div
      style={{
        width: `${FRAME_WIDTH}px`,
        height: `${FRAME_HEIGHT}px`,
        borderRadius: '36px',
        backgroundColor: '#0a0a0a',
        border: '8px solid #1a1a1a',
        boxShadow: '0 25px 60px rgba(0,0,0,0.6)',
        overflow: 'hidden',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Status bar */}
      <div
        style={{
          height: '32px',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          fontSize: '13px',
          color: '#fff',
          fontWeight: 600,
        }}
      >
        <span>9:41</span>
        <span>•••</span>
      </div>

      {/* Header — minimal, just to set tenant tone */}
      <div
        style={{
          height: '44px',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: primary,
          fontWeight: 700,
          fontSize: '15px',
          letterSpacing: '0.5px',
        }}
      >
        GALLERY
      </div>

      {/* Photo grid — fills the rest of the frame, scrollable if many photos */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: `0 0 16px 0`,
        }}
      >
        {photos.length === 0 ? (
          <div
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#666',
              fontSize: '13px',
              padding: '0 24px',
              textAlign: 'center',
            }}
          >
            No photos yet — add some on the left to see them here.
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: `${TILE_GAP}px`,
            }}
          >
            {photos.map((photo) => (
              <div
                key={photo.id}
                style={{
                  width: `${TILE_SIZE}px`,
                  height: `${TILE_SIZE}px`,
                  backgroundColor: '#1a1a1a',
                  overflow: 'hidden',
                }}
              >
                <img
                  src={photo.public_url}
                  alt=""
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block',
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Public component — desktop sticky + mobile modal pattern ──────────────

export function GalleryOnlyPreview({ photos }: GalleryOnlyPreviewProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const { tenant } = useTenant();
  const primary = tenant?.primary_color ?? '#FFD600';

  return (
    <>
      {/* Desktop (≥1024px): sticky right panel */}
      <div className="hidden lg:flex flex-col items-center">
        <div className="sticky top-8">
          <p className="text-text-subtle text-xs text-center mb-4 uppercase tracking-wide font-medium">
            Gallery preview
          </p>
          <div style={{ transform: 'scale(0.75)', transformOrigin: 'top center', marginBottom: '-150px' }}>
            <PhoneFrame photos={photos} primary={primary} />
          </div>
        </div>
      </div>

      {/* Mobile (<1024px): floating "Preview" button + modal */}
      <div className="lg:hidden">
        <button
          onClick={() => setModalOpen(true)}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-2.5 rounded-full font-semibold text-sm shadow-lg z-40"
          style={{ backgroundColor: primary, color: '#000000' }}
        >
          Preview
        </button>

        {modalOpen && (
          <div className="fixed inset-0 bg-black/80 z-50 flex flex-col items-center justify-center p-4">
            <div className="flex items-center justify-between w-full max-w-sm mb-3">
              <span className="text-white text-sm font-medium">Gallery preview</span>
              <button
                onClick={() => setModalOpen(false)}
                className="text-zinc-400 hover:text-white text-sm"
              >
                Close
              </button>
            </div>
            <div style={{ transform: 'scale(0.85)', transformOrigin: 'top center' }}>
              <PhoneFrame photos={photos} primary={primary} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
