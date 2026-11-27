import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  History as HistoryIcon,
  Layers,
  PanelRightClose,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import {
  ALL_PAPER_GRADES,
  BctFluteId,
  BctHistoryEntry,
  BoxConfig,
  CustomRctOverrides,
  DielinePaths,
  EngineeringAnalysis,
  FLUTE_SPECS,
  FLUTE_TYPES,
  FluteDirection,
  ForceUnit,
  MEDIUM_GRADES,
  MediumGradeId,
  PaperGradeId,
  PRINT_COVERAGE_PRESETS,
  SAFETY_FACTOR_PRESETS,
} from '../types';
import { fromMm, toMm } from '../utils/units';
import { authFetch } from '../utils/apiSession';
import {
  computeCaseGrossWeightKg,
  computeWeightedPrintCoverage,
  detectPrintPresetId,
  formatMaterialsSummary,
  formatSubstanceString,
  getEffectiveProductNetWeightKg,
  getEffectiveRct,
  getIndonesianHumidityContext,
  getPrintCoverageDescription,
  getRecommendedCoverageHint,
  KGF_CM_TO_LBF_IN,
  LBF_TO_KGF,
  loadBctHistory,
  saveBctHistory,
} from '../utils/engineering';
import {
  TactileButton,
  TactileInputWell,
  TactileSegmented,
  TactileSelect,
  TactileSwitch,
} from './tactile/TactileUI';

interface BCTInspectorRailProps {
  config: BoxConfig;
  paths: DielinePaths;
  analysis: EngineeringAnalysis;
  userId?: string;
  onChange: (config: BoxConfig) => void;
  onOpenEngineeringSheet: () => void;
  onClose?: () => void;
  className?: string;
}

type RailTab = 'calculator' | 'history' | 'compare';

const PANEL_CYCLE_STEPS = [0, 15, 35, 65, 90];

