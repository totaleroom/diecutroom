import React, { useEffect, useState } from 'react';

export type GenieDockOrigin = 'left' | 'center';

interface MobileGenieSheetProps {
  open: boolean;
  isMobileGenie: boolean;
  side: 'left' | 'right';
  dockOrigin: GenieDockOrigin;
  ariaLabel: string;
  onClose: () => void;
  children: (ctx: { isCenteredMobile: boolean }) => React.ReactNode;
}

/**
 * Renders an overlay workspace panel:
 * - On Mobile Portrait (from bottom Floating Thumb Dock): fluid "Genie-on-the-Lamp" emergence
 *   into a centered floating card with reverse retract animation before unmount.
 * - On Tablet / Compact Desktop overlay: clean side-anchored overlay drawer.
 */
export default function MobileGenieSheet({
  open,
  isMobileGenie,
  side,
  dockOrigin,
  ariaLabel,
  onClose,
  children,
}: MobileGenieSheetProps) {
  const [rendered, setRendered] = useState(open);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (open) {
      setRendered(true);
      setClosing(false);
      return;
    }
    if (!rendered) return;
    if (!isMobileGenie) {
      setRendered(false);
      setClosing(false);
      return;
    }
    setClosing(true);
    const timer = window.setTimeout(() => {
      setRendered(false);
      setClosing(false);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [open, rendered, isMobileGenie]);

  useEffect(() => {
    if (!rendered) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [rendered, onClose]);

  if (!rendered) return null;

  if (isMobileGenie) {
    // Horizontal offset matching the tapped button in the centered bottom Floating Thumb Dock
    const originX = dockOrigin === 'left' ? '26%' : '54%';
    const dx = dockOrigin === 'left' ? '-22vw' : '3vw';

    return (
      <div
        className="fixed inset-0 z-40 flex items-center justify-center px-3 pt-14 pb-[74px]"
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
      >
        <div
          className={`absolute inset-0 bg-[var(--backdrop)] backdrop-blur-[2px] ${
            closing ? 'mobile-genie-backdrop-out' : 'mobile-genie-backdrop-in'
          }`}
          onClick={onClose}
          aria-hidden="true"
        />
        <div
          style={
            {
              transformOrigin: `${originX} 100%`,
              '--genie-dx': dx,
            } as React.CSSProperties
          }
          className={`relative z-10 w-[min(372px,calc(100vw-24px))] h-[min(78dvh,640px)] rounded-[var(--radius-feature)] overflow-hidden border-[0.5px] border-[var(--line)] shadow-[var(--shadow-modal)] bg-[var(--surface-top)] flex flex-col ${
            closing ? 'mobile-genie-panel-out' : 'mobile-genie-panel-in'
          }`}
        >
          {children({ isCenteredMobile: true })}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`fixed inset-0 z-40 flex ${side === 'right' ? 'justify-end' : 'justify-start'}`}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
    >
      <div
        className="absolute inset-0 bg-[var(--backdrop)] backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />
      {children({ isCenteredMobile: false })}
    </div>
  );
}
