import React, { useEffect, useState } from 'react';
import { FolderOpen, Save, Trash2, X } from 'lucide-react';
import { BoxConfig, SavedBoxProject } from '../types';
import { TactileButton, TactileInputWell } from './tactile/TactileUI';
import { authFetch } from '../utils/apiSession';

interface ProjectsModalProps {
  open: boolean;
  currentConfig: BoxConfig;
  onLoadProject: (config: BoxConfig) => void;
  onClose: () => void;
}

export default function ProjectsModal({
  open,
  currentConfig,
  onLoadProject,
  onClose,
}: ProjectsModalProps) {
  const [projects, setProjects] = useState<SavedBoxProject[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchProjects = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await authFetch('/api/projects');
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Gagal memuat proyek.');
        return;
      }
      setProjects(Array.isArray(data.projects) ? data.projects : []);
    } catch {
      setErrorMsg('Koneksi ke server terputus.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchProjects();
      const suggested = `${currentConfig.metadata.productName || 'Box'} ${Math.round(
        currentConfig.dimensions.length
      )}x${Math.round(currentConfig.dimensions.width)}x${Math.round(
        currentConfig.dimensions.depth
      )}`;
      setProjectName(suggested);
    }
  }, [open, currentConfig]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim()) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      const res = await authFetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: projectName.trim(), config: currentConfig }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Gagal menyimpan proyek.');
        return;
      }
      if (data.project) {
        setProjects((prev) => [data.project, ...prev.filter((p) => p.id !== data.project.id)]);
      }
    } catch {
      setErrorMsg('Gagal menyimpan ke server VPS.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await authFetch(`/api/projects/${id}`, {
        method: 'DELETE',
      });
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch {
      setErrorMsg('Gagal menghapus proyek.');
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--backdrop)] p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Proyek Dieline Tersimpan"
        className="surface-raised w-full max-w-[600px] max-h-[82vh] bg-[var(--surface-top)] rounded-[var(--radius-feature)] shadow-[var(--shadow-modal)] flex flex-col overflow-hidden"
      >
        <div className="px-5 py-4 border-b-[0.5px] border-[var(--line)] flex items-center justify-between gap-4 shrink-0">
          <div>
            <h2 className="text-[15px] leading-[22px] font-semibold text-[var(--ink-12)]">
              Proyek Dieline Tersimpan
            </h2>
            <p className="text-[12px] leading-[16px] text-[var(--ink-10)]">
              Tersinkron ke akun Anda di server VPS untuk akses lintas perangkat.
            </p>
          </div>
          <TactileButton type="button" variant="icon" onClick={onClose} aria-label="Tutup daftar proyek">
            <X size={16} />
          </TactileButton>
        </div>

        <form onSubmit={handleSave} className="px-5 py-3.5 border-b-[0.5px] border-[var(--line)] bg-[var(--ink-1)] flex items-center gap-2.5 shrink-0">
          <div className="flex-1">
            <TactileInputWell
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Nama proyek box baru..."
              required
            />
          </div>
          <TactileButton type="submit" variant="primary" size="compact" disabled={saving}>
            <Save size={13} />
            <span>{saving ? 'Menyimpan...' : 'Simpan Proyek'}</span>
          </TactileButton>
        </form>

        {errorMsg && (
          <div className="mx-5 mt-3 rounded-[var(--radius-control)] bg-[var(--red-3)] px-3 py-2 text-[12px] text-[var(--red-11)]">
            {errorMsg}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-3 divide-y-[0.5px] divide-[var(--line)]">
          {loading ? (
            <div className="py-10 text-center text-[12px] text-[var(--ink-10)]">
              Memuat proyek tersimpan...
            </div>
          ) : projects.length === 0 ? (
            <div className="py-10 text-center text-[12px] text-[var(--ink-10)]">
              Belum ada proyek tersimpan di akun ini. Klik Simpan Proyek di atas untuk menyimpan konfigurasi saat ini.
            </div>
          ) : (
            projects.map((p) => (
              <div key={p.id} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-[var(--ink-12)] truncate">
                    {p.name}
                  </div>
                  <div className="text-[11px] font-mono tabular-nums text-[var(--ink-10)]">
                    FEFCO {p.boxStyle} · {p.dimsSummary} · {new Date(p.updatedAt).toLocaleDateString('id-ID')}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <TactileButton
                    type="button"
                    variant="secondary"
                    size="compact"
                    onClick={() => {
                      onLoadProject(p.config);
                      onClose();
                    }}
                  >
                    <FolderOpen size={13} />
                    <span>Muat</span>
                  </TactileButton>
                  <TactileButton
                    type="button"
                    variant="icon"
                    onClick={() => handleDelete(p.id)}
                    aria-label={`Hapus proyek ${p.name}`}
                  >
                    <Trash2 size={13} className="text-[var(--red-11)]" />
                  </TactileButton>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