function BCTInspectorRail({
  config,
  analysis,
  userId,
  onChange,
  onOpenEngineeringSheet,
  onClose,
  className = '',
}: BCTInspectorRailProps) {
  const [activeTab, setActiveTab] = useState<RailTab>('calculator');
  const [forceUnit, setForceUnit] = useState<ForceUnit>('kgf');
  const [history, setHistory] = useState<BctHistoryEntry[]>(() => loadBctHistory(userId));
  const [historyQuery, setHistoryQuery] = useState('');
  const [compareIds, setCompareIds] = useState<[string, string]>(['__current__', '']);
  const [justSaved, setJustSaved] = useState(false);

  // Sync per-user BCT history from VPS SQLite database when account changes or mounts
  useEffect(() => {
    let cancelled = false;
    setHistory(loadBctHistory(userId));
    if (!userId) return;

    authFetch('/api/history')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data && Array.isArray(data.entries)) {
          setHistory(data.entries);
          saveBctHistory(data.entries, userId);
        }
      })
      .catch(() => {
        // Offline / transient network fallback retains local cache
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const unit = config.unit;
  const eng = config.engineering;
  const isDoubleWall = config.boardGrade === 'double-wall';

  const toDisplayDim = (mm: number) => Math.round(fromMm(mm, unit) * 100) / 100;
  const parseDisplayDim = (val: string) => {
    const num = Number(val);
    return Number.isFinite(num) ? Math.max(20, toMm(num, unit)) : 20;
  };

  const formatForce = (kgf: number) => {
    const val = forceUnit === 'kgf' ? kgf : kgf / LBF_TO_KGF;
    return val.toFixed(val >= 100 ? 1 : 2);
  };

  const formatEct = (kgfCm: number) => {
    return forceUnit === 'kgf'
      ? `${kgfCm.toFixed(2)} kgf/cm`
      : `${(kgfCm * KGF_CM_TO_LBF_IN).toFixed(1)} lbf/in`;
  };

  const formatEctNumber = (kgfCm: number) =>
    forceUnit === 'kgf'
      ? kgfCm.toFixed(2)
      : (kgfCm * KGF_CM_TO_LBF_IN).toFixed(1);

  // Two-way Direct ID Dimension Update (syncs CAD ID & recalculates weighted coverage)
  const handleDimChange = (axis: 'length' | 'width' | 'depth', mmVal: number) => {
    const nextDim = Math.max(20, Math.round(mmVal * 10) / 10);
    const nextDims = { ...config.dimensions, [axis]: nextDim };

    const nextWeightedCoverage =
      eng.panelPrintCoverage && eng.panelPrintCoverage.length === 4
        ? computeWeightedPrintCoverage(
            eng.panelPrintCoverage,
            nextDims.length,
            nextDims.width
          )
        : eng.printCoverage;

    const nextEng =
      axis === 'length' || axis === 'width'
        ? { ...eng, printCoverage: nextWeightedCoverage }
        : eng;

    onChange({
      ...config,
      inputMode: 'id',
      dimensions: nextDims,
      engineering: nextEng,
    });
  };

  // Two-way Board Grade Update (Single Wall 3-ply ↔ Double Wall 5-ply)
  const handleBoardGradeChange = (grade: BoxConfig['boardGrade']) => {
    if (grade === config.boardGrade) return;
    const defaultFlute =
      FLUTE_TYPES[grade].find((f) => f.id === 'C' || f.id === 'BC') ||
      FLUTE_TYPES[grade][0];
    const nextSubstance = formatSubstanceString(eng, grade);
    onChange({
      ...config,
      boardGrade: grade,
      fluteThickness: defaultFlute.thickness,
      engineering: {
        ...eng,
        fluteId: defaultFlute.id,
        ectValue: defaultFlute.defaultEct,
      },
      metadata: {
        ...config.metadata,
        materialSubstance: nextSubstance,
      },
    });
  };

  // Two-way Flute Update (syncs caliper + boardGrade + fluteId + 3/5-ply substance)
  const handleFluteChange = (fluteId: BctFluteId) => {
    const spec = FLUTE_SPECS[fluteId];
    const nextSubstance = formatSubstanceString(eng, spec.wall);
    onChange({
      ...config,
      boardGrade: spec.wall,
      fluteThickness: spec.thickness,
      engineering: {
        ...eng,
        fluteId,
        ectValue: Math.round(analysis.ectLbfIn),
      },
      metadata: {
        ...config.metadata,
        materialSubstance: nextSubstance,
      },
    });
  };

  // Two-way Paper Composition Update (supports 3-ply Single-Wall & 5-ply Double-Wall)
  const handleLayerChange = (
    layer: 'topLayer' | 'mediumLayer' | 'centerLayer' | 'mediumLayer2' | 'bottomLayer',
    value: PaperGradeId
  ) => {
    const nextEng = {
      ...eng,
      [layer]: value,
    };
    const nextSubstance = formatSubstanceString(nextEng, config.boardGrade);
    onChange({
      ...config,
      engineering: nextEng,
      metadata: {
        ...config.metadata,
        materialSubstance: nextSubstance,
      },
    });
  };

  const handleCustomRctChange = (
    key: keyof Omit<CustomRctOverrides, 'enabled'>,
    raw: string
  ) => {
    const num = parseFloat(raw);
    onChange({
      ...config,
      engineering: {
        ...eng,
        customRct: {
          ...eng.customRct,
          [key]: Number.isFinite(num) && num > 0 ? num : undefined,
        },
      },
    });
  };

  // Two-way Print Coverage: Preset, Interactive Panel Click, Fine Slider, Ink Colors
  const handleSelectPrintPreset = (
    preset: (typeof PRINT_COVERAGE_PRESETS)[number]
  ) => {
    const panels: [number, number, number, number] = [...preset.panels];
    const weighted = computeWeightedPrintCoverage(
      panels,
      config.dimensions.length,
      config.dimensions.width
    );
    const shouldUpdateColors =
      preset.id === 'none' || config.metadata.printColorsCount === 0;
    onChange({
      ...config,
      engineering: {
        ...eng,
        panelPrintCoverage: panels,
        printPresetId: preset.id,
        printCoverage: weighted,
      },
      metadata: shouldUpdateColors
        ? {
            ...config.metadata,
            printColorsCount: preset.colorsHint,
          }
        : config.metadata,
    });
  };

  const handleCyclePanel = (idx: 0 | 1 | 2 | 3) => {
    const current = eng.panelPrintCoverage?.[idx] ?? eng.printCoverage;
    const nextStep =
      PANEL_CYCLE_STEPS.find((s) => s > current) ?? PANEL_CYCLE_STEPS[0];
    const nextPanels: [number, number, number, number] = [
      ...(eng.panelPrintCoverage || [
        eng.printCoverage,
        eng.printCoverage,
        eng.printCoverage,
        eng.printCoverage,
      ]),
    ] as [number, number, number, number];
    nextPanels[idx] = nextStep;
    const weighted = computeWeightedPrintCoverage(
      nextPanels,
      config.dimensions.length,
      config.dimensions.width
    );
    onChange({
      ...config,
      engineering: {
        ...eng,
        panelPrintCoverage: nextPanels,
        printPresetId: detectPrintPresetId(nextPanels),
        printCoverage: weighted,
      },
      metadata:
        weighted > 0 && config.metadata.printColorsCount === 0
          ? { ...config.metadata, printColorsCount: 1 }
          : config.metadata,
    });
  };

  const handleCoverageSlider = (pct: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(pct || 0)));
    const nextPanels: [number, number, number, number] = [
      clamped,
      clamped,
      clamped,
      clamped,
    ];
    onChange({
      ...config,
      engineering: {
        ...eng,
        printCoverage: clamped,
        panelPrintCoverage: nextPanels,
        printPresetId: clamped === 0 ? 'none' : 'custom',
      },
    });
  };

  const handleColorsChange = (count: number) => {
    const clamped = Math.max(0, Math.min(10, Math.round(count || 0)));
    const shouldAutoSuggest = clamped > 0 && eng.printCoverage === 0;
    const suggested = Math.min(clamped * 15, 80);
    onChange({
      ...config,
      metadata: {
        ...config.metadata,
        printColorsCount: clamped,
      },
      engineering: shouldAutoSuggest
        ? {
            ...eng,
            printCoverage: suggested,
            panelPrintCoverage: [suggested, suggested, suggested, suggested],
            printPresetId: 'custom',
          }
        : eng,
    });
  };

  const updateEngineering = <K extends keyof BoxConfig['engineering']>(
    field: K,
    value: BoxConfig['engineering'][K]
  ) => {
    onChange({
      ...config,
      engineering: {
        ...eng,
        [field]: value,
      },
    });
  };

  const handleSaveSnapshot = () => {
    const entry: BctHistoryEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: new Date().toISOString(),
      label:
        config.metadata.productName.trim() ||
        `FEFCO ${config.boxStyle} (${Math.round(config.dimensions.length)}×${Math.round(
          config.dimensions.width
        )}×${Math.round(config.dimensions.depth)})`,
      calculationMethod: eng.calculationMethod,
      boxStyle: config.boxStyle,
      dimensions: { ...config.dimensions },
      fluteId: eng.fluteId,
      fluteThickness: config.fluteThickness,
      boardGrade: config.boardGrade,
      fluteDirection: config.prepress.fluteDirection,
      materials: {
        top: eng.topLayer,
        medium: eng.mediumLayer,
        center: eng.centerLayer,
        medium2: eng.mediumLayer2,
        bottom: eng.bottomLayer,
      },
      customRct: { ...eng.customRct },
      conditions: {
        printCoverage: eng.printCoverage,
        panelPrintCoverage: [...eng.panelPrintCoverage] as [number, number, number, number],
        printPresetId: eng.printPresetId,
        numberOfColors: config.metadata.printColorsCount,
        relativeHumidity: eng.relativeHumidity,
        handlingRisk: eng.handlingRisk,
        useActualEct: eng.useActualEct,
        actualEctKgfCm: eng.actualEctKgfCm,
      },
      safetyFactor: eng.safetyFactor,
      results: {
        ectKgfCm: analysis.ectKgfCm,
        ectSource: analysis.ectSource,
        bctEstimateKgf: analysis.bctEstimateKgf,
        correctedBctKgf: analysis.correctedBctKgf,
        maxStackingLoadKgf: analysis.maxStackingLoadKgf,
        combinedFactor: analysis.factors.combined,
      },
    };

    const next = [entry, ...history];
    setHistory(next);
    saveBctHistory(next, userId);
    if (userId) {
      authFetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entry }),
      }).catch(() => {});
    }
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 1600);
  };

  const handleDeleteHistory = (id: string) => {
    const next = history.filter((item) => item.id !== id);
    setHistory(next);
    saveBctHistory(next, userId);
    if (userId) {
      authFetch(`/api/history/${id}`, {
        method: 'DELETE',
      }).catch(() => {});
    }
    setCompareIds((prev) => [
      prev[0] === id ? '__current__' : prev[0],
      prev[1] === id ? '' : prev[1],
    ]);
  };

  const handleRestoreSnapshot = (entry: BctHistoryEntry) => {
    const fluteSpec = FLUTE_SPECS[entry.fluteId] || FLUTE_SPECS.B;
    const restoredGrade = entry.boardGrade || fluteSpec.wall;
    const nextEng: BoxConfig['engineering'] = {
      ...eng,
      calculationMethod: entry.calculationMethod || 'tappi',
      fluteId: entry.fluteId,
      topLayer: entry.materials.top,
      mediumLayer: entry.materials.medium,
      centerLayer: entry.materials.center || eng.centerLayer,
      mediumLayer2: entry.materials.medium2 || eng.mediumLayer2,
      bottomLayer: entry.materials.bottom,
      customRct: entry.customRct || { enabled: false },
      printCoverage: entry.conditions.printCoverage,
      panelPrintCoverage: entry.conditions.panelPrintCoverage || [
        entry.conditions.printCoverage,
        entry.conditions.printCoverage,
        entry.conditions.printCoverage,
        entry.conditions.printCoverage,
      ],
      printPresetId: entry.conditions.printPresetId || 'custom',
      relativeHumidity: entry.conditions.relativeHumidity,
      handlingRisk: entry.conditions.handlingRisk,
      useActualEct: entry.conditions.useActualEct,
      actualEctKgfCm: entry.conditions.actualEctKgfCm,
      safetyFactor: entry.safetyFactor,
      ectValue: Math.round(entry.results.ectKgfCm * KGF_CM_TO_LBF_IN),
    };
    const nextSubstance = formatSubstanceString(nextEng, restoredGrade);

    const nextProduct =
      config.inputMode === 'product'
        ? {
            ...config.product,
            length: Math.max(10, entry.dimensions.length - config.product.clearanceL),
            width: Math.max(10, entry.dimensions.width - config.product.clearanceW),
            depth: Math.max(10, entry.dimensions.depth - config.product.clearanceD),
          }
        : config.product;

    onChange({
      ...config,
      boxStyle: entry.boxStyle,
      dimensions: { ...entry.dimensions },
      product: nextProduct,
      boardGrade: restoredGrade,
      fluteThickness: entry.fluteThickness || fluteSpec.thickness,
      prepress: {
        ...config.prepress,
        fluteDirection: entry.fluteDirection,
      },
      engineering: nextEng,
      metadata: {
        ...config.metadata,
        materialSubstance: nextSubstance,
        printColorsCount: entry.conditions.numberOfColors,
      },
    });
  };

  // Select Options
  const linerOptions = useMemo(
    () =>
      Object.values(ALL_PAPER_GRADES).map((g) => ({
        value: g.id as PaperGradeId,
        label: `${g.id} · ${g.name}`,
        hint: `RCT ${g.rct.toFixed(2)} kgf/cm · ${g.gsm} gsm`,
      })),
    []
  );

  const mediumOptions = useMemo(
    () =>
      Object.values(MEDIUM_GRADES).map((g) => ({
        value: g.id as MediumGradeId,
        label: `${g.id} · ${g.name}`,
        hint: `RCT ${g.rct.toFixed(2)} kgf/cm · ${g.gsm} gsm`,
      })),
    []
  );

  const fluteOptions = useMemo(
    () =>
      (['B', 'C', 'A', 'E', 'F', 'BC', 'AB', 'EB', 'AA'] as BctFluteId[]).map((id) => {
        const s = FLUTE_SPECS[id];
        const tufText = s.tuf2 ? `${s.tuf1}/${s.tuf2}` : `${s.tuf1.toFixed(2)}`;
        return {
          value: id,
          label: s.name,
          hint: `TUF ${tufText} · ${s.wall === 'double-wall' ? '5-ply DW' : '3-ply SW'}`,
        };
      }),
    []
  );

  const sfOptions = useMemo(
    () =>
      SAFETY_FACTOR_PRESETS.map((p) => ({
        value: p.value,
        label: p.label,
        hint: p.environment,
      })),
    []
  );

  const filteredHistory = useMemo(() => {
    const q = historyQuery.trim().toLowerCase();
    if (!q) return history;
    return history.filter((item) => {
      const sub = formatMaterialsSummary(item.materials, item.boardGrade).toLowerCase();
      return (
        item.label.toLowerCase().includes(q) ||
        item.fluteId.toLowerCase().includes(q) ||
        item.boxStyle.toLowerCase().includes(q) ||
        sub.includes(q)
      );
    });
  }, [history, historyQuery]);

  // Build Compare Items
  const currentAsComparable: BctHistoryEntry = {
    id: '__current__',
    createdAt: new Date().toISOString(),
    label: 'Current workspace (Live)',
    calculationMethod: eng.calculationMethod,
    boxStyle: config.boxStyle,
    dimensions: { ...config.dimensions },
    fluteId: eng.fluteId,
    fluteThickness: config.fluteThickness,
    boardGrade: config.boardGrade,
    fluteDirection: config.prepress.fluteDirection,
    materials: {
      top: eng.topLayer,
      medium: eng.mediumLayer,
      center: eng.centerLayer,
      medium2: eng.mediumLayer2,
      bottom: eng.bottomLayer,
    },
    conditions: {
      printCoverage: eng.printCoverage,
      numberOfColors: config.metadata.printColorsCount,
      relativeHumidity: eng.relativeHumidity,
      handlingRisk: eng.handlingRisk,
      useActualEct: eng.useActualEct,
      actualEctKgfCm: eng.actualEctKgfCm,
    },
    safetyFactor: eng.safetyFactor,
    results: {
      ectKgfCm: analysis.ectKgfCm,
      ectSource: analysis.ectSource,
      bctEstimateKgf: analysis.bctEstimateKgf,
      correctedBctKgf: analysis.correctedBctKgf,
      maxStackingLoadKgf: analysis.maxStackingLoadKgf,
      combinedFactor: analysis.factors.combined,
    },
  };

  const comparePool = [currentAsComparable, ...history];
  const compareItem1 = comparePool.find((x) => x.id === compareIds[0]) || null;
  const compareItem2 = comparePool.find((x) => x.id === compareIds[1]) || null;

  const ectSourceLabel =
    analysis.ectSource === 'ACTUAL_ECT'
      ? 'Actual ECT'
      : analysis.ectSource === 'STANDARD_ECT'
      ? 'Standard table'
      : 'Estimated (RCT)';

  const coverageHint = getRecommendedCoverageHint(config.metadata.printColorsCount);
  const humidityContext = getIndonesianHumidityContext(eng.relativeHumidity);

  // Normalized panel flex weights for the visual coverage mini-strip
  const L = Math.max(40, config.dimensions.length);
  const W = Math.max(40, config.dimensions.width);
  const panelSpecs: Array<{
    idx: 0 | 1 | 2 | 3;
    code: string;
    flex: number;
    pct: number;
  }> = [
    { idx: 0, code: 'L1', flex: L, pct: eng.panelPrintCoverage?.[0] ?? eng.printCoverage },
    { idx: 1, code: 'W1', flex: W, pct: eng.panelPrintCoverage?.[1] ?? eng.printCoverage },
    { idx: 2, code: 'L2', flex: L, pct: eng.panelPrintCoverage?.[2] ?? eng.printCoverage },
    { idx: 3, code: 'W2', flex: W, pct: eng.panelPrintCoverage?.[3] ?? eng.printCoverage },
  ];

  return (
    <aside
      className={`surface-rail w-[min(348px,92vw)] lg:w-[332px] xl:w-[348px] h-full bg-[var(--ground)] border-l-[0.5px] border-[var(--line)] flex flex-col shrink-0 select-none ${className}`}
    >
      {/* Compact Rail Header with Direct Minimize Button */}
      <div className="px-4 py-3 border-b-[0.5px] border-[var(--line)] flex items-center justify-between gap-2 shrink-0">
        <div className="min-w-0">
          <h2 className="text-[14px] leading-[20px] font-semibold tracking-[-0.015em] text-[var(--ink-12)] truncate">
            BCT Engineering
          </h2>
          <p className="text-[12px] leading-[16px] text-[var(--ink-10)] truncate">
            TAPPI / ISO Calibrated · {isDoubleWall ? '5-ply DW' : '3-ply SW'}
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <TactileSegmented
            value={forceUnit}
            onChange={setForceUnit}
            size="compact"
            ariaLabel="Force display unit"
            options={[
              { value: 'kgf', label: 'kgf' },
              { value: 'lbf', label: 'lbf' },
            ]}
          />
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Minimize BCT sidebar"
              title="Minimize BCT Inspector"
              className="size-[34px] md:size-[28px] rounded-[var(--radius-control)] flex items-center justify-center text-[var(--ink-10)] hover:text-[var(--ink-12)] hover:bg-[var(--ink-3)] active:scale-[0.95] transition-colors cursor-pointer shrink-0 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus-ring)]"
            >
              <PanelRightClose size={15} />
            </button>
          )}
        </div>
      </div>

      {/* 3 Compact Sub-Tabs: Calc | Hist | Cmp */}
      <div className="px-4 py-2.5 border-b-[0.5px] border-[var(--line)]">
        <TactileSegmented
          value={activeTab}
          onChange={setActiveTab}
          fullWidth
          size="compact"
          shape="control"
          ariaLabel="BCT workspace section"
          options={[
            { value: 'calculator', label: 'Calc' },
            { value: 'history', label: `Hist (${history.length})` },
            { value: 'compare', label: 'Cmp' },
          ]}
        />
      </div>

      {/* Scrollable Rail Body */}
      <div className="flex-1 p-4 space-y-4 overflow-y-auto">
        {activeTab === 'calculator' && (
          <>
            {/* Primary Result Summary Card (Plain-Language BCT & Minus-Deduction Breakdown) */}
            {(() => {
              const effectiveNetKg = getEffectiveProductNetWeightKg(config);
              const caseGrossKg = computeCaseGrossWeightKg(
                effectiveNetKg,
                analysis.netBoxAreaSqm,
                analysis.boardGsm
              );
              const maxSafeLayers =
                caseGrossKg > 0.01 ? 1 + Math.floor(analysis.maxStackingLoadKgf / caseGrossKg) : 1;
              const retainedPct = Math.max(
                0,
                Math.min(100, Math.round(analysis.factors.combined * 100))
              );
              const rhLossPct = Math.max(0, Math.round((1 - analysis.factors.humidity) * 100));
              const handleLossPct = Math.max(0, Math.round((1 - analysis.factors.handling) * 100));
              const printLossPct = Math.max(0, Math.round((1 - analysis.factors.printing) * 100));
              const stabLossPct = Math.max(0, Math.round((1 - analysis.factors.stability) * 100));
              const grainLossPct = Math.max(0, Math.round((1 - analysis.factors.fluteGrain) * 100));

              const stackTier =
                maxSafeLayers >= 5
                  ? {
                      textClass: 'text-[var(--green-11)]',
                      label: `Aman s/d ~${maxSafeLayers} layer`,
                      Icon: ShieldCheck,
                    }
                  : maxSafeLayers >= 2
                  ? {
                      textClass: 'text-[var(--amber-11)]',
                      label: `Terbatas ~${maxSafeLayers} layer`,
                      Icon: AlertTriangle,
                    }
                  : {
                      textClass: 'text-[var(--red-11)]',
                      label: 'Maks 1 layer (rawan)',
                      Icon: ShieldAlert,
                    };
              const StackIcon = stackTier.Icon;

              const retentionBarClass =
                retainedPct >= 55
                  ? 'bg-[#16A34A]'
                  : retainedPct >= 35
                  ? 'bg-[#D97706]'
                  : 'bg-[#DC2626]';

              const deductions: Array<{ label: string; lossPct: number }> = [
                { label: `Kelembaban (${eng.relativeHumidity}% RH)`, lossPct: rhLossPct },
                { label: 'Handling & Pengiriman', lossPct: handleLossPct },
                { label: `Tinta Cetak (${eng.printCoverage}%)`, lossPct: printLossPct },
              ];
              if (stabLossPct > 0) {
                deductions.push({ label: 'Rasio Tinggi Dus', lossPct: stabLossPct });
              }
              if (grainLossPct > 0) {
                deductions.push({ label: 'Arah Flute Horizontal', lossPct: grainLossPct });
              }

              return (
                <div className="surface-raised bg-[var(--surface-top)] rounded-[var(--radius-container)] shadow-[var(--shadow-card)] p-3.5 space-y-3">
                  {/* Hero Row: Safe Load per Bottom Box + Plain-Language Stacking Status */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[11px] leading-[15px] text-[var(--ink-10)]">
                        Beban Aman / Dus (SF {eng.safetyFactor}:1)
                      </div>
                      <div
                        className={`text-[22px] leading-[28px] font-semibold font-mono tabular-nums ${stackTier.textClass}`}
                      >
                        {formatForce(analysis.maxStackingLoadKgf)} {forceUnit}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div
                        className={`inline-flex items-center justify-end gap-1 text-[11.5px] leading-[16px] font-semibold ${stackTier.textClass}`}
                      >
                        <StackIcon size={12} className="shrink-0" />
                        <span>{stackTier.label}</span>
                      </div>
                      <div className="text-[10.5px] leading-[15px] font-mono tabular-nums text-[var(--ink-10)] mt-0.5">
                        Isi {effectiveNetKg.toFixed(1)} kg · Kotor {caseGrossKg.toFixed(2)} kg
                      </div>
                    </div>
                  </div>

                  {/* Effective BCT & Remaining Strength Bar */}
                  <div className="pt-2.5 border-t-[0.5px] border-[var(--line)] space-y-1.5">
                    <div className="flex items-baseline justify-between gap-2 text-[11.5px]">
                      <span className="text-[var(--ink-10)]">BCT Efektif</span>
                      <span className="font-mono tabular-nums text-[var(--ink-12)] font-semibold">
                        {formatForce(analysis.correctedBctKgf)} {forceUnit}{' '}
                        <span className="text-[11px] font-normal text-[var(--ink-10)]">
                          (Sisa {retainedPct}%)
                        </span>
                      </span>
                    </div>
                    <div
                      className="h-1.5 w-full rounded-full bg-[var(--ink-3)] overflow-hidden"
                      role="progressbar"
                      aria-valuenow={retainedPct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`Sisa kekuatan BCT ${retainedPct} persen`}
                    >
                      <div
                        className={`h-full rounded-full transition-[width] duration-200 ${retentionBarClass}`}
                        style={{ width: `${retainedPct}%` }}
                      />
                    </div>
                    <div className="text-[10.5px] leading-[14px] text-[var(--ink-10)] font-mono tabular-nums">
                      Dari kekuatan awal (Raw) {formatForce(analysis.bctEstimateKgf)} {forceUnit}
                    </div>
                  </div>

                  {/* Plain-Language Minus Deduction Breakdown */}
                  <div className="pt-2.5 border-t-[0.5px] border-[var(--line)] space-y-1">
                    <div className="text-[10.5px] uppercase tracking-[0.04em] text-[var(--ink-10)] mb-1">
                      Pengurangan Kondisi Lapangan
                    </div>
                    {deductions.map((item) => (
                      <div
                        key={item.label}
                        className="flex items-center justify-between gap-2 text-[11px] leading-[16px]"
                      >
                        <span className="text-[var(--ink-11)] truncate">{item.label}</span>
                        <span
                          className={`font-mono tabular-nums shrink-0 ${
                            item.lossPct >= 20
                              ? 'text-[var(--red-11)] font-medium'
                              : item.lossPct > 0
                              ? 'text-[var(--amber-11)] font-medium'
                              : 'text-[var(--ink-10)]'
                          }`}
                        >
                          {item.lossPct > 0 ? `-${item.lossPct}%` : '0%'}
                        </span>
                      </div>
                    ))}
                    {stabLossPct === 0 && grainLossPct === 0 && (
                      <div className="flex items-center justify-between gap-2 text-[11px] leading-[16px]">
                        <span className="text-[var(--ink-10)]">Bentuk &amp; Arah Flute</span>
                        <span className="font-mono tabular-nums text-[var(--green-11)] shrink-0">
                          0% (Optimal)
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Compact Unboxed Technical Spec Footer */}
                  <div className="pt-2 border-t-[0.5px] border-[var(--line)] flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-[10.5px] leading-[15px] text-[var(--ink-10)] font-mono tabular-nums">
                    <span>ECT {formatEct(analysis.ectKgfCm)}</span>
                    <span>
                      {config.fluteThickness}mm · {analysis.boardGsm} gsm ·{' '}
                      {ectSourceLabel}
                    </span>
                  </div>

                  <div className="pt-0.5 flex items-center gap-2">
                    <TactileButton
                      type="button"
                      variant="primary"
                      size="compact"
                      onClick={handleSaveSnapshot}
                      className="flex-1"
                    >
                      {justSaved ? (
                        <>
                          <Check size={14} />
                          <span>Tersimpan di Riwayat</span>
                        </>
                      ) : (
                        <span>Simpan ke Riwayat</span>
                      )}
                    </TactileButton>
                    <TactileButton
                      type="button"
                      variant="secondary"
                      size="compact"
                      onClick={onOpenEngineeringSheet}
                      title="Buka detail engineering & rincian BCT"
                    >
                      <ArrowUpRight size={14} />
                    </TactileButton>
                  </div>
                </div>
              );
            })()}

            {/* Synced Box Dimensions (Direct ID) & Board Construction */}
            <section className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-[13px] leading-[20px] text-[var(--ink-12)]">
                  Inner dimensions ({unit})
                </h3>
                <span className="text-[11px] leading-[16px] text-[var(--ink-10)]">
                  Direct ID · CAD Sync
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[11px] leading-[15px] text-[var(--ink-10)] mb-1">
                    L ({unit})
                  </label>
                  <TactileInputWell
                    type="number"
                    mono
                    step={unit === 'mm' ? '1' : '0.1'}
                    value={toDisplayDim(config.dimensions.length)}
                    onChange={(e) => handleDimChange('length', parseDisplayDim(e.target.value))}
                  />
                </div>
                <div>
                  <label className="block text-[11px] leading-[15px] text-[var(--ink-10)] mb-1">
                    W ({unit})
                  </label>
                  <TactileInputWell
                    type="number"
                    mono
                    step={unit === 'mm' ? '1' : '0.1'}
                    value={toDisplayDim(config.dimensions.width)}
                    onChange={(e) => handleDimChange('width', parseDisplayDim(e.target.value))}
                  />
                </div>
                <div>
                  <label className="block text-[11px] leading-[15px] text-[var(--ink-10)] mb-1">
                    H ({unit})
                  </label>
                  <TactileInputWell
                    type="number"
                    mono
                    step={unit === 'mm' ? '1' : '0.1'}
                    value={toDisplayDim(config.dimensions.depth)}
                    onChange={(e) => handleDimChange('depth', parseDisplayDim(e.target.value))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-0.5">
                <div>
                  <label className="block text-[11px] leading-[15px] text-[var(--ink-10)] mb-1">
                    Board color
                  </label>
                  <TactileSelect
                    value={config.materialColor}
                    onChange={(val) => onChange({ ...config, materialColor: val })}
                    ariaLabel="Board color"
                    options={[
                      { value: 'kraft', label: 'Kraft (Brown)' },
                      { value: 'white', label: 'Bleached white' },
                    ]}
                  />
                </div>
                <div>
                  <label className="block text-[11px] leading-[15px] text-[var(--ink-10)] mb-1">
                    Board grade
                  </label>
                  <TactileSelect
                    value={config.boardGrade}
                    onChange={handleBoardGradeChange}
                    ariaLabel="Board grade"
                    options={[
                      { value: 'single-wall', label: 'Single wall' },
                      { value: 'double-wall', label: 'Double wall' },
                    ]}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] leading-[15px] text-[var(--ink-10)] mb-1">
                    Flute profile · {config.fluteThickness.toFixed(1)} mm
                  </label>
                  <TactileSelect
                    value={eng.fluteId}
                    options={fluteOptions}
                    onChange={handleFluteChange}
                    ariaLabel="Flute profile"
                  />
                </div>
                <div>
                  <label className="block text-[11px] leading-[15px] text-[var(--ink-10)] mb-1">
                    Flute grain
                  </label>
                  <TactileSegmented
                    value={config.prepress.fluteDirection}
                    onChange={(dir: FluteDirection) =>
                      onChange({
                        ...config,
                        prepress: { ...config.prepress, fluteDirection: dir },
                      })
                    }
                    fullWidth
                    size="compact"
                    ariaLabel="Flute direction"
                    options={[
                      { value: 'vertical', label: 'Vert.' },
                      { value: 'horizontal', label: 'Horiz.' },
                    ]}
                  />
                </div>
              </div>
            </section>

            <hr className="border-0 border-t-[0.5px] border-[var(--line)]" />

            {/* Material Layer Builder (3-Ply SW & 5-Ply DW) + Custom RCT */}
            <section className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[13px] leading-[20px] text-[var(--ink-12)]">
                  Material ({isDoubleWall ? '5-ply' : '3-ply'})
                </h3>
                <span className="text-[11px] font-mono tabular-nums text-[var(--ink-10)] truncate">
                  {config.metadata.materialSubstance}
                </span>
              </div>

              <div className="space-y-2">
                <div>
                  <label className="block text-[11px] leading-[15px] text-[var(--ink-10)] mb-1">
                    Outer liner L1 (
                    {getEffectiveRct(
                      eng.topLayer,
                      eng.customRct?.enabled ? eng.customRct.top : undefined
                    ).toFixed(2)}{' '}
                    RCT)
                  </label>
                  <TactileSelect
                    value={eng.topLayer}
                    options={linerOptions}
                    onChange={(v) => handleLayerChange('topLayer', v)}
                    ariaLabel="Top liner grade"
                  />
                </div>

                <div>
                  <label className="block text-[11px] leading-[15px] text-[var(--ink-10)] mb-1">
                    Medium M1 (
                    {getEffectiveRct(
                      eng.mediumLayer,
                      eng.customRct?.enabled ? eng.customRct.medium1 : undefined
                    ).toFixed(2)}{' '}
                    RCT)
                  </label>
                  <TactileSelect
                    value={eng.mediumLayer}
                    options={mediumOptions}
                    onChange={(v) => handleLayerChange('mediumLayer', v)}
                    ariaLabel="Medium 1 layer grade"
                  />
                </div>

                {isDoubleWall && (
                  <>
                    <div>
                      <label className="block text-[11px] leading-[15px] text-[var(--ink-10)] mb-1">
                        Center liner L2 (
                        {getEffectiveRct(
                          eng.centerLayer,
                          eng.customRct?.enabled ? eng.customRct.center : undefined
                        ).toFixed(2)}{' '}
                        RCT)
                      </label>
                      <TactileSelect
                        value={eng.centerLayer}
                        options={linerOptions}
                        onChange={(v) => handleLayerChange('centerLayer', v)}
                        ariaLabel="Center liner grade"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] leading-[15px] text-[var(--ink-10)] mb-1">
                        Medium M2 (
                        {getEffectiveRct(
                          eng.mediumLayer2,
                          eng.customRct?.enabled ? eng.customRct.medium2 : undefined
                        ).toFixed(2)}{' '}
                        RCT)
                      </label>
                      <TactileSelect
                        value={eng.mediumLayer2}
                        options={mediumOptions}
                        onChange={(v) => handleLayerChange('mediumLayer2', v)}
                        ariaLabel="Medium 2 layer grade"
                      />
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-[11px] leading-[15px] text-[var(--ink-10)] mb-1">
                    Inner liner {isDoubleWall ? 'L3' : 'L2'} (
                    {getEffectiveRct(
                      eng.bottomLayer,
                      eng.customRct?.enabled ? eng.customRct.bottom : undefined
                    ).toFixed(2)}{' '}
                    RCT)
                  </label>
                  <TactileSelect
                    value={eng.bottomLayer}
                    options={linerOptions}
                    onChange={(v) => handleLayerChange('bottomLayer', v)}
                    ariaLabel="Bottom liner grade"
                  />
                </div>
              </div>

              {/* Custom Lab RCT per ply */}
              <div className="pt-1 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] leading-[18px] text-[var(--ink-11)]">
                    Custom RCT per layer (kgf/cm)
                  </span>
                  <TactileSwitch
                    checked={eng.customRct?.enabled ?? false}
                    onChange={(checked) =>
                      updateEngineering('customRct', {
                        ...eng.customRct,
                        enabled: checked,
                      })
                    }
                    ariaLabel="Toggle custom RCT per layer"
                  />
                </div>

                {eng.customRct?.enabled && (
                  <div className="grid grid-cols-3 gap-1.5">
                    <div>
                      <label className="block text-[10px] leading-[14px] text-[var(--ink-10)] mb-0.5">
                        L1 RCT
                      </label>
                      <TactileInputWell
                        type="number"
                        mono
                        step="0.05"
                        min={0.3}
                        placeholder={String(ALL_PAPER_GRADES[eng.topLayer]?.rct ?? 1.5)}
                        value={eng.customRct.top ?? ''}
                        onChange={(e) => handleCustomRctChange('top', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] leading-[14px] text-[var(--ink-10)] mb-0.5">
                        M1 RCT
                      </label>
                      <TactileInputWell
                        type="number"
                        mono
                        step="0.05"
                        min={0.3}
                        placeholder={String(ALL_PAPER_GRADES[eng.mediumLayer]?.rct ?? 1.2)}
                        value={eng.customRct.medium1 ?? ''}
                        onChange={(e) => handleCustomRctChange('medium1', e.target.value)}
                      />
                    </div>
                    {isDoubleWall && (
                      <>
                        <div>
                          <label className="block text-[10px] leading-[14px] text-[var(--ink-10)] mb-0.5">
                            L2 RCT
                          </label>
                          <TactileInputWell
                            type="number"
                            mono
                            step="0.05"
                            min={0.3}
                            placeholder={String(
                              ALL_PAPER_GRADES[eng.centerLayer]?.rct ?? 1.2
                            )}
                            value={eng.customRct.center ?? ''}
                            onChange={(e) => handleCustomRctChange('center', e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] leading-[14px] text-[var(--ink-10)] mb-0.5">
                            M2 RCT
                          </label>
                          <TactileInputWell
                            type="number"
                            mono
                            step="0.05"
                            min={0.3}
                            placeholder={String(
                              ALL_PAPER_GRADES[eng.mediumLayer2]?.rct ?? 1.2
                            )}
                            value={eng.customRct.medium2 ?? ''}
                            onChange={(e) => handleCustomRctChange('medium2', e.target.value)}
                          />
                        </div>
                      </>
                    )}
                    <div>
                      <label className="block text-[10px] leading-[14px] text-[var(--ink-10)] mb-0.5">
                        {isDoubleWall ? 'L3' : 'L2'} RCT
                      </label>
                      <TactileInputWell
                        type="number"
                        mono
                        step="0.05"
                        min={0.3}
                        placeholder={String(ALL_PAPER_GRADES[eng.bottomLayer]?.rct ?? 1.5)}
                        value={eng.customRct.bottom ?? ''}
                        onChange={(e) => handleCustomRctChange('bottom', e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Lab Actual ECT Calibration */}
              <div className="pt-0.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] leading-[18px] text-[var(--ink-11)]">
                    Manual Actual ECT override
                  </span>
                  <TactileSwitch
                    checked={eng.useActualEct}
                    onChange={(checked) => updateEngineering('useActualEct', checked)}
                    ariaLabel="Toggle manual actual ECT override"
                  />
                </div>

                {eng.useActualEct && (
                  <TactileInputWell
                    type="number"
                    mono
                    min={1}
                    max={25}
                    step="0.1"
                    placeholder={analysis.ectKgfCm.toFixed(2)}
                    value={eng.actualEctKgfCm ?? ''}
                    onChange={(e) => {
                      const raw = parseFloat(e.target.value);
                      updateEngineering(
                        'actualEctKgfCm',
                        Number.isFinite(raw) && raw > 0 ? raw : null
                      );
                    }}
                    suffix="kgf/cm"
                  />
                )}
              </div>
            </section>

            <hr className="border-0 border-t-[0.5px] border-[var(--line)]" />

            {/* Operating Conditions & Mini Print Coverage Simulator */}
            <section className="space-y-3">
              <h3 className="text-[13px] leading-[20px] text-[var(--ink-12)]">
                Operating conditions
              </h3>

              {/* Interactive Visual Print Coverage Simulator */}
              <div className="surface-raised bg-[var(--surface-top)] rounded-[var(--radius-container)] shadow-[var(--shadow-card)] p-3 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[12px] leading-[16px] text-[var(--ink-12)]">
                      Print coverage simulator
                    </div>
                    <div className="text-[10px] leading-[14px] text-[var(--ink-10)]">
                      Click box panels to cycle ink area
                    </div>
                  </div>
                  <span className="text-[13px] font-mono tabular-nums text-[var(--ink-12)]">
                    {eng.printCoverage}%
                  </span>
                </div>

                {/* Preset Strip */}
                <div className="grid grid-cols-5 gap-1">
                  {PRINT_COVERAGE_PRESETS.map((preset) => {
                    const active = eng.printPresetId === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleSelectPrintPreset(preset)}
                        title={preset.summary}
                        className={`h-[24px] rounded-[var(--radius-sm)] text-[10px] font-mono tabular-nums cursor-pointer transition-colors duration-[var(--dur-hover)] ${
                          active
                            ? 'bg-[var(--ink-12)] text-[var(--surface-top)]'
                            : 'bg-[var(--raised)] text-[var(--ink-11)] shadow-[var(--shadow-button)] hover:text-[var(--ink-12)]'
                        }`}
                      >
                        {preset.label.split(' ')[0]}
                      </button>
                    );
                  })}
                </div>

                {/* Proportional 4-Panel Wall Strip: [L1 | W1 | L2 | W2] */}
                <div className="flex gap-1 items-stretch h-[56px] p-1 rounded-[var(--radius-sm)] bg-[var(--ink-2)] border-[0.5px] border-[var(--line)]">
                  {panelSpecs.map((panel) => {
                    const pct = Math.max(0, Math.min(100, panel.pct));
                    const substrateBg =
                      config.materialColor === 'kraft'
                        ? 'bg-[#e6d5bc]'
                        : 'bg-[#fafbfc]';

                    return (
                      <button
                        key={panel.code}
                        type="button"
                        onClick={() => handleCyclePanel(panel.idx)}
                        style={{ flexGrow: panel.flex }}
                        title={`Panel ${panel.code}: ${pct}% print coverage (click to cycle)`}
                        className={`relative min-w-[34px] basis-0 rounded-[3px] border-[0.5px] border-[var(--line)] ${substrateBg} overflow-hidden flex flex-col items-center justify-center cursor-pointer hover:border-[var(--ink-11)] active:scale-[0.98] transition-[transform,border-color] duration-[var(--dur-hover)]`}
                      >
                        {/* Visual Ink Zone Simulation Graphic */}
                        {pct > 0 && pct <= 20 && (
                          <div
                            aria-hidden="true"
                            className="absolute right-1.5 bottom-1.5 w-[42%] h-[30%] rounded-[2px] bg-[#1e2430]/75"
                          />
                        )}
                        {pct > 20 && pct <= 45 && (
                          <div
                            aria-hidden="true"
                            className="absolute inset-x-1 top-1/2 -translate-y-1/2 h-[38%] rounded-[2px] bg-[#1e2430]/70"
                          />
                        )}
                        {pct > 45 && pct <= 75 && (
                          <div
                            aria-hidden="true"
                            className="absolute inset-x-1 bottom-1 h-[66%] rounded-[2px] bg-[#1e2430]/75"
                          />
                        )}
                        {pct > 75 && (
                          <div
                            aria-hidden="true"
                            className="absolute inset-[2px] rounded-[2px] bg-[#1e2430]/82"
                          />
                        )}

                        <span
                          className={`relative z-10 text-[10px] leading-[12px] font-mono tabular-nums px-1 rounded-[2px] ${
                            pct > 45
                              ? 'text-white bg-black/35'
                              : 'text-[var(--ink-12)] bg-white/75'
                          }`}
                        >
                          {panel.code}
                        </span>
                        <span
                          className={`relative z-10 mt-0.5 text-[10px] leading-[12px] font-mono tabular-nums px-1 rounded-[2px] ${
                            pct > 45
                              ? 'text-white/95 bg-black/35'
                              : 'text-[var(--ink-11)] bg-white/75'
                          }`}
                        >
                          {pct}%
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Fine Slider */}
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={eng.printCoverage}
                  onChange={(e) => handleCoverageSlider(Number(e.target.value))}
                  className="tactile-range"
                  aria-label="Weighted printing coverage percentage"
                />

                <div className="flex items-center justify-between gap-2 text-[11px] leading-[15px] text-[var(--ink-10)]">
                  <span className="truncate">
                    {getPrintCoverageDescription(eng.printCoverage)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 items-end">
                <div>
                  <label className="block text-[11px] leading-[15px] text-[var(--ink-10)] mb-1">
                    Ink colors (Title)
                  </label>
                  <TactileInputWell
                    type="number"
                    mono
                    min={0}
                    max={10}
                    value={config.metadata.printColorsCount}
                    onChange={(e) => handleColorsChange(Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className="block text-[11px] leading-[15px] text-[var(--ink-10)] mb-1">
                    Safety factor
                  </label>
                  <TactileSelect
                    value={eng.safetyFactor}
                    options={sfOptions}
                    onChange={(val) => updateEngineering('safetyFactor', Number(val))}
                    ariaLabel="Safety factor"
                  />
                </div>
              </div>

              {coverageHint && (
                <p className="text-[11px] leading-[15px] text-[var(--ink-10)]">
                  {coverageHint}
                </p>
              )}

              {/* Relative Humidity (Kalibrasi Iklim Tropis Indonesia — BMKG / FBA / TAPPI) */}
              <div className="space-y-1.5 pt-0.5">
                <div className="flex items-center justify-between">
                  <label className="text-[12px] leading-[16px] text-[var(--ink-11)]">
                    Kelembaban relatif (RH)
                  </label>
                  <span className="text-[12px] font-mono tabular-nums text-[var(--ink-12)]">
                    {eng.relativeHumidity}% RH · {(analysis.factors.humidity * 100).toFixed(0)}% BCT
                  </span>
                </div>
                <input
                  type="range"
                  min={50}
                  max={95}
                  step={1}
                  value={Math.max(50, Math.min(95, eng.relativeHumidity))}
                  onChange={(e) =>
                    updateEngineering('relativeHumidity', Number(e.target.value))
                  }
                  className="tactile-range"
                  aria-label="Relative humidity"
                />
                <p className="text-[10.5px] leading-[14.5px] text-[var(--ink-10)]">
                  <span className="font-medium text-[var(--ink-11)]">
                    {humidityContext.label}:
                  </span>{' '}
                  {humidityContext.detail}
                </p>
              </div>

              {/* Handling Risk (Distribusi & Bongkar-Muat Indonesia) */}
              <div className="flex items-center justify-between gap-2 pt-0.5">
                <div className="min-w-0">
                  <div className="text-[12px] leading-[18px] text-[var(--ink-11)]">
                    Risiko handling &amp; transit
                  </div>
                  <div className="text-[11px] leading-[15px] text-[var(--ink-10)]">
                    {eng.handlingRisk
                      ? '-18% bongkar-muat manual / LTL Indonesia (×0.82)'
                      : 'Gudang modern full-forklift & palletized (×1.00)'}
                  </div>
                </div>
                <TactileSwitch
                  checked={eng.handlingRisk}
                  onChange={(checked) => updateEngineering('handlingRisk', checked)}
                  ariaLabel="Toggle handling risk factor"
                />
              </div>
            </section>
          </>
        )}

        {activeTab === 'history' && (
          <div className="space-y-3">
            <div className="relative">
              <Search
                size={14}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--ink-10)]"
              />
              <TactileInputWell
                type="text"
                value={historyQuery}
                onChange={(e) => setHistoryQuery(e.target.value)}
                placeholder="Search SKU, flute, K/M..."
                className="pl-8"
              />
            </div>

            {filteredHistory.length === 0 ? (
              <div className="py-12 px-4 text-center space-y-2">
                <HistoryIcon size={18} className="mx-auto text-[var(--ink-9)]" />
                <div className="text-[13px] leading-[20px] text-[var(--ink-11)]">
                  {history.length === 0 ? 'No saved calculations yet' : 'No matching snapshots'}
                </div>
                <p className="text-[12px] leading-[18px] text-[var(--ink-10)]">
                  {history.length === 0
                    ? 'Save the current calculation in Calc to restore or compare scenarios.'
                    : 'Try another SKU, flute code, or paper grade.'}
                </p>
              </div>
            ) : (
              <div className="surface-raised bg-[var(--surface-top)] rounded-[var(--radius-container)] shadow-[var(--shadow-table)] border-[0.5px] border-[var(--line)] divide-y-[0.5px] divide-[var(--line)] overflow-hidden">
                {filteredHistory.map((item) => {
                  const sub = formatMaterialsSummary(item.materials, item.boardGrade);
                  const dateLabel = new Date(item.createdAt).toLocaleDateString('en-GB', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  });
                  return (
                    <div
                      key={item.id}
                      className="p-3 hover:bg-[var(--root-ink-2)] transition-colors duration-[var(--dur-hover)] group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => handleRestoreSnapshot(item)}
                          className="flex-1 min-w-0 text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] rounded-[var(--radius-sm)]"
                        >
                          <div className="text-[13px] leading-[18px] text-[var(--ink-12)] truncate">
                            {item.label}
                          </div>
                          <div className="mt-1 text-[12px] leading-[16px] text-[var(--ink-10)] font-mono tabular-nums truncate">
                            {Math.round(item.dimensions.length)}×{Math.round(item.dimensions.width)}×
                            {Math.round(item.dimensions.depth)} mm · {item.fluteId} · {sub}
                          </div>
                          <div className="mt-1.5 flex items-center gap-2 text-[12px] leading-[16px] tabular-nums">
                            <span className="text-[var(--ink-12)] font-mono">
                              BCT {formatForce(item.results.correctedBctKgf)} {forceUnit}
                            </span>
                            <span aria-hidden="true" className="text-[var(--ink-9)]">·</span>
                            <span className="text-[var(--green-11)] font-mono">
                              Stack {formatForce(item.results.maxStackingLoadKgf)} {forceUnit}
                            </span>
                          </div>
                          <div className="mt-1 text-[11px] leading-[15px] text-[var(--ink-10)] tabular-nums">
                            {dateLabel} · TAPPI/ISO · Click to load
                          </div>
                        </button>

                        <TactileButton
                          type="button"
                          variant="icon"
                          onClick={() => handleDeleteHistory(item.id)}
                          aria-label="Delete saved calculation"
                          title="Delete snapshot"
                          className="shrink-0 text-[var(--ink-9)] hover:text-[var(--red-11)]"
                        >
                          <Trash2 size={14} />
                        </TactileButton>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'compare' && (
          <div className="space-y-3.5">
            {history.length === 0 ? (
              <div className="py-12 px-4 text-center space-y-2">
                <Layers size={18} className="mx-auto text-[var(--ink-9)]" />
                <div className="text-[13px] leading-[20px] text-[var(--ink-11)]">
                  Save at least one calculation to compare
                </div>
                <p className="text-[12px] leading-[18px] text-[var(--ink-10)]">
                  Compare the live workspace or any two saved specs side by side.
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-2.5">
                  <div>
                    <label className="block text-[11px] leading-[15px] text-[var(--ink-10)] mb-1">
                      Scenario A (Baseline)
                    </label>
                    <TactileSelect
                      value={compareIds[0] || '__current__'}
                      onChange={(val) => setCompareIds([val, compareIds[1]])}
                      ariaLabel="Select baseline calculation"
                      options={comparePool
                        .filter((x) => x.id !== compareIds[1])
                        .map((x) => ({
                          value: x.id,
                          label: x.label,
                          hint: `${x.fluteId} · ${formatMaterialsSummary(
                            x.materials,
                            x.boardGrade
                          )} · ${formatForce(x.results.correctedBctKgf)} ${forceUnit}`,
                        }))}
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] leading-[15px] text-[var(--ink-10)] mb-1">
                      Scenario B (Candidate)
                    </label>
                    <TactileSelect
                      value={compareIds[1] || history[0].id}
                      onChange={(val) => setCompareIds([compareIds[0], val])}
                      ariaLabel="Select candidate calculation"
                      options={comparePool
                        .filter((x) => x.id !== compareIds[0])
                        .map((x) => ({
                          value: x.id,
                          label: x.label,
                          hint: `${x.fluteId} · ${formatMaterialsSummary(
                            x.materials,
                            x.boardGrade
                          )} · ${formatForce(x.results.correctedBctKgf)} ${forceUnit}`,
                        }))}
                    />
                  </div>
                </div>

                {(() => {
                  const a = compareItem1;
                  const b = compareItem2 || history.find((h) => h.id !== compareIds[0]) || null;
                  if (!a || !b) return null;

                  const metrics = [
                    {
                      label: 'ECT',
                      v1: a.results.ectKgfCm,
                      v2: b.results.ectKgfCm,
                      fmt: formatEctNumber,
                      unitLabel: forceUnit === 'kgf' ? 'kgf/cm' : 'lbf/in',
                    },
                    {
                      label: 'Raw BCT',
                      v1: a.results.bctEstimateKgf,
                      v2: b.results.bctEstimateKgf,
                      fmt: formatForce,
                      unitLabel: forceUnit,
                    },
                    {
                      label: 'Corrected BCT',
                      v1: a.results.correctedBctKgf,
                      v2: b.results.correctedBctKgf,
                      fmt: formatForce,
                      unitLabel: forceUnit,
                    },
                    {
                      label: 'Max Stack Load',
                      v1: a.results.maxStackingLoadKgf,
                      v2: b.results.maxStackingLoadKgf,
                      fmt: formatForce,
                      unitLabel: forceUnit,
                    },
                    {
                      label: 'Combined Factor',
                      v1: a.results.combinedFactor * 100,
                      v2: b.results.combinedFactor * 100,
                      fmt: (v: number) => `${v.toFixed(0)}`,
                      unitLabel: '%',
                    },
                  ];

                  return (
                    <div className="surface-raised bg-[var(--surface-top)] rounded-[var(--radius-container)] border-[0.5px] border-[var(--line)] shadow-[var(--shadow-table)] overflow-hidden">
                      <table className="w-full border-collapse text-left text-[12px] leading-[16px]">
                        <thead>
                          <tr className="h-[34px] border-b-[0.5px] border-[var(--line)] text-[var(--ink-12)]">
                            <th className="px-2.5 font-medium">Metric</th>
                            <th className="px-2 font-medium border-l-[0.5px] border-[var(--line)]">A</th>
                            <th className="px-2 font-medium border-l-[0.5px] border-[var(--line)]">B</th>
                            <th className="px-2 font-medium border-l-[0.5px] border-[var(--line)]">Delta</th>
                          </tr>
                        </thead>
                        <tbody>
                          {metrics.map((m, idx) => {
                            const diff = m.v2 - m.v1;
                            const pct = m.v1 > 0 ? (diff / m.v1) * 100 : 0;
                            const sign = diff > 0.005 ? '+' : '';
                            const hueClass =
                              diff > 0.005
                                ? 'text-[var(--green-11)]'
                                : diff < -0.005
                                ? 'text-[var(--red-11)]'
                                : 'text-[var(--ink-10)]';
                            return (
                              <tr
                                key={m.label}
                                className={`h-[38px] ${
                                  idx === metrics.length - 1
                                    ? ''
                                    : 'border-b-[0.5px] border-[var(--line)]'
                                }`}
                              >
                                <td className="px-2.5 text-[var(--ink-12)]">
                                  <div>{m.label}</div>
                                  <div className="text-[10px] text-[var(--ink-10)]">{m.unitLabel}</div>
                                </td>
                                <td className="px-2 font-mono tabular-nums text-[var(--ink-11)] border-l-[0.5px] border-[var(--line)]">
                                  {m.fmt(m.v1)}
                                </td>
                                <td className="px-2 font-mono tabular-nums text-[var(--ink-12)] border-l-[0.5px] border-[var(--line)]">
                                  {m.fmt(m.v2)}
                                </td>
                                <td
                                  className={`px-2 font-mono tabular-nums border-l-[0.5px] border-[var(--line)] ${hueClass}`}
                                >
                                  <div>
                                    {sign}
                                    {pct.toFixed(1)}%
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

export default React.memo(BCTInspectorRail);
