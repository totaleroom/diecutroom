import React, { useState } from 'react';
import {
  ALL_PAPER_GRADES,
  BoxConfig,
  DielinePaths,
  EngineeringAnalysis,
  FluteDirection,
  MEDIUM_GRADES,
  MediumGradeId,
  PaperGradeId,
  SAFETY_FACTOR_PRESETS,
} from '../types';
import { formatSubstanceString } from '../utils/engineering';
import {
  TactileButton,
  TactileSegmented,
  TactileSelect,
  TactileSheet,
} from './tactile/TactileUI';

interface EngineeringSheetProps {
  open: boolean;
  onClose: () => void;
  config: BoxConfig;
  paths: DielinePaths;
  analysis: EngineeringAnalysis;
  onChange: (config: BoxConfig) => void;
}

export default function EngineeringSheet({
  open,
  onClose,
  config,
  paths,
  analysis,
  onChange,
}: EngineeringSheetProps) {
  const [hoveredBar, setHoveredBar] = useState<string | null>(null);

  const updateEngineering = <K extends keyof BoxConfig['engineering']>(
    field: K,
    value: BoxConfig['engineering'][K]
  ) => {
    onChange({
      ...config,
      engineering: { ...config.engineering, [field]: value },
    });
  };

  const handleLayerChange = (
    layer: 'topLayer' | 'mediumLayer' | 'centerLayer' | 'mediumLayer2' | 'bottomLayer',
    value: PaperGradeId
  ) => {
    const nextEng = { ...config.engineering, [layer]: value };
    onChange({
      ...config,
      engineering: nextEng,
      metadata: {
        ...config.metadata,
        materialSubstance: formatSubstanceString(nextEng, config.boardGrade),
      },
    });
  };

  const handleFluteDirChange = (dir: FluteDirection) => {
    onChange({
      ...config,
      prepress: { ...config.prepress, fluteDirection: dir },
    });
  };

  const bctBars = [
    {
      id: 'theoretical',
      label: `Raw McKee BCT (${analysis.ectKgfCm.toFixed(2)} kgf/cm)`,
      kgf: analysis.bctEstimateKgf,
      lbf: analysis.bctEstimateLbf,
      color: 'var(--ink-7)',
    },
    {
      id: 'effective',
      label: `Corrected BCT (${(analysis.factors.combined * 100).toFixed(0)}% combined factor)`,
      kgf: analysis.correctedBctKgf,
      lbf: analysis.correctedBctLbf,
      color:
        config.prepress.fluteDirection === 'vertical'
          ? 'var(--blue-9)'
          : 'var(--amber-9)',
    },
    {
      id: 'safe',
      label: `Max Stacking Load (${config.engineering.safetyFactor}:1 SF)`,
      kgf: analysis.maxStackingLoadKgf,
      lbf: analysis.maxStackingLoadLbf,
      color: 'var(--green-9)',
    },
  ];
  const maxKgf = Math.max(1, analysis.bctEstimateKgf);

  const linerOptions = Object.values(ALL_PAPER_GRADES).map((g) => ({
    value: g.id as PaperGradeId,
    label: `${g.id} · ${g.name}`,
    hint: `RCT ${g.rct.toFixed(2)} · ${g.gsm} gsm`,
  }));

  const mediumOptions = Object.values(MEDIUM_GRADES).map((g) => ({
    value: g.id as MediumGradeId,
    label: `${g.id} · ${g.name}`,
    hint: `RCT ${g.rct.toFixed(2)} · ${g.gsm} gsm`,
  }));

  const sfOptions = SAFETY_FACTOR_PRESETS.map((p) => ({
    value: p.value,
    label: p.label,
    hint: p.environment,
  }));

  const issueDotColor = {
    critical: 'bg-[var(--red-9)]',
    warning: 'bg-[var(--amber-9)]',
    pass: 'bg-[var(--green-9)]',
  };

  return (
    <TactileSheet
      open={open}
      onClose={onClose}
      title="Corrugated engineering and pre-flight"
      description="TAPPI/ISO McKee compression modeling and automated shop-floor defect checks."
    >
      {/* Section 1: McKee BCT Compression & Safe Stacking Load */}
      <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-[16px] leading-[24px] text-[var(--ink-12)]">
                  Box compression strength (McKee · TAPPI / ISO)
                </h3>
                <p className="text-[13px] leading-[20px] text-[var(--ink-11)]">
                  Synced with {config.metadata.materialSubstance} · {config.engineering.fluteId}-flute ({config.fluteThickness} mm) · Blank {Math.ceil(paths.width)} × {Math.ceil(paths.height)} mm ({analysis.grossBlankAreaSqm.toFixed(3)} m²).
                </p>
              </div>
            </div>

        <div className="surface-raised bg-[var(--raised)] rounded-[var(--radius-container)] shadow-[var(--shadow-card)] p-5 space-y-5">
          {/* Paper Layers (3-ply SW / 5-ply DW) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[12px] leading-[16px] text-[var(--ink-10)] mb-1.5">
                Outer liner (L1)
              </label>
              <TactileSelect
                value={config.engineering.topLayer}
                options={linerOptions}
                onChange={(val) => handleLayerChange('topLayer', val)}
                ariaLabel="Top liner"
              />
            </div>

            <div>
              <label className="block text-[12px] leading-[16px] text-[var(--ink-10)] mb-1.5">
                Medium (M1)
              </label>
              <TactileSelect
                value={config.engineering.mediumLayer}
                options={mediumOptions}
                onChange={(val) => handleLayerChange('mediumLayer', val)}
                ariaLabel="Fluting medium"
              />
            </div>

            {config.boardGrade === 'double-wall' && (
              <>
                <div>
                  <label className="block text-[12px] leading-[16px] text-[var(--ink-10)] mb-1.5">
                    Center liner (L2)
                  </label>
                  <TactileSelect
                    value={config.engineering.centerLayer}
                    options={linerOptions}
                    onChange={(val) => handleLayerChange('centerLayer', val)}
                    ariaLabel="Center liner"
                  />
                </div>

                <div>
                  <label className="block text-[12px] leading-[16px] text-[var(--ink-10)] mb-1.5">
                    Medium (M2)
                  </label>
                  <TactileSelect
                    value={config.engineering.mediumLayer2}
                    options={mediumOptions}
                    onChange={(val) => handleLayerChange('mediumLayer2', val)}
                    ariaLabel="Second medium"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-[12px] leading-[16px] text-[var(--ink-10)] mb-1.5">
                Inner liner ({config.boardGrade === 'double-wall' ? 'L3' : 'L2'})
              </label>
              <TactileSelect
                value={config.engineering.bottomLayer}
                options={linerOptions}
                onChange={(val) => handleLayerChange('bottomLayer', val)}
                ariaLabel="Bottom liner"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] leading-[16px] text-[var(--ink-10)] mb-1.5">
                Safety factor
              </label>
              <TactileSelect
                value={config.engineering.safetyFactor}
                options={sfOptions}
                onChange={(val) => updateEngineering('safetyFactor', Number(val))}
                ariaLabel="Warehouse safety factor"
              />
            </div>

            <div>
              <label className="block text-[12px] leading-[16px] text-[var(--ink-10)] mb-1.5">
                Flute grain
              </label>
              <TactileSegmented
                value={config.prepress.fluteDirection}
                onChange={handleFluteDirChange}
                fullWidth
                size="compact"
                ariaLabel="Flute direction"
                options={[
                  { value: 'vertical', label: 'Vertical' },
                  { value: 'horizontal', label: 'Horizontal' },
                ]}
              />
            </div>
          </div>

          {/* Primary Figures (24/32 number over 13/20 label) */}
          <div className="flex flex-wrap items-baseline gap-8 pt-1">
            <div>
              <div className="text-[24px] leading-[32px] text-[var(--ink-12)] tabular-nums">
                {analysis.maxStackingLoadKgf.toFixed(1)} kgf
              </div>
              <div className="text-[13px] leading-[20px] text-[var(--ink-11)]">
                Max stack load ({Math.round(analysis.maxStackingLoadLbf)} lbf)
              </div>
            </div>

            <div>
              <div className="text-[24px] leading-[32px] text-[var(--ink-12)] tabular-nums">
                {analysis.correctedBctKgf.toFixed(1)} kgf
              </div>
              <div className="text-[13px] leading-[20px] text-[var(--ink-11)]">
                Corrected BCT ({(analysis.factors.combined * 100).toFixed(0)}% combined)
              </div>
            </div>

            <div>
              <div className="text-[24px] leading-[32px] text-[var(--ink-12)] tabular-nums">
                {analysis.ectKgfCm.toFixed(2)} kgf/cm
              </div>
              <div className="text-[13px] leading-[20px] text-[var(--ink-11)]">
                {analysis.ectSource.replace('_', ' ')} ({analysis.boardGsm} gsm)
              </div>
            </div>
          </div>

          {/* Interactive Comparison Bar Chart */}
          <div className="space-y-3 pt-1">
            {bctBars.map((bar) => {
              const pct = Math.max(4, Math.min(100, (bar.kgf / maxKgf) * 100));
              const dimmed = hoveredBar !== null && hoveredBar !== bar.id;
              return (
                <div
                  key={bar.id}
                  onMouseEnter={() => setHoveredBar(bar.id)}
                  onMouseLeave={() => setHoveredBar(null)}
                  className="space-y-1.5 transition-opacity duration-[var(--dur-hover)] ease-[var(--ease-out)] cursor-default"
                  style={{ opacity: dimmed ? 0.35 : 1 }}
                >
                  <div className="flex items-center justify-between text-[13px] leading-[20px]">
                    <span className="text-[var(--ink-11)]">{bar.label}</span>
                    <span className="text-[var(--ink-12)] tabular-nums">
                      {bar.kgf.toFixed(1)} kgf ({Math.round(bar.lbf)} lbf)
                    </span>
                  </div>
                  <div className="h-[10px] w-full rounded-full bg-[var(--ink-3)] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-[width] duration-200 ease-[var(--ease-out)]"
                      style={{ width: `${pct}%`, backgroundColor: bar.color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Section 2: Field-Defect Pre-Flight Predictor */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-[16px] leading-[24px] text-[var(--ink-12)]">
              Shop-floor defect predictor
            </h3>
            <p className="text-[13px] leading-[20px] text-[var(--ink-11)]">
              Checks die-rule clearances, glue adhesion, score proximity, and flute load paths before tooling.
            </p>
          </div>
          <div className="text-[12px] leading-[16px] text-[var(--ink-11)] tabular-nums shrink-0">
            {analysis.criticalCount} critical · {analysis.warningCount} warning · {analysis.passCount} passed
          </div>
        </div>

        <div className="surface-raised bg-[var(--raised)] rounded-[var(--radius-container)] border-[0.5px] border-[var(--line)] shadow-[var(--shadow-table)] divide-y-[0.5px] divide-[var(--line)] overflow-hidden">
          {analysis.fieldIssues.map((issue) => (
            <div
              key={issue.id}
              className="px-4 py-3 flex items-start justify-between gap-3 hover:bg-[var(--root-ink-2)] transition-colors duration-[var(--dur-hover)]"
            >
              <div className="flex items-start gap-2.5 min-w-0">
                <span
                  className={`mt-[6px] size-[8px] rounded-full shrink-0 ${issueDotColor[issue.severity]}`}
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <div className="text-[13px] leading-[20px] text-[var(--ink-12)]">
                    {issue.title}
                  </div>
                  <p className="text-[12px] leading-[18px] text-[var(--ink-11)] mt-0.5">
                    {issue.detail}
                  </p>
                </div>
              </div>

              {issue.applyFix && issue.fixLabel && (
                <TactileButton
                  type="button"
                  variant="pill"
                  className="shrink-0"
                  onClick={() => onChange(issue.applyFix!(config))}
                >
                  {issue.fixLabel}
                </TactileButton>
              )}
            </div>
          ))}
        </div>
      </section>
    </TactileSheet>
  );
}
