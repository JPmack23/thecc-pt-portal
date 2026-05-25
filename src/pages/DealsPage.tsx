/**
 * DealsPage — Issue #14
 *
 * PT can see, add, edit, and delete their deals.
 *
 * Data: read/write to `pt_deals` table via Supabase JS client (RLS scoped to coach_id).
 * Soft delete: sets is_active = false, deleted_at = now().
 *
 * Layout: list view → slide-in form (add / edit).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import { supabase } from '../lib/supabase';
import { PortalLayout } from '../components/PortalLayout';

// ── Types ──────────────────────────────────────────────────────────────────

interface PtDeal {
  id: string;
  title: string;
  description: string;
  discount_type: 'percentage' | 'fixed_nzd';
  discount_value: number;
  how_to_redeem: string;
  redemption_code: string | null;
  hero_image_url: string | null;
  expires_at: string | null;
  featured_on_house_carousel: boolean;
  is_active: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

interface DealFormState {
  title: string;
  description: string;
  discount_type: 'percentage' | 'fixed_nzd';
  discount_value: string;
  how_to_redeem: string;
  redemption_code: string;
  expires_at: string;
  hero_image_url: string | null;
  hero_image_file: File | null;
  hero_image_local_url: string | null;
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

function EmptyDeals({ onAdd, primary }: { onAdd: () => void; primary: string }) {
  return (
    <div className="text-center py-20">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4"
        style={{ backgroundColor: primary + '15' }}
      >
        🏷
      </div>
      <h3 className="text-text font-semibold text-lg mb-2">No deals yet</h3>
      <p className="text-text-muted text-sm mb-6 max-w-xs mx-auto">
        Add your first deal to share exclusive offers with your clients.
      </p>
      <button
        onClick={onAdd}
        className="px-5 py-2.5 rounded-xl font-semibold text-sm"
        style={{ backgroundColor: primary, color: '#000000' }}
      >
        Add your first deal
      </button>
    </div>
  );
}

// ── Deal card ──────────────────────────────────────────────────────────────

function DealCard({
  deal,
  primary,
  onEdit,
  onDelete,
}: {
  deal: PtDeal;
  primary: string;
  onEdit: (deal: PtDeal) => void;
  onDelete: (deal: PtDeal) => void;
}) {
  const discountLabel = deal.discount_type === 'percentage'
    ? `${deal.discount_value}% off`
    : `$${deal.discount_value.toFixed(2)} NZD off`;

  const isExpired = deal.expires_at ? new Date(deal.expires_at) < new Date() : false;
  const status = deal.deleted_at ? 'removed' : isExpired ? 'expired' : 'active';

  const statusColors = {
    active: { bg: '#22c55e20', text: '#22c55e' },
    expired: { bg: '#f59e0b20', text: '#f59e0b' },
    removed: { bg: '#ef444420', text: '#ef4444' },
  };
  const sc = statusColors[status];

  return (
    <div className="bg-surface border border-border rounded-2xl p-5 flex gap-4 items-start">
      {/* Hero thumb */}
      <div
        className="w-14 h-14 rounded-xl flex-shrink-0 overflow-hidden bg-surface-alt flex items-center justify-center text-xl"
        style={{ border: `1px solid var(--color-border)` }}
      >
        {deal.hero_image_url ? (
          <img src={deal.hero_image_url} alt={deal.title} className="w-full h-full object-cover" />
        ) : (
          <span style={{ color: primary }}>🏷</span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="text-text font-semibold text-sm truncate">{deal.title}</h3>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {deal.featured_on_house_carousel && (
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{ backgroundColor: primary + '20', color: primary }}
              >
                ★ Featured
              </span>
            )}
            <span
              className="text-xs font-semibold px-2 py-0.5 rounded-full capitalize"
              style={{ backgroundColor: sc.bg, color: sc.text }}
            >
              {status}
            </span>
          </div>
        </div>

        <p className="text-text-muted text-xs mb-2 line-clamp-2">{deal.description}</p>
        <p className="text-xs font-semibold" style={{ color: primary }}>{discountLabel}</p>

        {deal.expires_at && (
          <p className="text-text-subtle text-xs mt-1">
            Expires {new Date(deal.expires_at).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        )}
      </div>

      {/* Actions */}
      {!deal.deleted_at && (
        <div className="flex flex-col gap-1 flex-shrink-0">
          <button
            onClick={() => onEdit(deal)}
            className="text-text-muted hover:text-text text-xs px-2 py-1 rounded-lg hover:bg-surface-alt transition-colors"
          >
            Edit
          </button>
          <button
            onClick={() => onDelete(deal)}
            className="text-red-400 hover:text-red-300 text-xs px-2 py-1 rounded-lg hover:bg-surface-alt transition-colors"
          >
            Remove
          </button>
        </div>
      )}
    </div>
  );
}

