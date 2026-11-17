import React, { useEffect, useState } from 'react';
import { Download, Smartphone, WifiOff } from 'lucide-react';
import { TactileButton } from './tactile/TactileUI';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    const ua = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(ua));

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return {
    isInstallable: !!deferredPrompt,
    isInstalled,
    isIOS,
    install,
  };
}

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  return isOnline;
}

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <TactileButton
        type="button"
        variant="secondary"
        size="compact"
        onClick={install}
        title="Install DieCut.Room sebagai aplikasi desktop/mobile"
      >
        <Download size={13} className="text-[var(--ink-10)]" />
        <span>Install App</span>
      </TactileButton>
    );
  }

  if (isIOS) {
    return (
      <>
        <TactileButton
          type="button"
          variant="secondary"
          size="compact"
          onClick={() => setShowIOSGuide(true)}
        >
          <Smartphone size={13} className="text-[var(--ink-10)]" />
          <span>Install iOS</span>
        </TactileButton>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--backdrop)] p-4">
            <div className="surface-raised w-full max-w-sm rounded-[var(--radius-container)] bg-[var(--surface-top)] shadow-[var(--shadow-modal)] p-5 space-y-3">
              <h3 className="font-brand text-[15px] font-semibold text-[var(--ink-12)]">
                Install DieCut.Room di iPhone / iPad
              </h3>
              <p className="text-[13px] leading-[20px] text-[var(--ink-11)]">
                1. Ketuk tombol <strong className="text-[var(--ink-12)]">Share</strong> di bilah Safari.<br />
                2. Pilih <strong className="text-[var(--ink-12)]">Add to Home Screen</strong> untuk memasang aplikasi.
              </p>
              <TactileButton
                type="button"
                variant="primary"
                className="w-full"
                onClick={() => setShowIOSGuide(false)}
              >
                Tutup
              </TactileButton>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-16 md:bottom-12 left-4 z-40 surface-raised bg-[var(--surface-top)] rounded-[var(--radius-control)] shadow-[var(--shadow-card)] px-3 py-1.5 flex items-center gap-2 text-[12px] leading-[16px] text-[var(--amber-11)]"
    >
      <WifiOff size={13} className="shrink-0" />
      <span>Offline Mode · Cache lokal aktif</span>
    </div>
  );
};
