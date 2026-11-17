import React, { useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, Clock, ShieldAlert } from 'lucide-react';
import { AuthUser } from '../types';
import { collectAccessMetadata } from '../utils/whatsapp';
import InteractiveMatrixCanvas from './InteractiveMatrixCanvas';
import { HalftonePerimeterFrame, TopRightSheetHalftone } from './HalftoneSheetDecor';
import WhatsAppContactButton from './WhatsAppContactButton';
import { TactileButton, TactileInputWell, TactileSegmented } from './tactile/TactileUI';

interface AuthGateProps {
  initialStatusNotice?: {
    code: 'ACCOUNT_PENDING' | 'ACCOUNT_DISABLED';
    email?: string;
    name?: string;
  } | null;
  onAuthenticated: (user: AuthUser) => void;
}

type AuthTab = 'login' | 'register';
type GateView = 'form' | 'pending' | 'disabled';

export default function AuthGate({ initialStatusNotice, onAuthenticated }: AuthGateProps) {
  const [tab, setTab] = useState<AuthTab>('login');
  const [view, setView] = useState<GateView>(
    initialStatusNotice?.code === 'ACCOUNT_PENDING'
      ? 'pending'
      : initialStatusNotice?.code === 'ACCOUNT_DISABLED'
      ? 'disabled'
      : 'form'
  );

  const [name, setName] = useState(initialStatusNotice?.name || '');
  const [email, setEmail] = useState(initialStatusNotice?.email || '');
  const [company, setCompany] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const accessMeta = useMemo(() => collectAccessMetadata(), []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);

    try {
      const endpoint = tab === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body =
        tab === 'login'
          ? { email, password, clientMeta: accessMeta }
          : { name, email, company, password, clientMeta: accessMeta };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 201 && data.status === 'pending') {
        setView('pending');
        return;
      }

      if (res.status === 403 && data.code === 'ACCOUNT_PENDING') {
        if (data.user?.name) setName(data.user.name);
        setView('pending');
        return;
      }

      if (res.status === 403 && data.code === 'ACCOUNT_DISABLED') {
        if (data.user?.name) setName(data.user.name);
        setView('disabled');
        return;
      }

      if (!res.ok) {
        if (data.code === 'ALREADY_PENDING') {
          setView('pending');
          return;
        }
        if (data.code === 'ALREADY_DISABLED') {
          setView('disabled');
          return;
        }
        setErrorMsg(data.error || 'Email atau password tidak sesuai.');
        return;
      }

      if (data.user) {
        onAuthenticated(data.user);
      }
    } catch {
      setErrorMsg('Koneksi terputus. Periksa jaringan Anda lalu coba lagi.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-[#090A0D] flex flex-col justify-between px-6 py-6 sm:p-10 lg:px-16 lg:py-10">
      <InteractiveMatrixCanvas />

      <div className="relative z-10 flex-1 flex items-center justify-start pointer-events-none">
        <div
          className="pointer-events-auto relative w-full max-w-[408px]"
          style={
            {
              '--radius-control': '2px',
              '--radius-container': '2px',
              '--radius-feature': '2px',
            } as React.CSSProperties
          }
        >
          <HalftonePerimeterFrame />

          <div className="surface-raised relative z-10 overflow-hidden bg-[#fcfcfd] text-[var(--ink-12)] rounded-[2px] border border-[#d5d9e2] shadow-[0_28px_72px_-16px_rgba(0,0,0,0.82)] p-6 sm:p-7 space-y-5">
            <TopRightSheetHalftone />

            <div className="relative z-10 flex items-center gap-3 pb-4 border-b-[0.5px] border-[var(--line)]">
              <img
                src="/icon.svg"
                alt="DieCut.Room emblem"
                className="size-9 rounded-[2px] shadow-[var(--shadow-card)] shrink-0"
              />
              <div className="min-w-0">
                <h1 className="font-brand text-[18px] leading-[22px] font-semibold text-[var(--ink-12)] truncate">
                  DieCut.Room
                </h1>
                <p className="text-[12px] leading-[16px] text-[var(--ink-10)] truncate">
                  Packaging CAD &amp; 3D Palletizer
                </p>
              </div>
            </div>

            {view === 'form' ? (
              <>
                <div className="relative z-10 flex items-center justify-between gap-3">
                  <h2 className="text-[15px] leading-[20px] font-semibold text-[var(--ink-12)]">
                    {tab === 'login' ? 'Masuk ke Workstation' : 'Daftar Akun'}
                  </h2>
                  <TactileSegmented
                    value={tab}
                    size="compact"
                    shape="control"
                    ariaLabel="Pilih mode masuk atau daftar"
                    onChange={(nextTab) => {
                      setTab(nextTab);
                      setErrorMsg(null);
                    }}
                    options={[
                      { value: 'login', label: 'Masuk' },
                      { value: 'register', label: 'Daftar' },
                    ]}
                  />
                </div>

              <p className="relative z-10 text-[12.5px] leading-[18px] text-[var(--ink-10)] -mt-2">
                {tab === 'login'
                  ? 'Rancang dieline FEFCO, simulasi lipat 3D, dan optimasi tumpukan palet.'
                  : 'Daftarkan akun Anda untuk mendapatkan akses workstation.'}
              </p>

              {errorMsg && (
                <div
                  role="alert"
                  className="relative z-10 rounded-[var(--radius-control)] bg-[var(--red-3)] px-3.5 py-2.5 text-[12px] leading-[18px] text-[var(--red-11)]"
                >
                  {errorMsg}
                </div>
              )}

              <form onSubmit={handleSubmit} className="relative z-10 space-y-3.5">
                {tab === 'register' && (
                  <>
                    <div>
                      <label className="block text-[12px] leading-[16px] text-[var(--ink-10)] mb-1">
                        Nama lengkap
                      </label>
                      <TactileInputWell
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Contoh: Budi Santoso"
                        compact={false}
                      />
                    </div>
                    <div>
                      <label className="block text-[12px] leading-[16px] text-[var(--ink-10)] mb-1">
                        Perusahaan (opsional)
                      </label>
                      <TactileInputWell
                        type="text"
                        value={company}
                        onChange={(e) => setCompany(e.target.value)}
                        placeholder="Nama tim atau perusahaan"
                        compact={false}
                      />
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-[12px] leading-[16px] text-[var(--ink-10)] mb-1">
                    Email
                  </label>
                  <TactileInputWell
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nama@perusahaan.com"
                    compact={false}
                  />
                </div>

                <div>
                  <label className="block text-[12px] leading-[16px] text-[var(--ink-10)] mb-1">
                    Password
                  </label>
                  <TactileInputWell
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimal 6 karakter"
                    compact={false}
                  />
                </div>

                <TactileButton
                  type="submit"
                  variant="primary"
                  disabled={submitting}
                  className="w-full mt-1"
                >
                  {submitting
                    ? 'Memproses...'
                    : tab === 'login'
                    ? 'Masuk ke DieCut.Room'
                    : 'Kirim Pendaftaran'}
                </TactileButton>
              </form>

              <div className="relative z-10 pt-4 border-t-[0.5px] border-[var(--line)] space-y-2.5">
                <p className="text-[12px] leading-[17px] text-[var(--ink-10)]">
                  {tab === 'login'
                    ? 'Lupa password atau butuh bantuan masuk?'
                    : 'Setelah mendaftar, aktivasi akun dikonfirmasi melalui Admin.'}
                </p>
                <WhatsAppContactButton
                  context={tab === 'login' ? 'forgot-password' : 'new-access'}
                  label={
                    tab === 'login'
                      ? 'Hubungi Admin via WhatsApp'
                      : 'Konfirmasi Akses via WhatsApp'
                  }
                  name={name}
                  email={email}
                  company={company}
                  variant="subtle"
                  fullWidth
                  showMetadataPreview={false}
                />
              </div>
            </>
          ) : (
            <div className="relative z-10 space-y-4">
              <div className="flex items-start gap-3">
                {view === 'pending' ? (
                  <Clock size={20} className="text-[var(--amber-11)] mt-0.5 shrink-0" />
                ) : (
                  <ShieldAlert size={20} className="text-[var(--red-11)] mt-0.5 shrink-0" />
                )}
                <div className="space-y-1">
                  <h2 className="text-[15px] leading-[21px] font-semibold text-[var(--ink-12)]">
                    {view === 'pending'
                      ? 'Menunggu Aktivasi Admin'
                      : 'Akun Sedang Nonaktif'}
                  </h2>
                  <p className="text-[12.5px] leading-[19px] text-[var(--ink-11)]">
                    {view === 'pending'
                      ? `Permintaan akses untuk ${email || 'akun Anda'} telah diterima. Hubungi Admin untuk aktivasi cepat.`
                      : `Akses untuk ${email || 'akun ini'} saat ini dinonaktifkan. Silakan hubungi Admin untuk mengaktifkan kembali.`}
                  </p>
                </div>
              </div>

              <div className="rounded-[var(--radius-control)] bg-[var(--ink-3)] px-3.5 py-2.5 flex items-center gap-2 text-[12px] text-[var(--ink-11)]">
                <CheckCircle2 size={14} className="text-[var(--green-11)] shrink-0" />
                <span>Detail akun otomatis terlampir di pesan WhatsApp</span>
              </div>

              <WhatsAppContactButton
                context={view === 'pending' ? 'pending-approval' : 'account-disabled'}
                label="Hubungi Admin WhatsApp"
                name={name}
                email={email}
                company={company}
                variant="solid"
                fullWidth
                showMetadataPreview={false}
              />

              <div className="flex items-center justify-between pt-2 border-t-[0.5px] border-[var(--line)]">
                <TactileButton
                  type="button"
                  variant="ghost"
                  size="compact"
                  onClick={() => {
                    setView('form');
                    setTab('login');
                    setErrorMsg(null);
                  }}
                >
                  <ArrowLeft size={13} />
                  <span>Kembali ke Login</span>
                </TactileButton>
              </div>
            </div>
          )}
          </div>
        </div>
      </div>

      <footer className="relative z-10 pt-6 flex items-center justify-end pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-2.5 text-[12px] text-[#9CA3AF] whitespace-nowrap shrink-0">
          <span>Made by</span>
          <img
            src="/assets/aistudio/Asset_2_5ca58983.svg"
            alt="Totale.Room"
            width={99}
            height={13}
            loading="eager"
            decoding="sync"
            className="h-[13px] w-auto object-contain opacity-95 select-none"
          />
        </div>
      </footer>
    </div>
  );
}
