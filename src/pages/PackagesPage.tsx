/**
 * PackagesPage — Issue #15
 *
 * PT can see, add, edit, delete, and reorder their pricing packages (pt_offerings).
 *
 * Data: read/write to `pt_offerings` via Supabase JS client (RLS scoped to coach_id).
 * Reorder: up/down arrow buttons update display_order on each affected row.
 * Max 10 packages per PT in v1.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import { supabase } from '../lib/supabase';
import { PortalLayout } from '../components/PortalLayout';
import {
  PreviewPanel,
  buildPreviewDataFromCoachRow,
  type PreviewPackage,
} from '../components/preview/CoachProfilePreview';

// ── Carousel conflict confirmation modal ───────────────────────────────────────
// Shown when Tyler tries to feature a package for a PT who already has one featured.

function CarouselConflictModal({
  existingLabel,
  newLabel,
  onConfirm,
  onCancel,
  primary,
}: {
  existingLabel: string;
  newLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  primary: string;
}) {
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-surface rounded-2xl border border-border p-6">
        <h3 className="text-text font-bold text-base mb-2">Replace featured package?</h3>
        <p className="text-text-muted text-sm mb-4">
          This PT already has a featured package on the home carousel:
        </p>
        <div className="bg-surface-alt border border-border rounded-xl px-3 py-2 mb-4">
          <p className="text-text text-sm font-semibold">{existingLabel}</p>
          <p className="text-text-subtle text-xs mt-0.5">Currently featured</p>
        </div>
        <p className="text-text-muted text-sm mb-6">
          Featuring <strong className="text-text">{newLabel}</strong> will remove the previous one from the carousel.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium text-text-muted border border-border hover:text-text transition-colors"
          >
            Keep current
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
            style={{ backgroundColor: primary, color: '#000000' }}
          >
            Replace it
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Types ──────────────────────────────────────────────────────────────────

interface PtOffering {
  id: string;
  label: string;
  description: string | null;
  price_nzd: number;
  duration_label: string | null;
  cta_label: string | null;
  cta_url: string | null;
  display_order: number;
  is_active: boolean;
  featured_on_carousel: boolean;
  // Promo fields (migration 7)
  promo_label: string | null;
  promo_description: string | null;
  promo_active: boolean;
  promo_starts_at: string | null;
  promo_ends_at: string | null;
  created_at: string;
}

interface OfferingFormState {
  label: string;
  description: string;
  price_nzd: string;
  duration_label: string;
  cta_label: string;
  cta_url: string;
  // Promo
  promo_active: boolean;
  promo_label: string;
  promo_description: string;
  promo_starts_at: string;
  promo_ends_at: string;
}

const MAX_PACKAGES = 10;

const EMPTY_FORM: OfferingFormState = {
  label: '',
  description: '',
  price_nzd: '',
  duration_label: '',
  cta_label: 'Book now',
  cta_url: '',
  promo_active: false,
  promo_label: '',
  promo_description: '',
  promo_starts_at: '',
  promo_ends_at: '',
};

// Helper: is a promo currently in range?
function promoIsLive(pkg: PtOffering): boolean {
  if (!pkg.promo_active) return false;
  const now = Date.now();
  if (pkg.promo_starts_at && new Date(pkg.promo_starts_at).getTime() > now) return false;
  if (pkg.promo_ends_at && new Date(pkg.promo_ends_at).getTime() < now) return false;
  return true;
}

// ── Toast ──────────────────────────────────────────────────────────────────

function Toast({ message, type, onDismiss }: { message: string; type: 'success' | 'error'; onDismiss: () => void }) {
  const { tenant } = useTenant();
  const primary = tenant?.primary_color ?? '#FFD600';
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [onDismiss]);
  return (
    <div
      className="fixed top-4 right-4 z-50 rounded-xl px-4 py-3 text-sm font-medium shadow-lg flex items-center gap-2 max-w-xs"
      style={type === 'success' ? { backgroundColor: primary, color: '#000000' } : { backgroundColor: '#ef4444', color: '#ffffff' }}
    >
      <span>{type === 'success' ? '✓' : '✕'}</span>
      <span>{message}</span>
    </div>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────

function EmptyPackages({ onAdd, primary }: { onAdd: () => void; primary: string }) {
  return (
    <div className="text-center py-20">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4"
        style={{ backgroundColor: primary + '15' }}
      >
        📦
      </div>
      <h3 className="text-text font-semibold text-lg mb-2">No packages yet</h3>
      <p className="text-text-muted text-sm mb-6 max-w-xs mx-auto">
        List your coaching programmes and pricing so clients know what you offer.
      </p>
      <button
        onClick={onAdd}
        className="px-5 py-2.5 rounded-xl font-semibold text-sm"
        style={{ backgroundColor: primary, color: '#000000' }}
      >
        Add your first package
      </button>
    </div>
  );
}

// ── Package card ───────────────────────────────────────────────────────────

function PackageCard({
  offering,
  primary,
  isFirst,
  isLast,
  isOrgAdmin,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
  onToggleFeatured,
}: {
  offering: PtOffering;
  primary: string;
  isFirst: boolean;
  isLast: boolean;
  /** Org admin sees the featured toggle; PTs see a read-only badge */
  isOrgAdmin: boolean;
  onEdit: (o: PtOffering) => void;
  onDelete: (o: PtOffering) => void;
  onMoveUp: (o: PtOffering) => void;
  onMoveDown: (o: PtOffering) => void;
  /** Called when org admin flips the featured toggle */
  onToggleFeatured: (o: PtOffering) => void;
}) {
  const promoLive = promoIsLive(offering);

  return (
    <div className="bg-surface border border-border rounded-2xl p-5 flex gap-3 items-start">
      {/* Reorder buttons */}
      <div className="flex flex-col gap-1 pt-1">
        <button
          onClick={() => onMoveUp(offering)}
          disabled={isFirst}
          className="w-6 h-6 flex items-center justify-center rounded-lg text-text-subtle hover:text-text hover:bg-surface-alt transition-colors disabled:opacity-20 disabled:cursor-not-allowed text-xs"
          title="Move up"
        >
          ↑
        </button>
        <button
          onClick={() => onMoveDown(offering)}
          disabled={isLast}
          className="w-6 h-6 flex items-center justify-center rounded-lg text-text-subtle hover:text-text hover:bg-surface-alt transition-colors disabled:opacity-20 disabled:cursor-not-allowed text-xs"
          title="Move down"
        >
          ↓
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Promo badge row */}
        {promoLive && offering.promo_label && (
          <div className="flex items-center gap-2 mb-2">
            <span className="bg-yellow-400 text-black text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded">
              {offering.promo_label}
            </span>
            {offering.featured_on_carousel && (
              <span
                className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border"
                style={{ color: primary, borderColor: primary }}
              >
                Featured
              </span>
            )}
          </div>
        )}
        {/* Inactive promo indicator */}
        {offering.promo_active && !promoLive && (
          <div className="mb-2">
            <span className="text-[10px] font-semibold text-text-subtle border border-border px-2 py-0.5 rounded">
              Promo (inactive / out of date range)
            </span>
          </div>
        )}

        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="text-text font-semibold text-sm">{offering.label}</h3>
          <span className="text-lg font-bold flex-shrink-0" style={{ color: primary }}>
            ${offering.price_nzd % 1 === 0 ? Number(offering.price_nzd).toFixed(0) : Number(offering.price_nzd).toFixed(2)}
            <span className="text-text-subtle text-xs font-normal ml-0.5">NZD</span>
          </span>
        </div>
        {offering.duration_label && (
          <p className="text-text-subtle text-xs mb-1">{offering.duration_label}</p>
        )}
        {offering.description && (
          <p className="text-text-muted text-xs leading-relaxed line-clamp-2">{offering.description}</p>
        )}
        {offering.cta_url && (
          <a
            href={offering.cta_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-2 text-xs font-semibold underline"
            style={{ color: primary }}
          >
            {offering.cta_label ?? 'Book now'} ↗
          </a>
        )}
      </div>

      {/* Actions + featured toggle */}
      <div className="flex flex-col gap-1 flex-shrink-0 items-end">
        <button
          onClick={() => onEdit(offering)}
          className="text-text-muted hover:text-text text-xs px-2 py-1 rounded-lg hover:bg-surface-alt transition-colors"
        >
          Edit
        </button>
        <button
          onClick={() => onDelete(offering)}
          className="text-red-400 hover:text-red-300 text-xs px-2 py-1 rounded-lg hover:bg-surface-alt transition-colors"
        >
          Remove
        </button>

        {/* Featured on carousel — org_admin toggle / PT read-only badge */}
        <div className="mt-2 border-t border-border pt-2 w-full">
          {isOrgAdmin ? (
            <div className="flex flex-col gap-1">
              <button
                type="button"
                role="switch"
                aria-checked={offering.featured_on_carousel}
                onClick={() => onToggleFeatured(offering)}
                title="Feature on home carousel"
                className="relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none self-end"
                style={{ backgroundColor: offering.featured_on_carousel ? primary : 'var(--color-border)' }}
              >
                <span
                  className="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200"
                  style={{ transform: offering.featured_on_carousel ? 'translateX(16px)' : 'translateX(0)' }}
                />
              </button>
              <p className="text-text-subtle text-[10px] text-right leading-tight">
                {offering.featured_on_carousel ? 'On carousel' : 'Carousel'}
              </p>
            </div>
          ) : offering.featured_on_carousel ? (
            <span
              className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border"
              style={{ color: primary, borderColor: primary + '66' }}
            >
              Featured by Tyler
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ── Package form modal ─────────────────────────────────────────────────────

function PackageFormModal({
  offering,
  onClose,
  onSave,
  primary,
}: {
  offering: PtOffering | null;
  onClose: () => void;
  onSave: (form: OfferingFormState, offeringId: string | null) => Promise<void>;
  primary: string;
}) {
  const [form, setForm] = useState<OfferingFormState>(
    offering
      ? {
          label: offering.label,
          description: offering.description ?? '',
          price_nzd: String(offering.price_nzd),
          duration_label: offering.duration_label ?? '',
          cta_label: offering.cta_label ?? 'Book now',
          cta_url: offering.cta_url ?? '',
          promo_active: offering.promo_active ?? false,
          promo_label: offering.promo_label ?? '',
          promo_description: offering.promo_description ?? '',
          promo_starts_at: offering.promo_starts_at
            ? offering.promo_starts_at.slice(0, 16)  // trim to datetime-local format
            : '',
          promo_ends_at: offering.promo_ends_at
            ? offering.promo_ends_at.slice(0, 16)
            : '',
        }
      : EMPTY_FORM,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  type StringOfferingKeys = { [K in keyof OfferingFormState]: OfferingFormState[K] extends string ? K : never }[keyof OfferingFormState];

  function set(key: StringOfferingKeys, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => { const n = { ...prev }; delete n[key]; return n; });
  }

  function togglePromo() {
    setForm((prev) => ({ ...prev, promo_active: !prev.promo_active }));
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.label.trim()) e.label = 'Package name is required.';
    else if (form.label.length > 60) e.label = 'Max 60 characters.';
    if (form.description.length > 300) e.description = 'Max 300 characters.';
    const price = parseFloat(form.price_nzd);
    if (!form.price_nzd || isNaN(price) || price < 0) e.price_nzd = 'Enter a valid price (0 or more).';
    if (form.duration_label.length > 40) e.duration_label = 'Max 40 characters.';
    if (form.cta_label.length > 30) e.cta_label = 'Max 30 characters.';
    if (form.cta_url && !/^https:\/\//i.test(form.cta_url)) {
      e.cta_url = 'Link must start with https://';
    }
    if (form.promo_active && !form.promo_label.trim()) {
      e.promo_label = 'Promo badge text is required when promo is active.';
    }
    if (form.promo_label.length > 40) e.promo_label = 'Max 40 characters.';
    if (form.promo_description.length > 200) e.promo_description = 'Max 200 characters.';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    await onSave(form, offering?.id ?? null);
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full sm:max-w-lg bg-surface rounded-t-3xl sm:rounded-2xl border border-border max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-surface z-10">
          <h2 className="text-text font-bold text-base">{offering ? 'Edit package' : 'Add a package'}</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <ModalField label="Package name *" error={errors.label}>
            <input
              type="text"
              value={form.label}
              onChange={(e) => set('label', e.target.value)}
              maxLength={70}
              placeholder="e.g. 12-Week Transformation Programme"
              className="w-full bg-canvas border border-border rounded-xl px-4 py-2.5 text-text text-sm focus:outline-none"
            />
          </ModalField>

          <ModalField label="Description (optional)" error={errors.description}>
            <textarea
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              rows={3}
              maxLength={320}
              placeholder="What's included, who it's for…"
              className="w-full bg-canvas border border-border rounded-xl px-4 py-2.5 text-text text-sm focus:outline-none resize-none"
            />
            <p className="text-text-subtle text-xs mt-0.5">{form.description.length}/300 chars</p>
          </ModalField>

          <ModalField label="Price (NZD) *" error={errors.price_nzd}>
            <div className="flex items-center bg-canvas border border-border rounded-xl overflow-hidden">
              <span className="px-3 text-text-subtle text-sm border-r border-border py-2.5">$</span>
              <input
                type="number"
                value={form.price_nzd}
                onChange={(e) => set('price_nzd', e.target.value)}
                placeholder="199.00"
                min="0"
                step="0.01"
                className="flex-1 bg-transparent px-3 py-2.5 text-text text-sm focus:outline-none"
              />
              <span className="px-3 text-text-subtle text-xs">NZD</span>
            </div>
          </ModalField>

          <ModalField label="Duration / sessions label (optional)" error={errors.duration_label}>
            <input
              type="text"
              value={form.duration_label}
              onChange={(e) => set('duration_label', e.target.value)}
              maxLength={45}
              placeholder="e.g. 12 weeks · 3 sessions/week"
              className="w-full bg-canvas border border-border rounded-xl px-4 py-2.5 text-text text-sm focus:outline-none"
            />
          </ModalField>

          <ModalField label="Button label (optional)" error={errors.cta_label}>
            <input
              type="text"
              value={form.cta_label}
              onChange={(e) => set('cta_label', e.target.value)}
              maxLength={35}
              placeholder="Book now"
              className="w-full bg-canvas border border-border rounded-xl px-4 py-2.5 text-text text-sm focus:outline-none"
            />
          </ModalField>

          <ModalField label="Link URL (optional — must be https://)" error={errors.cta_url}>
            <input
              type="url"
              value={form.cta_url}
              onChange={(e) => set('cta_url', e.target.value)}
              placeholder="https://your-booking-link.com"
              className="w-full bg-canvas border border-border rounded-xl px-4 py-2.5 text-text text-sm focus:outline-none"
            />
          </ModalField>

          {/* ── Promo section ────────────────────────────────────────── */}
          <div className="border-t border-border pt-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-text text-sm font-semibold">Promo offer</p>
                <p className="text-text-subtle text-xs mt-0.5">Show a badge on this package in the app</p>
              </div>
              {/* Toggle */}
              <button
                type="button"
                role="switch"
                aria-checked={form.promo_active}
                onClick={togglePromo}
                className="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none"
                style={{ backgroundColor: form.promo_active ? primary : 'var(--color-border)' }}
              >
                <span
                  className="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200"
                  style={{ transform: form.promo_active ? 'translateX(20px)' : 'translateX(0)' }}
                />
              </button>
            </div>

            {form.promo_active && (
              <div className="space-y-3">
                <ModalField label="Badge text *" error={errors.promo_label}>
                  <input
                    type="text"
                    value={form.promo_label}
                    onChange={(e) => set('promo_label', e.target.value)}
                    maxLength={45}
                    placeholder="e.g. BUY 10 GET 5 FREE"
                    className="w-full bg-canvas border border-border rounded-xl px-4 py-2.5 text-text text-sm font-mono uppercase focus:outline-none"
                  />
                </ModalField>

                <ModalField label="Promo description (optional)" error={errors.promo_description}>
                  <textarea
                    value={form.promo_description}
                    onChange={(e) => set('promo_description', e.target.value)}
                    rows={2}
                    maxLength={210}
                    placeholder="Extra detail shown under the badge…"
                    className="w-full bg-canvas border border-border rounded-xl px-4 py-2.5 text-text text-sm focus:outline-none resize-none"
                  />
                </ModalField>

                <div className="grid grid-cols-2 gap-3">
                  <ModalField label="Start date (optional)">
                    <input
                      type="datetime-local"
                      value={form.promo_starts_at}
                      onChange={(e) => set('promo_starts_at', e.target.value)}
                      className="w-full bg-canvas border border-border rounded-xl px-3 py-2.5 text-text text-xs focus:outline-none"
                    />
                  </ModalField>
                  <ModalField label="End date (optional)">
                    <input
                      type="datetime-local"
                      value={form.promo_ends_at}
                      onChange={(e) => set('promo_ends_at', e.target.value)}
                      className="w-full bg-canvas border border-border rounded-xl px-3 py-2.5 text-text text-xs focus:outline-none"
                    />
                  </ModalField>
                </div>

                <div className="rounded-xl bg-surface-alt border border-border px-3 py-2">
                  <p className="text-text-subtle text-xs">
                    <strong className="text-text-muted">Featured on carousel</strong> — controlled by Tyler from the admin view, not editable here.
                    {offering?.featured_on_carousel && (
                      <span className="ml-2 text-yellow-400 font-semibold">Currently featured</span>
                    )}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-medium text-text-muted border border-border hover:text-text transition-colors">Cancel</button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
              style={{ backgroundColor: primary, color: '#000000' }}
            >
              {saving ? 'Saving…' : offering ? 'Save changes' : 'Add package'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Delete confirm ─────────────────────────────────────────────────────────

function DeleteModal({ offering, onConfirm, onCancel }: { offering: PtOffering; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-surface rounded-2xl border border-border p-6">
        <h3 className="text-text font-bold text-base mb-2">Remove this package?</h3>
        <p className="text-text-muted text-sm mb-6">
          <strong className="text-text">{offering.label}</strong> will no longer show on your profile.
        </p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl text-sm font-medium text-text-muted border border-border hover:text-text transition-colors">Keep it</button>
          <button onClick={onConfirm} className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-red-500 text-white hover:bg-red-400 transition-colors">Remove</button>
        </div>
      </div>
    </div>
  );
}

// ── ModalField ─────────────────────────────────────────────────────────────

function ModalField({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-text-muted text-xs font-medium mb-1.5 uppercase tracking-wide">{label}</label>
      {children}
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function PackagesPage() {
  const { coachRow, isOrgAdmin } = useAuth();
  const { tenant } = useTenant();
  const primary = tenant?.primary_color ?? '#FFD600';

  const [offerings, setOfferings] = useState<PtOffering[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingOffering, setEditingOffering] = useState<PtOffering | null>(null);
  const [deletingOffering, setDeletingOffering] = useState<PtOffering | null>(null);
  const [reordering, setReordering] = useState(false);

  // Carousel conflict modal — shown when Tyler tries to feature a second package for the same PT
  const [carouselConflict, setCarouselConflict] = useState<{
    existingOffering: PtOffering;
    newOffering: PtOffering;
  } | null>(null);

  const fetchOfferings = useCallback(async () => {
    if (!coachRow) return;
    const { data, error } = await supabase
      .from('pt_offerings')
      .select('id, label, description, price_nzd, duration_label, cta_label, cta_url, display_order, is_active, featured_on_carousel, promo_label, promo_description, promo_active, promo_starts_at, promo_ends_at, created_at')
      .eq('coach_id', coachRow.id)
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[PackagesPage] fetch:', error);
      setToast({ message: 'Failed to load packages.', type: 'error' });
    } else {
      setOfferings((data ?? []) as PtOffering[]);
    }
    setLoading(false);
  }, [coachRow?.id]);

  useEffect(() => { fetchOfferings(); }, [fetchOfferings]);

  // Coach gallery photos — fetched read-only for the preview so /packages
  // shows the SAME full profile chrome as /profile (gallery section included).
  const [coachGalleryPhotos, setCoachGalleryPhotos] = useState<Array<{ id: string; public_url: string }>>([]);
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

  async function handleSaveOffering(form: OfferingFormState, offeringId: string | null) {
    if (!coachRow || !tenant) return;

    const payload = {
      coach_id: coachRow.id,
      api_client_id: tenant.api_client_id,
      label: form.label.trim(),
      description: form.description.trim() || null,
      price_nzd: parseFloat(form.price_nzd),
      duration_label: form.duration_label.trim() || null,
      cta_label: form.cta_label.trim() || null,
      cta_url: form.cta_url.trim() || null,
      // Promo fields — clear text when toggled off
      promo_active: form.promo_active,
      promo_label: form.promo_active ? (form.promo_label.trim() || null) : null,
      promo_description: form.promo_active ? (form.promo_description.trim() || null) : null,
      promo_starts_at: form.promo_active && form.promo_starts_at ? new Date(form.promo_starts_at).toISOString() : null,
      promo_ends_at: form.promo_active && form.promo_ends_at ? new Date(form.promo_ends_at).toISOString() : null,
    };

    if (offeringId) {
      const { error } = await supabase
        .from('pt_offerings')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', offeringId)
        .eq('coach_id', coachRow.id);
      if (error) { setToast({ message: 'Failed to save changes.', type: 'error' }); return; }
      setToast({ message: 'Package updated.', type: 'success' });
    } else {
      if (offerings.length >= MAX_PACKAGES) {
        setToast({ message: `You've reached the ${MAX_PACKAGES}-package limit.`, type: 'error' });
        return;
      }
      const nextOrder = offerings.length > 0 ? Math.max(...offerings.map((o) => o.display_order)) + 1 : 0;
      const { error } = await supabase.from('pt_offerings').insert({ ...payload, display_order: nextOrder });
      if (error) { setToast({ message: 'Failed to add package.', type: 'error' }); return; }
      setToast({ message: 'Package added.', type: 'success' });
    }

    setShowForm(false);
    setEditingOffering(null);
    fetchOfferings();
  }

  async function handleDelete() {
    if (!deletingOffering || !coachRow) return;
    const { error } = await supabase
      .from('pt_offerings')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', deletingOffering.id)
      .eq('coach_id', coachRow.id);

    if (error) {
      setToast({ message: 'Failed to remove package.', type: 'error' });
    } else {
      setToast({ message: 'Package removed.', type: 'success' });
      setOfferings((prev) => prev.filter((o) => o.id !== deletingOffering.id));
    }
    setDeletingOffering(null);
  }

  async function moveOffering(offering: PtOffering, direction: 'up' | 'down') {
    const idx = offerings.findIndex((o) => o.id === offering.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= offerings.length) return;

    const updated = [...offerings];
    const tempOrder = updated[idx].display_order;
    updated[idx] = { ...updated[idx], display_order: updated[swapIdx].display_order };
    updated[swapIdx] = { ...updated[swapIdx], display_order: tempOrder };
    updated.sort((a, b) => a.display_order - b.display_order);

    setOfferings(updated);
    setReordering(true);

    // Persist the two swapped rows
    await Promise.all([
      supabase.from('pt_offerings').update({ display_order: updated[swapIdx < idx ? idx : swapIdx].display_order }).eq('id', updated[swapIdx < idx ? idx : swapIdx].id),
      supabase.from('pt_offerings').update({ display_order: updated[swapIdx < idx ? swapIdx : idx].display_order }).eq('id', updated[swapIdx < idx ? swapIdx : idx].id),
    ]);

    setReordering(false);
  }

  /**
   * handleToggleFeatured — called when Tyler clicks the carousel toggle on a package.
   *
   * If the target offering is currently featured, just un-feature it (simple PATCH).
   * If it's currently not featured, check whether this coach already has another
   * featured offering. If yes → show CarouselConflictModal. If no → PATCH directly.
   *
   * The soft warning (not a DB constraint) matches Walter's spec: "Only one package per PT
   * should be featured. Featuring multiple packages stacks them on the carousel."
   */
  async function handleToggleFeatured(offering: PtOffering) {
    if (!isOrgAdmin) return;

    const newValue = !offering.featured_on_carousel;

    // Un-featuring: simple PATCH, no conflict check needed
    if (!newValue) {
      await applyFeaturedToggle(offering, false);
      return;
    }

    // Featuring: check for existing featured package for the same coach
    const existingFeatured = offerings.find(
      (o) => o.id !== offering.id && o.featured_on_carousel
    );

    if (existingFeatured) {
      // Show conflict modal — let Tyler decide
      setCarouselConflict({ existingOffering: existingFeatured, newOffering: offering });
    } else {
      await applyFeaturedToggle(offering, true);
    }
  }

  /** Actually PATCH the featured_on_carousel value, optionally clearing the previous one first. */
  async function applyFeaturedToggle(offering: PtOffering, newValue: boolean, replacingId?: string) {
    const result1 = await supabase
      .from('pt_offerings')
      .update({ featured_on_carousel: newValue, updated_at: new Date().toISOString() })
      .eq('id', offering.id);

    let result2: { error: any } | null = null;
    if (replacingId) {
      result2 = await supabase
        .from('pt_offerings')
        .update({ featured_on_carousel: false, updated_at: new Date().toISOString() })
        .eq('id', replacingId);
    }

    const hasError = !!result1.error || !!result2?.error;

    if (hasError) {
      setToast({ message: 'Failed to update carousel status.', type: 'error' });
    } else {
      setToast({
        message: newValue ? 'Package featured on home carousel.' : 'Package removed from carousel.',
        type: 'success',
      });
      fetchOfferings();
    }
    setCarouselConflict(null);
  }

  return (
    <PortalLayout>
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}

      {(showForm || editingOffering) && (
        <PackageFormModal
          offering={editingOffering}
          onClose={() => { setShowForm(false); setEditingOffering(null); }}
          onSave={handleSaveOffering}
          primary={primary}
        />
      )}

      {deletingOffering && (
        <DeleteModal
          offering={deletingOffering}
          onConfirm={handleDelete}
          onCancel={() => setDeletingOffering(null)}
        />
      )}

      {carouselConflict && (
        <CarouselConflictModal
          existingLabel={carouselConflict.existingOffering.label}
          newLabel={carouselConflict.newOffering.label}
          primary={primary}
          onConfirm={() =>
            applyFeaturedToggle(
              carouselConflict.newOffering,
              true,
              carouselConflict.existingOffering.id
            )
          }
          onCancel={() => setCarouselConflict(null)}
        />
      )}

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Split-panel layout: editor on the left, live mobile preview on the right
            (matches /profile and /photos for consistent visual scale + chrome) */}
        <div className="flex gap-8 items-start">
          <div className="flex-1 min-w-0">
        {/* Heading */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-text text-2xl font-bold">My Packages</h1>
            <p className="text-text-muted text-sm mt-0.5">
              {offerings.length > 0
                ? `${offerings.length} package${offerings.length !== 1 ? 's' : ''} · use the arrows to reorder`
                : 'No packages yet'}
            </p>
          </div>
          {offerings.length > 0 && offerings.length < MAX_PACKAGES && (
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2 rounded-xl font-semibold text-sm"
              style={{ backgroundColor: primary, color: '#000000' }}
            >
              + Add package
            </button>
          )}
        </div>

        {/* Soft warning — carousel feature limit (org_admin only) */}
        {isOrgAdmin && offerings.length > 0 && (
          <div className="mb-4 rounded-xl bg-surface-alt border border-border px-4 py-2.5 flex items-start gap-2">
            <span className="text-text-muted text-xs mt-0.5">ℹ</span>
            <p className="text-text-muted text-xs leading-relaxed">
              <strong className="text-text">Carousel tip:</strong> Only one package per PT should be featured on the home carousel at a time. Use the toggle on each package to control what members see.
            </p>
          </div>
        )}

        {/* Reordering indicator */}
        {reordering && (
          <div className="mb-3 flex items-center gap-2 text-text-muted text-xs">
            <div className="w-3 h-3 border border-border border-t-primary rounded-full animate-spin" />
            Saving order…
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-6 h-6 border-2 border-border border-t-primary rounded-full animate-spin" />
          </div>
        ) : offerings.length === 0 ? (
          <EmptyPackages onAdd={() => setShowForm(true)} primary={primary} />
        ) : (
          <div className="space-y-3">
            {offerings.map((o, idx) => (
              <PackageCard
                key={o.id}
                offering={o}
                primary={primary}
                isFirst={idx === 0}
                isLast={idx === offerings.length - 1}
                isOrgAdmin={isOrgAdmin}
                onEdit={(offering) => setEditingOffering(offering)}
                onDelete={(offering) => setDeletingOffering(offering)}
                onMoveUp={(offering) => moveOffering(offering, 'up')}
                onMoveDown={(offering) => moveOffering(offering, 'down')}
                onToggleFeatured={handleToggleFeatured}
              />
            ))}
            {offerings.length >= MAX_PACKAGES && (
              <div className="bg-surface border border-border rounded-2xl p-4 text-center">
                <p className="text-text-muted text-sm">
                  You've reached the {MAX_PACKAGES}-package limit.
                </p>
              </div>
            )}
          </div>
        )}
          </div>

          {/* Right column: live mobile preview — same PreviewPanel as /profile.
              Only the packages section reflects live edits; everything else
              shows the saved coachRow data (read-only context). */}
          <PreviewPanel
            formData={buildPreviewDataFromCoachRow(coachRow, {
              packages: offerings.map(
                (o): PreviewPackage => ({
                  id: o.id,
                  title: o.label,
                  price: o.price_nzd,
                  duration: o.duration_label,
                  promo_label: o.promo_label,
                  promo_active: o.promo_active,
                  promo_starts_at: o.promo_starts_at,
                  promo_ends_at: o.promo_ends_at,
                  featured: o.featured_on_carousel,
                }),
              ),
              // Pass saved gallery photos too so the preview shows the SAME
              // full profile as /profile — only packages section is live here.
              gallery_photos: coachGalleryPhotos,
            })}
          />
        </div>
      </div>
    </PortalLayout>
  );
}