// ── Deal form modal ────────────────────────────────────────────────────────

const EMPTY_FORM: DealFormState = {
  title: '',
  description: '',
  discount_type: 'percentage',
  discount_value: '',
  how_to_redeem: '',
  redemption_code: '',
  expires_at: '',
  hero_image_url: null,
  hero_image_file: null,
  hero_image_local_url: null,
};

function DealFormModal({
  deal,
  onClose,
  onSave,
  primary,
}: {
  deal: PtDeal | null;
  onClose: () => void;
  onSave: (form: DealFormState, dealId: string | null) => Promise<void>;
  primary: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<DealFormState>(
    deal
      ? {
          title: deal.title,
          description: deal.description,
          discount_type: deal.discount_type,
          discount_value: String(deal.discount_value),
          how_to_redeem: deal.how_to_redeem,
          redemption_code: deal.redemption_code ?? '',
          expires_at: deal.expires_at ? deal.expires_at.slice(0, 10) : '',
          hero_image_url: deal.hero_image_url,
          hero_image_file: null,
          hero_image_local_url: null,
        }
      : EMPTY_FORM,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  function set<K extends keyof DealFormState>(key: K, value: DealFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => { const n = { ...prev }; delete n[key]; return n; });
  }

  function handleHeroChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setErrors((p) => ({ ...p, hero: 'Image must be under 10MB.' })); return; }
    const localUrl = URL.createObjectURL(file);
    setForm((prev) => ({ ...prev, hero_image_file: file, hero_image_local_url: localUrl }));
    setErrors((p) => { const n = { ...p }; delete n.hero; return n; });
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.title.trim()) e.title = 'Title is required.';
    else if (form.title.length > 60) e.title = 'Max 60 characters.';
    if (!form.description.trim()) e.description = 'Description is required.';
    else if (form.description.length > 400) e.description = 'Max 400 characters.';
    const val = parseFloat(form.discount_value);
    if (!form.discount_value || isNaN(val) || val <= 0) e.discount_value = 'Enter a valid amount greater than 0.';
    if (form.discount_type === 'percentage' && val > 100) e.discount_value = 'Percentage cannot exceed 100.';
    if (!form.how_to_redeem.trim()) e.how_to_redeem = 'How to redeem is required.';
    else if (form.how_to_redeem.length > 200) e.how_to_redeem = 'Max 200 characters.';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    await onSave(form, deal?.id ?? null);
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full sm:max-w-lg bg-surface rounded-t-3xl sm:rounded-2xl border border-border max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-surface z-10">
          <h2 className="text-text font-bold text-base">{deal ? 'Edit deal' : 'Add a deal'}</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <ModalField label="Deal title *" error={errors.title}>
            <input
              type="text"
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              maxLength={70}
              placeholder="e.g. 20% off all programmes"
              className="w-full bg-canvas border border-border rounded-xl px-4 py-2.5 text-text text-sm focus:outline-none"
            />
            <p className="text-text-subtle text-xs mt-0.5">{form.title.length}/60 chars</p>
          </ModalField>

          <ModalField label="Description *" error={errors.description}>
            <textarea
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              rows={3}
              maxLength={420}
              placeholder="What's included, who it's for, any key details…"
              className="w-full bg-canvas border border-border rounded-xl px-4 py-2.5 text-text text-sm focus:outline-none resize-none"
            />
            <p className="text-text-subtle text-xs mt-0.5">{form.description.length}/400 chars</p>
          </ModalField>

          {/* Discount */}
          <ModalField label="Discount *" error={errors.discount_value}>
            <div className="flex gap-2">
              <select
                value={form.discount_type}
                onChange={(e) => set('discount_type', e.target.value as 'percentage' | 'fixed_nzd')}
                className="bg-canvas border border-border rounded-xl px-3 py-2.5 text-text text-sm focus:outline-none"
              >
                <option value="percentage">% off</option>
                <option value="fixed_nzd">NZD $ off</option>
              </select>
              <input
                type="number"
                value={form.discount_value}
                onChange={(e) => set('discount_value', e.target.value)}
                placeholder={form.discount_type === 'percentage' ? '20' : '50.00'}
                min="0.01"
                step="0.01"
                className="flex-1 bg-canvas border border-border rounded-xl px-4 py-2.5 text-text text-sm focus:outline-none"
              />
            </div>
          </ModalField>

          <ModalField label="How to redeem *" error={errors.how_to_redeem}>
            <input
              type="text"
              value={form.how_to_redeem}
              onChange={(e) => set('how_to_redeem', e.target.value)}
              maxLength={210}
              placeholder="e.g. DM me on Instagram or email me to get started"
              className="w-full bg-canvas border border-border rounded-xl px-4 py-2.5 text-text text-sm focus:outline-none"
            />
          </ModalField>

          <ModalField label="Coupon code (optional)">
            <input
              type="text"
              value={form.redemption_code}
              onChange={(e) => set('redemption_code', e.target.value)}
              placeholder="e.g. COACH20"
              className="w-full bg-canvas border border-border rounded-xl px-4 py-2.5 text-text text-sm focus:outline-none font-mono"
            />
          </ModalField>

          <ModalField label="Expiry date (optional)">
            <input
              type="date"
              value={form.expires_at}
              onChange={(e) => set('expires_at', e.target.value)}
              min={new Date().toISOString().slice(0, 10)}
              className="w-full bg-canvas border border-border rounded-xl px-4 py-2.5 text-text text-sm focus:outline-none"
            />
          </ModalField>

          {/* Hero image */}
          <ModalField label="Hero image (optional)" error={errors.hero}>
            <div className="flex items-center gap-3">
              {(form.hero_image_local_url ?? form.hero_image_url) && (
                <img
                  src={form.hero_image_local_url ?? form.hero_image_url!}
                  alt="Deal hero"
                  className="w-16 h-10 rounded-lg object-cover border border-border"
                />
              )}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-2 text-xs font-medium border border-border rounded-lg text-text-muted hover:text-text transition-colors"
              >
                {form.hero_image_url || form.hero_image_local_url ? 'Change image' : 'Upload image'}
              </button>
            </div>
            <p className="text-text-subtle text-xs mt-1">1200×630px recommended · max 10MB</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleHeroChange}
              className="hidden"
            />
          </ModalField>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-medium text-text-muted border border-border hover:text-text transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
              style={{ backgroundColor: primary, color: '#000000' }}
            >
              {saving ? 'Saving…' : deal ? 'Save changes' : 'Publish deal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Confirm delete modal ───────────────────────────────────────────────────

function DeleteModal({ deal, onConfirm, onCancel }: { deal: PtDeal; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-surface rounded-2xl border border-border p-6">
        <h3 className="text-text font-bold text-base mb-2">Remove this deal?</h3>
        <p className="text-text-muted text-sm mb-6">
          <strong className="text-text">{deal.title}</strong> — Your clients will no longer see it.
          {deal.featured_on_house_carousel && (
            <span className="block mt-2 text-yellow-400 text-xs">This deal is currently featured on the carousel — removing it will take it off immediately.</span>
          )}
        </p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl text-sm font-medium text-text-muted border border-border hover:text-text transition-colors">Keep it</button>
          <button onClick={onConfirm} className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-red-500 text-white hover:bg-red-400 transition-colors">Remove</button>
        </div>
      </div>
    </div>
  );
}

// ── ModalField helper ──────────────────────────────────────────────────────

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

export default function DealsPage() {
  const { coachRow } = useAuth();
  const { tenant } = useTenant();
  const primary = tenant?.primary_color ?? '#FFD600';

  const [deals, setDeals] = useState<PtDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingDeal, setEditingDeal] = useState<PtDeal | null>(null);
  const [deletingDeal, setDeletingDeal] = useState<PtDeal | null>(null);

  const MAX_DEALS = 50;

  const fetchDeals = useCallback(async () => {
    if (!coachRow) return;
    const { data, error } = await supabase
      .from('pt_deals')
      .select('*')
      .eq('coach_id', coachRow.id)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('[DealsPage] fetch error:', error);
      setToast({ message: 'Failed to load deals.', type: 'error' });
    } else {
      setDeals((data ?? []) as PtDeal[]);
    }
    setLoading(false);
  }, [coachRow?.id]);

  useEffect(() => { fetchDeals(); }, [fetchDeals]);

  async function uploadHeroImage(file: File, dealId: string): Promise<string | null> {
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `deal-heroes/${coachRow!.id}/${dealId}.${ext}`;
    const { error } = await supabase.storage.from('assets').upload(path, file, { upsert: true, contentType: file.type });
    if (error) { console.error('[DealsPage] hero upload:', error); return null; }
    const { data } = supabase.storage.from('assets').getPublicUrl(path);
    return data.publicUrl;
  }

  async function handleSaveDeal(form: DealFormState, dealId: string | null) {
    if (!coachRow || !tenant) return;

    let heroUrl = form.hero_image_url;
    const targetId = dealId ?? crypto.randomUUID();

    if (form.hero_image_file) {
      const uploaded = await uploadHeroImage(form.hero_image_file, targetId);
      if (uploaded) {
        heroUrl = uploaded;
        if (form.hero_image_local_url) URL.revokeObjectURL(form.hero_image_local_url);
      }
    }

    const payload = {
      coach_id: coachRow.id,
      api_client_id: tenant.api_client_id,
      title: form.title.trim(),
      description: form.description.trim(),
      discount_type: form.discount_type,
      discount_value: parseFloat(form.discount_value),
      how_to_redeem: form.how_to_redeem.trim(),
      redemption_code: form.redemption_code.trim() || null,
      expires_at: form.expires_at || null,
      hero_image_url: heroUrl,
      updated_at: new Date().toISOString(),
    };

    if (dealId) {
      const { error } = await supabase.from('pt_deals').update(payload).eq('id', dealId).eq('coach_id', coachRow.id);
      if (error) { setToast({ message: 'Failed to save changes.', type: 'error' }); return; }
      setToast({ message: 'Deal updated.', type: 'success' });
    } else {
      if (deals.length >= MAX_DEALS) {
        setToast({ message: `You've reached the ${MAX_DEALS}-deal limit. Remove an existing deal to add a new one.`, type: 'error' });
        return;
      }
      const { error } = await supabase.from('pt_deals').insert({ ...payload, id: targetId });
      if (error) { setToast({ message: 'Failed to publish deal.', type: 'error' }); return; }
      setToast({ message: 'Deal published. Tyler has been notified.', type: 'success' });
    }

    setShowForm(false);
    setEditingDeal(null);
    fetchDeals();
  }

  async function handleDelete() {
    if (!deletingDeal || !coachRow) return;
    const { error } = await supabase
      .from('pt_deals')
      .update({
        is_active: false,
        deleted_at: new Date().toISOString(),
        featured_on_house_carousel: false,
      })
      .eq('id', deletingDeal.id)
      .eq('coach_id', coachRow.id);

    if (error) {
      setToast({ message: 'Failed to remove deal.', type: 'error' });
    } else {
      setToast({ message: 'Deal removed.', type: 'success' });
      setDeals((prev) => prev.filter((d) => d.id !== deletingDeal.id));
    }
    setDeletingDeal(null);
  }

  return (
    <PortalLayout>
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}

      {(showForm || editingDeal) && (
        <DealFormModal
          deal={editingDeal}
          onClose={() => { setShowForm(false); setEditingDeal(null); }}
          onSave={handleSaveDeal}
          primary={primary}
        />
      )}

      {deletingDeal && (
        <DeleteModal
          deal={deletingDeal}
          onConfirm={handleDelete}
          onCancel={() => setDeletingDeal(null)}
        />
      )}

      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Heading row */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-text text-2xl font-bold">My Deals</h1>
            <p className="text-text-muted text-sm mt-0.5">
              {deals.length > 0 ? `${deals.length} active deal${deals.length !== 1 ? 's' : ''}` : 'No deals yet'}
            </p>
          </div>
          {deals.length > 0 && deals.length < MAX_DEALS && (
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2 rounded-xl font-semibold text-sm"
              style={{ backgroundColor: primary, color: '#000000' }}
            >
              + Add deal
            </button>
          )}
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-6 h-6 border-2 border-border border-t-primary rounded-full animate-spin" />
          </div>
        ) : deals.length === 0 ? (
          <EmptyDeals onAdd={() => setShowForm(true)} primary={primary} />
        ) : (
          <div className="space-y-3">
            {deals.map((deal) => (
              <DealCard
                key={deal.id}
                deal={deal}
                primary={primary}
                onEdit={(d) => setEditingDeal(d)}
                onDelete={(d) => setDeletingDeal(d)}
              />
            ))}
            {deals.length >= MAX_DEALS && (
              <div className="bg-surface border border-border rounded-2xl p-4 text-center">
                <p className="text-text-muted text-sm">
                  You've reached the {MAX_DEALS}-deal limit. Remove an existing deal to add a new one.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </PortalLayout>
  );
}
