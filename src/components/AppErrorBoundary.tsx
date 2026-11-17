import React from 'react';

interface AppErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export default class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  AppErrorBoundaryState
> {
  declare readonly props: { children: React.ReactNode };
  state: AppErrorBoundaryState = { hasError: false, message: '' };

  constructor(props: { children: React.ReactNode }) {
    super(props);
  }

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
        ? error
        : 'Terjadi kesalahan saat merender antarmuka.';
    return { hasError: true, message };
  }

  handleRecover = async () => {
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch {
      // Ignore cleanup errors and force reload
    }
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen w-full bg-[#f4f5f7] text-[#17191f] flex items-center justify-center p-6">
        <div className="w-full max-w-[420px] rounded-xl bg-white border border-[#cdd2db] shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-3">
            <img src="/icon.svg" alt="" className="size-8 rounded-md shrink-0" />
            <div>
              <h1 className="font-brand text-[16px] font-semibold text-[#17191f]">
                DieCut.Room
              </h1>
              <p className="text-[12px] text-[#5c626e]">
                Pemulihan Tampilan Otomatis
              </p>
            </div>
          </div>

          <p className="text-[13px] leading-[19px] text-[#474d58]">
            Terjadi gangguan saat memuat modul halaman atau cache versi lama masih tersimpan di browser Anda.
          </p>

          {this.state.message && (
            <div className="rounded-md bg-[#f4f5f7] border border-[#dadde4] px-3 py-2 text-[11.5px] font-mono text-[#5c626e] break-words">
              {this.state.message}
            </div>
          )}

          <button
            type="button"
            onClick={this.handleRecover}
            className="w-full h-[36px] rounded-md bg-[#17191f] text-white text-[13px] font-medium hover:opacity-90 cursor-pointer"
          >
            Muat Ulang &amp; Bersihkan Cache
          </button>
        </div>
      </div>
    );
  }
}
