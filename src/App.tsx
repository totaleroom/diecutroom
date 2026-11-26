/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import {
  Monitor,
  Box as BoxIcon,
  Layers,
  ShieldCheck,
  PanelLeft,
  PanelRight,
  FolderOpen,
  Users,
  LogOut,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  SlidersHorizontal,
  Download,
  FileDown,
  ChevronDown,
  FileText,
  FileCode2,
  PenTool,
} from 'lucide-react';
import Sidebar from './components/Sidebar';
import BoxPreview from './components/BoxPreview';
import BCTInspectorRail from './components/BCTInspectorRail';
import AuthGate from './components/AuthGate';
import MobileGenieSheet from './components/MobileGenieSheet';
import {
  PWAInstallButton,
  OfflineIndicator,
  usePWAInstall,
} from './components/PWAInstallControl';
import { useWorkspaceLayout } from './hooks/useWorkspaceLayout';
import { generateRSCDieline } from './utils/dieline';
import { computeEngineeringAnalysis } from './utils/engineering';
import { scheduleIdleWork } from './utils/browserEngine';
import { authFetch, clearClientSessionToken } from './utils/apiSession';
import { lazyWithRetry } from './utils/lazyWithRetry';

const Box3DViewer = lazyWithRetry(() => import('./components/Box3DViewer'));
const PalletizerWorkspace = lazyWithRetry(() => import('./components/PalletizerWorkspace'));
const EngineeringSheet = lazyWithRetry(() => import('./components/EngineeringSheet'));
const AdminUsersModal = lazyWithRetry(() => import('./components/AdminUsersModal'));
const ProjectsModal = lazyWithRetry(() => import('./components/ProjectsModal'));
import {
  AuthUser,
  BoxConfig,
  BOX_STYLES,
  DEFAULT_CASE_PACK_CONFIG,
  DEFAULT_PALLET_CONFIG,
  ExportMode,
  FLUTE_SPECS,
  LayerVisibility,
  ViewMode,
} from './types';
import { TactileButton, TactileSegmented } from './components/tactile/TactileUI';

