import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bot,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Database,
  Download,
  Edit3,
  KeyRound,
  LogOut,
  Mail,
  Plus,
  RefreshCw,
  Search,
  Send,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Unlock,
  UserCheck,
  UserPlus,
  UserX,
  X,
} from 'lucide-react';
import {
  AdminHealthRadar,
  AdminSmtpSettings,
  AdminUserRecord,
  AgentApiKeyInfo,
  AuditEventCategory,
  AuditLogEntry,
  AuthUser,
  UserRole,
  UserStatus,
} from '../types';
import {
  TactileButton,
  TactileInputWell,
  TactileSegmented,
  TactileSelect,
} from './tactile/TactileUI';
import { authFetch, setClientSessionToken } from '../utils/apiSession';

interface AdminUsersModalProps {
  open: boolean;
  currentUser: AuthUser;
  onClose: () => void;
  onUserUpdated?: (patch: Partial<AuthUser>) => void;
}

type AdminTab = 'users' | 'health' | 'audit' | 'security';
type StatusFilter = 'all' | UserStatus;

function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}h ${h}j ${m}m`;
  if (h > 0) return `${h}j ${m}m`;
  return `${m}m ${s % 60}d`;
}

const AUDIT_LABELS: Record<string, string> = {
  login_success: 'Login Berhasil',
  login_failed: 'Gagal Masuk',
  login_locked: 'Akun Terkunci',
  register_pending: 'Pendaftaran Baru',
  admin_recover: 'Pemulihan Admin',
  otp_requested: 'Permintaan OTP Admin',
  smtp_updated: 'Ubah Konfigurasi SMTP',
  smtp_tested: 'Uji Kirim Email SMTP',
  password_changed: 'Perubahan Password',
  status_changed: 'Perubahan Status',
  role_changed: 'Perubahan Role',
  user_created: 'Buat Akun Baru',
  user_updated: 'Edit Profil Akun',
  user_deleted: 'Hapus Akun',
  session_revoked: 'Cabut Sesi Paksa',
  recovery_key_rotated: 'Rotasi Recovery Key',
  backup_exported: 'Unduh Backup',
};

function buildHermesAgentSnippets(
  originUrl: string,
  displayKey: string,
  skillVer: string
): { mcp: string; skill: string; rest: string } {
  const mcp = [
    '# Tambahkan ke ~/.hermes/config.yaml',
    'mcp_servers:',
    '  diecut_room:',
    `    url: "${originUrl}/api/mcp"`,
    '    transport: "http"',
    '    headers:',
    `      Authorization: "Bearer ${displayKey}"`,
    `      X-Skill-Version: "${skillVer}"`,
    '    timeout: 60',
  ].join('\n');

  const skill = [
    '# Unduh SKILL.md ke ~/.hermes/skills/diecut-room/SKILL.md',
    'mkdir -p ~/.hermes/skills/diecut-room',
    `curl -sSL -H "X-Agent-Key: ${displayKey}" \\`,
    `  "${originUrl}/api/agent/skill?format=raw" \\`,
    '  -o ~/.hermes/skills/diecut-room/SKILL.md',
  ].join('\n');

  const rest = [
    `# 1) Handshake (kirim tanpa X-Skill-Version saat kontak awal,`,
    `#    atau kirim X-Skill-Version: ${skillVer} untuk langsung mendapat template form)`,
    `curl -X POST "${originUrl}/api/agent/connect" \\`,
    `  -H "X-Agent-Key: ${displayKey}" \\`,
    `  -H "X-Skill-Version: ${skillVer}"`,
    '',
    '# 2) Kirim template form yang sudah diisi user (Print 60%, SF 6:1 default)',
    `curl -X POST "${originUrl}/api/agent/calculate" \\`,
    `  -H "X-Agent-Key: ${displayKey}" \\`,
    '  -H "Content-Type: application/json" \\',
    '  -d \'{"formText":"ID Panjang (mm): 300\\nID Lebar (mm): 200\\nID Tinggi (mm): 150\\nFlute Type: C\\nMaterial: K150/M125/K150\\nPrint Coverage (%): 60\\nJumlah Ink Colors: 2\\nSafety Factor: 6:1"}\'',
    '',
    '# 3) Generate Dieline 2D SVG ("clean-cad" untuk mesin pisau, atau "spec-sheet" lengkap)',
    `curl -X POST "${originUrl}/api/agent/dieline" \\`,
    `  -H "X-Agent-Key: ${displayKey}" \\`,
    '  -H "Content-Type: application/json" \\',
    '  -d \'{"idLengthMm":300,"idWidthMm":200,"idDepthMm":150,"fluteType":"C","boxStyle":"0201","mode":"clean-cad"}\'',
  ].join('\n');

  return { mcp, skill, rest };
}

