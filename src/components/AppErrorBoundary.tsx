import React from 'react';
import { clearBrowserCachesAndReload, isChunkLoadError } from '../utils/lazyWithRetry';

interface AppErrorBoundaryState {
  hasError: boolean;
  message: string;
  recovering: boolean;
}

export default class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  AppErrorBoundaryState
> {
  declare readonly props: { children: React.ReactNode };
  declare setState: (state: Partial<AppErrorBoundaryState>) => void;
  state: AppErrorBoundaryState = { hasError: false, message: '', recovering: false };

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
    return { hasError: true, message, recovering: false };
  }

  componentDidCatch(error: unknown) {
    if (typeof window !== 'undefined') {
      (window as unknown as { __DIECUT_MOUNTED__?: boolean }).__DIECUT_MOUNTED__ = true;
    }

    // Silent client-side auto-recovery on chunk/module mismatch without logging to Admin
    if (isChunkLoadError(error)) {
      this.setState({ recovering: true });
      void clearBrowserCachesAndReload(12000).then((didReload) => {
        if (!didReload) {
          this.setState({ recovering: false });
        }
      });
    }
  }

  handleRecover = async () => {
    this.setState({ recovering: true });
    await clearBrowserCachesAndReload(0);
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen w-full bg-[#f4f5f7] text-[#17191f] flex items-center justify-center p-6">
        <div className="w-full max-w-[420px] rounded-[var(--radius-feature,8px)] bg-white border border-[#cdd2db] shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-3">
            <img src="/icon.svg" alt="DieCut.Room" className="size-8 rounded-md shrink-0" />
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
            {this.state.recovering
              ? 'Menyegarkan modul terbaru dan membersihkan cache browser secara otomatis...'
              : 'Terjadi gangguan saat memuat modul halaman atau cache versi lama masih tersimpan di browser Anda.'}
          </p>

          {this.state.message && !this.state.recovering && (
            <div className="rounded-[var(--radius-control,6px)] bg-[#f4f5f7] border border-[#dadde4] px-3 py-2 text-[11.5px] font-mono text-[#5c626e] break-words">
              {this.state.message}
            </div>
          )}

          <button
            type="button"
            disabled={this.state.recovering}
            onClick={this.handleRecover}
            className="w-full h-[36px] rounded-[var(--radius-control,6px)] bg-[#17191f] text-white text-[13px] font-medium hover:opacity-90 disabled:opacity-60 cursor-pointer"
          >
            {this.state.recovering ? 'Memulihkan...' : 'Muat Ulang & Bersihkan Cache'}
          </button>
        </div>
      </div>
    );
  }
}
