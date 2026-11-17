import { useCallback, useEffect, useRef, useState } from 'react';

export type ViewportTier = 'desktop' | 'compact' | 'tablet' | 'mobile';

export function resolveViewportTier(width: number): ViewportTier {
  if (width >= 1280) return 'desktop';
  if (width >= 1024) return 'compact';
  if (width >= 768) return 'tablet';
  return 'mobile';
}

export function resolveShortLandscape(width: number, height: number): boolean {
  return height <= 500 && width >= 560;
}

interface PanelSnapshot {
  specsOpen: boolean;
  bctOpen: boolean;
  palletConfigOpen: boolean;
}

function defaultStateForLayout(tier: ViewportTier, shortLandscape: boolean): PanelSnapshot {
  if (shortLandscape) {
    return { specsOpen: false, bctOpen: false, palletConfigOpen: false };
  }
  if (tier === 'desktop') {
    return { specsOpen: true, bctOpen: true, palletConfigOpen: true };
  }
  if (tier === 'compact') {
    // Auto-minimize BCT rail on 1024-1279px so left panel + CAD canvas remain spacious
    return { specsOpen: true, bctOpen: false, palletConfigOpen: true };
  }
  // Tablet (< 1024px) & Mobile (< 768px): auto-minimize both rails for unobstructed canvas
  return { specsOpen: false, bctOpen: false, palletConfigOpen: false };
}

export function useWorkspaceLayout() {
  const initialWidth = typeof window !== 'undefined' ? window.innerWidth : 1440;
  const initialHeight = typeof window !== 'undefined' ? window.innerHeight : 900;
  const initialTier = resolveViewportTier(initialWidth);
  const initialShortLandscape = resolveShortLandscape(initialWidth, initialHeight);

  const [tier, setTier] = useState<ViewportTier>(initialTier);
  const [isShortLandscape, setIsShortLandscape] = useState<boolean>(initialShortLandscape);
  const [specsOpen, setSpecsOpen] = useState<boolean>(
    () => defaultStateForLayout(initialTier, initialShortLandscape).specsOpen
  );
  const [bctOpen, setBctOpen] = useState<boolean>(
    () => defaultStateForLayout(initialTier, initialShortLandscape).bctOpen
  );
  const [palletConfigOpen, setPalletConfigOpen] = useState<boolean>(
    () => defaultStateForLayout(initialTier, initialShortLandscape).palletConfigOpen
  );
  const [focusMode, setFocusMode] = useState<boolean>(false);

  const prevKeyRef = useRef<string>(`${initialTier}:${initialShortLandscape}`);
  const preFocusRef = useRef<PanelSnapshot>(defaultStateForLayout(initialTier, initialShortLandscape));

  // Auto-minimize panels smoothly only when crossing breakpoint tiers or short-landscape posture
  useEffect(() => {
    const onResize = () => {
      const nextTier = resolveViewportTier(window.innerWidth);
      const nextShortLandscape = resolveShortLandscape(window.innerWidth, window.innerHeight);
      const nextKey = `${nextTier}:${nextShortLandscape}`;
      if (nextKey === prevKeyRef.current) return;
      prevKeyRef.current = nextKey;
      setTier(nextTier);
      setIsShortLandscape(nextShortLandscape);

      if (!focusMode) {
        const defaults = defaultStateForLayout(nextTier, nextShortLandscape);
        setSpecsOpen(defaults.specsOpen);
        setBctOpen(defaults.bctOpen);
        setPalletConfigOpen(defaults.palletConfigOpen);
      }
    };

    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [focusMode]);

  // Derived overlay posture per tier:
  // - Left rail (Specs / Pallet Config) overlays on tablet, mobile, or short mobile landscape
  // - Right rail (BCT Pro) overlays below 1280px or on short mobile landscape
  const isMobile = tier === 'mobile';
  const isLeftOverlay = tier === 'tablet' || tier === 'mobile' || isShortLandscape;
  const isRightOverlay = tier !== 'desktop' || isShortLandscape;

  const openSpecs = useCallback(
    (open: boolean) => {
      if (focusMode && open) setFocusMode(false);
      setSpecsOpen(open);
      // On narrow overlay screens, prevent stacked left + right drawers
      if (open && isLeftOverlay) {
        setBctOpen(false);
      }
    },
    [focusMode, isLeftOverlay]
  );

  const openBct = useCallback(
    (open: boolean) => {
      if (focusMode && open) setFocusMode(false);
      setBctOpen(open);
      if (open && isLeftOverlay) {
        setSpecsOpen(false);
        setPalletConfigOpen(false);
      }
    },
    [focusMode, isLeftOverlay]
  );

  const openPalletConfig = useCallback(
    (open: boolean) => {
      if (focusMode && open) setFocusMode(false);
      setPalletConfigOpen(open);
      if (open && isLeftOverlay) {
        setBctOpen(false);
      }
    },
    [focusMode, isLeftOverlay]
  );

  const toggleFocusMode = useCallback(() => {
    setFocusMode((prev) => {
      if (!prev) {
        preFocusRef.current = { specsOpen, bctOpen, palletConfigOpen };
        setSpecsOpen(false);
        setBctOpen(false);
        setPalletConfigOpen(false);
        return true;
      }
      const fallback = defaultStateForLayout(tier, isShortLandscape);
      const restore = preFocusRef.current || fallback;
      setSpecsOpen(isLeftOverlay ? false : restore.specsOpen);
      setBctOpen(isRightOverlay ? false : restore.bctOpen);
      setPalletConfigOpen(isLeftOverlay ? false : restore.palletConfigOpen);
      return false;
    });
  }, [bctOpen, isLeftOverlay, isRightOverlay, isShortLandscape, palletConfigOpen, specsOpen, tier]);

  // Keyboard shortcuts: 'F' toggles Focus Mode, 'Escape' closes overlays or exits Focus Mode
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isTyping =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        Boolean(target?.isContentEditable);

      if (e.key === 'Escape') {
        if (isRightOverlay && bctOpen) {
          setBctOpen(false);
          return;
        }
        if (isLeftOverlay && (specsOpen || palletConfigOpen)) {
          setSpecsOpen(false);
          setPalletConfigOpen(false);
          return;
        }
        if (focusMode) {
          toggleFocusMode();
        }
        return;
      }

      if (
        !isTyping &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        (e.key === 'f' || e.key === 'F')
      ) {
        e.preventDefault();
        toggleFocusMode();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    bctOpen,
    focusMode,
    isLeftOverlay,
    isRightOverlay,
    palletConfigOpen,
    specsOpen,
    toggleFocusMode,
  ]);

  return {
    tier,
    isMobile,
    isShortLandscape,
    isLeftOverlay,
    isRightOverlay,
    specsOpen,
    bctOpen,
    palletConfigOpen,
    focusMode,
    setSpecsOpen: openSpecs,
    setBctOpen: openBct,
    setPalletConfigOpen: openPalletConfig,
    toggleFocusMode,
  };
}
