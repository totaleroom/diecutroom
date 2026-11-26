import React, { useState } from 'react';
import {
  BoxConfig,
  BOX_STYLES,
  FLUTE_TYPES,
  PERFORATION_OPTIONS,
  PERFORATION_RULE_PRESETS,
  TOLERANCE_PRESETS,
  DielinePaths,
  DisplayUnit,
  EngineeringAnalysis,
  FluteDirection,
  PerforationRuleMode,
  PerforationType,
  TolerancePreset,
} from '../types';
import { fromMm, toMm, formatValue, validateITF14, fixITF14CheckDigit } from '../utils/units';
import {
  computeCaseGrossWeightKg,
  computeWeightedPrintCoverage,
  formatSubstanceString,
  getEffectiveProductNetWeightKg,
  parseSubstanceString,
} from '../utils/engineering';
import { Sparkles, ArrowUpRight, Info, PanelLeftClose } from 'lucide-react';
import {
  TactileButton,
  TactileCheckbox,
  TactileInputWell,
  TactileSegmented,
  TactileSelect,
  TactileSwitch,
  TactileTextareaWell,
} from './tactile/TactileUI';

interface SidebarProps {
  config: BoxConfig;
  paths: DielinePaths;
  analysis: EngineeringAnalysis;
  onChange: (config: BoxConfig) => void;
  onOpenEngineering: () => void;
  onClose?: () => void;
  className?: string;
}

type SidebarTab = 'structure' | 'features' | 'metadata';

