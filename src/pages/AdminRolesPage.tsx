/**
 * AdminRolesPage — /admin/roles
 *
 * Gated to organisation_admin users (Tyler for THECC+).
 * Lets the org admin manage the coach_roles list for their tenant:
 *   - View all roles (active + inactive)
 *   - Add a new role (label + sort_order)
 *   - Edit an existing role (rename, change sort_order)
 *   - Toggle is_active (soft-delete) with confirmation if the role has assignments
 *   - Reorder via up/down arrows (updates sort_order)
 *
 * Data flow:
 *   - Loads from coach_roles WHERE api_client_id = tenant.api_client_id
 *   - Mutations go directly via Supabase JS (RLS: organisation_admin policy)
 *   - Assignment count shown for each role (used for deactivation warning)
 *
 * Added 2026-05-25 (coach-roles feature, Issue #16-db-roles).
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useTenant } from '../contexts/TenantContext';
import { supabase } from '../lib/supabase';
import { PortalLayout } from '../components/PortalLayout';

// ── Types ──────────────────────────────────────────────────────────────────

interface CoachRole {
  id: string;
  label: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

// ── Toast ─────────────────────────────────────────────────────────────────

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

// ── Confirm dialog ────────────────────────────────────────────────────────

function ConfirmDialog({
  message,
  onConfirm,
  onCancel,
  primary,
}: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  primary: string;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-surface rounded-2xl border border-border p-6 max-w-sm w-full space-y-4 shadow-xl">
        <p className="text-text text-sm leading-relaxed">{message}</p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-sm font-medium border border-border text-text-muted hover:text-text transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-xl text-sm font-semibold"
            style={{ backgroundColor: primary, color: '#000000' }}
          >
            Deactivate
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function AdminRolesPage() {
  const { tenant } = useTenant();
  const primary = tenant?.primary_color ?? '#FFD600';

  const [roles, setRoles] = useState<CoachRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null); // role id being saved
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<{ role: CoachRole; assignmentCount: number } | null>(null);

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editSortOrder, setEditSortOrder] = useState(0);

  // Add new role state
  const [addingNew, setAddingNew] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newSortOrder, setNewSortOrder] = useState(0);
  const [addError, setAddError] = useState('');

  const fetchRoles = useCallback(async () => {
    if (!tenant?.api_client_id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('coach_roles')
      .select('id, label, sort_order, is_active, created_at')
      .eq('api_client_id', tenant.api_client_id)
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('[AdminRolesPage] fetch error:', error);
      setToast({ message: 'Could not load roles. Please refresh.', type: 'error' });
    } else {
      setRoles(data ?? []);
    }
    setLoading(false);
  }, [tenant?.api_client_id]);

  useEffect(() => { fetchRoles(); }, [fetchRoles]);

  // ── Helpers ──────────────────────────────────────────────────────────────

  async function getAssignmentCount(roleId: string): Promise<number> {
    const { count } = await supabase
      .from('coach_role_assignments')
      .select('*', { count: 'exact', head: true })
      .eq('coach_role_id', roleId);
    return count ?? 0;
  }

  // ── Add new role ──────────────────────────────────────────────────────────

  async function handleAddRole() {
    const label = newLabel.trim();
    if (!label) { setAddError('Label is required.'); return; }
    if (label.length > 80) { setAddError('Max 80 characters.'); return; }
    if (roles.some((r) => r.label.toLowerCase() === label.toLowerCase())) {
      setAddError('A role with that name already exists.');
      return;
    }

    setSaving('new');
    const { error } = await supabase
      .from('coach_roles')
      .insert({
        api_client_id: tenant!.api_client_id,
        label,
        sort_order: newSortOrder,
        is_active: true,
      });

    if (error) {
      console.error('[AdminRolesPage] add error:', error);
      setToast({ message: 'Failed to add role. Please try again.', type: 'error' });
    } else {
      setToast({ message: `"${label}" added.`, type: 'success' });
      setNewLabel('');
      setNewSortOrder(0);
      setAddingNew(false);
      setAddError('');
      await fetchRoles();
    }
    setSaving(null);
  }

  // ── Edit existing role ────────────────────────────────────────────────────

  function startEdit(role: CoachRole) {
    setEditingId(role.id);
    setEditLabel(role.label);
    setEditSortOrder(role.sort_order);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditLabel('');
    setEditSortOrder(0);
  }

  async function saveEdit(role: CoachRole) {
    const label = editLabel.trim();
    if (!label) return;
    if (
      roles.some(
        (r) => r.id !== role.id && r.label.toLowerCase() === label.toLowerCase()
      )
    ) {
      setToast({ message: 'Another role already has that name.', type: 'error' });
      return;
    }

    setSaving(role.id);
    const { error } = await supabase
      .from('coach_roles')
      .update({ label, sort_order: editSortOrder, updated_at: new Date().toISOString() })
      .eq('id', role.id);

    if (error) {
      console.error('[AdminRolesPage] edit error:', error);
      setToast({ message: 'Failed to save changes.', type: 'error' });
    } else {
      setToast({ message: 'Role updated.', type: 'success' });
      cancelEdit();
      await fetchRoles();
    }
    setSaving(null);
  }

  // ── Toggle active (soft-delete) ───────────────────────────────────────────

  async function handleToggleActive(role: CoachRole) {
    if (role.is_active) {
      // Deactivating — check for assignments first
      const count = await getAssignmentCount(role.id);
      if (count > 0) {
        setConfirmDeactivate({ role, assignmentCount: count });
        return;
      }
    }
    await commitToggleActive(role);
  }

  async function commitToggleActive(role: CoachRole) {
    setSaving(role.id);
    const { error } = await supabase
      .from('coach_roles')
      .update({ is_active: !role.is_active, updated_at: new Date().toISOString() })
      .eq('id', role.id);

    if (error) {
      console.error('[AdminRolesPage] toggle error:', error);
      setToast({ message: 'Failed to update role status.', type: 'error' });
    } else {
      setToast({
        message: role.is_active ? `"${role.label}" deactivated.` : `"${role.label}" reactivated.`,
        type: 'success',
      });
      await fetchRoles();
    }
    setSaving(null);
    setConfirmDeactivate(null);
  }

  // ── Reorder via up/down ───────────────────────────────────────────────────

  async function moveRole(role: CoachRole, direction: 'up' | 'down') {
    const active = roles.filter((r) => r.is_active);
    const idx = active.findIndex((r) => r.id === role.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= active.length) return;

    const swapRole = active[swapIdx];
    setSaving(role.id);

    // Swap sort_orders
    const [err1, err2] = await Promise.all([
      supabase
        .from('coach_roles')
        .update({ sort_order: swapRole.sort_order, updated_at: new Date().toISOString() })
        .eq('id', role.id),
      supabase
        .from('coach_roles')
        .update({ sort_order: role.sort_order, updated_at: new Date().toISOString() })
        .eq('id', swapRole.id),
    ]).then(([a, b]) => [a.error, b.error]);

    if (err1 || err2) {
      setToast({ message: 'Reorder failed. Please try again.', type: 'error' });
    } else {
      await fetchRoles();
    }
    setSaving(null);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const activeRoles = roles.filter((r) => r.is_active);
  const inactiveRoles = roles.filter((r) => !r.is_active);

  return (
    <PortalLayout>
      {toast && (
        <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
      )}

      {confirmDeactivate && (
        <ConfirmDialog
          message={`"${confirmDeactivate.role.label}" is currently assigned to ${confirmDeactivate.assignmentCount} coach${confirmDeactivate.assignmentCount !== 1 ? 'es' : ''}. Deactivating it will hide it from the role picker but will not remove existing assignments. Continue?`}
          onConfirm={() => commitToggleActive(confirmDeactivate.role)}
          onCancel={() => setConfirmDeactivate(null)}
          primary={primary}
        />
      )}

      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Page heading */}
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-text text-2xl font-bold">Manage Roles</h1>
            <p className="text-text-muted text-sm mt-1">
              Control the role options coaches can pick from on their profile.
            </p>
          </div>
          <button
            onClick={() => { setAddingNew(true); setNewSortOrder(activeRoles.length); }}
            className="flex-shrink-0 px-4 py-2 rounded-xl text-sm font-semibold"
            style={{ backgroundColor: primary, color: '#000000' }}
          >
            + Add role
          </button>
        </div>

        {/* Add new role panel */}
        {addingNew && (
          <div className="bg-surface rounded-2xl border border-border p-5 mb-6 space-y-4">
            <h3 className="text-text text-sm font-semibold uppercase tracking-wide">New role</h3>
            <div className="space-y-3">
              <div>
                <label className="text-text-muted text-xs font-medium uppercase tracking-wide block mb-1">
                  Label <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={newLabel}
                  onChange={(e) => { setNewLabel(e.target.value); setAddError(''); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddRole(); } }}
                  placeholder="e.g. Powerlifting Coach"
                  maxLength={80}
                  autoFocus
                  className="w-full bg-surface-alt border border-border rounded-xl px-4 py-3 text-text text-sm focus:outline-none focus:ring-2"
                  style={{ '--tw-ring-color': primary } as React.CSSProperties}
                />
                {addError && <p className="text-red-400 text-xs mt-1">{addError}</p>}
              </div>
              <div>
                <label className="text-text-muted text-xs font-medium uppercase tracking-wide block mb-1">
                  Sort order
                </label>
                <input
                  type="number"
                  value={newSortOrder}
                  onChange={(e) => setNewSortOrder(Number(e.target.value))}
                  min={0}
                  className="w-28 bg-surface-alt border border-border rounded-xl px-4 py-3 text-text text-sm focus:outline-none focus:ring-2"
                  style={{ '--tw-ring-color': primary } as React.CSSProperties}
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleAddRole}
                disabled={saving === 'new'}
                className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50"
                style={{ backgroundColor: primary, color: '#000000' }}
              >
                {saving === 'new' ? 'Adding…' : 'Add role'}
              </button>
              <button
                onClick={() => { setAddingNew(false); setNewLabel(''); setAddError(''); }}
                className="px-4 py-2 rounded-xl text-sm font-medium border border-border text-text-muted hover:text-text transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Active roles list */}
        <div className="bg-surface rounded-2xl border border-border overflow-hidden mb-6">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-text text-sm font-semibold uppercase tracking-wide">
              Active roles <span className="text-text-subtle font-normal normal-case">({activeRoles.length})</span>
            </h2>
          </div>

          {loading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 rounded-xl bg-surface-alt animate-pulse" />
              ))}
            </div>
          ) : activeRoles.length === 0 ? (
            <p className="text-text-subtle text-sm p-6">No active roles yet. Add one above.</p>
          ) : (
            <ul className="divide-y divide-border">
              {activeRoles.map((role, idx) => (
                <li key={role.id} className="px-5 py-4 flex items-center gap-3">
                  {/* Up/down reorder arrows */}
                  <div className="flex flex-col gap-0.5 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => moveRole(role, 'up')}
                      disabled={idx === 0 || saving === role.id}
                      className="w-6 h-6 flex items-center justify-center rounded text-text-subtle hover:text-text disabled:opacity-20 transition-colors text-xs"
                      title="Move up"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => moveRole(role, 'down')}
                      disabled={idx === activeRoles.length - 1 || saving === role.id}
                      className="w-6 h-6 flex items-center justify-center rounded text-text-subtle hover:text-text disabled:opacity-20 transition-colors text-xs"
                      title="Move down"
                    >
                      ▼
                    </button>
                  </div>

                  {/* Role label / edit inline */}
                  {editingId === role.id ? (
                    <div className="flex-1 flex items-center gap-2">
                      <input
                        type="text"
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); saveEdit(role); }
                          if (e.key === 'Escape') cancelEdit();
                        }}
                        maxLength={80}
                        autoFocus
                        className="flex-1 bg-surface-alt border border-border rounded-lg px-3 py-1.5 text-text text-sm focus:outline-none focus:ring-2"
                        style={{ '--tw-ring-color': primary } as React.CSSProperties}
                      />
                      <input
                        type="number"
                        value={editSortOrder}
                        onChange={(e) => setEditSortOrder(Number(e.target.value))}
                        min={0}
                        className="w-16 bg-surface-alt border border-border rounded-lg px-2 py-1.5 text-text text-xs focus:outline-none focus:ring-2"
                        style={{ '--tw-ring-color': primary } as React.CSSProperties}
                        title="Sort order"
                      />
                      <button
                        onClick={() => saveEdit(role)}
                        disabled={saving === role.id}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
                        style={{ backgroundColor: primary, color: '#000000' }}
                      >
                        {saving === role.id ? '…' : 'Save'}
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium border border-border text-text-muted hover:text-text transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="flex-1 text-text text-sm font-medium">{role.label}</span>
                      <span className="text-text-subtle text-xs flex-shrink-0">#{role.sort_order}</span>
                    </>
                  )}

                  {/* Action buttons (hidden when editing this row) */}
                  {editingId !== role.id && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => startEdit(role)}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-border text-text-muted hover:text-text transition-colors"
                        title="Edit"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleActive(role)}
                        disabled={saving === role.id}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-border text-text-muted hover:text-red-400 transition-colors disabled:opacity-50"
                        title="Deactivate"
                      >
                        {saving === role.id ? '…' : 'Deactivate'}
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Inactive roles list — collapsed, shown only when there are some */}
        {inactiveRoles.length > 0 && (
          <div className="bg-surface rounded-2xl border border-border overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-text-muted text-sm font-semibold uppercase tracking-wide">
                Inactive roles <span className="text-text-subtle font-normal normal-case">({inactiveRoles.length})</span>
              </h2>
              <p className="text-text-subtle text-xs mt-0.5">
                These won't appear in the role picker. Existing assignments are preserved.
              </p>
            </div>
            <ul className="divide-y divide-border">
              {inactiveRoles.map((role) => (
                <li key={role.id} className="px-5 py-3 flex items-center gap-3 opacity-60">
                  <span className="flex-1 text-text-muted text-sm line-through">{role.label}</span>
                  <button
                    type="button"
                    onClick={() => handleToggleActive(role)}
                    disabled={saving === role.id}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-border text-text-muted hover:text-text transition-colors disabled:opacity-50"
                  >
                    {saving === role.id ? '…' : 'Reactivate'}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </PortalLayout>
  );
}