export default function AdminUsersModal({
  open,
  currentUser,
  onClose,
  onUserUpdated,
}: AdminUsersModalProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>('users');

  // Shared notifications
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [noticeMsg, setNoticeMsg] = useState<string | null>(null);

  // Tab 1: Users & Sessions state
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  // Create user inline drawer
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createCompany, setCreateCompany] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createRole, setCreateRole] = useState<UserRole>('user');
  const [createStatus, setCreateStatus] = useState<UserStatus>('active');
  const [creating, setCreating] = useState(false);

  // Per-row drawers
  const [resetTargetId, setResetTargetId] = useState<string | null>(null);
  const [newUserPassword, setNewUserPassword] = useState('');
  const [editTargetId, setEditTargetId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editCompany, setEditCompany] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('user');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Tab 2: Health Radar state
  const [healthRadar, setHealthRadar] = useState<AdminHealthRadar | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);

  // Tab 3: Audit Logs state
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditCategory, setAuditCategory] = useState<AuditEventCategory>('all');
  const [auditLoading, setAuditLoading] = useState(false);

  // Tab 4: Admin Security & Backup state
  const [currentAdminPwd, setCurrentAdminPwd] = useState('');
  const [newAdminPwd, setNewAdminPwd] = useState('');
  const [confirmAdminPwd, setConfirmAdminPwd] = useState('');
  const [changingOwnPwd, setChangingOwnPwd] = useState(false);
  const [rotatingKey, setRotatingKey] = useState(false);
  const [revealedRecoveryKey, setRevealedRecoveryKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [downloadingBackup, setDownloadingBackup] = useState<'sqlite' | 'json' | null>(null);

  // Tab 4: Co-Admin & Optional SMTP Email OTP state
  const [promoteCandidateId, setPromoteCandidateId] = useState<string>('');
  const [smtpSettings, setSmtpSettings] = useState<AdminSmtpSettings | null>(null);
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [smtpFrom, setSmtpFrom] = useState('');
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [smtpTesting, setSmtpTesting] = useState(false);

  // Tab 4: External Hermes Agent API Key state
  const [agentKeyInfo, setAgentKeyInfo] = useState<AgentApiKeyInfo | null>(null);
  const [revealedAgentKey, setRevealedAgentKey] = useState<string | null>(null);
  const [agentKeyBusy, setAgentKeyBusy] = useState(false);
  const [hermesGuideTab, setHermesGuideTab] = useState<'mcp' | 'skill' | 'rest'>('mcp');
  const [copiedAgentSnippet, setCopiedAgentSnippet] = useState<'key' | 'mcp' | 'skill' | 'rest' | null>(null);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const res = await authFetch('/api/admin/users');
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Gagal memuat daftar pengguna.');
        return;
      }
      setUsers(Array.isArray(data.users) ? data.users : []);
    } catch {
      setErrorMsg('Koneksi ke server terputus.');
    } finally {
      setUsersLoading(false);
    }
  }, []);

  const loadHealthRadar = useCallback(async () => {
    setHealthLoading(true);
    try {
      const res = await authFetch('/api/admin/health-radar');
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Gagal memuat diagnosa kesehatan server.');
        return;
      }
      setHealthRadar(data as AdminHealthRadar);
    } catch {
      setErrorMsg('Gagal memuat radar kesehatan server.');
    } finally {
      setHealthLoading(false);
    }
  }, []);

  const loadAuditLogs = useCallback(async (category: AuditEventCategory) => {
    setAuditLoading(true);
    try {
      const res = await authFetch(`/api/admin/audit-logs?category=${encodeURIComponent(category)}`);
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Gagal memuat log audit.');
        return;
      }
      setAuditLogs(Array.isArray(data.logs) ? data.logs : []);
    } catch {
      setErrorMsg('Gagal memuat log audit.');
    } finally {
      setAuditLoading(false);
    }
  }, []);

  const loadSmtpSettings = useCallback(async () => {
    try {
      const res = await authFetch('/api/admin/security/smtp');
      const data = (await res.json().catch(() => null)) as AdminSmtpSettings | null;
      if (!res.ok || !data) return;
      setSmtpSettings(data);
      setSmtpHost(data.host || '');
      setSmtpPort(String(data.port || 587));
      setSmtpSecure(Boolean(data.secure));
      setSmtpUser(data.user || '');
      setSmtpFrom(data.from || '');
      setSmtpPass('');
    } catch {
      // ignore transient error
    }
  }, []);

  const loadAgentKeyInfo = useCallback(async () => {
    try {
      const res = await authFetch('/api/admin/security/agent-key');
      const data = (await res.json().catch(() => null)) as AgentApiKeyInfo | null;
      if (!res.ok || !data) return;
      setAgentKeyInfo(data);
    } catch {
      // ignore transient error
    }
  }, []);

  const refreshActiveTab = useCallback(() => {
    setErrorMsg(null);
    if (activeTab === 'users') {
      void loadUsers();
      void loadHealthRadar();
    } else if (activeTab === 'health') {
      void loadHealthRadar();
    } else if (activeTab === 'security') {
      void loadHealthRadar();
      void loadSmtpSettings();
      void loadAgentKeyInfo();
    } else if (activeTab === 'audit') {
      void loadAuditLogs(auditCategory);
    }
  }, [
    activeTab,
    auditCategory,
    loadAgentKeyInfo,
    loadAuditLogs,
    loadHealthRadar,
    loadSmtpSettings,
    loadUsers,
  ]);

  useEffect(() => {
    if (open) {
      setActiveTab('users');
      setFilterStatus('all');
      setQuery('');
      setErrorMsg(null);
      setNoticeMsg(null);
      setCreateOpen(false);
      setResetTargetId(null);
      setEditTargetId(null);
      setConfirmDeleteId(null);
      setRevealedRecoveryKey(null);
      setCopiedKey(false);
      setRevealedAgentKey(null);
      setCopiedAgentSnippet(null);
      void loadUsers();
      void loadHealthRadar();
      void loadSmtpSettings();
      void loadAgentKeyInfo();
    }
  }, [open, loadUsers, loadHealthRadar, loadSmtpSettings, loadAgentKeyInfo]);

  useEffect(() => {
    if (!open) return;
    if (activeTab === 'audit') {
      void loadAuditLogs(auditCategory);
    } else if (activeTab === 'health') {
      void loadHealthRadar();
    } else if (activeTab === 'security') {
      void loadHealthRadar();
      void loadSmtpSettings();
      void loadAgentKeyInfo();
    }
  }, [open, activeTab, auditCategory, loadAgentKeyInfo, loadAuditLogs, loadHealthRadar, loadSmtpSettings]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const counts = useMemo(() => {
    let pending = 0;
    let active = 0;
    let disabled = 0;
    let locked = 0;
    const nowMs = Date.now();
    users.forEach((u) => {
      if (u.status === 'pending') pending++;
      else if (u.status === 'active') active++;
      else disabled++;
      if (u.lockedUntil && new Date(u.lockedUntil).getTime() > nowMs) {
        locked++;
      }
    });
    return { total: users.length, pending, active, disabled, locked };
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

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setNoticeMsg(null);
    setCreating(true);
    try {
      const res = await authFetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createName,
          email: createEmail,
          company: createCompany,
          password: createPassword,
          role: createRole,
          status: createStatus,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Gagal membuat akun baru.');
        return;
      }
      setUsers((prev) => [data.user, ...prev]);
      setCreateOpen(false);
      setCreateName('');
      setCreateEmail('');
      setCreateCompany('');
      setCreatePassword('');
      setCreateRole('user');
      setCreateStatus('active');
      setNoticeMsg(`Akun ${data.user.email} (${data.user.role}) berhasil dibuat.`);
      void loadHealthRadar();
    } catch {
      setErrorMsg('Gagal menghubungi server.');
    } finally {
      setCreating(false);
    }
  };

  const handleBulkApprove = async () => {
    setBusyId('bulk');
    setErrorMsg(null);
    setNoticeMsg(null);
    try {
      const res = await authFetch('/api/admin/users/bulk-approve', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Gagal menyetujui akun pending.');
        return;
      }
      setUsers((prev) =>
        prev.map((u) =>
          u.status === 'pending'
            ? { ...u, status: 'active', failedLoginCount: 0, lockedUntil: null }
            : u
        )
      );
      setNoticeMsg(`${data.approvedCount || 0} akun pending telah diaktifkan.`);
      void loadHealthRadar();
    } catch {
      setErrorMsg('Gagal menghubungi server.');
    } finally {
      setBusyId(null);
    }
  };

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
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, ...data.user } : u)));
      setNoticeMsg(
        `Status akun ${user.email} diubah menjadi ${
          nextStatus === 'active' ? 'Aktif' : nextStatus === 'disabled' ? 'Nonaktif' : 'Pending'
        }.`
      );
      void loadHealthRadar();
    } catch {
      setErrorMsg('Gagal menghubungi server.');
    } finally {
      setBusyId(null);
    }
  };

  const handleSaveEditUser = async (user: AdminUserRecord) => {
    setBusyId(user.id);
    setErrorMsg(null);
    setNoticeMsg(null);
    try {
      const res = await authFetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName,
          email: editEmail,
          company: editCompany,
          role: editRole,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Gagal memperbarui profil pengguna.');
        return;
      }
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, ...data.user } : u)));
      if (user.id === currentUser.id && onUserUpdated) {
        onUserUpdated({
          name: data.user.name,
          email: data.user.email,
          company: data.user.company,
        });
      }
      setEditTargetId(null);
      setNoticeMsg(`Data akun ${data.user.email} berhasil diperbarui.`);
    } catch {
      setErrorMsg('Gagal menghubungi server.');
    } finally {
      setBusyId(null);
    }
  };

  const handleSetPassword = async (user: AdminUserRecord) => {
    if (newUserPassword.length < 6) {
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
        body: JSON.stringify({ password: newUserPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Gagal menyimpan password baru.');
        return;
      }
      setResetTargetId(null);
      setNewUserPassword('');
      setUsers((prev) =>
        prev.map((u) =>
          u.id === user.id
            ? { ...u, tokenVersion: u.tokenVersion + 1, failedLoginCount: 0, lockedUntil: null }
            : u
        )
      );
      setNoticeMsg(
        `Password baru untuk ${user.email} disimpan & seluruh sesi lama user tersebut telah dicabut.`
      );
    } catch {
      setErrorMsg('Gagal menghubungi server.');
    } finally {
      setBusyId(null);
    }
  };

  const handleRevokeSessions = async (user: AdminUserRecord) => {
    setBusyId(user.id);
    setErrorMsg(null);
    setNoticeMsg(null);
    try {
      const res = await authFetch(`/api/admin/users/${user.id}/revoke-sessions`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Gagal mencabut sesi pengguna.');
        return;
      }
      setUsers((prev) =>
        prev.map((u) =>
          u.id === user.id
            ? {
                ...u,
                tokenVersion: Number(data.tokenVersion || u.tokenVersion + 1),
                failedLoginCount: 0,
                lockedUntil: null,
              }
            : u
        )
      );
      setNoticeMsg(
        `Seluruh sesi aktif ${user.email} dicabut & penguncian login dibuka.`
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
      setNoticeMsg(`Akun ${user.email} dan seluruh datanya berhasil dihapus.`);
      void loadHealthRadar();
    } catch {
      setErrorMsg('Gagal menghubungi server.');
    } finally {
      setBusyId(null);
    }
  };

  const handleChangeOwnPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setNoticeMsg(null);
    if (newAdminPwd.length < 6) {
      setErrorMsg('Password baru Admin minimal 6 karakter.');
      return;
    }
    if (newAdminPwd !== confirmAdminPwd) {
      setErrorMsg('Konfirmasi password baru tidak sama.');
      return;
    }
    setChangingOwnPwd(true);
    try {
      const res = await authFetch('/api/admin/security/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: currentAdminPwd,
          newPassword: newAdminPwd,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Gagal mengubah password Admin.');
        return;
      }
      if (data.token) {
        setClientSessionToken(data.token);
      }
      setCurrentAdminPwd('');
      setNewAdminPwd('');
      setConfirmAdminPwd('');
      setNoticeMsg(
        'Password Admin berhasil diubah. Sesi perangkat ini tetap aktif dan sesi lain dicabut.'
      );
      void loadUsers();
    } catch {
      setErrorMsg('Gagal menghubungi server.');
    } finally {
      setChangingOwnPwd(false);
    }
  };

  const handleRotateRecoveryKey = async () => {
    setRotatingKey(true);
    setErrorMsg(null);
    setNoticeMsg(null);
    setCopiedKey(false);
    try {
      const res = await authFetch('/api/admin/security/rotate-recovery-key', {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Gagal membuat Recovery Key baru.');
        return;
      }
      setRevealedRecoveryKey(data.recoveryKey);
      setNoticeMsg(
        'Recovery Key baru dibuat. Salin atau unduh kunci di bawah ini sekarang — kunci tidak dapat dilihat lagi setelah ditutup.'
      );
      void loadHealthRadar();
    } catch {
      setErrorMsg('Gagal menghubungi server.');
    } finally {
      setRotatingKey(false);
    }
  };

  const handleCopyRecoveryKey = async () => {
    if (!revealedRecoveryKey) return;
    try {
      await navigator.clipboard.writeText(revealedRecoveryKey);
      setCopiedKey(true);
      window.setTimeout(() => setCopiedKey(false), 2500);
    } catch {
      setErrorMsg('Browser memblokir akses clipboard. Silakan salin teks kunci secara manual.');
    }
  };

  const handleDownloadRecoveryKeyTxt = () => {
    if (!revealedRecoveryKey) return;
    const text = [
      'DieCut.Room — Admin Emergency Recovery Key',
      `Email Admin : ${currentUser.email}`,
      `Dibuat pada : ${new Date().toISOString()}`,
      `Recovery Key: ${revealedRecoveryKey}`,
      '',
      'Cara pakai saat lupa password:',
      '1. Buka halaman Login DieCut.Room.',
      '2. Tap 5x logo DieCut.Room atau tekan Ctrl+Shift+Alt+A.',
      '3. Masukkan Email Admin, Recovery Key di atas, dan password baru.',
    ].join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `diecut-admin-recovery-key.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleDownloadBackup = async (kind: 'sqlite' | 'json') => {
    setDownloadingBackup(kind);
    setErrorMsg(null);
    setNoticeMsg(null);
    try {
      const res = await authFetch(`/api/admin/backup/${kind}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setErrorMsg(errData.error || 'Gagal mengunduh backup database.');
        return;
      }
      const blob = await res.blob();
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = kind === 'sqlite' ? `diecut-backup-${stamp}.db` : `diecut-export-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setNoticeMsg(
        kind === 'sqlite'
          ? 'Snapshot SQLite (.db) berhasil diunduh.'
          : 'Ekspor data JSON berhasil diunduh.'
      );
      void loadHealthRadar();
    } catch {
      setErrorMsg('Gagal mengunduh backup dari server.');
    } finally {
      setDownloadingBackup(null);
    }
  };

  const activeAdmins = useMemo(
    () => users.filter((u) => u.role === 'admin' && u.status === 'active'),
    [users]
  );

  const coAdminCandidates = useMemo(
    () => users.filter((u) => u.role !== 'admin' && u.status === 'active'),
    [users]
  );

  useEffect(() => {
    if (coAdminCandidates.length === 0) {
      setPromoteCandidateId('');
      return;
    }
    if (!coAdminCandidates.some((c) => c.id === promoteCandidateId)) {
      setPromoteCandidateId(coAdminCandidates[0].id);
    }
  }, [coAdminCandidates, promoteCandidateId]);

  const handlePromoteCoAdmin = async () => {
    const candidate = coAdminCandidates.find((c) => c.id === promoteCandidateId);
    if (!candidate) return;
    setBusyId(candidate.id);
    setErrorMsg(null);
    setNoticeMsg(null);
    try {
      const res = await authFetch(`/api/admin/users/${candidate.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: candidate.name,
          email: candidate.email,
          company: candidate.company,
          role: 'admin',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Gagal menunjuk Admin Cadangan.');
        return;
      }
      setUsers((prev) => prev.map((u) => (u.id === candidate.id ? { ...u, ...data.user } : u)));
      setNoticeMsg(
        `${candidate.name} (${candidate.email}) kini aktif sebagai Admin Cadangan dan dapat mereset akses lewat browser.`
      );
      void loadHealthRadar();
    } catch {
      setErrorMsg('Gagal menghubungi server.');
    } finally {
      setBusyId(null);
    }
  };

  const handleQuickCreateCoAdmin = () => {
    setActiveTab('users');
    setCreateOpen(true);
    setCreateRole('admin');
    setCreateStatus('active');
    setErrorMsg(null);
    setNoticeMsg(null);
  };

  const handleSaveSmtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSmtpSaving(true);
    setErrorMsg(null);
    setNoticeMsg(null);
    try {
      const res = await authFetch('/api/admin/security/smtp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: smtpHost.trim(),
          port: Number(smtpPort) || 587,
          secure: smtpSecure,
          user: smtpUser.trim(),
          pass: smtpPass.trim(),
          from: smtpFrom.trim() || smtpUser.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Gagal menyimpan konfigurasi SMTP.');
        return;
      }
      setSmtpSettings(data as AdminSmtpSettings);
      setSmtpPass('');
      setNoticeMsg(
        'Konfigurasi Email OTP SMTP disimpan. Klik "Kirim Email Uji" untuk memastikan pengiriman berjalan.'
      );
      void loadHealthRadar();
    } catch {
      setErrorMsg('Gagal menghubungi server.');
    } finally {
      setSmtpSaving(false);
    }
  };

  const handleClearConsoleSmtp = async () => {
    setSmtpSaving(true);
    setErrorMsg(null);
    setNoticeMsg(null);
    try {
      const res = await authFetch('/api/admin/security/smtp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clearConsoleOverride: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Gagal mereset konfigurasi SMTP.');
        return;
      }
      const next = data as AdminSmtpSettings;
      setSmtpSettings(next);
      setSmtpHost(next.host || '');
      setSmtpPort(String(next.port || 587));
      setSmtpSecure(Boolean(next.secure));
      setSmtpUser(next.user || '');
      setSmtpFrom(next.from || '');
      setSmtpPass('');
      setNoticeMsg('Pengaturan SMTP dari Konsol Admin dihapus.');
      void loadHealthRadar();
    } catch {
      setErrorMsg('Gagal menghubungi server.');
    } finally {
      setSmtpSaving(false);
    }
  };

  const handleTestSmtp = async () => {
    setSmtpTesting(true);
    setErrorMsg(null);
    setNoticeMsg(null);
    try {
      const res = await authFetch('/api/admin/security/smtp-test', {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Pengiriman email uji SMTP gagal.');
        return;
      }
      setNoticeMsg(
        `Email uji berhasil dikirim ke ${data.sentTo || currentUser.email}. Jalur Email OTP siap dipakai.`
      );
    } catch {
      setErrorMsg('Gagal menghubungi server.');
    } finally {
      setSmtpTesting(false);
    }
  };

  const handleGenerateAgentKey = async () => {
    setAgentKeyBusy(true);
    setErrorMsg(null);
    setNoticeMsg(null);
    try {
      const res = await authFetch('/api/admin/security/agent-key', {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Gagal membuat API Key Agent.');
        return;
      }
      const newKey = String(data.apiKey || '');
      const nextSkillVer = String(data.skillVersion || agentKeyInfo?.skillVersion || '1.1.0');
      setRevealedAgentKey(newKey);
      setAgentKeyInfo({
        configured: true,
        prefix: data.prefix,
        updatedAt: data.updatedAt,
        skillVersion: nextSkillVer,
      });

      const originUrl =
        typeof window !== 'undefined' ? window.location.origin : 'https://cad.domainanda.com';
      const snippets = buildHermesAgentSnippets(originUrl, newKey, nextSkillVer);
      const activeConfigText = snippets[hermesGuideTab];

      let autoCopied = false;
      try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          await navigator.clipboard.writeText(activeConfigText);
          autoCopied = true;
          setCopiedAgentSnippet(hermesGuideTab);
          window.setTimeout(() => setCopiedAgentSnippet(null), 3000);
        }
      } catch {
        autoCopied = false;
      }

      setNoticeMsg(
        autoCopied
          ? 'API Key Agent dibuat & konfigurasi aktif yang sudah memuat API Key otomatis tersalin ke clipboard.'
          : 'API Key Agent berhasil dibuat dan langsung disisipkan ke salinan konfigurasi di bawah. Klik "Salin Konfigurasi" untuk menyalin.'
      );
    } catch {
      setErrorMsg('Gagal menghubungi server.');
    } finally {
      setAgentKeyBusy(false);
    }
  };

  const handleRevokeAgentKey = async () => {
    setAgentKeyBusy(true);
    setErrorMsg(null);
    setNoticeMsg(null);
    try {
      const res = await authFetch('/api/admin/security/agent-key', {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Gagal menonaktifkan API Key Agent.');
        return;
      }
      setRevealedAgentKey(null);
      setAgentKeyInfo(data as AgentApiKeyInfo);
      setNoticeMsg('API Key Agent dinonaktifkan. Hermes tidak dapat mengakses endpoint lagi.');
    } catch {
      setErrorMsg('Gagal menghubungi server.');
    } finally {
      setAgentKeyBusy(false);
    }
  };

  const handleCopyAgentSnippet = async (
    text: string,
    kind: 'key' | 'mcp' | 'skill' | 'rest'
  ) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedAgentSnippet(kind);
      window.setTimeout(() => setCopiedAgentSnippet(null), 2400);
    } catch {
      setErrorMsg('Browser memblokir clipboard. Silakan blok dan salin teks secara manual.');
    }
  };

  if (!open) return null;

  const formatDate = (iso: string | null) => {
    if (!iso) return 'Belum pernah';
    try {
      return new Intl.DateTimeFormat('id-ID', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  const alertCount =
    healthRadar?.alerts.filter((a) => a.severity === 'critical' || a.severity === 'warning').length ||
    0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--backdrop)] p-3 sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Konsol Admin DieCut.Room"
        className="surface-raised w-full max-w-[1060px] max-h-[90dvh] bg-[var(--surface-top)] rounded-[var(--radius-feature)] shadow-[var(--shadow-modal)] flex flex-col overflow-hidden"
      >
        {/* Top Modal Header */}
        <div className="px-5 sm:px-6 py-4 border-b-[0.5px] border-[var(--line)] flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h2 className="text-[16px] leading-[22px] font-semibold text-[var(--ink-12)] truncate">
              Konsol Admin &amp; Diagnosa Sistem
            </h2>
            <p className="text-[12px] leading-[16px] text-[var(--ink-10)] mt-0.5 font-mono tabular-nums">
              Total {counts.total} · Menunggu {counts.pending} · Aktif {counts.active} · Nonaktif{' '}
              {counts.disabled}
              {counts.locked > 0 ? ` · Terkunci ${counts.locked}` : ''}
              {alertCount > 0 ? ` · ${alertCount} peringatan sistem` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <TactileButton
              type="button"
              variant="secondary"
              size="compact"
              onClick={refreshActiveTab}
              disabled={usersLoading || healthLoading || auditLoading}
            >
              <RefreshCw
                size={13}
                className={usersLoading || healthLoading || auditLoading ? 'animate-spin' : ''}
              />
              <span>Refresh</span>
            </TactileButton>
            <TactileButton
              type="button"
              variant="icon"
              onClick={onClose}
              aria-label="Tutup konsol admin"
            >
              <X size={16} />
            </TactileButton>
          </div>
        </div>

        {/* Navigation Tab Bar */}
        <div className="px-5 sm:px-6 py-2.5 border-b-[0.5px] border-[var(--line)] bg-[var(--ink-1)] overflow-x-auto shrink-0">
          <TactileSegmented
            value={activeTab}
            size="compact"
            shape="control"
            ariaLabel="Pilih bagian konsol admin"
            onChange={(tab) => {
              setErrorMsg(null);
              setNoticeMsg(null);
              setActiveTab(tab);
            }}
            options={[
              { value: 'users', label: `Pengguna & Sesi (${counts.total})` },
              {
                value: 'health',
                label:
                  alertCount > 0
                    ? `Kesehatan & Prediksi (${alertCount})`
                    : 'Kesehatan & Prediksi',
              },
              { value: 'audit', label: 'Log Audit' },
              { value: 'security', label: 'Keamanan & Backup' },
            ]}
          />
        </div>

        {/* Global Alert Notifications */}
        {(errorMsg || noticeMsg) && (
          <div className="px-5 sm:px-6 pt-3 shrink-0 space-y-2">
            {errorMsg && (
              <div
                role="alert"
                className="rounded-[var(--radius-control)] bg-[var(--red-3)] px-3.5 py-2 text-[12px] text-[var(--red-11)]"
              >
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

        {/* Active Tab Viewport */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {activeTab === 'users' && (
            <div className="flex flex-col">
              {/* Filter, Search & Primary Actions Bar */}
              <div className="px-5 sm:px-6 py-3 border-b-[0.5px] border-[var(--line)] flex flex-wrap items-center justify-between gap-3">
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

                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
                  <div className="flex-1 sm:w-[230px] relative">
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

                  {counts.pending > 0 && (
                    <TactileButton
                      type="button"
                      variant="secondary"
                      size="compact"
                      disabled={busyId === 'bulk'}
                      onClick={handleBulkApprove}
                    >
                      <UserCheck size={13} />
                      <span>Setujui Pending ({counts.pending})</span>
                    </TactileButton>
                  )}

                  <TactileButton
                    type="button"
                    variant={createOpen ? 'primary' : 'secondary'}
                    size="compact"
                    onClick={() => {
                      setCreateOpen((v) => !v);
                      setErrorMsg(null);
                    }}
                  >
                    <UserPlus size={13} />
                    <span>Tambah Akun</span>
                  </TactileButton>
                </div>
              </div>

              {/* Direct User Creation Form */}
              {createOpen && (
                <form
                  onSubmit={handleCreateUser}
                  className="px-5 sm:px-6 py-4 bg-[var(--ink-2)] border-b-[0.5px] border-[var(--line)] space-y-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-[13px] font-semibold text-[var(--ink-12)]">
                      Buat Akun Pengguna Baru (Langsung oleh Admin)
                    </h3>
                    <button
                      type="button"
                      onClick={() => setCreateOpen(false)}
                      className="text-[12px] text-[var(--ink-10)] hover:text-[var(--ink-12)] cursor-pointer"
                    >
                      Tutup
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] text-[var(--ink-10)] mb-1">
                        Nama Lengkap
                      </label>
                      <TactileInputWell
                        required
                        value={createName}
                        onChange={(e) => setCreateName(e.target.value)}
                        placeholder="Contoh: Rina Wijaya"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[var(--ink-10)] mb-1">Email</label>
                      <TactileInputWell
                        type="email"
                        required
                        value={createEmail}
                        onChange={(e) => setCreateEmail(e.target.value)}
                        placeholder="rina@perusahaan.com"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[var(--ink-10)] mb-1">
                        Perusahaan
                      </label>
                      <TactileInputWell
                        value={createCompany}
                        onChange={(e) => setCreateCompany(e.target.value)}
                        placeholder="Opsional"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[var(--ink-10)] mb-1">
                        Password Awal (min. 6)
                      </label>
                      <TactileInputWell
                        type="text"
                        required
                        minLength={6}
                        value={createPassword}
                        onChange={(e) => setCreatePassword(e.target.value)}
                        placeholder="Minimal 6 karakter"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[var(--ink-10)] mb-1">Role</label>
                      <TactileSegmented
                        value={createRole}
                        size="compact"
                        fullWidth
                        onChange={setCreateRole}
                        options={[
                          { value: 'user', label: 'User Biasa' },
                          { value: 'admin', label: 'Admin' },
                        ]}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[var(--ink-10)] mb-1">
                        Status Awal
                      </label>
                      <TactileSegmented
                        value={createStatus}
                        size="compact"
                        fullWidth
                        onChange={setCreateStatus}
                        options={[
                          { value: 'active', label: 'Aktif' },
                          { value: 'pending', label: 'Pending' },
                        ]}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <TactileButton
                      type="button"
                      variant="ghost"
                      size="compact"
                      onClick={() => setCreateOpen(false)}
                    >
                      Batal
                    </TactileButton>
                    <TactileButton type="submit" variant="primary" size="compact" disabled={creating}>
                      <Plus size={13} />
                      <span>{creating ? 'Menyimpan...' : 'Simpan Akun Baru'}</span>
                    </TactileButton>
                  </div>
                </form>
              )}

              {/* User List */}
              <div className="px-5 sm:px-6 py-4 divide-y-[0.5px] divide-[var(--line)]">
                {usersLoading && users.length === 0 ? (
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
                    const isEditing = editTargetId === u.id;
                    const isConfirmingDel = confirmDeleteId === u.id;
                    const isLocked =
                      Boolean(u.lockedUntil) && new Date(u.lockedUntil!).getTime() > Date.now();

                    return (
                      <div key={u.id} className="py-4 first:pt-1 last:pb-1 space-y-3">
                        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                          {/* Unboxed Identity & Provenance Metadata */}
                          <div className="space-y-1.5 min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2 text-[13px] leading-[18px]">
                              <span className="font-semibold text-[var(--ink-12)]">{u.name}</span>
                              {isSelf && (
                                <span className="text-[11px] font-medium text-[var(--ink-10)]">
                                  (Anda)
                                </span>
                              )}
                              <span className="text-[var(--ink-9)]">·</span>
                              <span className="font-mono text-[12px] text-[var(--ink-11)]">
                                {u.email}
                              </span>
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
                              {isLocked && (
                                <>
                                  <span className="text-[var(--ink-9)]">·</span>
                                  <span className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--red-11)]">
                                    <AlertTriangle size={12} />
                                    Terkunci sementara
                                  </span>
                                </>
                              )}
                            </div>

                            <div className="text-[11px] leading-[16px] text-[var(--ink-10)] font-mono tabular-nums space-y-0.5">
                              <div className="truncate">
                                Origin: {u.accessOrigin || '-'} {u.accessPath || ''} · Perangkat:{' '}
                                {u.deviceSummary || '-'}
                              </div>
                              <div>
                                IP: {u.lastIp || '-'} · Daftar: {formatDate(u.createdAt)} · Login:{' '}
                                {formatDate(u.lastLoginAt)} · Proyek: {u.projectCount} · BCT:{' '}
                                {u.historyCount} · Sesi v{u.tokenVersion}
                                {u.failedLoginCount > 0 ? ` · Gagal login: ${u.failedLoginCount}×` : ''}
                              </div>
                            </div>
                          </div>

                          {/* Row Action Controls */}
                          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
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
                              variant={isEditing ? 'primary' : 'secondary'}
                              size="compact"
                              disabled={busyId === u.id}
                              onClick={() => {
                                if (isEditing) {
                                  setEditTargetId(null);
                                } else {
                                  setEditTargetId(u.id);
                                  setEditName(u.name);
                                  setEditEmail(u.email);
                                  setEditCompany(u.company || '');
                                  setEditRole(u.role);
                                  setResetTargetId(null);
                                  setConfirmDeleteId(null);
                                }
                              }}
                            >
                              <Edit3 size={13} />
                              <span>Edit</span>
                            </TactileButton>

                            <TactileButton
                              type="button"
                              variant={isResetting ? 'primary' : 'secondary'}
                              size="compact"
                              disabled={busyId === u.id}
                              onClick={() => {
                                setResetTargetId(isResetting ? null : u.id);
                                setNewUserPassword('');
                                setEditTargetId(null);
                                setConfirmDeleteId(null);
                              }}
                            >
                              <KeyRound size={13} />
                              <span>Set Password</span>
                            </TactileButton>

                            <TactileButton
                              type="button"
                              variant="secondary"
                              size="compact"
                              disabled={busyId === u.id}
                              onClick={() => handleRevokeSessions(u)}
                              title="Paksa keluar di semua perangkat & buka kunci login"
                            >
                              {isLocked ? <Unlock size={13} /> : <LogOut size={13} />}
                              <span>{isLocked ? 'Buka Kunci & Cabut Sesi' : 'Cabut Sesi'}</span>
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
                                  setEditTargetId(null);
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

                        {/* Edit Profile & Role Drawer */}
                        {isEditing && (
                          <div className="rounded-[var(--radius-control)] bg-[var(--ink-3)] p-3 space-y-2.5">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                              <div>
                                <label className="block text-[11px] text-[var(--ink-10)] mb-1">
                                  Nama
                                </label>
                                <TactileInputWell
                                  value={editName}
                                  onChange={(e) => setEditName(e.target.value)}
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] text-[var(--ink-10)] mb-1">
                                  Email
                                </label>
                                <TactileInputWell
                                  type="email"
                                  value={editEmail}
                                  onChange={(e) => setEditEmail(e.target.value)}
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] text-[var(--ink-10)] mb-1">
                                  Perusahaan
                                </label>
                                <TactileInputWell
                                  value={editCompany}
                                  onChange={(e) => setEditCompany(e.target.value)}
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] text-[var(--ink-10)] mb-1">
                                  Role Akun
                                </label>
                                <TactileSegmented
                                  value={editRole}
                                  size="compact"
                                  fullWidth
                                  onChange={(val) => {
                                    if (!isSelf) setEditRole(val);
                                  }}
                                  options={[
                                    { value: 'user', label: 'User' },
                                    { value: 'admin', label: 'Admin' },
                                  ]}
                                />
                              </div>
                            </div>
                            <div className="flex justify-end gap-2">
                              <TactileButton
                                type="button"
                                variant="ghost"
                                size="compact"
                                onClick={() => setEditTargetId(null)}
                              >
                                Batal
                              </TactileButton>
                              <TactileButton
                                type="button"
                                variant="primary"
                                size="compact"
                                disabled={busyId === u.id}
                                onClick={() => handleSaveEditUser(u)}
                              >
                                Simpan Perubahan
                              </TactileButton>
                            </div>
                          </div>
                        )}

                        {/* Direct Password Override Drawer */}
                        {isResetting && (
                          <div className="rounded-[var(--radius-control)] bg-[var(--ink-3)] p-3 flex flex-wrap items-center gap-2.5">
                            <span className="text-[12px] text-[var(--ink-11)] whitespace-nowrap">
                              Password baru untuk {u.email}:
                            </span>
                            <div className="flex-1 min-w-[200px]">
                              <TactileInputWell
                                type="text"
                                value={newUserPassword}
                                onChange={(e) => setNewUserPassword(e.target.value)}
                                placeholder="Ketik password baru (min 6 karakter)"
                              />
                            </div>
                            <TactileButton
                              type="button"
                              variant="primary"
                              size="compact"
                              disabled={busyId === u.id || newUserPassword.length < 6}
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
                                setNewUserPassword('');
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
          )}

          {activeTab === 'health' && (
            <div className="p-5 sm:p-6 space-y-6">
              {/* Proactive Predictive Incident Alerts */}
              <section className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[13px] font-semibold text-[var(--ink-12)]">
                    Radar Peringatan Dini &amp; Prediksi Insiden
                  </h3>
                  {healthRadar && (
                    <span className="text-[11px] font-mono tabular-nums text-[var(--ink-10)]">
                      Diperbarui {formatDate(healthRadar.generatedAt)}
                    </span>
                  )}
                </div>

                {healthLoading && !healthRadar ? (
                  <div className="py-6 text-[13px] text-[var(--ink-10)]">
                    Memeriksa kesehatan server &amp; SQLite...
                  </div>
                ) : (
                  <div className="border-[0.5px] border-[var(--line)] rounded-[var(--radius-container)] divide-y-[0.5px] divide-[var(--line)]">
                    {(healthRadar?.alerts || []).map((alert) => {
                      const tone =
                        alert.severity === 'critical'
                          ? {
                              label: 'Kritis',
                              text: 'text-[var(--red-11)]',
                              Icon: ShieldAlert,
                            }
                          : alert.severity === 'warning'
                          ? {
                              label: 'Peringatan',
                              text: 'text-[var(--amber-11)]',
                              Icon: AlertTriangle,
                            }
                          : alert.severity === 'info'
                          ? {
                              label: 'Info',
                              text: 'text-[var(--blue-11)]',
                              Icon: Clock,
                            }
                          : {
                              label: 'Optimal',
                              text: 'text-[var(--green-11)]',
                              Icon: CheckCircle2,
                            };

                      const Icon = tone.Icon;

                      return (
                        <div
                          key={alert.id}
                          className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="space-y-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 text-[13px]">
                              <span
                                className={`inline-flex items-center gap-1 text-[12px] font-medium ${tone.text}`}
                              >
                                <Icon size={13} />
                                {tone.label}
                              </span>
                              <span className="text-[var(--ink-9)]">·</span>
                              <span className="font-semibold text-[var(--ink-12)]">
                                {alert.title}
                              </span>
                            </div>
                            <p className="text-[12px] leading-[17px] text-[var(--ink-10)]">
                              {alert.detail}
                            </p>
                          </div>

                          {alert.actionTab && (
                            <TactileButton
                              type="button"
                              variant="secondary"
                              size="compact"
                              className="shrink-0 self-start sm:self-center"
                              onClick={() => {
                                if (alert.actionTab === 'users' && alert.actionFilter) {
                                  setFilterStatus(alert.actionFilter);
                                }
                                setActiveTab(alert.actionTab!);
                              }}
                            >
                              <span>Tindak Lanjut</span>
                            </TactileButton>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* 4 Telemetry & Environment Diagnostics Grids */}
              {healthRadar && (
                <section className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 border-t-[0.5px] border-[var(--line)]">
                  <div className="space-y-2">
                    <h4 className="text-[12px] font-semibold text-[var(--ink-12)] flex items-center gap-1.5">
                      <Activity size={13} className="text-[var(--ink-10)]" />
                      <span>Runtime &amp; Memori Server</span>
                    </h4>
                    <div className="border-t-[0.5px] border-[var(--line)] divide-y-[0.5px] divide-[var(--line)] text-[12px]">
                      <div className="py-2 flex justify-between gap-3">
                        <span className="text-[var(--ink-10)]">Node.js Runtime</span>
                        <span className="font-mono tabular-nums text-[var(--ink-12)]">
                          {healthRadar.runtime.nodeVersion} ({healthRadar.runtime.platform})
                        </span>
                      </div>
                      <div className="py-2 flex justify-between gap-3">
                        <span className="text-[var(--ink-10)]">Uptime Proses</span>
                        <span className="font-mono tabular-nums text-[var(--ink-12)]">
                          {formatDuration(healthRadar.runtime.uptimeSec)}
                        </span>
                      </div>
                      <div className="py-2 flex justify-between gap-3">
                        <span className="text-[var(--ink-10)]">RAM RSS vs Target VPS</span>
                        <span className="font-mono tabular-nums text-[var(--ink-12)]">
                          {healthRadar.runtime.rssMb} / {healthRadar.runtime.memLimitMb} MB (
                          {healthRadar.runtime.rssPctOfLimit}%)
                        </span>
                      </div>
                      <div className="py-2 flex justify-between gap-3">
                        <span className="text-[var(--ink-10)]">V8 Heap Terpakai</span>
                        <span className="font-mono tabular-nums text-[var(--ink-12)]">
                          {healthRadar.runtime.heapUsedMb} MB
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-[12px] font-semibold text-[var(--ink-12)] flex items-center gap-1.5">
                      <Database size={13} className="text-[var(--ink-10)]" />
                      <span>SQLite &amp; Ruang Penyimpanan</span>
                    </h4>
                    <div className="border-t-[0.5px] border-[var(--line)] divide-y-[0.5px] divide-[var(--line)] text-[12px]">
                      <div className="py-2 flex justify-between gap-3">
                        <span className="text-[var(--ink-10)]">Ukuran Database + WAL</span>
                        <span className="font-mono tabular-nums text-[var(--ink-12)]">
                          {formatBytes(healthRadar.runtime.dbSizeBytes)} (+
                          {formatBytes(healthRadar.runtime.walSizeBytes)} WAL)
                        </span>
                      </div>
                      <div className="py-2 flex justify-between gap-3">
                        <span className="text-[var(--ink-10)]">Sisa Ruang Disk</span>
                        <span className="font-mono tabular-nums text-[var(--ink-12)]">
                          {formatBytes(healthRadar.runtime.diskFreeBytes)} /{' '}
                          {formatBytes(healthRadar.runtime.diskTotalBytes)}
                        </span>
                      </div>
                      <div className="py-2 flex justify-between gap-3">
                        <span className="text-[var(--ink-10)]">Total Proyek &amp; Riwayat BCT</span>
                        <span className="font-mono tabular-nums text-[var(--ink-12)]">
                          {healthRadar.metrics.totalProjects} proyek ·{' '}
                          {healthRadar.metrics.totalHistory} riwayat
                        </span>
                      </div>
                      <div className="py-2 flex justify-between gap-3">
                        <span className="text-[var(--ink-10)]">Backup Konsol Terakhir</span>
                        <span className="font-mono tabular-nums text-[var(--ink-12)]">
                          {formatDate(healthRadar.environment.lastBackupAt)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-[12px] font-semibold text-[var(--ink-12)] flex items-center gap-1.5">
                      <ShieldCheck size={13} className="text-[var(--ink-10)]" />
                      <span>Lingkungan Proxy, Cookie &amp; Build</span>
                    </h4>
                    <div className="border-t-[0.5px] border-[var(--line)] divide-y-[0.5px] divide-[var(--line)] text-[12px]">
                      <div className="py-2 flex justify-between gap-3">
                        <span className="text-[var(--ink-10)]">Mode Server &amp; TLS</span>
                        <span className="font-mono text-[var(--ink-12)]">
                          {healthRadar.environment.nodeEnv} ·{' '}
                          {healthRadar.environment.isHttps ? 'HTTPS terdeteksi' : 'HTTP'}
                        </span>
                      </div>
                      <div className="py-2 flex justify-between gap-3">
                        <span className="text-[var(--ink-10)]">Atribut Cookie Sesi</span>
                        <span className="font-mono text-[var(--ink-12)] text-right">
                          {healthRadar.environment.cookieMode}
                        </span>
                      </div>
                      <div className="py-2 flex justify-between gap-3">
                        <span className="text-[var(--ink-10)]">Artefak Produksi (`dist`)</span>
                        <span className="font-mono text-[var(--ink-12)]">
                          {healthRadar.environment.distBuilt ? 'HTML siap' : 'Belum di-build'} ·{' '}
                          {healthRadar.environment.swBuilt ? 'SW siap' : 'Mode Dev'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-[12px] font-semibold text-[var(--ink-12)] flex items-center gap-1.5">
                      <KeyRound size={13} className="text-[var(--ink-10)]" />
                      <span>Keamanan Autentikasi</span>
                    </h4>
                    <div className="border-t-[0.5px] border-[var(--line)] divide-y-[0.5px] divide-[var(--line)] text-[12px]">
                      <div className="py-2 flex justify-between gap-3">
                        <span className="text-[var(--ink-10)]">Recovery Key UI</span>
                        <span
                          className={`font-medium ${
                            healthRadar.environment.hasDbRecoveryKey
                              ? 'text-[var(--green-11)]'
                              : 'text-[var(--red-11)]'
                          }`}
                        >
                          {healthRadar.environment.hasDbRecoveryKey
                            ? `Aktif (${formatDate(healthRadar.environment.recoveryKeyRotatedAt)})`
                            : 'Belum dibuat'}
                        </span>
                      </div>
                      <div className="py-2 flex justify-between gap-3">
                        <span className="text-[var(--ink-10)]">Fallback ENV Recovery Key</span>
                        <span className="font-mono text-[var(--ink-12)]">
                          {healthRadar.environment.hasEnvRecoveryKey ? 'Tersedia' : 'Tidak diset'}
                        </span>
                      </div>
                      <div className="py-2 flex justify-between gap-3">
                        <span className="text-[var(--ink-10)]">Admin Cadangan Aktif</span>
                        <span
                          className={`font-mono tabular-nums font-medium ${
                            healthRadar.metrics.activeAdmins >= 2
                              ? 'text-[var(--green-11)]'
                              : 'text-[var(--amber-11)]'
                          }`}
                        >
                          {healthRadar.metrics.activeAdmins} Admin (
                          {healthRadar.metrics.activeAdmins >= 2 ? 'Aman' : 'Perlu cadangan'})
                        </span>
                      </div>
                      <div className="py-2 flex justify-between gap-3">
                        <span className="text-[var(--ink-10)]">Email OTP (SMTP Opsional)</span>
                        <span
                          className={`font-medium ${
                            healthRadar.environment.smtpConfigured
                              ? 'text-[var(--green-11)]'
                              : 'text-[var(--ink-10)]'
                          }`}
                        >
                          {healthRadar.environment.smtpConfigured
                            ? `Aktif (${
                                healthRadar.environment.smtpSource === 'console'
                                  ? 'Konsol Admin'
                                  : 'Environment'
                              })`
                            : 'Belum diatur'}
                        </span>
                      </div>
                      <div className="py-2 flex justify-between gap-3">
                        <span className="text-[var(--ink-10)]">Gagal Login (24 jam)</span>
                        <span className="font-mono tabular-nums text-[var(--ink-12)]">
                          {healthRadar.metrics.failedLogins24h}× percobaan ·{' '}
                          {healthRadar.metrics.lockedUsers} terkunci
                        </span>
                      </div>
                    </div>
                  </div>
                </section>
              )}
            </div>
          )}

          {activeTab === 'audit' && (
            <div className="flex flex-col">
              <div className="px-5 sm:px-6 py-3 border-b-[0.5px] border-[var(--line)] flex flex-wrap items-center justify-between gap-3">
                <TactileSegmented
                  value={auditCategory}
                  size="compact"
                  ariaLabel="Filter kategori log audit"
                  onChange={setAuditCategory}
                  options={[
                    { value: 'all', label: 'Semua' },
                    { value: 'auth', label: 'Login & Daftar' },
                    { value: 'failed', label: 'Gagal Masuk' },
                    { value: 'account', label: 'Perubahan Akun' },
                    { value: 'security', label: 'Keamanan & Backup' },
                  ]}
                />
                <span className="text-[11.5px] font-mono tabular-nums text-[var(--ink-10)]">
                  Menampilkan {auditLogs.length} kejadian terbaru (maks. 500 tersimpan)
                </span>
              </div>

              <div className="px-5 sm:px-6 py-4 divide-y-[0.5px] divide-[var(--line)]">
                {auditLoading && auditLogs.length === 0 ? (
                  <div className="py-12 text-center text-[13px] text-[var(--ink-10)]">
                    Memuat jejak audit dari SQLite...
                  </div>
                ) : auditLogs.length === 0 ? (
                  <div className="py-12 text-center text-[13px] text-[var(--ink-10)]">
                    Belum ada catatan audit pada kategori ini.
                  </div>
                ) : (
                  auditLogs.map((log) => {
                    const sevColor =
                      log.severity === 'critical'
                        ? 'text-[var(--red-11)]'
                        : log.severity === 'warning'
                        ? 'text-[var(--amber-11)]'
                        : 'text-[var(--ink-11)]';
                    const sevLabel =
                      log.severity === 'critical'
                        ? 'Kritis'
                        : log.severity === 'warning'
                        ? 'Peringatan'
                        : 'Info';

                    return (
                      <div
                        key={log.id}
                        className="py-3 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                      >
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
                            <span className={`font-medium ${sevColor}`}>{sevLabel}</span>
                            <span className="text-[var(--ink-9)]">·</span>
                            <span className="font-semibold text-[var(--ink-12)]">
                              {AUDIT_LABELS[log.eventType] || log.eventType}
                            </span>
                            {(log.actorEmail || log.targetEmail) && (
                              <>
                                <span className="text-[var(--ink-9)]">·</span>
                                <span className="font-mono text-[11.5px] text-[var(--ink-11)] truncate">
                                  {log.actorEmail || '-'}
                                  {log.targetEmail && log.targetEmail !== log.actorEmail
                                    ? ` → ${log.targetEmail}`
                                    : ''}
                                </span>
                              </>
                            )}
                          </div>
                          <div className="text-[12px] text-[var(--ink-10)]">{log.detail}</div>
                        </div>

                        <div className="text-[11px] font-mono tabular-nums text-[var(--ink-10)] sm:text-right shrink-0">
                          <div>{formatDate(log.createdAt)}</div>
                          <div>IP: {log.ipAddress || '-'}</div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="p-5 sm:p-6 space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Admin Self-Password Change */}
                <section className="space-y-3">
                  <div>
                    <h3 className="text-[14px] font-semibold text-[var(--ink-12)]">
                      Ubah Password Admin Saya
                    </h3>
                    <p className="text-[12px] text-[var(--ink-10)] mt-0.5">
                      Perbarui password untuk <span className="font-mono">{currentUser.email}</span>.
                      Sesi browser ini tetap tersambung dan sesi perangkat lain dicabut.
                    </p>
                  </div>

                  <form onSubmit={handleChangeOwnPassword} className="space-y-2.5">
                    <div>
                      <label className="block text-[11.5px] text-[var(--ink-10)] mb-1">
                        Password Saat Ini
                      </label>
                      <TactileInputWell
                        type="password"
                        required
                        value={currentAdminPwd}
                        onChange={(e) => setCurrentAdminPwd(e.target.value)}
                        placeholder="Masukkan password sekarang"
                      />
                    </div>
                    <div>
                      <label className="block text-[11.5px] text-[var(--ink-10)] mb-1">
                        Password Baru (min. 6 karakter)
                      </label>
                      <TactileInputWell
                        type="password"
                        required
                        minLength={6}
                        value={newAdminPwd}
                        onChange={(e) => setNewAdminPwd(e.target.value)}
                        placeholder="Ketik password baru"
                      />
                    </div>
                    <div>
                      <label className="block text-[11.5px] text-[var(--ink-10)] mb-1">
                        Konfirmasi Password Baru
                      </label>
                      <TactileInputWell
                        type="password"
                        required
                        minLength={6}
                        value={confirmAdminPwd}
                        onChange={(e) => setConfirmAdminPwd(e.target.value)}
                        placeholder="Ketik ulang password baru"
                      />
                    </div>
                    <TactileButton
                      type="submit"
                      variant="primary"
                      size="compact"
                      disabled={changingOwnPwd}
                    >
                      <KeyRound size={13} />
                      <span>{changingOwnPwd ? 'Menyimpan...' : 'Simpan Password Baru'}</span>
                    </TactileButton>
                  </form>
                </section>

                {/* Admin Recovery Key & Hidden Shortcut Reference */}
                <section className="space-y-3">
                  <div>
                    <h3 className="text-[14px] font-semibold text-[var(--ink-12)]">
                      Admin Emergency Recovery Key
                    </h3>
                    <p className="text-[12px] text-[var(--ink-10)] mt-0.5">
                      Gunakan kunci ini di halaman Login melalui <strong>hidden shortcut</strong>{' '}
                      bila suatu saat Anda lupa password Admin.
                    </p>
                  </div>

                  <div className="border-[0.5px] border-[var(--line)] rounded-[var(--radius-control)] p-3.5 space-y-2.5 text-[12px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[var(--ink-10)]">Status Recovery Key</span>
                      <span
                        className={`font-medium ${
                          healthRadar?.environment.hasDbRecoveryKey
                            ? 'text-[var(--green-11)]'
                            : 'text-[var(--red-11)]'
                        }`}
                      >
                        {healthRadar?.environment.hasDbRecoveryKey
                          ? `Aktif (${formatDate(healthRadar.environment.recoveryKeyRotatedAt)})`
                          : 'Belum dibuat'}
                      </span>
                    </div>

                    <TactileButton
                      type="button"
                      variant="secondary"
                      size="compact"
                      disabled={rotatingKey}
                      onClick={handleRotateRecoveryKey}
                    >
                      <RefreshCw size={13} className={rotatingKey ? 'animate-spin' : ''} />
                      <span>
                        {healthRadar?.environment.hasDbRecoveryKey
                          ? 'Buat / Rotasi Recovery Key Baru'
                          : 'Buat Recovery Key Sekarang'}
                      </span>
                    </TactileButton>

                    {revealedRecoveryKey && (
                      <div className="rounded-[var(--radius-control)] bg-[var(--ink-3)] p-3 space-y-2">
                        <div className="text-[11px] font-medium text-[var(--amber-11)]">
                          Simpan kunci ini sekarang (hanya ditampilkan satu kali):
                        </div>
                        <div className="font-mono text-[13px] font-semibold text-[var(--ink-12)] select-all break-all">
                          {revealedRecoveryKey}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <TactileButton
                            type="button"
                            variant="primary"
                            size="compact"
                            onClick={handleCopyRecoveryKey}
                          >
                            {copiedKey ? <Check size={13} /> : <Copy size={13} />}
                            <span>{copiedKey ? 'Tersalin' : 'Salin Kunci'}</span>
                          </TactileButton>
                          <TactileButton
                            type="button"
                            variant="secondary"
                            size="compact"
                            onClick={handleDownloadRecoveryKeyTxt}
                          >
                            <Download size={13} />
                            <span>Unduh .txt</span>
                          </TactileButton>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="border-[0.5px] border-[var(--line)] rounded-[var(--radius-control)] p-3.5 text-[11.5px] leading-[17px] text-[var(--ink-10)] space-y-1.5">
                    <div className="font-semibold text-[var(--ink-12)]">
                      Panduan Hidden Shortcut &amp; Darurat CLI VPS
                    </div>
                    <div>
                      · Di halaman Login: <strong>Tap 5× logo DieCut.Room</strong> atau tekan{' '}
                      <code className="font-mono text-[var(--ink-12)]">Ctrl+Shift+Alt+A</code>.
                    </div>
                    <div>
                      · Di dalam Workspace: <strong>Tap 5× logo footer</strong> atau tekan{' '}
                      <code className="font-mono text-[var(--ink-12)]">Ctrl+Shift+A</code>.
                    </div>
                    <div>
                      · Jika lupa password &amp; kunci sekaligus di VPS, jalankan:{' '}
                      <code className="font-mono text-[var(--ink-12)]">npm run admin:reset</code>
                    </div>
                  </div>
                </section>
              </div>

              {/* Backup Co-Admin (Admin Cadangan) & Optional Email OTP SMTP */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-5 border-t-[0.5px] border-[var(--line)]">
                {/* Co-Admin Browser Recovery Section */}
                <section className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-[14px] font-semibold text-[var(--ink-12)] flex items-center gap-1.5">
                        <Shield size={14} className="text-[var(--ink-10)]" />
                        <span>Admin Cadangan (Co-Admin Browser)</span>
                      </h3>
                      <p className="text-[12px] text-[var(--ink-10)] mt-0.5">
                        Jika lupa password sekaligus Recovery Key, Admin Cadangan dapat langsung
                        mereset akun Anda dari Konsol Admin di browser.
                      </p>
                    </div>
                    <span
                      className={`text-[11.5px] font-mono tabular-nums shrink-0 font-medium ${
                        activeAdmins.length >= 2
                          ? 'text-[var(--green-11)]'
                          : 'text-[var(--amber-11)]'
                      }`}
                    >
                      {activeAdmins.length} Admin aktif
                    </span>
                  </div>

                  <div className="border-[0.5px] border-[var(--line)] rounded-[var(--radius-control)] divide-y-[0.5px] divide-[var(--line)]">
                    {activeAdmins.map((admin) => {
                      const isSelfAdmin = admin.id === currentUser.id;
                      return (
                        <div
                          key={admin.id}
                          className="px-3 py-2 flex items-center justify-between gap-2 text-[12px]"
                        >
                          <div className="min-w-0 truncate">
                            <span className="font-medium text-[var(--ink-12)]">{admin.name}</span>
                            <span className="text-[var(--ink-9)]"> · </span>
                            <span className="font-mono text-[11.5px] text-[var(--ink-10)]">
                              {admin.email}
                            </span>
                          </div>
                          <span className="text-[11px] font-medium text-[var(--ink-10)] shrink-0">
                            {isSelfAdmin ? 'Anda' : 'Cadangan'}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {coAdminCandidates.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex-1 min-w-[200px]">
                        <TactileSelect
                          value={promoteCandidateId}
                          onChange={(val) => setPromoteCandidateId(String(val))}
                          ariaLabel="Pilih user aktif untuk dijadikan Admin Cadangan"
                          options={coAdminCandidates.map((c) => ({
                            value: c.id,
                            label: `${c.name} (${c.email})`,
                          }))}
                        />
                      </div>
                      <TactileButton
                        type="button"
                        variant="secondary"
                        size="compact"
                        disabled={!promoteCandidateId || busyId !== null}
                        onClick={handlePromoteCoAdmin}
                      >
                        <UserCheck size={13} />
                        <span>Jadikan Co-Admin</span>
                      </TactileButton>
                    </div>
                  ) : (
                    <p className="text-[11.5px] text-[var(--ink-10)]">
                      Belum ada user biasa berstatus aktif yang bisa dipromosikan.
                    </p>
                  )}

                  <TactileButton
                    type="button"
                    variant="secondary"
                    size="compact"
                    onClick={handleQuickCreateCoAdmin}
                  >
                    <UserPlus size={13} />
                    <span>Buat Akun Admin Cadangan Baru</span>
                  </TactileButton>
                </section>

                {/* Optional SMTP Email OTP Configuration */}
                <section className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-[14px] font-semibold text-[var(--ink-12)] flex items-center gap-1.5">
                        <Mail size={14} className="text-[var(--ink-10)]" />
                        <span>Pemulihan Email OTP (SMTP Opsional)</span>
                      </h3>
                      <p className="text-[12px] text-[var(--ink-10)] mt-0.5">
                        Aktifkan SMTP bila ingin menerima kode OTP 6 digit lewat email saat
                        pemulihan darurat di layar Login.
                      </p>
                    </div>
                    <span
                      className={`text-[11.5px] font-medium shrink-0 ${
                        smtpSettings && smtpSettings.source !== 'none'
                          ? 'text-[var(--green-11)]'
                          : 'text-[var(--ink-10)]'
                      }`}
                    >
                      {smtpSettings?.source === 'console'
                        ? 'Aktif (Konsol)'
                        : smtpSettings?.source === 'env'
                        ? 'Aktif (ENV)'
                        : 'Nonaktif'}
                    </span>
                  </div>

                  <form onSubmit={handleSaveSmtp} className="space-y-2.5">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div className="sm:col-span-2">
                        <label className="block text-[11px] text-[var(--ink-10)] mb-1">
                          Host SMTP
                        </label>
                        <TactileInputWell
                          required
                          value={smtpHost}
                          onChange={(e) => setSmtpHost(e.target.value)}
                          placeholder="smtp.gmail.com"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[var(--ink-10)] mb-1">Port</label>
                        <TactileInputWell
                          type="number"
                          min={1}
                          max={65535}
                          required
                          mono
                          value={smtpPort}
                          onChange={(e) => setSmtpPort(e.target.value)}
                          placeholder="587"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] text-[var(--ink-10)] mb-1">
                          Enkripsi Transport
                        </label>
                        <TactileSegmented
                          value={smtpSecure ? 'tls' : 'starttls'}
                          fullWidth
                          size="compact"
                          onChange={(v) => {
                            const isTls = v === 'tls';
                            setSmtpSecure(isTls);
                            if (isTls && smtpPort === '587') setSmtpPort('465');
                            if (!isTls && smtpPort === '465') setSmtpPort('587');
                          }}
                          options={[
                            { value: 'starttls', label: 'STARTTLS (587)' },
                            { value: 'tls', label: 'SSL/TLS (465)' },
                          ]}
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[var(--ink-10)] mb-1">
                          Username / Email SMTP
                        </label>
                        <TactileInputWell
                          required
                          value={smtpUser}
                          onChange={(e) => setSmtpUser(e.target.value)}
                          placeholder="email@domain.com"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] text-[var(--ink-10)] mb-1">
                          Password / App Password SMTP
                        </label>
                        <TactileInputWell
                          type="password"
                          required={!smtpSettings?.hasPassword}
                          value={smtpPass}
                          onChange={(e) => setSmtpPass(e.target.value)}
                          placeholder={
                            smtpSettings?.hasPassword
                              ? 'Tersimpan (kosongkan jika tetap)'
                              : 'Masukkan App Password SMTP'
                          }
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[var(--ink-10)] mb-1">
                          Email Pengirim (From)
                        </label>
                        <TactileInputWell
                          value={smtpFrom}
                          onChange={(e) => setSmtpFrom(e.target.value)}
                          placeholder="Opsional (default: Username)"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                      <TactileButton
                        type="submit"
                        variant="primary"
                        size="compact"
                        disabled={smtpSaving}
                      >
                        <Check size={13} />
                        <span>{smtpSaving ? 'Menyimpan...' : 'Simpan SMTP'}</span>
                      </TactileButton>
                      <TactileButton
                        type="button"
                        variant="secondary"
                        size="compact"
                        disabled={smtpTesting || !smtpSettings || smtpSettings.source === 'none'}
                        onClick={handleTestSmtp}
                      >
                        <Send size={13} />
                        <span>{smtpTesting ? 'Mengirim...' : 'Kirim Email Uji'}</span>
                      </TactileButton>
                      {smtpSettings?.source === 'console' && (
                        <TactileButton
                          type="button"
                          variant="ghost"
                          size="compact"
                          disabled={smtpSaving}
                          onClick={handleClearConsoleSmtp}
                        >
                          <span>Hapus Pengaturan</span>
                        </TactileButton>
                      )}
                    </div>
                  </form>
                </section>
              </div>

              {/* External Agent Integration (Hermes MCP / REST Skill Handshake) */}
              <section className="pt-5 border-t-[0.5px] border-[var(--line)] space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="space-y-0.5">
                    <h3 className="text-[14px] font-semibold text-[var(--ink-12)] flex items-center gap-1.5">
                      <Bot size={14} className="text-[var(--ink-10)]" />
                      <span>Integrasi Hermes Agent (MCP &amp; REST API)</span>
                    </h3>
                    <p className="text-[12px] text-[var(--ink-10)]">
                      Berikan skill otomatis di kontak pertama, kirim template form manual
                      (Telegram/WhatsApp/CLI), hitung BCT Corrected, ECT &amp; Engineering, serta
                      generate file Dieline 2D SVG (Clean CAD / Spec Sheet 1:1 mm) tanpa dicatat
                      ke Log Audit.
                    </p>
                  </div>
                  <div className="text-[11.5px] font-mono tabular-nums shrink-0 text-right">
                    {agentKeyInfo?.configured ? (
                      <span className="text-[var(--green-11)]">
                        Aktif · {agentKeyInfo.prefix}
                      </span>
                    ) : (
                      <span className="text-[var(--ink-10)]">Belum dikonfigurasi</span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <TactileButton
                    type="button"
                    variant="primary"
                    size="compact"
                    disabled={agentKeyBusy}
                    onClick={handleGenerateAgentKey}
                  >
                    <KeyRound size={13} />
                    <span>
                      {agentKeyBusy
                        ? 'Memproses...'
                        : agentKeyInfo?.configured
                        ? 'Putar Ulang API Key Agent'
                        : 'Buat API Key Agent'}
                    </span>
                  </TactileButton>
                  {agentKeyInfo?.configured && (
                    <TactileButton
                      type="button"
                      variant="ghost"
                      size="compact"
                      disabled={agentKeyBusy}
                      onClick={handleRevokeAgentKey}
                    >
                      <Trash2 size={13} />
                      <span>Nonaktifkan Key</span>
                    </TactileButton>
                  )}
                  <span className="text-[11px] font-mono text-[var(--ink-9)]">
                    Skill v{agentKeyInfo?.skillVersion || '1.0.0'}
                    {agentKeyInfo?.updatedAt ? ` · Diperbarui ${formatDate(agentKeyInfo.updatedAt)}` : ''}
                  </span>
                </div>

                {revealedAgentKey && (
                  <div className="border-[0.5px] border-[var(--line)] bg-[var(--ink-1)] rounded-[var(--radius-control)] p-3.5 space-y-2">
                    <div className="text-[11.5px] font-semibold text-[var(--ink-12)]">
                      API Key Baru (hanya ditampilkan satu kali)
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <code className="font-mono text-[12px] font-semibold text-[var(--ink-12)] break-all">
                        {revealedAgentKey}
                      </code>
                      <TactileButton
                        type="button"
                        variant="secondary"
                        size="compact"
                        onClick={() => handleCopyAgentSnippet(revealedAgentKey, 'key')}
                      >
                        {copiedAgentSnippet === 'key' ? <Check size={13} /> : <Copy size={13} />}
                        <span>{copiedAgentSnippet === 'key' ? 'Tersalin' : 'Salin Key'}</span>
                      </TactileButton>
                    </div>
                  </div>
                )}

                {(() => {
                  const originUrl =
                    typeof window !== 'undefined' ? window.location.origin : 'https://cad.domainanda.com';
                  const displayKey = revealedAgentKey || '<API_KEY_AGENT_ANDA>';
                  const skillVer = agentKeyInfo?.skillVersion || '1.1.0';
                  const snippets = buildHermesAgentSnippets(originUrl, displayKey, skillVer);
                  const activeSnippet = snippets[hermesGuideTab];

                  return (
                    <div className="border-[0.5px] border-[var(--line)] rounded-[var(--radius-control)] p-3.5 space-y-2.5 bg-[var(--ink-1)]">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <TactileSegmented
                          value={hermesGuideTab}
                          size="compact"
                          ariaLabel="Pilih format integrasi Hermes"
                          onChange={(tab) => setHermesGuideTab(tab)}
                          options={[
                            { value: 'mcp', label: 'Hermes MCP (config.yaml)' },
                            { value: 'skill', label: 'Unduh SKILL.md' },
                            { value: 'rest', label: 'REST API' },
                          ]}
                        />
                        <TactileButton
                          type="button"
                          variant={revealedAgentKey ? 'primary' : 'secondary'}
                          size="compact"
                          onClick={() => handleCopyAgentSnippet(activeSnippet, hermesGuideTab)}
                        >
                          {copiedAgentSnippet === hermesGuideTab ? (
                            <Check size={13} />
                          ) : (
                            <Copy size={13} />
                          )}
                          <span>
                            {copiedAgentSnippet === hermesGuideTab
                              ? revealedAgentKey
                                ? 'Tersalin (+ Key)'
                                : 'Tersalin'
                              : revealedAgentKey
                              ? 'Salin Konfigurasi (+ Key)'
                              : 'Salin Konfigurasi'}
                          </span>
                        </TactileButton>
                      </div>
                      <pre className="font-mono text-[11px] leading-[16px] text-[var(--ink-11)] overflow-x-auto whitespace-pre select-all">
                        {activeSnippet}
                      </pre>
                    </div>
                  );
                })()}
              </section>

              {/* Consistent Database Backup Section */}
              <section className="pt-4 border-t-[0.5px] border-[var(--line)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <h3 className="text-[14px] font-semibold text-[var(--ink-12)]">
                    Backup Konsisten Database SQLite
                  </h3>
                  <p className="text-[12px] text-[var(--ink-10)]">
                    Snapshot dibuat via <code className="font-mono">VACUUM INTO</code> agar aman
                    terhadap file WAL aktif sebelum update VPS. Terakhir:{' '}
                    <span className="font-mono tabular-nums">
                      {formatDate(healthRadar?.environment.lastBackupAt || null)}
                    </span>
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <TactileButton
                    type="button"
                    variant="primary"
                    size="compact"
                    disabled={downloadingBackup !== null}
                    onClick={() => handleDownloadBackup('sqlite')}
                  >
                    <Download size={13} />
                    <span>
                      {downloadingBackup === 'sqlite'
                        ? 'Menyiapkan...'
                        : 'Unduh Snapshot SQLite (.db)'}
                    </span>
                  </TactileButton>
                  <TactileButton
                    type="button"
                    variant="secondary"
                    size="compact"
                    disabled={downloadingBackup !== null}
                    onClick={() => handleDownloadBackup('json')}
                  >
                    <Download size={13} />
                    <span>
                      {downloadingBackup === 'json' ? 'Menyiapkan...' : 'Ekspor Data JSON'}
                    </span>
                  </TactileButton>
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