export default function Sidebar({
  config,
  paths,
  analysis,
  onChange,
  onOpenEngineering,
  onClose,
  className = '',
}: SidebarProps) {
  const [activeTab, setActiveTab] = useState<SidebarTab>('structure');

  const unit = config.unit;
  const toDisplay = (mm: number) => Math.round(fromMm(mm, unit) * 100) / 100;
  const parseDisplay = (val: string) => {
    const num = Number(val);
    return Number.isFinite(num) ? Math.max(0, toMm(num, unit)) : 0;
  };

  const handleChange = <K extends keyof BoxConfig>(field: K, value: BoxConfig[K]) => {
    onChange({ ...config, [field]: value });
  };

  const handleDimensionChange = (field: keyof BoxConfig['dimensions'], mmValue: number) => {
    const nextDims = { ...config.dimensions, [field]: Math.max(20, mmValue) };
    const nextCoverage =
      field === 'length' || field === 'width'
        ? computeWeightedPrintCoverage(
            config.engineering.panelPrintCoverage,
            nextDims.length,
            nextDims.width
          )
        : config.engineering.printCoverage;
    onChange({
      ...config,
      dimensions: nextDims,
      engineering: {
        ...config.engineering,
        printCoverage: nextCoverage,
      },
    });
  };

  const syncDimensionsFromProduct = (prod: BoxConfig['product'], baseConfig: BoxConfig): BoxConfig => {
    const nextDims = {
      length: Math.max(20, Math.round((prod.length + prod.clearanceL) * 10) / 10),
      width: Math.max(20, Math.round((prod.width + prod.clearanceW) * 10) / 10),
      depth: Math.max(20, Math.round((prod.depth + prod.clearanceD) * 10) / 10),
    };
    return {
      ...baseConfig,
      product: prod,
      dimensions: nextDims,
      engineering: {
        ...baseConfig.engineering,
        printCoverage: computeWeightedPrintCoverage(
          baseConfig.engineering.panelPrintCoverage,
          nextDims.length,
          nextDims.width
        ),
      },
    };
  };

  const handleProductField = (
    field: 'length' | 'width' | 'depth' | 'clearanceL' | 'clearanceW' | 'clearanceD',
    mmValue: number
  ) => {
    const isClearance = field.startsWith('clearance');
    const nextProd: BoxConfig['product'] = {
      ...config.product,
      [field]: isClearance ? Math.max(-20, mmValue) : Math.max(10, mmValue),
      tolerancePreset: isClearance ? 'custom' : config.product.tolerancePreset,
    };
    if (config.inputMode === 'product') {
      onChange(syncDimensionsFromProduct(nextProd, config));
    } else {
      onChange({ ...config, product: nextProd });
    }
  };

  const handleTolerancePreset = (preset: TolerancePreset) => {
    if (preset === 'custom') {
      onChange({
        ...config,
        product: { ...config.product, tolerancePreset: 'custom' },
      });
      return;
    }
    const spec = TOLERANCE_PRESETS[preset];
    const nextProd: BoxConfig['product'] = {
      ...config.product,
      tolerancePreset: preset,
      clearanceL: spec.clearanceL,
      clearanceW: spec.clearanceW,
      clearanceD: spec.clearanceD,
    };
    onChange(syncDimensionsFromProduct(nextProd, config));
  };

  const handleSnapZeroHeadspace = () => {
    const nextProd: BoxConfig['product'] = {
      ...config.product,
      tolerancePreset: 'custom',
      clearanceD: 0.5,
    };
    onChange(syncDimensionsFromProduct({ ...nextProd }, { ...config, inputMode: 'product' }));
  };

  const handleInputModeChange = (mode: 'id' | 'product') => {
    if (mode === 'product') {
      onChange(syncDimensionsFromProduct(config.product, { ...config, inputMode: 'product' }));
    } else {
      onChange({ ...config, inputMode: 'id' });
    }
  };

  const handleAdvancedChange = <K extends keyof BoxConfig['advanced']>(
    field: K,
    value: BoxConfig['advanced'][K]
  ) => {
    onChange({ ...config, advanced: { ...config.advanced, [field]: value } });
  };

  const handlePrePressChange = <K extends keyof BoxConfig['prepress']>(
    field: K,
    value: BoxConfig['prepress'][K]
  ) => {
    onChange({ ...config, prepress: { ...config.prepress, [field]: value } });
  };

  const handleBarcodeChange = <K extends keyof BoxConfig['barcode']>(
    field: K,
    value: BoxConfig['barcode'][K]
  ) => {
    onChange({ ...config, barcode: { ...config.barcode, [field]: value } });
  };

  const handlePerforationChange = <K extends keyof BoxConfig['perforation']>(
    field: K,
    value: BoxConfig['perforation'][K]
  ) => {
    onChange({ ...config, perforation: { ...config.perforation, [field]: value } });
  };

  const handlePerforationTypeChange = (nextType: PerforationType) => {
    const opt = PERFORATION_OPTIONS.find((p) => p.id === nextType);
    const keepCustom = config.perforation.ruleMode === 'custom';
    const nextMode: PerforationRuleMode = keepCustom
      ? 'custom'
      : opt?.defaultRuleMode || 'standard';
    const preset = PERFORATION_RULE_PRESETS.find((r) => r.id === nextMode);
    onChange({
      ...config,
      perforation: {
        ...config.perforation,
        type: nextType,
        ruleMode: nextMode,
        cut: keepCustom ? config.perforation.cut : preset?.cut ?? 5,
        tie: keepCustom ? config.perforation.tie : preset?.tie ?? 3,
      },
    });
  };

  const handlePerforationRuleModeChange = (nextMode: PerforationRuleMode) => {
    const preset = PERFORATION_RULE_PRESETS.find((r) => r.id === nextMode);
    onChange({
      ...config,
      perforation: {
        ...config.perforation,
        ruleMode: nextMode,
        cut:
          nextMode === 'custom'
            ? Math.max(1, config.perforation.cut || 5)
            : preset?.cut ?? 5,
        tie:
          nextMode === 'custom'
            ? Math.max(1, config.perforation.tie || 3)
            : preset?.tie ?? 3,
      },
    });
  };

  const handleAppearanceChange = <K extends keyof BoxConfig['appearance']>(
    field: K,
    value: BoxConfig['appearance'][K]
  ) => {
    onChange({ ...config, appearance: { ...config.appearance, [field]: value } });
  };

  const handleMetadataChange = <K extends keyof BoxConfig['metadata']>(
    field: K,
    value: BoxConfig['metadata'][K]
  ) => {
    if (field === 'materialSubstance') {
      const parsed = parseSubstanceString(String(value));
      if (!parsed) {
        onChange({
          ...config,
          metadata: { ...config.metadata, materialSubstance: String(value) },
        });
        return;
      }
      const targetGrade = parsed.isDoubleWall ? 'double-wall' : 'single-wall';
      const switchedFlute =
        targetGrade !== config.boardGrade
          ? FLUTE_TYPES[targetGrade].find((f) => f.id === 'B' || f.id === 'BC') ||
            FLUTE_TYPES[targetGrade][0]
          : null;

      onChange({
        ...config,
        boardGrade: targetGrade,
        fluteThickness: switchedFlute ? switchedFlute.thickness : config.fluteThickness,
        metadata: { ...config.metadata, materialSubstance: String(value) },
        engineering: {
          ...config.engineering,
          fluteId: switchedFlute ? switchedFlute.id : config.engineering.fluteId,
          topLayer: parsed.top,
          mediumLayer: parsed.medium,
          centerLayer: parsed.center ?? config.engineering.centerLayer,
          mediumLayer2: parsed.medium2 ?? config.engineering.mediumLayer2,
          bottomLayer: parsed.bottom,
        },
      });
      return;
    }
    if (field === 'printColorsCount') {
      const count = Math.max(0, Math.min(10, Number(value) || 0));
      const shouldAutoSuggest = count > 0 && config.engineering.printCoverage === 0;
      const suggested = Math.min(count * 15, 80);
      onChange({
        ...config,
        metadata: { ...config.metadata, printColorsCount: count },
        engineering: shouldAutoSuggest
          ? {
              ...config.engineering,
              printCoverage: suggested,
              panelPrintCoverage: [suggested, suggested, suggested, suggested],
              printPresetId: 'custom',
            }
          : config.engineering,
      });
      return;
    }
    onChange({ ...config, metadata: { ...config.metadata, [field]: value } });
  };

  const activeStyle = BOX_STYLES.find((s) => s.id === config.boxStyle) || BOX_STYLES[0];
  const activePerf = PERFORATION_OPTIONS.find((p) => p.id === config.perforation.type) || PERFORATION_OPTIONS[0];
  const barcodeCheck = validateITF14(config.barcode.value);
  const diag = paths.info.headspaceDiagnostic;

  const styleOptions = BOX_STYLES.map((s) => ({
    value: s.id,
    label: `${s.code} - ${s.name}`,
  }));

  const toleranceOptions = [
    { value: 'snug' as TolerancePreset, label: 'Snug / Zero-Headspace (+2/+2/+0.5 mm)' },
    { value: 'standard' as TolerancePreset, label: 'Standard E-Commerce (+4/+4/+2 mm)' },
    { value: 'protective' as TolerancePreset, label: 'Protective / Cushion (+12/+12/+10 mm)' },
    { value: 'custom' as TolerancePreset, label: 'Custom per-axis clearance' },
  ];

  const fluteOptions = FLUTE_TYPES[config.boardGrade].map((f) => ({
    value: f.thickness,
    label: f.name,
  }));

  const totalAlerts = analysis.criticalCount + analysis.warningCount;
  const alertDot =
    analysis.criticalCount > 0
      ? 'bg-[var(--red-9)]'
      : analysis.warningCount > 0
      ? 'bg-[var(--amber-9)]'
      : 'bg-[var(--green-9)]';

  return (
    <aside
      className={`surface-rail w-[min(356px,92vw)] lg:w-[332px] xl:w-[356px] h-full bg-[var(--ground)] border-r-[0.5px] border-[var(--line)] flex flex-col shrink-0 select-none ${className}`}
    >
      <div className="px-4 py-3 border-b-[0.5px] border-[var(--line)] flex items-center justify-between gap-2 shrink-0">
        <div className="min-w-0">
          <h1 className="font-brand text-[16px] leading-[20px] font-semibold text-[var(--ink-12)] truncate">
            DieCut.Room
          </h1>
          <p className="text-[12px] leading-[16px] text-[var(--ink-10)] truncate">
            FEFCO CAD &amp; fit simulator
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <TactileSegmented
            value={config.unit}
            onChange={(u) => handleChange('unit', u)}
            size="compact"
            ariaLabel="Display unit"
            options={[
              { value: 'mm' as DisplayUnit, label: 'mm' },
              { value: 'cm' as DisplayUnit, label: 'cm' },
              { value: 'in' as DisplayUnit, label: 'in' },
            ]}
          />
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Minimize panel spesifikasi"
              title="Minimize panel spesifikasi"
              className="size-[34px] md:size-[28px] rounded-[var(--radius-control)] flex items-center justify-center text-[var(--ink-10)] hover:text-[var(--ink-12)] hover:bg-[var(--ink-3)] active:scale-[0.95] transition-colors cursor-pointer shrink-0 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus-ring)]"
            >
              <PanelLeftClose size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Tactile 3-Tab Navigation */}
      <div className="px-4 py-2.5 border-b-[0.5px] border-[var(--line)]">
        <TactileSegmented
          value={activeTab}
          onChange={setActiveTab}
          fullWidth
          size="compact"
          shape="control"
          ariaLabel="Configuration section"
          options={[
            { value: 'structure', label: 'Structure' },
            { value: 'features', label: 'Pre-press' },
            { value: 'metadata', label: 'Title block' },
          ]}
        />
      </div>

      {/* Scrollable Tab Body */}
      <div className="flex-1 p-4 space-y-5 overflow-y-auto">
        {activeTab === 'structure' && (
          <>
            {/* Quick Clickable Engineering Card */}
            <button
              type="button"
              onClick={onOpenEngineering}
              className="surface-raised w-full text-left bg-[var(--surface-top)] rounded-[var(--radius-container)] shadow-[var(--shadow-card)] p-3.5 hover:bg-[var(--root-ink-1)] active:scale-[0.99] transition-[transform,scale,background-color] duration-[var(--dur-hover)] ease-[var(--ease-out)] cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={`size-[8px] rounded-full ${alertDot}`} />
                  <span className="text-[13px] leading-[20px] text-[var(--ink-12)]">
                    {totalAlerts === 0
                      ? 'Pre-flight nominal'
                      : `${totalAlerts} factory ${totalAlerts === 1 ? 'check' : 'checks'} flagged`}
                  </span>
                </div>
                <ArrowUpRight size={15} className="text-[var(--ink-10)] shrink-0" />
              </div>

              <div className="mt-2 pt-2 border-t-[0.5px] border-[var(--line)] flex items-baseline justify-between gap-3">
                <div>
                  <div className="text-[16px] leading-[22px] text-[var(--ink-12)] tabular-nums">
                    {analysis.safeLoadKgf.toFixed(1)} kgf
                  </div>
                  <div className="text-[12px] leading-[16px] text-[var(--ink-10)]">
                    Max stack ({analysis.ectKgfCm.toFixed(2)} kgf/cm)
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[13px] leading-[20px] text-[var(--ink-12)] tabular-nums capitalize">
                    {config.prepress.fluteDirection} flute
                  </div>
                  <div className="text-[12px] leading-[16px] text-[var(--ink-10)] tabular-nums">
                    {analysis.grossBlankAreaSqm.toFixed(3)} m² blank
                  </div>
                </div>
              </div>
            </button>

            {/* FEFCO Box Style */}
            <section className="space-y-2">
              <label className="block text-[13px] leading-[20px] text-[var(--ink-12)]">
                Box style (FEFCO)
              </label>
              <TactileSelect
                value={config.boxStyle}
                options={styleOptions}
                onChange={(val) => handleChange('boxStyle', val)}
                ariaLabel="FEFCO box style"
              />
              <p className="text-[12px] leading-[18px] text-[var(--ink-11)]">
                {activeStyle.description}
              </p>

              {config.boxStyle === '0202' && (
                <div className="pt-1">
                  <label className="block text-[12px] leading-[16px] text-[var(--ink-10)] mb-1">
                    Flap overlap allowance
                  </label>
                  <TactileInputWell
                    type="number"
                    mono
                    min={10}
                    max={Math.max(20, config.dimensions.width - 10)}
                    value={config.flapOverlapMm}
                    onChange={(e) =>
                      handleChange('flapOverlapMm', Math.max(5, Number(e.target.value)))
                    }
                    suffix="mm"
                  />
                </div>
              )}
            </section>

            <hr className="border-0 border-t-[0.5px] border-[var(--line)]" />

            {/* Dimensions & Anti-Headspace Fit */}
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-[13px] leading-[20px] text-[var(--ink-12)]">
                  Dimensions ({unit})
                </h2>
                <TactileSegmented
                  value={config.inputMode}
                  onChange={handleInputModeChange}
                  size="compact"
                  ariaLabel="Dimension input mode"
                  options={[
                    {
                      value: 'id',
                      label: 'Direct ID',
                      title: 'Isi langsung ukuran dalam kardus (Panjang x Lebar x Tinggi)',
                    },
                    {
                      value: 'product',
                      label: 'Product fit',
                      title: 'Hitung ukuran kardus otomatis dari ukuran fisik produk + kelonggaran',
                    },
                  ]}
                />
              </div>

              <p className="text-[11.5px] leading-[16px] text-[var(--ink-10)]">
                {config.inputMode === 'product'
                  ? 'Product fit: masukkan ukuran fisik produk + kelonggaran (ΔL/ΔW/ΔD) agar ukuran dalam kardus & sisa ruang atas (headspace) dihitung otomatis.'
                  : 'Direct ID: isi langsung ukuran bersih ruang dalam kardus (L × W × D) jika dimensi box sudah ditetapkan.'}
              </p>

              {config.inputMode === 'product' ? (
                <div className="surface-raised bg-[var(--surface-top)] rounded-[var(--radius-container)] shadow-[var(--shadow-card)] p-3.5 space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[12px] leading-[16px] text-[var(--ink-10)] mb-1">
                        Prod L
                      </label>
                      <TactileInputWell
                        type="number"
                        mono
                        step={unit === 'mm' ? '1' : '0.1'}
                        value={toDisplay(config.product.length)}
                        onChange={(e) => handleProductField('length', parseDisplay(e.target.value))}
                      />
                    </div>
                    <div>
                      <label className="block text-[12px] leading-[16px] text-[var(--ink-10)] mb-1">
                        Prod W
                      </label>
                      <TactileInputWell
                        type="number"
                        mono
                        step={unit === 'mm' ? '1' : '0.1'}
                        value={toDisplay(config.product.width)}
                        onChange={(e) => handleProductField('width', parseDisplay(e.target.value))}
                      />
                    </div>
                    <div>
                      <label className="block text-[12px] leading-[16px] text-[var(--ink-10)] mb-1">
                        Prod D
                      </label>
                      <TactileInputWell
                        type="number"
                        mono
                        step={unit === 'mm' ? '1' : '0.1'}
                        value={toDisplay(config.product.depth)}
                        onChange={(e) => handleProductField('depth', parseDisplay(e.target.value))}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[12px] leading-[16px] text-[var(--ink-10)] mb-1">
                      Headspace tolerance preset
                    </label>
                    <TactileSelect
                      value={config.product.tolerancePreset}
                      options={toleranceOptions}
                      onChange={handleTolerancePreset}
                      ariaLabel="Tolerance preset"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[12px] leading-[16px] text-[var(--ink-10)] mb-1">
                        ΔL ({unit})
                      </label>
                      <TactileInputWell
                        type="number"
                        mono
                        step={unit === 'mm' ? '0.5' : '0.05'}
                        value={toDisplay(config.product.clearanceL)}
                        onChange={(e) =>
                          handleProductField('clearanceL', parseDisplay(e.target.value))
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-[12px] leading-[16px] text-[var(--ink-10)] mb-1">
                        ΔW ({unit})
                      </label>
                      <TactileInputWell
                        type="number"
                        mono
                        step={unit === 'mm' ? '0.5' : '0.05'}
                        value={toDisplay(config.product.clearanceW)}
                        onChange={(e) =>
                          handleProductField('clearanceW', parseDisplay(e.target.value))
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-[12px] leading-[16px] text-[var(--ink-10)] mb-1">
                        ΔD ({unit})
                      </label>
                      <TactileInputWell
                        type="number"
                        mono
                        step={unit === 'mm' ? '0.5' : '0.05'}
                        value={toDisplay(config.product.clearanceD)}
                        onChange={(e) =>
                          handleProductField('clearanceD', parseDisplay(e.target.value))
                        }
                      />
                    </div>
                  </div>

                  {diag && (
                    <div className="pt-2.5 border-t-[0.5px] border-[var(--line)] space-y-1.5">
                      <div className="flex items-center justify-between text-[12px] leading-[16px]">
                        <span className="text-[var(--ink-10)]">Derived box ID</span>
                        <span className="font-mono tabular-nums text-[var(--ink-12)]">
                          {`${formatValue(config.dimensions.length, unit)} x ${formatValue(
                            config.dimensions.width,
                            unit
                          )} x ${formatValue(config.dimensions.depth, unit)} ${unit}`}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[12px] leading-[16px]">
                        <span className="text-[var(--ink-10)]">Headspace / fill</span>
                        <span
                          className={`font-mono tabular-nums ${
                            diag.status === 'optimal'
                              ? 'text-[var(--green-11)]'
                              : diag.status === 'excessive'
                              ? 'text-[var(--amber-11)]'
                              : 'text-[var(--red-11)]'
                          }`}
                        >
                          {`${formatValue(diag.headspaceMm, unit)} ${unit} · ${diag.volumeUtilizationPct}%`}
                        </span>
                      </div>
                      <p className="text-[12px] leading-[18px] text-[var(--ink-11)]">
                        {diag.message}
                      </p>
                      {diag.headspaceMm > 1 && (
                        <TactileButton
                          type="button"
                          variant="secondary"
                          size="compact"
                          onClick={handleSnapZeroHeadspace}
                          className="w-full mt-1"
                        >
                          <Sparkles size={14} className="text-[var(--ink-10)]" />
                          Snap depth to snug fit (+0.5 mm)
                        </TactileButton>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[12px] leading-[16px] text-[var(--ink-10)] mb-1">
                      ID Length (L)
                    </label>
                    <TactileInputWell
                      type="number"
                      mono
                      step={unit === 'mm' ? '1' : '0.1'}
                      value={toDisplay(config.dimensions.length)}
                      onChange={(e) =>
                        handleDimensionChange('length', parseDisplay(e.target.value))
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] leading-[16px] text-[var(--ink-10)] mb-1">
                      ID Width (W)
                    </label>
                    <TactileInputWell
                      type="number"
                      mono
                      step={unit === 'mm' ? '1' : '0.1'}
                      value={toDisplay(config.dimensions.width)}
                      onChange={(e) =>
                        handleDimensionChange('width', parseDisplay(e.target.value))
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] leading-[16px] text-[var(--ink-10)] mb-1">
                      ID Depth (D)
                    </label>
                    <TactileInputWell
                      type="number"
                      mono
                      step={unit === 'mm' ? '1' : '0.1'}
                      value={toDisplay(config.dimensions.depth)}
                      onChange={(e) =>
                        handleDimensionChange('depth', parseDisplay(e.target.value))
                      }
                    />
                  </div>
                </div>
              )}

              {/* Berat Nett Produk (Sinkron dengan BCT, Heat-Map & Rekomendasi Material) */}
              {(() => {
                const effectiveNetKg = getEffectiveProductNetWeightKg(config);
                const grossKg = computeCaseGrossWeightKg(
                  effectiveNetKg,
                  analysis.netBoxAreaSqm,
                  analysis.boardGsm
                );
                const tareKg = Math.max(0.05, grossKg - effectiveNetKg);
                return (
                  <div className="surface-raised bg-[var(--surface-top)] rounded-[var(--radius-container)] shadow-[var(--shadow-card)] p-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[12px] leading-[16px] font-medium text-[var(--ink-12)]">
                        Berat nett produk / dus
                      </label>
                      <span className="text-[11px] font-mono tabular-nums text-[var(--ink-10)]">
                        Kotor ~{grossKg.toFixed(2)} kg
                      </span>
                    </div>
                    <TactileInputWell
                      type="number"
                      mono
                      min={0.1}
                      max={200}
                      step="0.1"
                      placeholder="1.0"
                      value={config.product.netWeightKg ?? ''}
                      onChange={(e) => {
                        const raw = e.target.value.trim();
                        if (raw === '') {
                          onChange({
                            ...config,
                            product: { ...config.product, netWeightKg: undefined },
                          });
                          return;
                        }
                        const parsed = Number(raw);
                        if (Number.isFinite(parsed) && parsed >= 0) {
                          onChange({
                            ...config,
                            product: {
                              ...config.product,
                              netWeightKg: Math.min(200, Math.round(parsed * 100) / 100),
                            },
                          });
                        }
                      }}
                      suffix="kg"
                    />
                    <p className="text-[11px] leading-[15px] text-[var(--ink-10)]">
                      Default 1.0 kg jika kosong · Tare karton ~{tareKg.toFixed(2)} kg · Mempengaruhi heat-map &amp; saran material.
                    </p>
                  </div>
                );
              })()}
            </section>

            <hr className="border-0 border-t-[0.5px] border-[var(--line)]" />

            {/* Material & Construction */}
            <section className="space-y-3">
              <h2 className="text-[13px] leading-[20px] text-[var(--ink-12)]">
                Material and construction
              </h2>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[12px] leading-[16px] text-[var(--ink-10)] mb-1">
                    Board color
                  </label>
                  <TactileSelect
                    value={config.materialColor}
                    onChange={(val) => handleChange('materialColor', val)}
                    ariaLabel="Board color"
                    options={[
                      { value: 'kraft', label: 'Kraft (Brown)' },
                      { value: 'white', label: 'Bleached white' },
                    ]}
                  />
                </div>
                <div>
                  <label className="block text-[12px] leading-[16px] text-[var(--ink-10)] mb-1">
                    Board grade
                  </label>
                  <TactileSelect
                    value={config.boardGrade}
                    onChange={(grade) => {
                      const defaultFlute =
                        FLUTE_TYPES[grade].find((f) => f.id === 'B' || f.id === 'BC') ||
                        FLUTE_TYPES[grade][0];
                      onChange({
                        ...config,
                        boardGrade: grade,
                        fluteThickness: defaultFlute.thickness,
                        engineering: {
                          ...config.engineering,
                          fluteId: defaultFlute.id,
                          ectValue: defaultFlute.defaultEct,
                        },
                        metadata: {
                          ...config.metadata,
                          materialSubstance: formatSubstanceString(config.engineering, grade),
                        },
                      });
                    }}
                    ariaLabel="Board grade"
                    options={[
                      { value: 'single-wall', label: 'Single wall' },
                      { value: 'double-wall', label: 'Double wall' },
                    ]}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[12px] leading-[16px] text-[var(--ink-10)] mb-1">
                    Flute caliper
                  </label>
                  <TactileSelect
                    value={config.fluteThickness}
                    options={fluteOptions}
                    onChange={(thickness) => {
                      const matched = FLUTE_TYPES[config.boardGrade].find(
                        (f) => f.thickness === thickness
                      );
                      onChange({
                        ...config,
                        fluteThickness: Number(thickness),
                        engineering: matched
                          ? {
                              ...config.engineering,
                              fluteId: matched.id,
                              ectValue: matched.defaultEct,
                            }
                          : config.engineering,
                      });
                    }}
                    ariaLabel="Flute caliper"
                  />
                </div>
                <div>
                  <label className="block text-[12px] leading-[16px] text-[var(--ink-10)] mb-1">
                    Glue flap side
                  </label>
                  <TactileSelect
                    value={config.glueFlapPosition}
                    onChange={(val) => handleChange('glueFlapPosition', val)}
                    ariaLabel="Glue flap side"
                    options={[
                      { value: 'left', label: 'Left (before L1)' },
                      { value: 'right', label: 'Right (after W2)' },
                    ]}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[12px] leading-[16px] text-[var(--ink-10)] mb-1">
                    Glue flap width
                  </label>
                  <TactileInputWell
                    type="number"
                    mono
                    min={10}
                    max={100}
                    value={config.glueFlapWidth}
                    onChange={(e) =>
                      handleChange('glueFlapWidth', Math.max(10, Number(e.target.value)))
                    }
                    suffix="mm"
                  />
                </div>
                <div>
                  <label className="block text-[12px] leading-[16px] text-[var(--ink-10)] mb-1">
                    Board thickness (T)
                  </label>
                  <div className="h-[32px] rounded-[var(--radius-control)] bg-[var(--ink-2)] px-2.5 flex items-center text-[13px] font-mono tabular-nums text-[var(--ink-11)]">
                    {config.fluteThickness.toFixed(1)} mm
                  </div>
                </div>
              </div>
            </section>

            <hr className="border-0 border-t-[0.5px] border-[var(--line)]" />

            {/* Structural Allowances */}
            <section className="space-y-3">
              <h2 className="text-[13px] leading-[20px] text-[var(--ink-12)]">
                Structural allowances
              </h2>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[12px] leading-[16px] text-[var(--ink-10)] mb-1">
                    Flap gap
                  </label>
                  <TactileInputWell
                    type="number"
                    mono
                    min={0}
                    step="0.5"
                    value={config.advanced.flapGap}
                    onChange={(e) =>
                      handleAdvancedChange('flapGap', Math.max(0, Number(e.target.value)))
                    }
                    suffix="mm"
                  />
                </div>
                <div>
                  <label className="block text-[12px] leading-[16px] text-[var(--ink-10)] mb-1">
                    Slot width
                  </label>
                  <TactileInputWell
                    type="number"
                    mono
                    min={2}
                    step="0.5"
                    value={config.advanced.slotGap}
                    onChange={(e) =>
                      handleAdvancedChange('slotGap', Math.max(2, Number(e.target.value)))
                    }
                    suffix="mm"
                  />
                </div>
              </div>

              <div className="space-y-2.5 pt-0.5">
                <TactileCheckbox
                  checked={config.advanced.fishtailCompensation}
                  onChange={(v) => handleAdvancedChange('fishtailCompensation', v)}
                  label="Anti-fishtail / stretch offset"
                />

                <TactileCheckbox
                  checked={config.advanced.compensateInnerFlapDepth}
                  onChange={(v) => handleAdvancedChange('compensateInnerFlapDepth', v)}
                  label={`Inner-flap depth allowance (+${paths.info.depthAllowanceMm.toFixed(1)} mm)`}
                />
              </div>
            </section>
          </>
        )}

        {activeTab === 'features' && (
          <>
            {/* Pre-Press Production Zones */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-[13px] leading-[20px] text-[var(--ink-12)]">
                  Pre-press print boundaries
                </h2>
              </div>

              <div className="surface-raised bg-[var(--surface-top)] rounded-[var(--radius-container)] shadow-[var(--shadow-card)] p-3.5 space-y-3">
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[12px] leading-[16px] text-[var(--ink-10)] mb-1">
                      Print bleed
                    </label>
                    <TactileInputWell
                      type="number"
                      mono
                      min={0}
                      max={15}
                      step="0.5"
                      value={config.prepress.bleedMm}
                      onChange={(e) =>
                        handlePrePressChange('bleedMm', Math.max(0, Math.min(15, Number(e.target.value))))
                      }
                      suffix="mm"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] leading-[16px] text-[var(--ink-10)] mb-1">
                      Score safe zone
                    </label>
                    <TactileInputWell
                      type="number"
                      mono
                      min={2}
                      max={25}
                      step="0.5"
                      value={config.prepress.scoreSafeMarginMm}
                      onChange={(e) =>
                        handlePrePressChange(
                          'scoreSafeMarginMm',
                          Math.max(2, Math.min(25, Number(e.target.value)))
                        )
                      }
                      suffix="mm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[12px] leading-[16px] text-[var(--ink-10)] mb-1.5">
                    Flute grain direction
                  </label>
                  <TactileSegmented
                    value={config.prepress.fluteDirection}
                    onChange={(dir: FluteDirection) => handlePrePressChange('fluteDirection', dir)}
                    fullWidth
                    size="compact"
                    ariaLabel="Flute grain direction"
                    options={[
                      { value: 'vertical', label: 'Vertical (Load)' },
                      { value: 'horizontal', label: 'Horizontal' },
                    ]}
                  />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[13px] leading-[20px] text-[var(--ink-11)]">
                    Glue flap no-ink zone
                  </span>
                  <TactileSwitch
                    checked={config.prepress.showGlueKnockout}
                    onChange={(v) => handlePrePressChange('showGlueKnockout', v)}
                    ariaLabel="Toggle glue flap no-ink knockout zone"
                  />
                </div>
              </div>
            </section>

            <hr className="border-0 border-t-[0.5px] border-[var(--line)]" />

            {/* Shelf-Ready & Logistics Perforation */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-[13px] leading-[20px] text-[var(--ink-12)]">
                  Perforation and cutouts
                </h2>
                <TactileSwitch
                  checked={config.perforation.enabled}
                  onChange={(v) => handlePerforationChange('enabled', v)}
                  ariaLabel="Enable perforation"
                />
              </div>

              {config.perforation.enabled && (
                <div className="surface-raised bg-[var(--surface-top)] rounded-[var(--radius-container)] shadow-[var(--shadow-card)] p-3.5 space-y-3">
                  <div>
                    <label className="block text-[12px] leading-[16px] text-[var(--ink-10)] mb-1">
                      Pattern template
                    </label>
                    <TactileSelect
                      value={config.perforation.type}
                      onChange={(val) => handlePerforationTypeChange(val)}
                      ariaLabel="Perforation template"
                      options={PERFORATION_OPTIONS.map((opt) => ({
                        value: opt.id,
                        label: opt.label,
                        hint: `${opt.categoryLabel} · ${opt.defaultRuleMode === 'solid' ? 'Solid Cut' : 'Perf Rule'}`,
                      }))}
                    />
                  </div>

                  <p className="text-[12px] leading-[18px] text-[var(--ink-11)]">
                    {activePerf.usage}
                  </p>

                  <div>
                    <label className="block text-[12px] leading-[16px] text-[var(--ink-10)] mb-1">
                      Rule style (Dash / Non-Dash)
                    </label>
                    <TactileSelect
                      value={config.perforation.ruleMode}
                      onChange={(val) => handlePerforationRuleModeChange(val)}
                      ariaLabel="Perforation rule style"
                      options={PERFORATION_RULE_PRESETS.map((preset) => ({
                        value: preset.id,
                        label: preset.label,
                        hint: preset.hint,
                      }))}
                    />
                  </div>

                  {config.perforation.ruleMode === 'custom' ? (
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[12px] leading-[16px] text-[var(--ink-10)] mb-1">
                          Cut dash
                        </label>
                        <TactileInputWell
                          type="number"
                          mono
                          min={1}
                          max={20}
                          value={config.perforation.cut}
                          onChange={(e) =>
                            handlePerforationChange('cut', Math.max(1, Number(e.target.value)))
                          }
                          suffix="mm"
                        />
                      </div>
                      <div>
                        <label className="block text-[12px] leading-[16px] text-[var(--ink-10)] mb-1">
                          Tie nick
                        </label>
                        <TactileInputWell
                          type="number"
                          mono
                          min={1}
                          max={12}
                          value={config.perforation.tie}
                          onChange={(e) =>
                            handlePerforationChange('tie', Math.max(1, Number(e.target.value)))
                          }
                          suffix="mm"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between text-[12px] leading-[16px] pt-1 border-t-[0.5px] border-[var(--line)]">
                      <span className="text-[var(--ink-10)]">Active blade spec</span>
                      <span className="font-mono tabular-nums text-[var(--ink-12)]">
                        {config.perforation.ruleMode === 'solid' || config.perforation.tie <= 0
                          ? 'Solid Non-Dash (0mm tie)'
                          : `${config.perforation.cut}mm cut / ${config.perforation.tie}mm tie`}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </section>

            <hr className="border-0 border-t-[0.5px] border-[var(--line)]" />

            {/* GS1 ITF-14 Barcode */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-[13px] leading-[20px] text-[var(--ink-12)]">
                  GS1 ITF-14 barcode
                </h2>
                <TactileSwitch
                  checked={config.barcode.enabled}
                  onChange={(v) => handleBarcodeChange('enabled', v)}
                  ariaLabel="Enable ITF-14 barcode"
                />
              </div>

              {config.barcode.enabled && (
                <div className="surface-raised bg-[var(--surface-top)] rounded-[var(--radius-container)] shadow-[var(--shadow-card)] p-3.5 space-y-3">
                  <div>
                    <label className="block text-[12px] leading-[16px] text-[var(--ink-10)] mb-1">
                      GTIN-14 code (14 digits)
                    </label>
                    <TactileInputWell
                      type="text"
                      mono
                      maxLength={14}
                      value={config.barcode.value}
                      error={!barcodeCheck.isValidITF14}
                      onChange={(e) => handleBarcodeChange('value', e.target.value)}
                      placeholder="18886015206106"
                    />
                    <div className="mt-2 flex items-center gap-2 text-[12px] leading-[16px]">
                      <span
                        className={`size-[7px] rounded-full shrink-0 ${
                          barcodeCheck.isValidITF14 ? 'bg-[var(--green-9)]' : 'bg-[var(--amber-9)]'
                        }`}
                      />
                      <span
                        className={
                          barcodeCheck.isValidITF14
                            ? 'text-[var(--green-11)]'
                            : 'text-[var(--amber-11)]'
                        }
                      >
                        {barcodeCheck.isValidITF14
                          ? 'Valid GS1 ITF-14 Mod-10 check digit'
                          : barcodeCheck.reason}
                      </span>
                    </div>

                    {!barcodeCheck.isValidITF14 && (
                      <TactileButton
                        type="button"
                        variant="secondary"
                        size="compact"
                        className="w-full mt-2"
                        onClick={() =>
                          handleBarcodeChange('value', fixITF14CheckDigit(config.barcode.value))
                        }
                      >
                        Auto-fix GS1 check digit
                      </TactileButton>
                    )}
                  </div>

                  <div>
                    <label className="block text-[12px] leading-[16px] text-[var(--ink-10)] mb-1">
                      Panel placement
                    </label>
                    <TactileSelect
                      value={config.barcode.panel}
                      onChange={(val) => handleBarcodeChange('panel', Number(val))}
                      ariaLabel="Barcode panel"
                      options={[
                        { value: 1, label: 'Panel 1 (Front / Length)' },
                        { value: 2, label: 'Panel 2 (Side / Width)' },
                        { value: 3, label: 'Panel 3 (Back / Length)' },
                        { value: 4, label: 'Panel 4 (Side / Width)' },
                      ]}
                    />
                  </div>

                  {paths.barcodeBox && (
                    <div className="pt-2 border-t-[0.5px] border-[var(--line)] space-y-1">
                      <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-[var(--ink-11)]">
                        <span>{`GS1 ${paths.barcodeBox.magnificationPct.toFixed(0)}%`}</span>
                        <span aria-hidden="true">·</span>
                        <span>{`X ${paths.barcodeBox.xDimensionMm.toFixed(2)} mm`}</span>
                        <span aria-hidden="true">·</span>
                        <span>{`Bearer ${paths.barcodeBox.bearerThicknessMm.toFixed(1)} mm`}</span>
                      </div>
                      {!paths.barcodeBox.gs1Compliant && (
                        <p className="text-[11px] leading-[15px] text-[var(--amber-11)]">
                          Panel lebih kecil dari minimum standar GS1 50% (X &lt; 0.51 mm).
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </section>

            <hr className="border-0 border-t-[0.5px] border-[var(--line)]" />

            {/* Dimension Appearance */}
            <section className="space-y-2.5">
              <div className="flex justify-between items-center">
                <h2 className="text-[13px] leading-[20px] text-[var(--ink-12)]">
                  Dimension label size
                </h2>
                <span className="text-[12px] font-mono tabular-nums text-[var(--ink-10)]">
                  {config.appearance.dimFontSize} pt
                </span>
              </div>
              <input
                type="range"
                min="4"
                max="20"
                value={config.appearance.dimFontSize}
                onChange={(e) => handleAppearanceChange('dimFontSize', Number(e.target.value))}
                className="tactile-range"
                aria-label="Dimension font size"
              />
            </section>
          </>
        )}

        {activeTab === 'metadata' && (
          <>
            <section className="space-y-3">
              <h2 className="text-[13px] leading-[20px] text-[var(--ink-12)]">
                Title block and print specs
              </h2>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[12px] leading-[16px] text-[var(--ink-10)] mb-1">
                    Drafter name
                  </label>
                  <TactileInputWell
                    type="text"
                    value={config.metadata.userName}
                    onChange={(e) => handleMetadataChange('userName', e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-[12px] leading-[16px] text-[var(--ink-10)] mb-1">
                    Date
                  </label>
                  <TactileInputWell
                    type="date"
                    mono
                    value={config.metadata.date}
                    onChange={(e) => handleMetadataChange('date', e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[12px] leading-[16px] text-[var(--ink-10)] mb-1">
                  Product / SKU name
                </label>
                <TactileInputWell
                  type="text"
                  value={config.metadata.productName}
                  onChange={(e) => handleMetadataChange('productName', e.target.value)}
                />
              </div>

              <div>
                <label className="block text-[12px] leading-[16px] text-[var(--ink-10)] mb-1">
                  Material substance
                </label>
                <TactileInputWell
                  type="text"
                  mono
                  placeholder="K200/M150/K200"
                  value={config.metadata.materialSubstance}
                  onChange={(e) => handleMetadataChange('materialSubstance', e.target.value)}
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-1">
                  <label className="block text-[12px] leading-[16px] text-[var(--ink-10)] mb-1">
                    Colors
                  </label>
                  <TactileInputWell
                    type="number"
                    mono
                    min={0}
                    max={10}
                    value={config.metadata.printColorsCount}
                    onChange={(e) =>
                      handleMetadataChange('printColorsCount', Number(e.target.value))
                    }
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-[12px] leading-[16px] text-[var(--ink-10)] mb-1">
                    Ink / Pantone codes
                  </label>
                  <TactileInputWell
                    type="text"
                    placeholder="Pantone Black C"
                    value={config.metadata.printColorCodes}
                    onChange={(e) => handleMetadataChange('printColorCodes', e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[12px] leading-[16px] text-[var(--ink-10)] mb-1">
                  Approval signee
                </label>
                <TactileInputWell
                  type="text"
                  value={config.metadata.approvalSignee}
                  onChange={(e) => handleMetadataChange('approvalSignee', e.target.value)}
                />
              </div>

              <div>
                <label className="block text-[12px] leading-[16px] text-[var(--ink-10)] mb-1">
                  Production notes
                </label>
                <TactileTextareaWell
                  rows={3}
                  value={config.metadata.notes}
                  onChange={(e) => handleMetadataChange('notes', e.target.value)}
                />
              </div>
            </section>

            <hr className="border-0 border-t-[0.5px] border-[var(--line)]" />

            {/* Packaging Engineering Reference */}
            <section className="surface-raised bg-[var(--surface-top)] rounded-[var(--radius-container)] shadow-[var(--shadow-card)] p-3.5 space-y-3 text-[12px] leading-[18px] text-[var(--ink-11)]">
              <div className="flex items-start gap-2">
                <Info size={15} className="mt-0.5 shrink-0 text-[var(--ink-10)]" />
                <div>
                  <div className="text-[var(--ink-12)]">FEFCO scoring and OD formula</div>
                  <p className="mt-0.5">
                    Score panels use centerline allowance (<code className="font-mono">L+T, W+T</code>).
                    Inner-flap depth compensation adds <code className="font-mono">+2T</code> (or{' '}
                    <code className="font-mono">+T</code> for HSC) so closed inner flaps never compress
                    product headspace.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Info size={15} className="mt-0.5 shrink-0 text-[var(--ink-10)]" />
                <div>
                  <div className="text-[var(--ink-12)]">1:1 vector export</div>
                  <p className="mt-0.5">
                    SVG and PDF exports preserve exact millimeter geometry (1 SVG unit = 1 mm).
                    Clean CAD strips all bleed, safe-zone, and annotation layers for cutting dies.
                  </p>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </aside>
  );
}
