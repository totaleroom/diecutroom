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
} from 'lucide-react';
import Sidebar from './components/Sidebar';
import BoxPreview from './components/BoxPreview';
import BCTInspectorRail from './components/BCTInspectorRail';
import AuthGate from './components/AuthGate';
import { PWAInstallButton, OfflineIndicator } from './components/PWAInstallControl';
import { useWorkspaceLayout } from './hooks/useWorkspaceLayout';
import { generateRSCDieline } from './utils/dieline';
import { computeEngineeringAnalysis } from './utils/engineering';
import { scheduleIdleWork } from './utils/browserEngine';
import { formatValue } from './utils/units';

const Box3DViewer = lazy(() => import('./components/Box3DViewer'));
const PalletizerWorkspace = lazy(() => import('./components/PalletizerWorkspace'));
const EngineeringSheet = lazy(() => import('./components/EngineeringSheet'));
const AdminUsersModal = lazy(() => import('./components/AdminUsersModal'));
const ProjectsModal = lazy(() => import('./components/ProjectsModal'));
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
  const moreMenuRef = useRef<HTMLDivElement>(null);

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
    productOverlay: true,
    barcode: true,
    titleBlock: true,
    grid: true,
    printBleed: true,
    scoreSafeZone: true,
    glueKnockout: true,
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
    fluteThickness: FLUTE_SPECS.B.thickness,
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
      fluteId: 'B',
      topLayer: 'K200',
      mediumLayer: 'M150',
      centerLayer: 'M125',
      mediumLayer2: 'M150',
      bottomLayer: 'K200',
      customRct: { enabled: false },
      useActualEct: false,
      actualEctKgfCm: null,
      ectValue: 39,
      printCoverage: 15,
      panelPrintCoverage: [15, 15, 15, 15],
      printPresetId: 'custom',
      relativeHumidity: 50,
      handlingRisk: false,
      safetyFactor: 5,
      sheetCostPerSqm: 12500,
      currency: 'IDR',
    },
    barcode: {
      enabled: true,
      panel: 1,
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
      dimFontSize: 8,
    },
    metadata: {
      userName: 'Technical Team',
      date: new Date().toISOString().split('T')[0],
      productName: 'Standard Shipping Box',
      materialSubstance: 'K200/M150/K200',
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

    fetch('/api/auth/me', { credentials: 'include', signal: controller.signal })
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
          setAuthUser(null);
          setStatusNotice({
            code: data.code,
            email: data.user?.email,
            name: data.user?.name,
          });
        } else {
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

  const handleLogout = async () => {
    setMoreMenuOpen(false);
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
    setAuthUser(null);
    setStatusNotice(null);
    setAdminModalOpen(false);
    setProjectsModalOpen(false);
  };

  const paths = useMemo(() => generateRSCDieline(config), [config]);
  const analysis = useMemo(() => computeEngineeringAnalysis(config, paths), [config, paths]);
  const activeStyle = BOX_STYLES.find((s) => s.id === config.boxStyle) || BOX_STYLES[0];
  const fmt = (mm: number) => formatValue(mm, config.unit);

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
  const headerResponsiveActionClass = isShortLandscape ? 'inline-flex' : 'hidden md:inline-flex';

  return (
    <div className="relative flex h-[100dvh] w-full bg-[var(--ground)] text-[var(--ink-12)] overflow-hidden">
      {viewMode !== 'pallet' &&
        specsOpen &&
        !focusMode &&
        (isLeftOverlay ? (
          <div
            className="fixed inset-0 z-40 flex"
            role="dialog"
            aria-modal="true"
            aria-label="Panel Spesifikasi DieCut"
          >
            <div
              className="absolute inset-0 bg-[var(--backdrop)] backdrop-blur-[2px]"
              onClick={() => setSpecsOpen(false)}
              aria-hidden="true"
            />
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
              className="relative z-10 shadow-[var(--shadow-modal)]"
            />
          </div>
        ) : (
          <Sidebar
            config={config}
            paths={paths}
            analysis={analysis}
            onChange={setConfig}
            onOpenEngineering={() => setEngineeringSheetOpen(true)}
            onClose={() => setSpecsOpen(false)}
          />
        ))}

      <main className="surface-panel flex-1 flex flex-col min-w-0 overflow-hidden bg-[var(--surface-top)]">
        {/* Adaptive Anti-Clip Workspace Mode Header */}
        <header
          className={`${
            isShortLandscape ? 'h-[44px]' : 'h-[52px]'
          } border-b-[0.5px] border-[var(--line)] bg-[var(--surface-top)] flex items-center justify-between px-2.5 sm:px-4 shrink-0 gap-2 sm:gap-3`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {!focusMode && (
              <TactileButton
                type="button"
                variant={leftRailOpen ? 'primary' : 'secondary'}
                size="compact"
                className={`${headerResponsiveActionClass} shrink-0`}
                onClick={() => setLeftRailOpen(!leftRailOpen)}
                aria-pressed={leftRailOpen}
                title={leftRailOpen ? `Tutup panel ${leftRailLabel}` : `Buka panel ${leftRailLabel}`}
              >
                <PanelLeft size={14} />
                <span className="hidden lg:inline">{leftRailLabel}</span>
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
                  label: (
                    <>
                      <Monitor size={14} />
                      <span className="hidden 2xl:inline">2D dieline CAD</span>
                      <span className="2xl:hidden">2D</span>
                    </>
                  ),
                },
                {
                  value: '3d',
                  label: (
                    <>
                      <BoxIcon size={14} />
                      <span className="hidden 2xl:inline">3D fit simulation</span>
                      <span className="2xl:hidden">3D</span>
                    </>
                  ),
                },
                {
                  value: 'pallet',
                  label: (
                    <>
                      <Layers size={14} />
                      <span className="hidden sm:inline">Palletizer</span>
                      <span className="sm:hidden">Pallet</span>
                    </>
                  ),
                },
              ]}
            />
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 shrink-0">
            <div className="hidden 2xl:flex items-center gap-2 text-[12px] leading-[16px] text-[var(--ink-10)] overflow-hidden mr-1">
              <span className="text-[var(--ink-12)] whitespace-nowrap">{activeStyle.code}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums whitespace-nowrap">
                ID {`${fmt(paths.info.innerDimensions.length)} x ${fmt(paths.info.innerDimensions.width)} x ${fmt(paths.info.innerDimensions.depth)} ${config.unit}`}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums whitespace-nowrap">
                OD {`${fmt(paths.info.outerDimensions.length)} x ${fmt(paths.info.outerDimensions.width)} x ${fmt(paths.info.outerDimensions.depth)} ${config.unit}`}
              </span>
            </div>

            <TactileButton
              type="button"
              variant="secondary"
              size="compact"
              className="hidden xl:inline-flex"
              onClick={() => setProjectsModalOpen(true)}
              title="Simpan atau muat proyek box dieline"
            >
              <FolderOpen size={13} className="text-[var(--ink-10)]" />
              <span>Proyek</span>
            </TactileButton>

            <TactileButton
              type="button"
              variant="secondary"
              size="compact"
              className="hidden md:inline-flex"
              onClick={() => setEngineeringSheetOpen(true)}
            >
              <span className={`size-[7px] rounded-full ${statusDotClass}`} />
              <ShieldCheck size={14} className="text-[var(--ink-10)]" />
              <span>
                {totalAlerts > 0
                  ? `Pre-flight (${totalAlerts})`
                  : `Stack ${analysis.maxStackingLoadKgf.toFixed(0)} kgf`}
              </span>
            </TactileButton>

            {authUser.role === 'admin' && (
              <TactileButton
                type="button"
                variant="secondary"
                size="compact"
                className="hidden xl:inline-flex"
                onClick={() => setAdminModalOpen(true)}
                title="Kelola akun user, aktivasi, reset password & hapus"
              >
                <Users size={13} className="text-[var(--ink-10)]" />
                <span>Users</span>
              </TactileButton>
            )}

            <div className="hidden xl:flex items-center">
              <PWAInstallButton />
            </div>

            <TactileButton
              type="button"
              variant={focusMode ? 'primary' : 'secondary'}
              size="compact"
              className={headerResponsiveActionClass}
              onClick={toggleFocusMode}
              aria-pressed={focusMode}
              title={focusMode ? 'Keluar dari Mode Fokus (F / Esc)' : 'Mode Fokus Kanvas Penuh (F)'}
            >
              {focusMode ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              <span className="hidden lg:inline">{focusMode ? 'Keluar Fokus' : 'Fokus'}</span>
            </TactileButton>

            {!focusMode && (
              <TactileButton
                type="button"
                variant={bctOpen ? 'primary' : 'secondary'}
                size="compact"
                className={headerResponsiveActionClass}
                onClick={() => setBctOpen(!bctOpen)}
                aria-pressed={bctOpen}
                title="Toggle BCT Pro right sidebar"
              >
                {!bctOpen && totalAlerts > 0 && (
                  <span className={`size-[7px] rounded-full ${statusDotClass}`} />
                )}
                <PanelRight size={14} />
                <span className={isShortLandscape ? 'hidden sm:inline' : ''}>BCT Pro</span>
              </TactileButton>
            )}

            <TactileButton
              type="button"
              variant="ghost"
              size="compact"
              className="hidden xl:inline-flex"
              onClick={handleLogout}
              title={`Keluar (${authUser.email})`}
            >
              <LogOut size={13} />
              <span>Keluar</span>
            </TactileButton>

            {/* Compact / Tablet / Mobile Overflow Action Menu */}
            <div ref={moreMenuRef} className="relative xl:hidden">
              <TactileButton
                type="button"
                variant="secondary"
                size="compact"
                className="px-2 min-w-[34px] h-[34px] md:h-[var(--control-h-compact)]"
                onClick={() => setMoreMenuOpen((v) => !v)}
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
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMoreMenuOpen(false);
                      setEngineeringSheetOpen(true);
                    }}
                    className="md:hidden w-full min-h-[40px] px-3 rounded-[var(--radius-control)] flex items-center justify-between text-[13px] text-[var(--ink-12)] hover:bg-[var(--ink-3)] cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <ShieldCheck size={14} className="text-[var(--ink-10)]" />
                      <span>
                        {totalAlerts > 0
                          ? `Pre-flight (${totalAlerts})`
                          : `Stack ${analysis.maxStackingLoadKgf.toFixed(0)} kgf`}
                      </span>
                    </span>
                    <span className={`size-[7px] rounded-full ${statusDotClass}`} />
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMoreMenuOpen(false);
                      toggleFocusMode();
                    }}
                    className="md:hidden w-full min-h-[40px] px-3 rounded-[var(--radius-control)] flex items-center gap-2 text-[13px] text-[var(--ink-12)] hover:bg-[var(--ink-3)] cursor-pointer"
                  >
                    {focusMode ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                    <span>{focusMode ? 'Keluar Mode Fokus' : 'Mode Fokus Kanvas'}</span>
                  </button>

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

                  {authUser.role === 'admin' && (
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

                  <div className="my-1 border-t-[0.5px] border-[var(--line)]" />

                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleLogout}
                    className="w-full min-h-[40px] px-3 rounded-[var(--radius-control)] flex items-center gap-2 text-[13px] text-[var(--red-11)] hover:bg-[var(--red-3)] cursor-pointer"
                  >
                    <LogOut size={14} />
                    <span>Keluar ({authUser.name})</span>
                  </button>
                </div>
              )}
            </div>
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
              layers={layers}
              onToggleLayer={handleToggleLayer}
              exportMode={exportMode}
              onChangeExportMode={setExportMode}
              hasMobileFloatingDock={showMobileBottomDock}
              focusMode={focusMode}
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
              <span aria-hidden="true" className="hidden xl:inline">
                ·
              </span>
              <span className="font-mono tabular-nums hidden xl:inline shrink-0">
                Max stack{' '}
                <span className="text-[var(--ink-12)]">{analysis.maxStackingLoadKgf.toFixed(1)} kgf</span>
              </span>
              <span aria-hidden="true" className="hidden 2xl:inline">
                ·
              </span>
              <span className="hidden 2xl:inline truncate">
                Akun <span className="text-[var(--ink-12)]">{authUser.name}</span>
              </span>
            </div>
            <div className="flex items-center gap-2 text-[var(--ink-10)] whitespace-nowrap shrink-0">
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

      {bctOpen &&
        !focusMode &&
        (isRightOverlay ? (
          <div
            className="fixed inset-0 z-40 flex justify-end"
            role="dialog"
            aria-modal="true"
            aria-label="Panel BCT Pro"
          >
            <div
              className="absolute inset-0 bg-[var(--backdrop)] backdrop-blur-[2px]"
              onClick={() => setBctOpen(false)}
              aria-hidden="true"
            />
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
              className="relative z-10 shadow-[var(--shadow-modal)]"
            />
          </div>
        ) : (
          <BCTInspectorRail
            config={config}
            paths={paths}
            analysis={analysis}
            userId={authUser.id}
            onChange={setConfig}
            onOpenEngineeringSheet={() => setEngineeringSheetOpen(true)}
            onClose={() => setBctOpen(false)}
          />
        ))}

      {/* Mobile Floating Thumb Dock (Portrait Mobile Full-Canvas Focus + 1-Tap Panel Access) */}
      {showMobileBottomDock && !focusMode && (
        <nav
          aria-label="Kontrol cepat mobile"
          className="fixed bottom-3 left-1/2 -translate-x-1/2 z-30 md:hidden flex items-center gap-1 p-1 rounded-full bg-[var(--surface-top)]/95 backdrop-blur-md border-[0.5px] border-[var(--line)] shadow-[var(--shadow-modal)]"
        >
          <button
            type="button"
            onClick={() => setLeftRailOpen(!leftRailOpen)}
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
            onClick={() => setBctOpen(!bctOpen)}
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
        <Suspense fallback={null}>
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
        <Suspense fallback={null}>
          <ProjectsModal
            open={projectsModalOpen}
            currentConfig={config}
            onLoadProject={(loaded) => setConfig(loaded)}
            onClose={() => setProjectsModalOpen(false)}
          />
        </Suspense>
      )}

      {/* Admin User Lifecycle Console */}
      {authUser.role === 'admin' && adminModalOpen && (
        <Suspense fallback={null}>
          <AdminUsersModal
            open={adminModalOpen}
            currentUser={authUser}
            onClose={() => setAdminModalOpen(false)}
          />
        </Suspense>
      )}

      <OfflineIndicator />
    </div>
  );
}