export default function App() {
  const [authChecking, setAuthChecking] = useState(true);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [statusNotice, setStatusNotice] = useState<{
    code: 'ACCOUNT_PENDING' | 'ACCOUNT_DISABLED';
    email?: string;
    name?: string;
  } | null>(null);

  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [projectsModalOpen, setProjectsModalOpen] = useState(false);

  const [viewMode, setViewMode] = useState<ViewMode>('2d');
  const [exportMode, setExportMode] = useState<ExportMode>('spec-sheet');
  const [engineeringSheetOpen, setEngineeringSheetOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [dielinePdfTrigger, setDielinePdfTrigger] = useState(0);
  const [dielineSvgTrigger, setDielineSvgTrigger] = useState(0);
  const [dielineExportingPdf, setDielineExportingPdf] = useState(false);
  const [palletExportTabRequest, setPalletExportTabRequest] = useState<
    'engineering' | 'vector' | null
  >(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const [headerWidth, setHeaderWidth] = useState<number>(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1280
  );
  const footerBrandTapsRef = useRef<number[]>([]);
  const { isInstallable: canInstallPwa, isInstalled: isPwaInstalled, install: installPwa } =
    usePWAInstall();

  const {
    isMobile,
    isShortLandscape,
    isLeftOverlay,
    isRightOverlay,
    specsOpen,
    bctOpen,
    palletConfigOpen,
    focusMode,
    setSpecsOpen,
    setBctOpen,
    setPalletConfigOpen,
    toggleFocusMode,
  } = useWorkspaceLayout();

  const [layers, setLayers] = useState<LayerVisibility>({
    dimensions: true,
    productOverlay: false,
    barcode: true,
    titleBlock: true,
    grid: true,
    printBleed: false,
    scoreSafeZone: true,
    glueKnockout: false,
    fluteDirection: true,
  });

  const [config, setConfig] = useState<BoxConfig>({
    boxStyle: '0201',
    flapOverlapMm: 30,
    inputMode: 'product',
    product: {
      length: 196,
      width: 146,
      depth: 98,
      netWeightKg: 1,
      tolerancePreset: 'standard',
      clearanceL: 4,
      clearanceW: 4,
      clearanceD: 2,
    },
    dimensions: {
      length: 200,
      width: 150,
      depth: 100,
    },
    boardGrade: 'single-wall',
    fluteThickness: FLUTE_SPECS.C.thickness,
    glueFlapWidth: 35,
    unit: 'mm',
    materialColor: 'kraft',
    glueFlapPosition: 'left',
    advanced: {
      flapGap: 3,
      slotGap: 8,
      fishtailCompensation: true,
      compensateInnerFlapDepth: true,
    },
    prepress: {
      bleedMm: 5,
      scoreSafeMarginMm: 6,
      fluteDirection: 'vertical',
      showGlueKnockout: true,
    },
    engineering: {
      calculationMethod: 'tappi',
      fluteId: 'C',
      topLayer: 'K150',
      mediumLayer: 'M125',
      centerLayer: 'M125',
      mediumLayer2: 'M150',
      bottomLayer: 'K150',
      customRct: { enabled: false },
      useActualEct: false,
      actualEctKgfCm: null,
      ectValue: FLUTE_SPECS.C.defaultEct,
      printCoverage: 15,
      panelPrintCoverage: [15, 15, 15, 15],
      printPresetId: 'custom',
      relativeHumidity: 75,
      handlingRisk: true,
      safetyFactor: 4,
      sheetCostPerSqm: 12500,
      currency: 'IDR',
    },
    barcode: {
      enabled: true,
      panel: 2,
      value: '18886015206106',
    },
    perforation: {
      enabled: false,
      type: 'angled-display',
      ruleMode: 'standard',
      cut: 5,
      tie: 3,
    },
    appearance: {
      dimFontSize: 12,
    },
    metadata: {
      userName: 'Technical Team',
      date: new Date().toISOString().split('T')[0],
      productName: 'Standard Shipping Box',
      materialSubstance: 'K150/M125/K150',
      approvalSignee: 'QA Manager',
      printColorsCount: 1,
      printColorCodes: 'Black (Pantone Black C)',
      notes: 'Ensure clean cut on all perforated edges.',
    },
    casePack: DEFAULT_CASE_PACK_CONFIG,
    pallet: DEFAULT_PALLET_CONFIG,
  });

  // Verify existing HTTP-only session cookie with VPS backend
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 8000);

    authFetch('/api/auth/me', {
      signal: controller.signal,
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!active) return;
        if (res.ok && data.user) {
          setAuthUser(data.user);
          setStatusNotice(null);
        } else if (
          res.status === 403 &&
          (data.code === 'ACCOUNT_PENDING' || data.code === 'ACCOUNT_DISABLED')
        ) {
          clearClientSessionToken();
          setAuthUser(null);
          setStatusNotice({
            code: data.code,
            email: data.user?.email,
            name: data.user?.name,
          });
        } else {
          clearClientSessionToken();
          setAuthUser(null);
        }
      })
      .catch(() => {
        if (active) setAuthUser(null);
      })
      .finally(() => {
        window.clearTimeout(timer);
        if (active) setAuthChecking(false);
      });

    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, []);

  // Background-prefetch 3D & Palletizer modules when browser is idle after auth
  useEffect(() => {
    if (!authUser) return;
    return scheduleIdleWork(() => {
      void import('./components/Box3DViewer');
      void import('./components/PalletizerWorkspace');
    }, 1500);
  }, [authUser]);

  // Confirm React commit succeeded for index.html boot watchdog
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as unknown as { __DIECUT_MOUNTED__?: boolean }).__DIECUT_MOUNTED__ = true;
    }
  }, []);

  // Hidden Admin Workspace Shortcut (Ctrl+Shift+A / Cmd+Shift+A)
  useEffect(() => {
    if (!authUser || authUser.role !== 'admin') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setAdminModalOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [authUser]);

  const handleFooterBrandSecretTap = () => {
    if (!authUser || authUser.role !== 'admin') return;
    const now = Date.now();
    const recent = footerBrandTapsRef.current.filter((t) => now - t <= 2500);
    recent.push(now);
    footerBrandTapsRef.current = recent;
    if (recent.length >= 5) {
      footerBrandTapsRef.current = [];
      setAdminModalOpen(true);
    }
  };

  useEffect(() => {
    if (!moreMenuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setMoreMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreMenuOpen(false);
    };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [moreMenuOpen]);

  // Close Header Export PDF popover on outside click or Escape
  useEffect(() => {
    if (!exportMenuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExportMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [exportMenuOpen]);

  // Measure actual <header> container width inside <main> so controls never collide when sidebars are open
  useEffect(() => {
    if (authChecking || !authUser) return;
    const el = headerRef.current;
    if (!el) return;

    const measure = () => {
      const w = Math.round(el.getBoundingClientRect().width);
      if (w > 0) setHeaderWidth(w);
    };
    measure();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }

    const ro = new ResizeObserver(() => {
      measure();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [authChecking, authUser]);

  const handleLogout = async () => {
    setMoreMenuOpen(false);
    await authFetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    clearClientSessionToken();
    setAuthUser(null);
    setStatusNotice(null);
    setAdminModalOpen(false);
    setProjectsModalOpen(false);
  };

  const paths = useMemo(() => generateRSCDieline(config), [config]);
  const analysis = useMemo(() => computeEngineeringAnalysis(config, paths), [config, paths]);
  const activeStyle = BOX_STYLES.find((s) => s.id === config.boxStyle) || BOX_STYLES[0];

  const handleToggleLayer = (layer: keyof LayerVisibility) => {
    setLayers((prev) => ({ ...prev, [layer]: !prev[layer] }));
  };

  if (authChecking) {
    return (
      <div className="min-h-screen w-full bg-[var(--ground)] text-[var(--ink-11)] flex items-center justify-center">
        <div className="surface-raised bg-[var(--surface-top)] rounded-[var(--radius-container)] shadow-[var(--shadow-card)] px-5 py-3.5 text-[13px] flex items-center gap-3">
          <img src="/icon.svg" alt="" className="size-6 rounded-[4px]" />
          <span>
            Memverifikasi sesi akses{' '}
            <span className="font-brand font-semibold text-[var(--ink-12)]">DieCut.Room</span>...
          </span>
        </div>
      </div>
    );
  }

  if (!authUser) {
    return (
      <>
        <AuthGate
          initialStatusNotice={statusNotice}
          onAuthenticated={(user) => {
            setAuthUser(user);
            setStatusNotice(null);
          }}
        />
        <OfflineIndicator />
      </>
    );
  }

  const totalAlerts = analysis.criticalCount + analysis.warningCount;
  const statusDotClass =
    analysis.criticalCount > 0
      ? 'bg-[var(--red-9)]'
      : analysis.warningCount > 0
      ? 'bg-[var(--amber-9)]'
      : 'bg-[var(--green-9)]';

  const leftRailOpen = viewMode === 'pallet' ? palletConfigOpen : specsOpen;
  const setLeftRailOpen = viewMode === 'pallet' ? setPalletConfigOpen : setSpecsOpen;
  const leftRailLabel = viewMode === 'pallet' ? 'Pallet' : 'Specs';
  const showMobileBottomDock = isMobile && !isShortLandscape;

  // Container-aware header density tiers (based on actual <header> width inside <main>)
  const showHeaderRailActions = !showMobileBottomDock;
  const compactSegmentedLabel = headerWidth < 430;
  const showSideToggleLabels = headerWidth >= 700;
  const showBctButtonInline = headerWidth >= 420;
  const showProyekInline = headerWidth >= 820;
  const showFullUtilitiesInline = headerWidth >= (authUser.role === 'admin' ? 1060 : 960);
  const showOverflowButton =
    !showBctButtonInline ||
    !showHeaderRailActions ||
    !showProyekInline ||
    !showFullUtilitiesInline;

  const triggerDielinePdfExport = () => {
    setExportMenuOpen(false);
    if (viewMode !== '2d') {
      setViewMode('2d');
    }
    setDielinePdfTrigger((n) => n + 1);
  };

  const triggerDielineSvgExport = () => {
    setExportMenuOpen(false);
    if (viewMode !== '2d') {
      setViewMode('2d');
    }
    setDielineSvgTrigger((n) => n + 1);
  };

  const triggerPalletExportModal = (tab: 'engineering' | 'vector') => {
    setExportMenuOpen(false);
    if (viewMode !== 'pallet') {
      setViewMode('pallet');
    }
    setPalletExportTabRequest(tab);
  };

  return (
    <div className="relative flex h-[100dvh] w-full bg-[var(--ground)] text-[var(--ink-12)] overflow-hidden">
      {viewMode !== 'pallet' &&
        !focusMode &&
        (isLeftOverlay ? (
          <MobileGenieSheet
            open={specsOpen}
            isMobileGenie={showMobileBottomDock}
            side="left"
            dockOrigin="left"
            ariaLabel="Panel Spesifikasi DieCut"
            onClose={() => setSpecsOpen(false)}
          >
            {({ isCenteredMobile }) => (
              <Sidebar
                config={config}
                paths={paths}
                analysis={analysis}
                onChange={setConfig}
                onOpenEngineering={() => {
                  setSpecsOpen(false);
                  setEngineeringSheetOpen(true);
                }}
                onClose={() => setSpecsOpen(false)}
                className={
                  isCenteredMobile
                    ? '!w-full !h-full !border-r-0'
                    : 'relative z-10 shadow-[var(--shadow-modal)]'
                }
              />
            )}
          </MobileGenieSheet>
        ) : (
          specsOpen && (
            <Sidebar
              config={config}
              paths={paths}
              analysis={analysis}
              onChange={setConfig}
              onOpenEngineering={() => setEngineeringSheetOpen(true)}
              onClose={() => setSpecsOpen(false)}
            />
          )
        ))}

      <main className="surface-panel flex-1 flex flex-col min-w-0 overflow-hidden bg-[var(--surface-top)]">
        {/* Container-Aware Anti-Clip Workspace Mode Header */}
        <header
          ref={headerRef}
          className={`${
            isShortLandscape ? 'h-[44px]' : 'h-[52px]'
          } border-b-[0.5px] border-[var(--line)] bg-[var(--surface-top)] flex items-center justify-between px-2.5 sm:px-4 shrink-0 gap-2 sm:gap-3`}
        >
          <div className="flex items-center gap-2 shrink-0">
            {!focusMode && showHeaderRailActions && (
              <TactileButton
                type="button"
                variant={leftRailOpen ? 'primary' : 'secondary'}
                size="compact"
                className="shrink-0"
                onClick={() => setLeftRailOpen(!leftRailOpen)}
                aria-pressed={leftRailOpen}
                aria-label={leftRailOpen ? `Tutup panel ${leftRailLabel}` : `Buka panel ${leftRailLabel}`}
                title={leftRailOpen ? `Tutup panel ${leftRailLabel}` : `Buka panel ${leftRailLabel}`}
              >
                <PanelLeft size={14} />
                {showSideToggleLabels && <span>{leftRailLabel}</span>}
              </TactileButton>
            )}

            <TactileSegmented
              value={viewMode}
              onChange={setViewMode}
              size="compact"
              shape="control"
              ariaLabel="Workspace view mode"
              options={[
                {
                  value: '2d',
                  title: '2D Dieline CAD',
                  label: (
                    <>
                      <Monitor size={14} />
                      <span>2D</span>
                    </>
                  ),
                },
                {
                  value: '3d',
                  title: '3D Fit Simulation',
                  label: (
                    <>
                      <BoxIcon size={14} />
                      <span>3D</span>
                    </>
                  ),
                },
                {
                  value: 'pallet',
                  title: 'Palletizer & Case Pack',
                  label: (
                    <>
                      <Layers size={14} />
                      <span>{compactSegmentedLabel ? 'Pallet' : 'Palletizer'}</span>
                    </>
                  ),
                },
              ]}
            />
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {showProyekInline && (
              <TactileButton
                type="button"
                variant="secondary"
                size="compact"
                onClick={() => setProjectsModalOpen(true)}
                title="Simpan atau muat proyek box dieline"
              >
                <FolderOpen size={13} className="text-[var(--ink-10)]" />
                <span>Proyek</span>
              </TactileButton>
            )}

            {showBctButtonInline && (
              <TactileButton
                type="button"
                variant="secondary"
                size="compact"
                onClick={() => setEngineeringSheetOpen(true)}
                title={
                  totalAlerts > 0
                    ? `Corrected BCT ${Math.round(analysis.correctedBctKgf)} kgf · ${totalAlerts} peringatan pre-flight`
                    : `Corrected BCT ${Math.round(analysis.correctedBctKgf)} kgf`
                }
              >
                <span className={`size-[7px] rounded-full ${statusDotClass}`} />
                <ShieldCheck size={14} className="text-[var(--ink-10)]" />
                <span className="font-mono tabular-nums whitespace-nowrap">
                  {`BCT ${Math.round(analysis.correctedBctKgf)} kgf`}
                </span>
              </TactileButton>
            )}

            {showFullUtilitiesInline && authUser.role === 'admin' && (
              <TactileButton
                type="button"
                variant="secondary"
                size="compact"
                onClick={() => setAdminModalOpen(true)}
                title="Kelola akun user, aktivasi, reset password & hapus"
              >
                <Users size={13} className="text-[var(--ink-10)]" />
                <span>Users</span>
              </TactileButton>
            )}

            {showFullUtilitiesInline && (
              <div className="flex items-center">
                <PWAInstallButton />
              </div>
            )}

            {showHeaderRailActions && (
              <TactileButton
                type="button"
                variant={focusMode ? 'primary' : 'secondary'}
                size="compact"
                onClick={toggleFocusMode}
                aria-pressed={focusMode}
                aria-label={focusMode ? 'Keluar dari Mode Fokus' : 'Mode Fokus Kanvas Penuh'}
                title={focusMode ? 'Keluar dari Mode Fokus (F / Esc)' : 'Mode Fokus Kanvas Penuh (F)'}
              >
                {focusMode ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                {showSideToggleLabels && <span>{focusMode ? 'Keluar Fokus' : 'Fokus'}</span>}
              </TactileButton>
            )}

            {!focusMode && showHeaderRailActions && (
              <TactileButton
                type="button"
                variant={bctOpen ? 'primary' : 'secondary'}
                size="compact"
                onClick={() => setBctOpen(!bctOpen)}
                aria-pressed={bctOpen}
                aria-label={bctOpen ? 'Tutup panel BCT Pro' : 'Buka panel BCT Pro'}
                title={bctOpen ? 'Tutup panel BCT Pro' : 'Buka panel BCT Pro'}
              >
                {!bctOpen && totalAlerts > 0 && (
                  <span className={`size-[7px] rounded-full ${statusDotClass}`} />
                )}
                <PanelRight size={14} />
                {showSideToggleLabels && <span>BCT Pro</span>}
              </TactileButton>
            )}

            {showFullUtilitiesInline && (
              <TactileButton
                type="button"
                variant="ghost"
                size="compact"
                onClick={handleLogout}
                title={`Keluar (${authUser.email})`}
              >
                <LogOut size={13} />
                <span>Keluar</span>
              </TactileButton>
            )}

            {/* Unified Header Export Popover (Single source of truth for PDF & SVG across all views) */}
            <div ref={exportMenuRef} className="relative shrink-0">
              <TactileButton
                type="button"
                variant="primary"
                size="compact"
                disabled={dielineExportingPdf}
                className="h-[34px] md:h-[var(--control-h-compact)] px-2.5 gap-1.5 whitespace-nowrap shrink-0"
                onClick={() => {
                  setMoreMenuOpen(false);
                  setExportMenuOpen((v) => !v);
                }}
                aria-expanded={exportMenuOpen}
                aria-haspopup="menu"
                aria-label="Export PDF & SVG"
                title="Export PDF & SVG (Dieline CAD, Laporan Pallet, atau Vektor AI)"
              >
                <FileDown size={13} />
                <span>{dielineExportingPdf ? 'PDF...' : 'Export'}</span>
                <ChevronDown size={12} className="opacity-80" />
              </TactileButton>

              {exportMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-[calc(100%+6px)] w-[min(276px,calc(100vw-24px))] surface-raised bg-[var(--surface-top)] rounded-[var(--radius-container)] shadow-[var(--shadow-modal)] border-[0.5px] border-[var(--line)] p-1.5 z-50 flex flex-col gap-0.5"
                >
                  <div className="px-2.5 pt-1 pb-1 text-[11px] leading-[14px] text-[var(--ink-10)] flex items-center justify-between gap-2">
                    <span>Dieline 2D CAD</span>
                    <span className="font-mono text-[10.5px] text-[var(--ink-11)]">
                      {exportMode === 'clean-cad' ? 'Clean CAD' : 'Spec sheet'}
                    </span>
                  </div>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={triggerDielinePdfExport}
                    disabled={dielineExportingPdf}
                    className="w-full min-h-[42px] px-2.5 py-1.5 rounded-[var(--radius-control)] flex items-start gap-2.5 text-left hover:bg-[var(--ink-3)] disabled:opacity-60 cursor-pointer transition-colors"
                  >
                    <FileText size={15} className="text-[var(--ink-12)] mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[12.5px] font-medium text-[var(--ink-12)] leading-[16px]">
                        Dieline CAD PDF (1:1 mm)
                      </div>
                      <div className="text-[11px] text-[var(--ink-10)] leading-[14px] mt-0.5">
                        Unduh gambar kerja 2D skala aktual
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={triggerDielineSvgExport}
                    className="w-full min-h-[42px] px-2.5 py-1.5 rounded-[var(--radius-control)] flex items-start gap-2.5 text-left hover:bg-[var(--ink-3)] cursor-pointer transition-colors"
                  >
                    <FileCode2 size={15} className="text-[var(--ink-12)] mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[12.5px] font-medium text-[var(--ink-12)] leading-[16px]">
                        Dieline CAD SVG (1:1 mm)
                      </div>
                      <div className="text-[11px] text-[var(--ink-10)] leading-[14px] mt-0.5">
                        Unduh vektor SVG siap CAD / Illustrator
                      </div>
                    </div>
                  </button>

                  <hr className="my-1 -mx-1.5 border-0 border-t-[0.5px] border-[var(--line)]" />

                  <div className="px-2.5 pt-0.5 pb-1 text-[11px] leading-[14px] text-[var(--ink-10)]">
                    Palletizer &amp; Kemasan
                  </div>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => triggerPalletExportModal('engineering')}
                    className="w-full min-h-[42px] px-2.5 py-1.5 rounded-[var(--radius-control)] flex items-start gap-2.5 text-left hover:bg-[var(--ink-3)] cursor-pointer transition-colors"
                  >
                    <FileDown size={15} className="text-[var(--accent-10)] mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[12.5px] font-medium text-[var(--ink-12)] leading-[16px]">
                        Laporan Palletizer (PDF A4)
                      </div>
                      <div className="text-[11px] text-[var(--ink-10)] leading-[14px] mt-0.5">
                        {config.pallet?.vehicle?.enabled
                          ? '3 halaman: 4 POV 3D, Heat-Map & Armada'
                          : '2 halaman: 4 POV 3D, Denah & Audit BCT'}
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => triggerPalletExportModal('vector')}
                    className="w-full min-h-[42px] px-2.5 py-1.5 rounded-[var(--radius-control)] flex items-start gap-2.5 text-left hover:bg-[var(--ink-3)] cursor-pointer transition-colors"
                  >
                    <PenTool size={15} className="text-[var(--ink-12)] mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[12.5px] font-medium text-[var(--ink-12)] leading-[16px]">
                        Vektor Kemasan AI (PDF &amp; SVG)
                      </div>
                      <div className="text-[11px] text-[var(--ink-10)] leading-[14px] mt-0.5">
                        Line-art transparan siap Adobe Illustrator
                      </div>
                    </div>
                  </button>
                </div>
              )}
            </div>

            {/* Container-Adaptive Overflow Action Menu */}
            {showOverflowButton && (
              <div ref={moreMenuRef} className="relative shrink-0">
                <TactileButton
                  type="button"
                  variant="secondary"
                  size="compact"
                  className="px-2 min-w-[34px] h-[34px] md:h-[var(--control-h-compact)]"
                  onClick={() => {
                    setExportMenuOpen(false);
                    setMoreMenuOpen((v) => !v);
                  }}
                  aria-expanded={moreMenuOpen}
                  aria-haspopup="menu"
                  aria-label="Menu lainnya"
                  title="Menu lainnya"
                >
                  <MoreHorizontal size={15} />
                </TactileButton>

                {moreMenuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-[calc(100%+6px)] w-56 surface-raised bg-[var(--surface-top)] rounded-[var(--radius-container)] shadow-[var(--shadow-modal)] border-[0.5px] border-[var(--line)] p-1.5 z-50 flex flex-col gap-0.5"
                  >
                    {!showBctButtonInline && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMoreMenuOpen(false);
                          setEngineeringSheetOpen(true);
                        }}
                        className="w-full min-h-[40px] px-3 rounded-[var(--radius-control)] flex items-center justify-between text-[13px] text-[var(--ink-12)] hover:bg-[var(--ink-3)] cursor-pointer"
                      >
                        <span className="flex items-center gap-2">
                          <ShieldCheck size={14} className="text-[var(--ink-10)]" />
                          <span className="font-mono tabular-nums">
                            {`BCT ${Math.round(analysis.correctedBctKgf)} kgf`}
                          </span>
                        </span>
                        <span className={`size-[7px] rounded-full ${statusDotClass}`} />
                      </button>
                    )}

                    {!showHeaderRailActions && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMoreMenuOpen(false);
                          toggleFocusMode();
                        }}
                        className="w-full min-h-[40px] px-3 rounded-[var(--radius-control)] flex items-center gap-2 text-[13px] text-[var(--ink-12)] hover:bg-[var(--ink-3)] cursor-pointer"
                      >
                        {focusMode ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                        <span>{focusMode ? 'Keluar Mode Fokus' : 'Mode Fokus Kanvas'}</span>
                      </button>
                    )}

                    {!showProyekInline && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMoreMenuOpen(false);
                          setProjectsModalOpen(true);
                        }}
                        className="w-full min-h-[40px] px-3 rounded-[var(--radius-control)] flex items-center gap-2 text-[13px] text-[var(--ink-12)] hover:bg-[var(--ink-3)] cursor-pointer"
                      >
                        <FolderOpen size={14} className="text-[var(--ink-10)]" />
                        <span>Proyek Tersimpan</span>
                      </button>
                    )}

                    {!showFullUtilitiesInline && authUser.role === 'admin' && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMoreMenuOpen(false);
                          setAdminModalOpen(true);
                        }}
                        className="w-full min-h-[40px] px-3 rounded-[var(--radius-control)] flex items-center gap-2 text-[13px] text-[var(--ink-12)] hover:bg-[var(--ink-3)] cursor-pointer"
                      >
                        <Users size={14} className="text-[var(--ink-10)]" />
                        <span>Kelola Users</span>
                      </button>
                    )}

                    {!showFullUtilitiesInline && !isPwaInstalled && canInstallPwa && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMoreMenuOpen(false);
                          void installPwa();
                        }}
                        className="w-full min-h-[40px] px-3 rounded-[var(--radius-control)] flex items-center gap-2 text-[13px] text-[var(--ink-12)] hover:bg-[var(--ink-3)] cursor-pointer"
                      >
                        <Download size={14} className="text-[var(--ink-10)]" />
                        <span>Install App</span>
                      </button>
                    )}

                    {!showFullUtilitiesInline && (
                      <>
                        <div className="my-1 border-t-[0.5px] border-[var(--line)]" />

                        <button
                          type="button"
                          role="menuitem"
                          onClick={handleLogout}
                          className="w-full min-h-[40px] px-3 rounded-[var(--radius-control)] flex items-center gap-2 text-[13px] text-[var(--red-11)] hover:bg-[var(--red-3)] cursor-pointer"
                        >
                          <LogOut size={14} />
                          <span className="truncate">Keluar ({authUser.name})</span>
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

        {/* Active Viewport + Subtle Edge Quick-Toggle Handles (Desktop & Tablet) */}
        <div className="relative flex-1 flex flex-col min-h-0 overflow-hidden">
          {!focusMode && !leftRailOpen && (
            <button
              type="button"
              onClick={() => setLeftRailOpen(true)}
              aria-label={`Buka panel ${leftRailLabel}`}
              title={`Buka panel ${leftRailLabel}`}
              className="hidden md:flex items-center gap-1.5 absolute left-0 top-1/2 -translate-y-1/2 z-20 h-11 px-2 rounded-r-[var(--radius-container)] bg-[var(--surface-top)]/95 backdrop-blur-sm border-[0.5px] border-l-0 border-[var(--line)] shadow-[var(--shadow-card)] text-[11px] font-medium text-[var(--ink-11)] hover:text-[var(--ink-12)] hover:bg-[var(--raised)] cursor-pointer transition-colors"
            >
              <SlidersHorizontal size={13} />
              <span className="hidden lg:inline">{leftRailLabel}</span>
            </button>
          )}

          {!focusMode && !bctOpen && (
            <button
              type="button"
              onClick={() => setBctOpen(true)}
              aria-label="Buka panel BCT Pro"
              title="Buka panel BCT Pro"
              className="hidden md:flex items-center gap-1.5 absolute right-0 top-1/2 -translate-y-1/2 z-20 h-11 px-2 rounded-l-[var(--radius-container)] bg-[var(--surface-top)]/95 backdrop-blur-sm border-[0.5px] border-r-0 border-[var(--line)] shadow-[var(--shadow-card)] text-[11px] font-medium text-[var(--ink-11)] hover:text-[var(--ink-12)] hover:bg-[var(--raised)] cursor-pointer transition-colors"
            >
              <span className={`size-[7px] rounded-full ${statusDotClass}`} />
              <PanelRight size={13} />
              <span className="hidden lg:inline">BCT</span>
            </button>
          )}

          {viewMode === '2d' ? (
            <BoxPreview
              paths={paths}
              config={config}
              analysis={analysis}
              layers={layers}
              onToggleLayer={handleToggleLayer}
              exportMode={exportMode}
              onChangeExportMode={setExportMode}
              hasMobileFloatingDock={showMobileBottomDock}
              focusMode={focusMode}
              pdfExportTrigger={dielinePdfTrigger}
              onPdfExportTriggered={() => setDielinePdfTrigger(0)}
              svgExportTrigger={dielineSvgTrigger}
              onSvgExportTriggered={() => setDielineSvgTrigger(0)}
              onExportingPdfChange={setDielineExportingPdf}
            />
          ) : (
            <Suspense
              fallback={
                <div className="flex-1 flex items-center justify-center bg-[var(--ground)] text-[12px] text-[var(--ink-10)]">
                  Menyiapkan engine 3D WebGL...
                </div>
              }
            >
              {viewMode === '3d' ? (
                <Box3DViewer
                  config={config}
                  paths={paths}
                  hasMobileFloatingDock={showMobileBottomDock}
                  isShortLandscape={isShortLandscape}
                  focusMode={focusMode}
                />
              ) : (
                <PalletizerWorkspace
                  config={config}
                  paths={paths}
                  analysis={analysis}
                  onChange={setConfig}
                  onOpenEngineering={() => setEngineeringSheetOpen(true)}
                  railOpen={palletConfigOpen && !focusMode}
                  isOverlayRail={isLeftOverlay}
                  onCloseRail={() => setPalletConfigOpen(false)}
                  hasMobileFloatingDock={showMobileBottomDock}
                  isShortLandscape={isShortLandscape}
                  focusMode={focusMode}
                  requestedExportTab={palletExportTabRequest}
                  onHandledExportRequest={() => setPalletExportTabRequest(null)}
                />
              )}
            </Suspense>
          )}
        </div>

        {/* Clean Engineering Footer (Hidden on mobile, short landscape & Focus Mode for max canvas height) */}
        {!focusMode && !isShortLandscape && (
          <footer className="hidden md:flex h-[40px] border-t-[0.5px] border-[var(--line)] bg-[var(--surface-top)] items-center justify-between px-4 text-[12px] leading-[16px] text-[var(--ink-10)] gap-4 shrink-0">
            <div className="flex items-center gap-3 min-w-0 overflow-hidden whitespace-nowrap">
              <span className="text-[var(--ink-12)] shrink-0">{activeStyle.shortName}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums shrink-0">
                Blank{' '}
                <span className="text-[var(--ink-12)]">
                  {Math.ceil(paths.width)} x {Math.ceil(paths.height)} mm
                </span>
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums shrink-0">
                Area <span className="text-[var(--ink-12)]">{paths.info.totalAreaSqM.toFixed(3)} m²</span>
              </span>
              {headerWidth >= 720 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums shrink-0">
                    Max stack{' '}
                    <span className="text-[var(--ink-12)]">{analysis.maxStackingLoadKgf.toFixed(1)} kgf</span>
                  </span>
                </>
              )}
              {headerWidth >= 900 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="truncate">
                    Akun <span className="text-[var(--ink-12)]">{authUser.name}</span>
                  </span>
                </>
              )}
            </div>
            <div
              onClick={handleFooterBrandSecretTap}
              className="flex items-center gap-2 text-[var(--ink-10)] whitespace-nowrap shrink-0 select-none"
            >
              <span>Made by</span>
              <img
                src="/assets/aistudio/Asset_2_5ca58983.svg"
                alt="Totale.Room"
                width={84}
                height={11}
                loading="eager"
                decoding="sync"
                className="h-[11px] w-auto brightness-0 opacity-85 select-none"
              />
            </div>
          </footer>
        )}
      </main>

      {!focusMode &&
        (isRightOverlay ? (
          <MobileGenieSheet
            open={bctOpen}
            isMobileGenie={showMobileBottomDock}
            side="right"
            dockOrigin="center"
            ariaLabel="Panel BCT Pro"
            onClose={() => setBctOpen(false)}
          >
            {({ isCenteredMobile }) => (
              <BCTInspectorRail
                config={config}
                paths={paths}
                analysis={analysis}
                userId={authUser.id}
                onChange={setConfig}
                onOpenEngineeringSheet={() => {
                  setBctOpen(false);
                  setEngineeringSheetOpen(true);
                }}
                onClose={() => setBctOpen(false)}
                className={
                  isCenteredMobile
                    ? '!w-full !h-full !border-l-0'
                    : 'relative z-10 shadow-[var(--shadow-modal)]'
                }
              />
            )}
          </MobileGenieSheet>
        ) : (
          bctOpen && (
            <BCTInspectorRail
              config={config}
              paths={paths}
              analysis={analysis}
              userId={authUser.id}
              onChange={setConfig}
              onOpenEngineeringSheet={() => setEngineeringSheetOpen(true)}
              onClose={() => setBctOpen(false)}
            />
          )
        ))}

      {/* Mobile Floating Thumb Dock (Portrait Mobile Full-Canvas Focus + 1-Tap Genie Panel Access) */}
      {showMobileBottomDock && !focusMode && (
        <nav
          aria-label="Kontrol cepat mobile"
          className="fixed bottom-3 left-1/2 -translate-x-1/2 z-50 md:hidden flex items-center gap-1 p-1 rounded-full bg-[var(--surface-top)]/95 backdrop-blur-md border-[0.5px] border-[var(--line)] shadow-[var(--shadow-modal)]"
        >
          <button
            type="button"
            onClick={() => {
              const next = !leftRailOpen;
              if (next) setBctOpen(false);
              setLeftRailOpen(next);
            }}
            aria-pressed={leftRailOpen}
            className={`min-h-[42px] px-3.5 rounded-full flex items-center gap-1.5 text-[12px] font-medium whitespace-nowrap cursor-pointer transition-colors ${
              leftRailOpen
                ? 'bg-[var(--primary-bg)] text-[var(--primary-fg)]'
                : 'text-[var(--ink-12)] hover:bg-[var(--ink-3)]'
            }`}
          >
            <SlidersHorizontal size={14} />
            <span>{leftRailLabel}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const next = !bctOpen;
              if (next) setLeftRailOpen(false);
              setBctOpen(next);
            }}
            aria-pressed={bctOpen}
            className={`min-h-[42px] px-3.5 rounded-full flex items-center gap-1.5 text-[12px] font-medium whitespace-nowrap cursor-pointer transition-colors ${
              bctOpen
                ? 'bg-[var(--primary-bg)] text-[var(--primary-fg)]'
                : 'text-[var(--ink-12)] hover:bg-[var(--ink-3)]'
            }`}
          >
            <span className={`size-[7px] rounded-full ${statusDotClass}`} />
            <span>BCT</span>
          </button>

          <button
            type="button"
            onClick={toggleFocusMode}
            aria-pressed={focusMode}
            className="min-h-[42px] px-3.5 rounded-full flex items-center gap-1.5 text-[12px] font-medium text-[var(--ink-12)] hover:bg-[var(--ink-3)] whitespace-nowrap cursor-pointer transition-colors"
          >
            <Maximize2 size={14} />
            <span>Fokus</span>
          </button>
        </nav>
      )}

      {/* Floating Exit Focus Pill (Always accessible on Mobile or Desktop Focus Mode) */}
      {focusMode && (
        <button
          type="button"
          onClick={toggleFocusMode}
          className="fixed bottom-3 right-3 z-30 flex items-center gap-1.5 min-h-[42px] px-4 rounded-full bg-[var(--primary-bg)] text-[var(--primary-fg)] shadow-[var(--shadow-modal)] text-[12px] font-medium cursor-pointer active:scale-[0.97] transition-transform"
        >
          <Minimize2 size={14} />
          <span>Keluar Fokus</span>
        </button>
      )}

      {/* Slide-Over Engineering, Costing & Field-Defect Sheet */}
      {engineeringSheetOpen && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--backdrop)] text-[12px] text-[var(--ink-12)]">
              <div className="surface-raised bg-[var(--surface-top)] rounded-[var(--radius-container)] px-4 py-2.5 shadow-[var(--shadow-modal)]">
                Memuat Engineering Sheet...
              </div>
            </div>
          }
        >
          <EngineeringSheet
            open={engineeringSheetOpen}
            onClose={() => setEngineeringSheetOpen(false)}
            config={config}
            paths={paths}
            analysis={analysis}
            onChange={setConfig}
          />
        </Suspense>
      )}

      {/* Per-Account Saved Box Projects Modal */}
      {projectsModalOpen && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--backdrop)] text-[12px] text-[var(--ink-12)]">
              <div className="surface-raised bg-[var(--surface-top)] rounded-[var(--radius-container)] px-4 py-2.5 shadow-[var(--shadow-modal)]">
                Memuat Proyek Tersimpan...
              </div>
            </div>
          }
        >
          <ProjectsModal
            open={projectsModalOpen}
            currentConfig={config}
            onLoadProject={(loaded) => setConfig(loaded)}
            onClose={() => setProjectsModalOpen(false)}
          />
        </Suspense>
      )}

      {/* Admin Command Console */}
      {authUser.role === 'admin' && adminModalOpen && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--backdrop)] text-[12px] text-[var(--ink-12)]">
              <div className="surface-raised bg-[var(--surface-top)] rounded-[var(--radius-container)] px-4 py-2.5 shadow-[var(--shadow-modal)]">
                Memuat Konsol Admin...
              </div>
            </div>
          }
        >
          <AdminUsersModal
            open={adminModalOpen}
            currentUser={authUser}
            onClose={() => setAdminModalOpen(false)}
            onUserUpdated={(patch) =>
              setAuthUser((prev) => (prev ? { ...prev, ...patch } : prev))
            }
          />
        </Suspense>
      )}

      <OfflineIndicator />
    </div>
  );
}
