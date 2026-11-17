import {
  ALL_PAPER_GRADES,
  AuditFindingNote,
  BatchCostTier,
  BCT_PRO_STANDARD_ECT_TABLE,
  BctCorrectionFactors,
  BctFluteId,
  BctHistoryEntry,
  BctMethodResult,
  BoxConfig,
  CURRENCY_META,
  CurrencyCode,
  CustomRctOverrides,
  DielinePaths,
  EctConfidence,
  EctSource,
  EngineeringAnalysis,
  EngineeringConfig,
  EXTENDED_STANDARD_ECT_TABLE,
  FieldDefectIssue,
  FLUTE_SPECS,
  MEDIUM_GRADES,
  MediumGradeId,
  PaperGradeId,
  PRINT_COVERAGE_PRESETS,
  PrintPresetId,
} from '../types';
import { validateITF14 } from './units';

// Conversion & McKee constants
export const MM_TO_IN = 0.0393701;
export const KGF_CM_TO_LBF_IN = 5.59974;
export const LBF_TO_KGF = 0.453592;
export const MCKEE_K = 5.87;

const BCT_HISTORY_STORAGE_KEY = 'diecut_bct_history_v1';

export function formatMoney(amount: number, currency: CurrencyCode): string {
  const meta = CURRENCY_META[currency];
  if (currency === 'IDR') {
    const rounded = Math.round(amount);
    return `${meta.symbol} ${new Intl.NumberFormat('id-ID').format(rounded)}`;
  }
  const isWhole = Math.abs(amount - Math.round(amount)) < 0.005;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function getEffectiveRct(gradeId: PaperGradeId, override?: number): number {
  if (typeof override === 'number' && Number.isFinite(override) && override > 0) {
    return override;
  }
  return ALL_PAPER_GRADES[gradeId]?.rct ?? 1.5;
}

export function formatSubstanceString(
  layers: Pick<
    EngineeringConfig,
    'topLayer' | 'mediumLayer' | 'centerLayer' | 'mediumLayer2' | 'bottomLayer'
  >,
  boardGrade: 'single-wall' | 'double-wall'
): string {
  if (boardGrade === 'double-wall') {
    return `${layers.topLayer}/${layers.mediumLayer}/${layers.centerLayer}/${layers.mediumLayer2}/${layers.bottomLayer}`;
  }
  return `${layers.topLayer}/${layers.mediumLayer}/${layers.bottomLayer}`;
}

export function formatMaterialsSummary(
  materials: BctHistoryEntry['materials'],
  boardGrade: 'single-wall' | 'double-wall'
): string {
  if (boardGrade === 'double-wall' && materials.center && materials.medium2) {
    return `${materials.top}/${materials.medium}/${materials.center}/${materials.medium2}/${materials.bottom}`;
  }
  return `${materials.top}/${materials.medium}/${materials.bottom}`;
}

export function parseSubstanceString(raw: string): {
  top: PaperGradeId;
  medium: MediumGradeId;
  center?: PaperGradeId;
  medium2?: MediumGradeId;
  bottom: PaperGradeId;
  isDoubleWall: boolean;
} | null {
  const parts = raw
    .trim()
    .toUpperCase()
    .split(/[/\-+\s]+/)
    .filter(Boolean);

  if (parts.length === 3) {
    const [t, m, b] = parts;
    if (t in ALL_PAPER_GRADES && m in MEDIUM_GRADES && b in ALL_PAPER_GRADES) {
      return {
        top: t as PaperGradeId,
        medium: m as MediumGradeId,
        bottom: b as PaperGradeId,
        isDoubleWall: false,
      };
    }
    return null;
  }

  if (parts.length === 5) {
    const [t, m1, c, m2, b] = parts;
    if (
      t in ALL_PAPER_GRADES &&
      m1 in MEDIUM_GRADES &&
      c in ALL_PAPER_GRADES &&
      m2 in MEDIUM_GRADES &&
      b in ALL_PAPER_GRADES
    ) {
      return {
        top: t as PaperGradeId,
        medium: m1 as MediumGradeId,
        center: c as PaperGradeId,
        medium2: m2 as MediumGradeId,
        bottom: b as PaperGradeId,
        isDoubleWall: true,
      };
    }
  }

  return null;
}

export function inferFluteIdFromThickness(
  thickness: number,
  boardGrade: 'single-wall' | 'double-wall'
): BctFluteId {
  const candidates = Object.values(FLUTE_SPECS).filter((f) => f.wall === boardGrade);
  let best = candidates[0] || FLUTE_SPECS.B;
  let bestDiff = Math.abs(best.thickness - thickness);
  for (const c of candidates) {
    const diff = Math.abs(c.thickness - thickness);
    if (diff < bestDiff) {
      best = c;
      bestDiff = diff;
    }
  }
  return best.id;
}

export function computeWeightedPrintCoverage(
  panels: [number, number, number, number],
  lengthMm: number,
  widthMm: number
): number {
  const L = Math.max(1, lengthMm);
  const W = Math.max(1, widthMm);
  const denom = 2 * (L + W);
  const weighted =
    (panels[0] * L + panels[1] * W + panels[2] * L + panels[3] * W) / denom;
  return Math.max(0, Math.min(100, Math.round(weighted)));
}

export function detectPrintPresetId(panels: [number, number, number, number]): PrintPresetId {
  for (const preset of PRINT_COVERAGE_PRESETS) {
    if (
      preset.panels[0] === panels[0] &&
      preset.panels[1] === panels[1] &&
      preset.panels[2] === panels[2] &&
      preset.panels[3] === panels[3]
    ) {
      return preset.id;
    }
  }
  return 'custom';
}

export function estimateTappiEctFromLayers(
  layers: {
    topLayer: PaperGradeId;
    mediumLayer: MediumGradeId;
    centerLayer: PaperGradeId;
    mediumLayer2: MediumGradeId;
    bottomLayer: PaperGradeId;
  },
  fluteId: BctFluteId,
  boardGrade: 'single-wall' | 'double-wall',
  customRct?: CustomRctOverrides
): number {
  const f = FLUTE_SPECS[fluteId] || FLUTE_SPECS.B;
  const rctL1 = getEffectiveRct(layers.topLayer, customRct?.enabled ? customRct.top : undefined);
  const rctM1 = getEffectiveRct(
    layers.mediumLayer,
    customRct?.enabled ? customRct.medium1 : undefined
  );
  const rctBot = getEffectiveRct(
    layers.bottomLayer,
    customRct?.enabled ? customRct.bottom : undefined
  );

  if (boardGrade === 'double-wall') {
    const rctC = getEffectiveRct(
      layers.centerLayer,
      customRct?.enabled ? customRct.center : undefined
    );
    const rctM2 = getEffectiveRct(
      layers.mediumLayer2,
      customRct?.enabled ? customRct.medium2 : undefined
    );
    const tuf2 = f.tuf2 ?? f.tuf1;
    const raw = 1.02 * (rctL1 + f.tuf1 * rctM1 + rctC + tuf2 * rctM2 + rctBot);
    return parseFloat(raw.toFixed(2));
  }

  const raw = 1.02 * (rctL1 + f.tuf1 * rctM1 + rctBot);
  return parseFloat(raw.toFixed(2));
}

export function estimateLegacyBctProEct(
  top: PaperGradeId,
  medium: MediumGradeId,
  bottom: PaperGradeId,
  fluteId: BctFluteId,
  customRct?: CustomRctOverrides
): number {
  const rctTop = getEffectiveRct(top, customRct?.enabled ? customRct.top : undefined);
  const rctMed = getEffectiveRct(medium, customRct?.enabled ? customRct.medium1 : undefined);
  const rctBot = getEffectiveRct(bottom, customRct?.enabled ? customRct.bottom : undefined);
  const f = FLUTE_SPECS[fluteId] || FLUTE_SPECS.B;
  // Exact BCT Pro DU() equation: ((top.rct + bottom.rct) * legacyTuf + medium.rct * 0.5) * 0.65
  const raw = ((rctTop + rctBot) * f.legacyTuf + rctMed * 0.5) * 0.65;
  return parseFloat(raw.toFixed(2));
}

export function resolveTappiEct(
  eng: EngineeringConfig,
  boardGrade: 'single-wall' | 'double-wall'
): { value: number; source: EctSource; confidence: EctConfidence } {
  if (eng.useActualEct && eng.actualEctKgfCm && eng.actualEctKgfCm > 0) {
    return {
      value: parseFloat(eng.actualEctKgfCm.toFixed(2)),
      source: 'ACTUAL_ECT',
      confidence: 'HIGH',
    };
  }

  const key =
    boardGrade === 'double-wall'
      ? `${eng.topLayer}-${eng.mediumLayer}-${eng.centerLayer}-${eng.mediumLayer2}-${eng.bottomLayer}-${eng.fluteId}`
      : `${eng.topLayer}-${eng.mediumLayer}-${eng.bottomLayer}-${eng.fluteId}`;

  if (!eng.customRct?.enabled && EXTENDED_STANDARD_ECT_TABLE[key]) {
    return {
      value: EXTENDED_STANDARD_ECT_TABLE[key],
      source: 'STANDARD_ECT',
      confidence: 'HIGH',
    };
  }

  return {
    value: estimateTappiEctFromLayers(eng, eng.fluteId, boardGrade, eng.customRct),
    source: 'ESTIMATED_ECT',
    confidence: 'MEDIUM',
  };
}

export function resolveLegacyBctProEct(
  eng: EngineeringConfig
): { value: number; source: EctSource; confidence: EctConfidence } {
  if (eng.useActualEct && eng.actualEctKgfCm && eng.actualEctKgfCm > 0) {
    return {
      value: parseFloat(eng.actualEctKgfCm.toFixed(2)),
      source: 'ACTUAL_ECT',
      confidence: 'HIGH',
    };
  }

  const key = `${eng.topLayer}-${eng.mediumLayer}-${eng.bottomLayer}-${eng.fluteId}`;
  if (!eng.customRct?.enabled && BCT_PRO_STANDARD_ECT_TABLE[key]) {
    return {
      value: BCT_PRO_STANDARD_ECT_TABLE[key],
      source: 'STANDARD_ECT',
      confidence: 'HIGH',
    };
  }

  return {
    value: estimateLegacyBctProEct(
      eng.topLayer,
      eng.mediumLayer,
      eng.bottomLayer,
      eng.fluteId,
      eng.customRct
    ),
    source: 'ESTIMATED_ECT',
    confidence: 'MEDIUM',
  };
}

export function computeMcKeeBctKgf(
  ectKgfCm: number,
  caliperMm: number,
  perimeterMm: number
): number {
  const ectLbfIn = Math.max(0.5, ectKgfCm) * KGF_CM_TO_LBF_IN;
  const caliperIn = Math.max(0.5, caliperMm) * MM_TO_IN;
  const perimeterIn = Math.max(20, perimeterMm) * MM_TO_IN;
  const bctKgf =
    MCKEE_K *
    ectLbfIn *
    Math.pow(caliperIn, 0.508) *
    Math.pow(perimeterIn, 0.492) *
    LBF_TO_KGF;
  return parseFloat(bctKgf.toFixed(2));
}

export function computePrintingFactor(printCoverage: number, numberOfColors = 0): number {
  const clampedCoverage = Math.min(100, Math.max(0, printCoverage));
  let factor = 1 - (clampedCoverage / 100) * 0.15;
  if (numberOfColors > 0) {
    const colorPenalty = Math.min(numberOfColors * 0.02, 0.08);
    factor = factor * (1 - colorPenalty);
  }
  return parseFloat(factor.toFixed(3));
}

export function computeHumidityFactor(rh: number): number {
  const points = [
    { rh: 50, factor: 1.0 },
    { rh: 55, factor: 0.95 },
    { rh: 60, factor: 0.9 },
    { rh: 65, factor: 0.85 },
    { rh: 70, factor: 0.8 },
    { rh: 75, factor: 0.75 },
    { rh: 80, factor: 0.7 },
    { rh: 85, factor: 0.65 },
    { rh: 90, factor: 0.6 },
  ];
  if (rh <= 50) return 1.0;
  if (rh >= 90) return 0.6;
  for (let i = 0; i < points.length - 1; i++) {
    if (rh >= points[i].rh && rh <= points[i + 1].rh) {
      const span = points[i + 1].rh - points[i].rh;
      const delta = points[i + 1].factor - points[i].factor;
      const t = (rh - points[i].rh) / span;
      return parseFloat((points[i].factor + t * delta).toFixed(3));
    }
  }
  return 0.9;
}

export function computeHandlingFactor(handlingRisk: boolean): number {
  return handlingRisk ? 0.85 : 1.0;
}

export function computeStabilityFactor(
  heightMm: number,
  lengthMm: number,
  widthMm: number
): number {
  const minDim = Math.max(1, Math.min(lengthMm, widthMm));
  const ratio = heightMm / minDim;
  if (ratio <= 1.5) return 1.0;
  if (ratio <= 2.0) return 0.95;
  if (ratio <= 2.5) return 0.9;
  return 0.85;
}

export function getPrintCoverageDescription(coverage: number): string {
  if (coverage <= 0) return 'Unprinted (kraft / plain)';
  if (coverage <= 12) return 'Minimal (small logo / corner mark)';
  if (coverage <= 35) return 'Moderate (brand belt & barcode)';
  if (coverage <= 65) return 'Heavy graphic / 2-panel flood';
  return 'Full solid flexo / litho flood coat';
}

export function getRecommendedCoverageHint(colors: number): string | null {
  if (colors <= 0) return null;
  if (colors === 1) return '1-color flexo typically runs 5-20% weighted coverage';
  if (colors <= 2) return '2-color flexo typically runs 15-35% weighted coverage';
  if (colors <= 4) return '3-4 color flexo typically runs 30-60% weighted coverage';
  return '5+ color litho/flexo typically runs 50-85% weighted coverage';
}

export function loadBctHistory(userId?: string): BctHistoryEntry[] {
  try {
    const key = userId ? `${BCT_HISTORY_STORAGE_KEY}_${userId}` : BCT_HISTORY_STORAGE_KEY;
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveBctHistory(entries: BctHistoryEntry[], userId?: string): void {
  try {
    const key = userId ? `${BCT_HISTORY_STORAGE_KEY}_${userId}` : BCT_HISTORY_STORAGE_KEY;
    window.localStorage.setItem(key, JSON.stringify(entries.slice(0, 100)));
  } catch {
    // Ignore quota/private-mode storage errors
  }
}

function buildMethodResult(
  method: 'tappi' | 'bct-pro',
  ectRes: { value: number; source: EctSource; confidence: EctConfidence },
  caliperMm: number,
  perimeterMm: number,
  perimeterBasis: 'outer' | 'inner',
  baseFactors: Omit<BctCorrectionFactors, 'fluteGrain' | 'combined'>,
  fluteGrain: number,
  safetyFactor: number
): BctMethodResult {
  const ectKgfCm = ectRes.value;
  const ectLbfIn = parseFloat((ectKgfCm * KGF_CM_TO_LBF_IN).toFixed(2));
  const bctEstimateKgf = computeMcKeeBctKgf(ectKgfCm, caliperMm, perimeterMm);
  const bctEstimateLbf = parseFloat((bctEstimateKgf / LBF_TO_KGF).toFixed(2));

  const combined = parseFloat(
    (
      baseFactors.printing *
      baseFactors.humidity *
      baseFactors.handling *
      baseFactors.stability *
      fluteGrain
    ).toFixed(3)
  );

  const factors: BctCorrectionFactors = {
    ...baseFactors,
    fluteGrain,
    combined,
  };

  const correctedBctKgf = parseFloat((bctEstimateKgf * combined).toFixed(2));
  const correctedBctLbf = parseFloat((correctedBctKgf / LBF_TO_KGF).toFixed(2));
  const maxStackingLoadKgf = parseFloat((correctedBctKgf / safetyFactor).toFixed(2));
  const maxStackingLoadLbf = parseFloat((maxStackingLoadKgf / LBF_TO_KGF).toFixed(2));

  return {
    method,
    ectKgfCm,
    ectLbfIn,
    ectSource: ectRes.source,
    ectConfidence: ectRes.confidence,
    perimeterMm: parseFloat(perimeterMm.toFixed(1)),
    perimeterBasis,
    bctEstimateKgf,
    bctEstimateLbf,
    correctedBctKgf,
    correctedBctLbf,
    maxStackingLoadKgf,
    maxStackingLoadLbf,
    factors,
  };
}

export function computeEngineeringAnalysis(
  config: BoxConfig,
  paths: DielinePaths
): EngineeringAnalysis {
  const { innerDimensions, outerDimensions } = paths.info;
  const eng = config.engineering;

  const fluteSpec = FLUTE_SPECS[eng.fluteId] || FLUTE_SPECS.B;
  const caliperMm = Math.max(0.5, config.fluteThickness || fluteSpec.thickness || 3.18);
  const safetyFactor = Math.max(1.2, eng.safetyFactor || 5);

  // 1. Total Nominal Board GSM (3-ply vs 5-ply Double-Wall)
  const topSpec = ALL_PAPER_GRADES[eng.topLayer];
  const med1Spec = ALL_PAPER_GRADES[eng.mediumLayer];
  const centerSpec = ALL_PAPER_GRADES[eng.centerLayer];
  const med2Spec = ALL_PAPER_GRADES[eng.mediumLayer2];
  const botSpec = ALL_PAPER_GRADES[eng.bottomLayer];

  const boardGsm =
    config.boardGrade === 'double-wall'
      ? Math.round(
          (topSpec?.gsm || 200) +
            (med1Spec?.gsm || 150) * fluteSpec.tuf1 +
            (centerSpec?.gsm || 125) +
            (med2Spec?.gsm || 150) * (fluteSpec.tuf2 ?? fluteSpec.tuf1) +
            (botSpec?.gsm || 200)
        )
      : Math.round(
          (topSpec?.gsm || 200) +
            (botSpec?.gsm || 200) +
            (med1Spec?.gsm || 150) * fluteSpec.tuf1
        );

  // 2. Shared Environmental & Print Correction Factors
  const baseFactors = {
    printing: computePrintingFactor(eng.printCoverage, config.metadata.printColorsCount),
    humidity: computeHumidityFactor(eng.relativeHumidity),
    handling: computeHandlingFactor(eng.handlingRisk),
    stability: computeStabilityFactor(
      innerDimensions.depth,
      innerDimensions.length,
      innerDimensions.width
    ),
  };

  // 3. Dual-Engine Evaluation: TAPPI / ISO Calibrated vs BCT Pro Legacy
  const tappiEct = resolveTappiEct(eng, config.boardGrade);
  const legacyEct = resolveLegacyBctProEct(eng);

  const outerPerimeterMm = 2 * (outerDimensions.length + outerDimensions.width);
  const innerPerimeterMm = 2 * (innerDimensions.length + innerDimensions.width);
  const grainFactor = config.prepress.fluteDirection === 'vertical' ? 1.0 : 0.55;

  const tappiResult = buildMethodResult(
    'tappi',
    tappiEct,
    caliperMm,
    outerPerimeterMm,
    'outer',
    baseFactors,
    grainFactor,
    safetyFactor
  );

  const bctProResult = buildMethodResult(
    'bct-pro',
    legacyEct,
    caliperMm,
    innerPerimeterMm,
    'inner',
    baseFactors,
    1.0,
    safetyFactor
  );

  const ectDiffPct =
    bctProResult.ectKgfCm > 0
      ? ((tappiResult.ectKgfCm - bctProResult.ectKgfCm) / bctProResult.ectKgfCm) * 100
      : 0;
  const correctedBctDiffPct =
    bctProResult.correctedBctKgf > 0
      ? ((tappiResult.correctedBctKgf - bctProResult.correctedBctKgf) /
          bctProResult.correctedBctKgf) *
        100
      : 0;

  const auditFindings: AuditFindingNote[] = [];

  if (!eng.useActualEct) {
    if (config.boardGrade === 'double-wall') {
      auditFindings.push({
        id: 'audit-5ply-dw',
        severity: Math.abs(ectDiffPct) > 8 ? 'warning' : 'info',
        title: 'Double-Wall 5-ply vs Legacy 3-ply + 0.65x TUF',
        detail: `TAPPI sums all 5 layers (L1 + ${fluteSpec.tuf1}·M1 + L2 + ${
          fluteSpec.tuf2 ?? fluteSpec.tuf1
        }·M2 + L3 = ${tappiResult.ectKgfCm.toFixed(
          2
        )} kgf/cm). BCT Pro drops center L2 & M2 and multiplies liners by ${fluteSpec.legacyTuf}x · 0.65 (${bctProResult.ectKgfCm.toFixed(
          2
        )} kgf/cm).`,
      });
    } else if (
      tappiResult.ectSource === 'ESTIMATED_ECT' ||
      bctProResult.ectSource === 'ESTIMATED_ECT'
    ) {
      auditFindings.push({
        id: 'audit-ect-tuf',
        severity: Math.abs(ectDiffPct) > 8 ? 'warning' : 'info',
        title:
          Math.abs(ectDiffPct) > 8
            ? `Estimated ECT diverges by ${ectDiffPct > 0 ? '+' : ''}${ectDiffPct.toFixed(1)}%`
            : 'Estimated ECT within tolerance',
        detail: `BCT Pro's DU() computes ((L1+L2)*${fluteSpec.legacyTuf} + 0.5*M)*0.65, penalizing non-table specs by up to ~40%. TAPPI applies flute take-up (${fluteSpec.tuf1}x) strictly to medium RCT (${tappiResult.ectKgfCm.toFixed(
          2
        )} vs ${bctProResult.ectKgfCm.toFixed(2)} kgf/cm).`,
      });
    } else {
      auditFindings.push({
        id: 'audit-std-table',
        severity: 'info',
        title: 'Standard ECT table lookup active',
        detail: `Both calculators match the mill reference table (${tappiResult.ectKgfCm.toFixed(
          2
        )} kgf/cm). Switch paper grades away from factory presets to inspect raw RCT formula divergence.`,
      });
    }
  } else {
    auditFindings.push({
      id: 'audit-actual-ect',
      severity: 'info',
      title: 'Measured Actual ECT override active',
      detail: `Both engines use lab-measured ${tappiResult.ectKgfCm.toFixed(
        2
      )} kgf/cm, isolating McKee perimeter and flute-grain differences only.`,
    });
  }

  auditFindings.push({
    id: 'audit-perimeter',
    severity: 'info',
    title: `McKee perimeter basis: OD (${outerPerimeterMm.toFixed(0)} mm) vs ID (${innerPerimeterMm.toFixed(0)} mm)`,
    detail: `TAPPI McKee measures outer box score perimeter (+${(
      outerPerimeterMm - innerPerimeterMm
    ).toFixed(1)} mm), adding ~${(
      ((Math.pow(outerPerimeterMm, 0.492) / Math.pow(Math.max(1, innerPerimeterMm), 0.492)) -
        1) *
      100
    ).toFixed(1)}% base compression capacity on thick flutes.`,
  });

  if (config.prepress.fluteDirection === 'horizontal') {
    auditFindings.push({
      id: 'audit-flute-grain',
      severity: 'warning',
      title: 'Horizontal flute grain ignored by BCT Pro Legacy',
      detail:
        'BCT Pro assumes 100% vertical flutes. TAPPI mode applies the 0.55 horizontal-grain column buckling penalty.',
    });
  }

  const active = eng.calculationMethod === 'bct-pro' ? bctProResult : tappiResult;

  // 4. Sheet Blank & Cutout Waste Calculation
  const { panelCoords } = paths;
  const grossBlankAreaSqm = Math.max(0.001, paths.info.totalAreaSqM);
  const slotGap = config.advanced.slotGap;
  const glueTaper = Math.min(15, panelCoords.dPanel / 4, panelCoords.flapL / 2);

  const botSlotsAreaMm2 = 3 * slotGap * Math.min(panelCoords.flapL, panelCoords.flapW);
  const topSlotsAreaMm2 = panelCoords.hasTopFlaps
    ? 3 * slotGap * Math.min(panelCoords.topFlapL, panelCoords.topFlapW)
    : 0;
  const flapSpanAbove = panelCoords.hasTopFlaps
    ? Math.max(panelCoords.topFlapL, panelCoords.topFlapW)
    : 0;
  const flapSpanBelow = Math.max(panelCoords.flapL, panelCoords.flapW);
  const glueUnusedCornersMm2 = config.glueFlapWidth * (flapSpanAbove + flapSpanBelow);
  const glueTaperMm2 = config.glueFlapWidth * glueTaper;

  const totalCutoutMm2 =
    botSlotsAreaMm2 + topSlotsAreaMm2 + glueUnusedCornersMm2 + glueTaperMm2;
  const cutoutAreaSqm = totalCutoutMm2 / 1_000_000;
  const netBoxAreaSqm = Math.max(0.001, grossBlankAreaSqm - cutoutAreaSqm);
  const scrapWastePct = Math.min(
    45,
    Math.round((cutoutAreaSqm / grossBlankAreaSqm) * 1000) / 10
  );

  // 5. Batch Cost Tiers
  const basePerSqm = Math.max(0, eng.sheetCostPerSqm);
  const unitCost = grossBlankAreaSqm * basePerSqm;

  const tierSpecs: Array<{
    qty: number;
    label: string;
    discount: number;
    statusLabel: string;
    statusHue: BatchCostTier['statusHue'];
  }> = [
    { qty: 1, label: '1 pc (Sample)', discount: 1.0, statusLabel: 'Proto', statusHue: 'neutral' },
    { qty: 100, label: '100 pcs', discount: 0.94, statusLabel: 'Short run', statusHue: 'info' },
    { qty: 500, label: '500 pcs', discount: 0.86, statusLabel: 'Standard', statusHue: 'info' },
    { qty: 1000, label: '1,000 pcs', discount: 0.78, statusLabel: 'Optimal', statusHue: 'green' },
    { qty: 5000, label: '5,000 pcs', discount: 0.7, statusLabel: 'Wholesale', statusHue: 'green' },
  ];

  const batchTiers: BatchCostTier[] = tierSpecs.map((tier) => {
    const tierUnit = unitCost * tier.discount;
    return {
      qty: tier.qty,
      label: tier.label,
      discountFactor: tier.discount,
      totalAreaSqm: grossBlankAreaSqm * tier.qty,
      unitCost: tierUnit,
      totalCost: tierUnit * tier.qty,
      statusLabel: tier.statusLabel,
      statusHue: tier.statusHue,
    };
  });

  // 6. Field-Defect Prediction Rules (Shop-Floor & Pre-Press Pre-Flight)
  const fieldIssues: FieldDefectIssue[] = [];
  const T = config.fluteThickness;

  // Rule 1: Slotting rule pinch / tear
  const minSlotGap = Math.max(3, Math.ceil(T * 1.5 * 2) / 2);
  if (config.advanced.slotGap < minSlotGap) {
    const targetSlot = Math.max(4, Math.ceil(T * 1.8 * 2) / 2);
    fieldIssues.push({
      id: 'slot-pinch',
      severity: 'critical',
      title: `Slot width (${config.advanced.slotGap} mm) too narrow for ${T} mm flute`,
      detail:
        'Die slotting knives below 1.5x caliper pinch board liners and tear corner scores during rotary slotting.',
      fixLabel: `Set slot to ${targetSlot} mm`,
      applyFix: (cfg) => ({
        ...cfg,
        advanced: { ...cfg.advanced, slotGap: targetSlot },
      }),
    });
  } else {
    fieldIssues.push({
      id: 'slot-pinch',
      severity: 'pass',
      title: `Slot clearance (${config.advanced.slotGap} mm) clears ${T} mm board caliper`,
      detail: 'Knife gap prevents corner liner tearing on rotary slotters.',
    });
  }

  // Rule 2: Glue flap adhesion surface width
  const minGlue = config.boardGrade === 'double-wall' ? 32 : 25;
  const recGlue = config.boardGrade === 'double-wall' ? 40 : 35;
  if (config.glueFlapWidth < minGlue) {
    fieldIssues.push({
      id: 'glue-flap-narrow',
      severity: 'warning',
      title: `Glue flap (${config.glueFlapWidth} mm) risks joint pop-open`,
      detail: `${
        config.boardGrade === 'double-wall' ? 'Double-wall' : 'Single-wall'
      } manufacturer's joint requires at least ${minGlue} mm for hot-melt or PVA bead bond.`,
      fixLabel: `Widen to ${recGlue} mm`,
      applyFix: (cfg) => ({ ...cfg, glueFlapWidth: recGlue }),
    });
  } else {
    fieldIssues.push({
      id: 'glue-flap-narrow',
      severity: 'pass',
      title: `Glue flap (${config.glueFlapWidth} mm) meets folder-gluer spec`,
      detail: 'Adequate adhesive bead width for manufacturer joint shear strength.',
    });
  }

  // Rule 3: Anti-fishtail / stretch offset on thicker flutes
  if (!config.advanced.fishtailCompensation && T >= 3.0) {
    fieldIssues.push({
      id: 'fishtail-risk',
      severity: 'warning',
      title: 'Anti-fishtail offset disabled on >= 3 mm board',
      detail:
        'Without slot overcut and inner-flap setback, thick flaps collide at fold corners and skew panel alignment.',
      fixLabel: 'Enable anti-fishtail',
      applyFix: (cfg) => ({
        ...cfg,
        advanced: { ...cfg.advanced, fishtailCompensation: true },
      }),
    });
  } else if (config.boardGrade === 'double-wall' && config.advanced.flapGap < 2) {
    fieldIssues.push({
      id: 'flap-gap-dw',
      severity: 'warning',
      title: 'Double-wall flap gap under 2 mm',
      detail:
        'Thick double-wall outer flaps can butt and buckle at center when sealed on case erectors.',
      fixLabel: 'Set flap gap to 3 mm',
      applyFix: (cfg) => ({
        ...cfg,
        advanced: { ...cfg.advanced, flapGap: 3 },
      }),
    });
  } else {
    fieldIssues.push({
      id: 'fishtail-risk',
      severity: 'pass',
      title: 'Anti-fishtail and flap gap geometry verified',
      detail: 'Flaps clear center crease without corner bind when closed 90 deg.',
    });
  }

  // Rule 4: Flute grain direction vs compression stacking
  if (config.prepress.fluteDirection === 'horizontal') {
    fieldIssues.push({
      id: 'flute-horizontal',
      severity: 'warning',
      title: 'Horizontal flute orientation cuts stacking strength by 45%',
      detail: `Flutes run perpendicular to load height, dropping TAPPI safe load to ${Math.round(
        tappiResult.maxStackingLoadKgf
      )} kgf. Use vertical flutes for palletized cartons.`,
      fixLabel: 'Switch to vertical',
      applyFix: (cfg) => ({
        ...cfg,
        prepress: { ...cfg.prepress, fluteDirection: 'vertical' },
      }),
    });
  } else {
    fieldIssues.push({
      id: 'flute-horizontal',
      severity: 'pass',
      title: 'Vertical flute direction aligned with stacking axis',
      detail: 'Corrugation columns run parallel to box depth for maximum McKee BCT.',
    });
  }

  // Rule 5: Pre-press print bleed & glue knockout hygiene
  if (config.metadata.printColorsCount > 0 && config.prepress.bleedMm < 3) {
    fieldIssues.push({
      id: 'bleed-low',
      severity: 'warning',
      title: `Print bleed (${config.prepress.bleedMm} mm) below 3 mm press tolerance`,
      detail: 'Flexo sheet feed drift can expose unprinted kraft/white slivers along trimmed edges.',
      fixLabel: 'Set bleed to 5 mm',
      applyFix: (cfg) => ({
        ...cfg,
        prepress: { ...cfg.prepress, bleedMm: 5 },
      }),
    });
  } else if (config.metadata.printColorsCount > 0 && !config.prepress.showGlueKnockout) {
    fieldIssues.push({
      id: 'glue-knockout-off',
      severity: 'warning',
      title: 'Glue flap no-ink knockout guide is disabled',
      detail:
        'Printing ink or varnish onto the glue tab degrades hot-melt adhesion and triggers carton delamination.',
      fixLabel: 'Enable glue knockout',
      applyFix: (cfg) => ({
        ...cfg,
        prepress: { ...cfg.prepress, showGlueKnockout: true },
      }),
    });
  } else {
    fieldIssues.push({
      id: 'bleed-hygiene',
      severity: 'pass',
      title: `Pre-press bleed (${config.prepress.bleedMm} mm) and glue knockout active`,
      detail: 'Artwork perimeter bleed and unprinted glue tab boundary are defined.',
    });
  }

  // Rule 6: Barcode score proximity & GS1 check digit
  if (config.barcode.enabled && paths.barcodeBox) {
    const bcCheck = validateITF14(config.barcode.value);
    const bc = paths.barcodeBox;
    let pLeft = panelCoords.pL1_x1;
    let pRight = panelCoords.pL1_x2;
    if (config.barcode.panel === 2) {
      pLeft = panelCoords.pW1_x1;
      pRight = panelCoords.pW1_x2;
    }
    if (config.barcode.panel === 3) {
      pLeft = panelCoords.pL2_x1;
      pRight = panelCoords.pL2_x2;
    }
    if (config.barcode.panel === 4) {
      pLeft = panelCoords.pW2_x1;
      pRight = panelCoords.pW2_x2;
    }

    const minClearance = Math.min(
      bc.x - pLeft,
      pRight - (bc.x + bc.width),
      bc.y - panelCoords.y1,
      panelCoords.y2 - (bc.y + bc.height)
    );

    if (!bcCheck.isValidITF14) {
      fieldIssues.push({
        id: 'barcode-checkdigit',
        severity: 'warning',
        title: 'GS1 ITF-14 check digit or length mismatch',
        detail:
          bcCheck.reason ||
          'Barcode falls back to CODE128 until 14-digit Mod-10 check digit is valid.',
      });
    } else if (minClearance < 5) {
      fieldIssues.push({
        id: 'barcode-score-proximity',
        severity: 'warning',
        title: `Barcode sits ${minClearance.toFixed(1)} mm from score line`,
        detail:
          'Quiet zone or bearer bar closer than 5 mm to a crease line can distort bars during folding.',
      });
    } else {
      fieldIssues.push({
        id: 'barcode-valid',
        severity: 'pass',
        title: `ITF-14 barcode clears score lines by ${minClearance.toFixed(1)} mm`,
        detail: 'Mod-10 check digit verified with safe quiet zone margin.',
      });
    }
  }

  // Rule 7: Product fit interference / excessive headspace
  if (config.inputMode === 'product' && paths.info.headspaceDiagnostic) {
    const hs = paths.info.headspaceDiagnostic;
    if (hs.status === 'interference') {
      fieldIssues.push({
        id: 'fit-interference',
        severity: 'critical',
        title: 'Product exceeds box inner cavity dimensions',
        detail: 'Negative clearance prevents box closure or crushes product walls.',
        fixLabel: 'Apply Standard (+4/+4/+2)',
        applyFix: (cfg) => ({
          ...cfg,
          product: {
            ...cfg.product,
            tolerancePreset: 'standard',
            clearanceL: 4,
            clearanceW: 4,
            clearanceD: 2,
          },
          dimensions: {
            length: Math.max(20, cfg.product.length + 4),
            width: Math.max(20, cfg.product.width + 4),
            depth: Math.max(20, cfg.product.depth + 2),
          },
        }),
      });
    } else if (hs.status === 'excessive') {
      fieldIssues.push({
        id: 'fit-headspace',
        severity: 'warning',
        title: `Top headspace (${hs.headspaceMm} mm) exceeds 6 mm threshold`,
        detail:
          'Excess air gap transfers stacking load into corrugated corners instead of product support.',
        fixLabel: 'Snap depth (+1 mm)',
        applyFix: (cfg) => ({
          ...cfg,
          product: { ...cfg.product, tolerancePreset: 'custom', clearanceD: 1 },
          dimensions: { ...cfg.dimensions, depth: Math.max(20, cfg.product.depth + 1) },
        }),
      });
    } else {
      fieldIssues.push({
        id: 'fit-nominal',
        severity: 'pass',
        title: `Headspace (${hs.headspaceMm} mm) and cavity fit (${hs.volumeUtilizationPct}%) optimal`,
        detail: 'Balanced clearance prevents transit crush and eases manual or automated packing.',
      });
    }
  }

  // Rule 8: Supermarket SRP & Perforation Integrity Check
  if (config.perforation.enabled) {
    const isTrayPerf = [
      'angled-display',
      'drop-front-pdq',
      'twin-zipper-window',
      'twin-split-tray',
      'shelf-tray-scoop',
      'wrap-around',
    ].includes(config.perforation.type);

    const isSolidCut = config.perforation.ruleMode === 'solid' || config.perforation.tie <= 0;
    const ruleSummary = isSolidCut
      ? 'Solid Cut (Non-Dash)'
      : `${config.perforation.cut}/${config.perforation.tie} mm perf rule`;

    if (isTrayPerf && config.prepress.fluteDirection === 'horizontal') {
      fieldIssues.push({
        id: 'srp-grain-conflict',
        severity: 'warning',
        title: `SRP perforation crosses horizontal flutes (${ruleSummary})`,
        detail:
          'Horizontal tear seams combined with horizontal flute direction severely weaken corner stacking stiffness.',
        fixLabel: 'Switch to vertical',
        applyFix: (cfg) => ({
          ...cfg,
          prepress: { ...cfg.prepress, fluteDirection: 'vertical' },
        }),
      });
    } else if (isTrayPerf && isSolidCut) {
      fieldIssues.push({
        id: 'srp-solid-warning',
        severity: 'warning',
        title: 'SRP tear-hood uses Solid Cut (0 mm tie nicks)',
        detail:
          'Without tie nicks, the upper hood will detach on the die-cutter before transit. Switch to Standard SRP (5/3 mm) for tear-open hoods.',
        fixLabel: 'Use Standard SRP (5/3)',
        applyFix: (cfg) => ({
          ...cfg,
          perforation: { ...cfg.perforation, ruleMode: 'standard', cut: 5, tie: 3 },
        }),
      });
    } else {
      fieldIssues.push({
        id: 'srp-perf-ok',
        severity: 'pass',
        title: `Perforation geometry verified (${ruleSummary})`,
        detail: 'Cut-to-tie rule and flute stiffness margin are balanced for retail floor conversion.',
      });
    }
  }

  const criticalCount = fieldIssues.filter((i) => i.severity === 'critical').length;
  const warningCount = fieldIssues.filter((i) => i.severity === 'warning').length;
  const passCount = fieldIssues.filter((i) => i.severity === 'pass').length;

  return {
    ectKgfCm: active.ectKgfCm,
    ectLbfIn: active.ectLbfIn,
    ectSource: active.ectSource,
    ectConfidence: active.ectConfidence,
    boardGsm,
    bctEstimateKgf: active.bctEstimateKgf,
    bctEstimateLbf: active.bctEstimateLbf,
    correctedBctKgf: active.correctedBctKgf,
    correctedBctLbf: active.correctedBctLbf,
    maxStackingLoadKgf: active.maxStackingLoadKgf,
    maxStackingLoadLbf: active.maxStackingLoadLbf,
    factors: active.factors,
    methodComparison: {
      tappi: tappiResult,
      bctPro: bctProResult,
      ectDiffPct: parseFloat(ectDiffPct.toFixed(1)),
      correctedBctDiffPct: parseFloat(correctedBctDiffPct.toFixed(1)),
      auditFindings,
    },
    theoreticalBctKgf: active.bctEstimateKgf,
    theoreticalBctLbf: active.bctEstimateLbf,
    effectiveBctKgf: active.correctedBctKgf,
    effectiveBctLbf: active.correctedBctLbf,
    safeLoadKgf: active.maxStackingLoadKgf,
    safeLoadLbf: active.maxStackingLoadLbf,
    fluteOrientationFactor: active.factors.fluteGrain,
    grossBlankAreaSqm,
    netBoxAreaSqm,
    scrapWastePct,
    unitCost,
    batchTiers,
    fieldIssues,
    criticalCount,
    warningCount,
    passCount,
  };
}

/**
 * Estimates combined Corrugated Mullen Bursting Strength (kPa, ISO 2759 / TAPPI T810).
 * Driven predominantly by liner plies (Outer + Inner + Center in DW), with minor flute web contribution.
 */
export function computeBoardBurstKpa(
  eng: EngineeringConfig,
  boardGrade: 'single-wall' | 'double-wall'
): number {
  const top = ALL_PAPER_GRADES[eng.topLayer]?.burstKpa ?? 445;
  const med1 = ALL_PAPER_GRADES[eng.mediumLayer]?.burstKpa ?? 215;
  const bot = ALL_PAPER_GRADES[eng.bottomLayer]?.burstKpa ?? 365;
  if (boardGrade === 'double-wall') {
    const center = ALL_PAPER_GRADES[eng.centerLayer]?.burstKpa ?? 215;
    const med2 = ALL_PAPER_GRADES[eng.mediumLayer2]?.burstKpa ?? 215;
    return Math.round(top + bot + center * 0.92 + (med1 + med2) * 0.12);
  }
  return Math.round(top + bot + med1 * 0.12);
}

/**
 * Estimates corrugated-on-corrugated outer kinetic friction coefficient (μ)
 * accounting for liner fiber type, print ink varnish coverage, and humidity.
 */
export function computeSurfaceFrictionCoeff(eng: EngineeringConfig): number {
  const baseMu = ALL_PAPER_GRADES[eng.topLayer]?.frictionCoeff ?? 0.42;
  const printPct = Math.max(0, Math.min(100, eng.printCoverage || 0));
  // Heavy solid flood varnish/lacquer reduces carton-to-carton friction significantly
  const inkDerate = 1 - (printPct / 100) * 0.22;
  const rh = Math.max(30, Math.min(95, eng.relativeHumidity || 55));
  const rhDerate = rh > 75 ? 1 - ((rh - 75) / 20) * 0.1 : 1.0;
  return parseFloat(Math.max(0.2, Math.min(0.48, baseMu * inkDerate * rhDerate)).toFixed(3));
}

