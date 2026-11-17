import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  KeyRound,
  RefreshCw,
  Search,
  ShieldAlert,
  Clock,
  Trash2,
  UserCheck,
  UserX,
  X,
} from 'lucide-react';
import { AdminUserRecord, AuthUser, UserStatus } from '../types';
import { TactileButton, TactileInputWell, TactileSegmented } from './tactile/TactileUI';
import { authFetch } from '../utils/apiSession';

interface AdminUsersModalProps {
  open: boolean;
  currentUser: AuthUser;
  onClose: () => void;
}

type StatusFilter = 'all' | UserStatus;

export default function AdminUsersModal({
  open,
  currentUser,
  onClose,
}: AdminUsersModalProps) {
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [noticeMsg, setNoticeMsg] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');

  // Per-row interactive sub-states
  const [resetTargetId, setResetTargetId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadUsers = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await authFetch('/api/admin/users', {
        headers: { 'Cache-Control': 'no-cache' },
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Gagal memuat daftar pengguna.');
        return;
      }
      setUsers(Array.isArray(data.users) ? data.users : []);
    } catch {
      setErrorMsg('Koneksi ke server terputus.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setFilterStatus('all');
      setQuery('');
      setNoticeMsg(null);
      setResetTargetId(null);
      setConfirmDeleteId(null);
      loadUsers();
    }
  }, [open]);

  const counts = useMemo(() => {
    let pending = 0;
    let active = 0;
    let disabled = 0;
    users.forEach((u) => {
      if (u.status === 'pending') pending++;
      else if (u.status === 'active') active++;
      else disabled++;
    });
    return { total: users.length, pending, active, disabled };
  }, [users]);

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (filterStatus !== 'all' && u.status !== filterStatus) return false;
      if (!q) return true;
      return (
        (u.name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.company || '').toLowerCase().includes(q) ||
        (u.accessOrigin || '').toLowerCase().includes(q) ||
        (u.deviceSummary || '').toLowerCase().includes(q)
      );
    });
  }, [users, filterStatus, query]);

  const handleToggleStatus = async (user: AdminUserRecord, nextStatus: UserStatus) => {
    setBusyId(user.id);
    setErrorMsg(null);
    setNoticeMsg(null);
    try {
      const res = await authFetch(`/api/admin/users/${user.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Gagal memperbarui status.');
        return;
      }
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, status: data.user.status } : u))
      );
      setNoticeMsg(
        `Status akun ${user.email} diubah menjadi ${
          nextStatus === 'active' ? 'Aktif' : nextStatus === 'disabled' ? 'Nonaktif' : 'Pending'
        }.`
      );
    } catch {
      setErrorMsg('Gagal menghubungi server.');
    } finally {
      setBusyId(null);
    }
  };

  const handleSetPassword = async (user: AdminUserRecord) => {
    if (newPassword.length < 6) {
      setErrorMsg('Password baru minimal 6 karakter.');
      return;
    }
    setBusyId(user.id);
    setErrorMsg(null);
    setNoticeMsg(null);
    try {
      const res = await authFetch(`/api/admin/users/${user.id}/password`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Gagal menyimpan password baru.');
        return;
      }
      setResetTargetId(null);
      setNewPassword('');
      setNoticeMsg(
        `Password baru untuk ${user.email} berhasil disimpan. Silakan kirimkan ke user melalui WhatsApp.`
      );
    } catch {
      setErrorMsg('Gagal menghubungi server.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteUser = async (user: AdminUserRecord) => {
    setBusyId(user.id);
    setErrorMsg(null);
    setNoticeMsg(null);
    try {
      const res = await authFetch(`/api/admin/users/${user.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Gagal menghapus akun.');
        return;
      }
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      setConfirmDeleteId(null);
      setNoticeMsg(`Akun ${user.email} dan datanya berhasil dihapus.`);
    } catch {
      setErrorMsg('Gagal menghubungi server.');
    } finally {
      setBusyId(null);
    }
  };

  if (!open) return null;

  const formatDate = (iso: string | null) => {
    if (!iso) return 'Belum pernah login';
    try {
      return new Intl.DateTimeFormat('id-ID', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--backdrop)] p-4 sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Manajemen Akun Pengguna"
        className="surface-raised w-full max-w-[980px] max-h-[90dvh] bg-[var(--surface-top)] rounded-[var(--radius-feature)] shadow-[var(--shadow-modal)] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b-[0.5px] border-[var(--line)] flex items-center justify-between gap-4 shrink-0">
          <div>
            <h2 className="text-[16px] leading-[22px] font-semibold text-[var(--ink-12)]">
              Manajemen Akun Pengguna
            </h2>
            <p className="text-[12px] leading-[16px] text-[var(--ink-10)] mt-0.5 tabular-nums">
              Total {counts.total} · Menunggu {counts.pending} · Aktif {counts.active} · Nonaktif{' '}
              {counts.disabled}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <TactileButton
              type="button"
              variant="secondary"
              size="compact"
              onClick={loadUsers}
              disabled={loading}
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </TactileButton>
            <TactileButton type="button" variant="icon" onClick={onClose} aria-label="Tutup panel admin">
              <X size={16} />
            </TactileButton>
          </div>
        </div>

        {/* Filter & Search Toolbar */}
        <div className="px-6 py-3 border-b-[0.5px] border-[var(--line)] bg-[var(--ink-1)] flex flex-wrap items-center justify-between gap-3 shrink-0">
          <TactileSegmented
            value={filterStatus}
            size="compact"
            ariaLabel="Filter status pengguna"
            onChange={(val) => setFilterStatus(val)}
            options={[
              { value: 'all', label: `Semua (${counts.total})` },
              { value: 'pending', label: `Pending (${counts.pending})` },
              { value: 'active', label: `Aktif (${counts.active})` },
              { value: 'disabled', label: `Nonaktif (${counts.disabled})` },
            ]}
          />

          <div className="w-full sm:w-[270px] relative">
            <Search
              size={13}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--ink-9)] pointer-events-none"
            />
            <TactileInputWell
              type="search"
              name="admin-user-filter"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              data-lpignore="true"
              data-form-type="other"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari nama, email, subdomain..."
              className={`pl-8 ${query ? 'pr-7' : ''}`}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Hapus pencarian"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--ink-9)] hover:text-[var(--ink-12)] p-0.5 cursor-pointer"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Notifications */}
        {(errorMsg || noticeMsg) && (
          <div className="px-6 pt-3 shrink-0">
            {errorMsg && (
              <div className="rounded-[var(--radius-control)] bg-[var(--red-3)] px-3.5 py-2 text-[12px] text-[var(--red-11)]">
                {errorMsg}
              </div>
            )}
            {noticeMsg && (
              <div className="rounded-[var(--radius-control)] bg-[var(--green-3)] px-3.5 py-2 text-[12px] text-[var(--green-11)]">
                {noticeMsg}
              </div>
            )}
          </div>
        )}

        {/* User List */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 divide-y-[0.5px] divide-[var(--line)]">
          {loading && users.length === 0 ? (
            <div className="py-12 text-center text-[13px] text-[var(--ink-10)]">
              Memuat daftar pengguna dari SQLite...
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="py-12 text-center text-[13px] text-[var(--ink-10)] space-y-2.5">
              <div>Tidak ada pengguna yang cocok dengan filter saat ini.</div>
              {(filterStatus !== 'all' || query.trim() !== '') && users.length > 0 && (
                <TactileButton
                  type="button"
                  variant="secondary"
                  size="compact"
                  onClick={() => {
                    setFilterStatus('all');
                    setQuery('');
                  }}
                >
                  <span>Tampilkan semua ({users.length})</span>
                </TactileButton>
              )}
            </div>
          ) : (
            filteredUsers.map((u) => {
              const isSelf = u.id === currentUser.id;
              const isResetting = resetTargetId === u.id;
              const isConfirmingDel = confirmDeleteId === u.id;

              return (
                <div key={u.id} className="py-4 first:pt-1 last:pb-1 space-y-3">
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    {/* User Identity & Provenance */}
                    <div className="space-y-1.5 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-[13px] leading-[18px]">
                        <span className="font-semibold text-[var(--ink-12)]">{u.name}</span>
                        <span className="text-[var(--ink-9)]">·</span>
                        <span className="font-mono text-[12px] text-[var(--ink-11)]">{u.email}</span>
                        {u.company && (
                          <>
                            <span className="text-[var(--ink-9)]">·</span>
                            <span className="text-[12px] text-[var(--ink-10)]">{u.company}</span>
                          </>
                        )}
                        <span className="text-[var(--ink-9)]">·</span>
                        {u.status === 'active' ? (
                          <span className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--green-11)]">
                            <CheckCircle2 size={12} />
                            {u.role === 'admin' ? 'Admin Aktif' : 'Aktif'}
                          </span>
                        ) : u.status === 'pending' ? (
                          <span className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--amber-11)]">
                            <Clock size={12} />
                            Menunggu Aktivasi
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--red-11)]">
                            <ShieldAlert size={12} />
                            Nonaktif
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] leading-[16px] text-[var(--ink-10)] font-mono tabular-nums space-y-0.5">
                        <div className="truncate">
                          Origin: {u.accessOrigin || '-'} {u.accessPath || ''} · Perangkat:{' '}
                          {u.deviceSummary || '-'}
                        </div>
                        <div>
                          IP: {u.lastIp || '-'} · Daftar: {formatDate(u.createdAt)} · Login terakhir:{' '}
                          {formatDate(u.lastLoginAt)} · Proyek: {u.projectCount} · Riwayat BCT:{' '}
                          {u.historyCount}
                        </div>
                      </div>
                    </div>

                    {/* User Actions */}
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {!isSelf && u.status !== 'active' && (
                        <TactileButton
                          type="button"
                          variant="primary"
                          size="compact"
                          disabled={busyId === u.id}
                          onClick={() => handleToggleStatus(u, 'active')}
                        >
                          <UserCheck size={13} />
                          <span>Aktifkan</span>
                        </TactileButton>
                      )}

                      {!isSelf && u.status === 'active' && (
                        <TactileButton
                          type="button"
                          variant="secondary"
                          size="compact"
                          disabled={busyId === u.id}
                          onClick={() => handleToggleStatus(u, 'disabled')}
                        >
                          <UserX size={13} />
                          <span>Nonaktifkan</span>
                        </TactileButton>
                      )}

                      <TactileButton
                        type="button"
                        variant={isResetting ? 'primary' : 'secondary'}
                        size="compact"
                        disabled={busyId === u.id}
                        onClick={() => {
                          setResetTargetId(isResetting ? null : u.id);
                          setNewPassword('');
                          setConfirmDeleteId(null);
                        }}
                      >
                        <KeyRound size={13} />
                        <span>Set Password</span>
                      </TactileButton>

                      {!isSelf && !isConfirmingDel && (
                        <TactileButton
                          type="button"
                          variant="destructive"
                          size="compact"
                          disabled={busyId === u.id}
                          onClick={() => {
                            setConfirmDeleteId(u.id);
                            setResetTargetId(null);
                          }}
                        >
                          <Trash2 size={13} />
                          <span>Hapus</span>
                        </TactileButton>
                      )}

                      {!isSelf && isConfirmingDel && (
                        <div className="flex items-center gap-1.5">
                          <TactileButton
                            type="button"
                            variant="destructive"
                            size="compact"
                            disabled={busyId === u.id}
                            onClick={() => handleDeleteUser(u)}
                          >
                            <span>Konfirmasi Hapus</span>
                          </TactileButton>
                          <TactileButton
                            type="button"
                            variant="ghost"
                            size="compact"
                            onClick={() => setConfirmDeleteId(null)}
                          >
                            <span>Batal</span>
                          </TactileButton>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Direct Password Override Drawer */}
                  {isResetting && (
                    <div className="rounded-[var(--radius-control)] bg-[var(--ink-3)] p-3 flex flex-wrap items-center gap-2.5">
                      <span className="text-[12px] text-[var(--ink-11)] whitespace-nowrap">
                        Password baru untuk {u.email}:
                      </span>
                      <div className="flex-1 min-w-[200px]">
                        <TactileInputWell
                          type="text"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Ketik password baru (min 6 karakter)"
                        />
                      </div>
                      <TactileButton
                        type="button"
                        variant="primary"
                        size="compact"
                        disabled={busyId === u.id || newPassword.length < 6}
                        onClick={() => handleSetPassword(u)}
                      >
                        <span>Simpan Password</span>
                      </TactileButton>
                      <TactileButton
                        type="button"
                        variant="ghost"
                        size="compact"
                        onClick={() => {
                          setResetTargetId(null);
                          setNewPassword('');
                        }}
                      >
                        <span>Batal</span>
                      </TactileButton>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
