export type BoxStyle = '0201' | '0200' | '0202' | '0203' | '0204';
export type DisplayUnit = 'mm' | 'cm' | 'in';
export type TolerancePreset = 'snug' | 'standard' | 'protective' | 'custom';
export type ExportMode = 'spec-sheet' | 'clean-cad';
export type ViewMode = '2d' | '3d' | 'pallet';
export type FluteDirection = 'vertical' | 'horizontal';
export type CurrencyCode = 'IDR' | 'USD' | 'EUR';
export type ForceUnit = 'kgf' | 'lbf';
export type BctCalculationMethod = 'tappi' | 'bct-pro';

export type PrintPresetId =
  | 'none'
  | 'shipping-mark'
  | 'brand-band'
  | 'two-panel'
  | 'full-flood'
  | 'custom';

export type KraftGradeId =
  | 'K110'
  | 'K125'
  | 'K140'
  | 'K150'
  | 'K175'
  | 'K200'
  | 'K220'
  | 'K250'
  | 'K275'
  | 'K300';

export type WhiteTopGradeId = 'WKL140' | 'WKL175' | 'WKL200';

export type TestlinerGradeId =
  | 'TL115'
  | 'TL125'
  | 'TL140'
  | 'TL150'
  | 'TL175'
  | 'TL200';

export type MediumGradeId =
  | 'M100'
  | 'M110'
  | 'M125'
  | 'M140'
  | 'M150'
  | 'M165'
  | 'M180'
  | 'M200'
  | 'SC125'
  | 'SC150'
  | 'SC175';

export type PaperGradeId =
  | KraftGradeId
  | WhiteTopGradeId
  | TestlinerGradeId
  | MediumGradeId;

export type BctFluteId = 'F' | 'E' | 'B' | 'C' | 'A' | 'EB' | 'BC' | 'AB' | 'AA';
export type EctSource = 'ACTUAL_ECT' | 'STANDARD_ECT' | 'ESTIMATED_ECT';
export type EctConfidence = 'HIGH' | 'MEDIUM';

export type PerforationRuleMode = 'solid' | 'fine' | 'standard' | 'heavy' | 'custom';

export type PerforationCategory = 'srp' | 'shelf-tray' | 'logistics';

export type PerforationType =
  | 'angled-display'
  | 'drop-front-pdq'
  | 'twin-zipper-window'
  | 'twin-split-tray'
  | 'shelf-tray-scoop'
  | 'front-cutout'
  | 'u-scoop-front'
  | 'wrap-around'
  | 'tear-strip'
  | 'zipper-rule'
  | 'thumb-hole-punch'
  | 'carry-handles'
  | 'ventilation-slots';

export interface BoxDimensions {
  length: number;
  width: number;
  depth: number;
}

export interface LayerVisibility {
  dimensions: boolean;
  productOverlay: boolean;
  barcode: boolean;
  titleBlock: boolean;
  grid: boolean;
  printBleed: boolean;
  scoreSafeZone: boolean;
  glueKnockout: boolean;
  fluteDirection: boolean;
}

export interface PrePressConfig {
  bleedMm: number;
  scoreSafeMarginMm: number;
  fluteDirection: FluteDirection;
  showGlueKnockout: boolean;
}

export interface CustomRctOverrides {
  enabled: boolean;
  top?: number;
  medium1?: number;
  center?: number;
  medium2?: number;
  bottom?: number;
}

export interface EngineeringConfig {
  calculationMethod: BctCalculationMethod;
  fluteId: BctFluteId;
  topLayer: PaperGradeId;
  mediumLayer: MediumGradeId;
  centerLayer: PaperGradeId; // 5-ply center liner for Double Wall
  mediumLayer2: MediumGradeId; // 5-ply second medium for Double Wall
  bottomLayer: PaperGradeId;
  customRct: CustomRctOverrides;
  useActualEct: boolean;
  actualEctKgfCm: number | null;
  ectValue: number; // Synced lbf/in readout
  printCoverage: number; // 0..100%
  panelPrintCoverage: [number, number, number, number]; // [L1, W1, L2, W2]
  printPresetId: PrintPresetId;
  relativeHumidity: number; // 30..90%
  handlingRisk: boolean;
  safetyFactor: number; // e.g., 2.2, 3, 4, 5, 6
  sheetCostPerSqm: number;
  currency: CurrencyCode;
}

export interface BoxConfig {
  boxStyle: BoxStyle;
  flapOverlapMm: number; // Used for FEFCO 0202 (OSC)
  inputMode: 'id' | 'product';
  product: {
    length: number;
    width: number;
    depth: number;
    tolerancePreset: TolerancePreset;
    clearanceL: number;
    clearanceW: number;
    clearanceD: number;
  };
  dimensions: BoxDimensions; // Inner Dimensions (ID) in mm
  boardGrade: 'single-wall' | 'double-wall';
  fluteThickness: number;
  glueFlapWidth: number;
  unit: DisplayUnit;
  materialColor: 'kraft' | 'white';
  glueFlapPosition: 'left' | 'right';
  advanced: {
    flapGap: number;
    slotGap: number;
    fishtailCompensation: boolean;
    compensateInnerFlapDepth: boolean;
  };
  prepress: PrePressConfig;
  engineering: EngineeringConfig;
  barcode: {
    enabled: boolean;
    panel: number;
    value: string; // ITF-14 is 14 digits
  };
  perforation: {
    enabled: boolean;
    type: PerforationType;
    ruleMode: PerforationRuleMode;
    cut: number; // cut dash length in mm (0 when solid)
    tie: number; // tie gap length in mm (0 when solid)
  };
  appearance: {
    dimFontSize: number;
  };
  metadata: {
    userName: string;
    date: string;
    productName: string;
    materialSubstance: string;
    approvalSignee: string;
    printColorsCount: number;
    printColorCodes: string;
    notes: string;
  };
  casePack?: CasePackConfig;
  pallet?: PalletConfig;
}

export const BOX_STYLES: Array<{
  id: BoxStyle;
  code: string;
  abbrev: string;
  name: string;
  shortName: string;
  description: string;
}> = [
  {
    id: '0201',
    code: 'FEFCO 0201',
    abbrev: 'RSC',
    name: 'Regular Slotted Container (RSC)',
    shortName: '0201 · RSC',
    description: 'Standard shipping carton with equal top and bottom meeting flaps.',
  },
  {
    id: '0200',
    code: 'FEFCO 0200',
    abbrev: 'HSC',
    name: 'Half Slotted Container (HSC)',
    shortName: '0200 · HSC',
    description: 'Open-top tray or sleeve carton with bottom slotted flaps only.',
  },
  {
    id: '0202',
    code: 'FEFCO 0202',
    abbrev: 'OSC',
    name: 'Overlap Slotted Container (OSC)',
    shortName: '0202 · OSC',
    description: 'Outer flaps overlap by a custom allowance for extra top and bottom seal strength.',
  },
  {
    id: '0203',
    code: 'FEFCO 0203',
    abbrev: 'FOL',
    name: 'Full Overlap Slotted (FOL)',
    shortName: '0203 · FOL',
    description: 'Outer flaps span full box width for maximum stacking and puncture resistance.',
  },
  {
    id: '0204',
    code: 'FEFCO 0204',
    abbrev: 'CSSC',
    name: 'Center Special Slotted (CSSC)',
    shortName: '0204 · CSSC',
    description: 'Both inner (L/2) and outer (W/2) flaps meet flush at center without voids.',
  },
];

export const TOLERANCE_PRESETS: Record<
  Exclude<TolerancePreset, 'custom'>,
  {
    label: string;
    clearanceL: number;
    clearanceW: number;
    clearanceD: number;
    note: string;
  }
> = {
  snug: {
    label: 'Snug / Zero-Headspace',
    clearanceL: 2,
    clearanceW: 2,
    clearanceD: 0.5,
    note: 'Tight rigid-box fit (+2mm L/W, +0.5mm D) to eliminate vertical headspace.',
  },
  standard: {
    label: 'Standard E-Commerce',
    clearanceL: 4,
    clearanceW: 4,
    clearanceD: 2,
    note: 'Balanced insertion ease (+4mm L/W, +2mm D) with minimal rattle.',
  },
  protective: {
    label: 'Protective / Cushion Wrap',
    clearanceL: 12,
    clearanceW: 12,
    clearanceD: 10,
    note: 'Allows 5-6mm bubble wrap or foam liner per wall (+12mm L/W, +10mm D).',
  },
};

export const PERFORATION_RULE_PRESETS: Array<{
  id: PerforationRuleMode;
  label: string;
  cut: number;
  tie: number;
  hint: string;
}> = [
  {
    id: 'solid',
    label: 'Solid Cut (Non-Dash)',
    cut: 0,
    tie: 0,
    hint: 'Continuous die-through cut line (handholds, vents, punched windows)',
  },
  {
    id: 'fine',
    label: 'Fine Perf (6 / 3 mm)',
    cut: 6,
    tie: 3,
    hint: '2:1 smooth easy-tear rule for lightweight retail cartons',
  },
  {
    id: 'standard',
    label: 'Standard SRP (5 / 3 mm)',
    cut: 5,
    tie: 3,
    hint: '62% cut · standard supermarket shelf-ready perf rule',
  },
  {
    id: 'heavy',
    label: 'Heavy Duty (4 / 4 mm)',
    cut: 4,
    tie: 4,
    hint: '1:1 high-retention perf for heavy cans, jars & pallet vibration',
  },
  {
    id: 'custom',
    label: 'Custom (Cut / Tie mm)',
    cut: 5,
    tie: 3,
    hint: 'Manual millimeter dash and tie-nick configuration',
  },
];

export const PERFORATION_OPTIONS: Array<{
  id: PerforationType;
  category: PerforationCategory;
  categoryLabel: string;
  defaultRuleMode: PerforationRuleMode;
  label: string;
  usage: string;
}> = [
  {
    id: 'angled-display',
    category: 'srp',
    categoryLabel: 'SRP Supermarket',
    defaultRuleMode: 'standard',
    label: 'SRP Angled Hood Tear',
    usage: 'Slanted side profile tear-away hood converting shipping carton into a high-back retail display.',
  },
  {
    id: 'drop-front-pdq',
    category: 'srp',
    categoryLabel: 'SRP Supermarket',
    defaultRuleMode: 'standard',
    label: 'Drop-Front PDQ Tray',
    usage: 'Twin vertical front tear seams hinged to a 35mm bottom retainer lip for fast fold-down supermarket display.',
  },
  {
    id: 'twin-zipper-window',
    category: 'srp',
    categoryLabel: 'SRP Supermarket',
    defaultRuleMode: 'fine',
    label: 'Twin-Zipper Front Window',
    usage: 'Dual vertical zipper tear tracks peeling off a clean front showcase panel without blades.',
  },
  {
    id: 'twin-split-tray',
    category: 'srp',
    categoryLabel: 'SRP Supermarket',
    defaultRuleMode: 'heavy',
    label: 'Split-Tray Twin-Pack',
    usage: 'Stepped circumferential split separating upper dust hood from a reinforced low-front supermarket tray.',
  },
  {
    id: 'shelf-tray-scoop',
    category: 'shelf-tray',
    categoryLabel: 'Shelf-Tray & Scoop',
    defaultRuleMode: 'standard',
    label: 'Stepped Shelf-Tray + U-Scoop',
    usage: 'Stepped side visibility rails + U-scoop front retainer keeping stacked pouches/cans over 80% visible.',
  },
  {
    id: 'front-cutout',
    category: 'shelf-tray',
    categoryLabel: 'Shelf-Tray & Scoop',
    defaultRuleMode: 'solid',
    label: 'Front Display Window',
    usage: 'Front panel showcase cutout with 20mm reinforced corner pillars for upright retail picking.',
  },
  {
    id: 'u-scoop-front',
    category: 'shelf-tray',
    categoryLabel: 'Shelf-Tray & Scoop',
    defaultRuleMode: 'solid',
    label: 'U-Scoop Retail Picker',
    usage: 'Deep U-shaped front access cutout for fast single-item picking on tightly spaced shelves.',
  },
  {
    id: 'wrap-around',
    category: 'shelf-tray',
    categoryLabel: 'Shelf-Tray & Scoop',
    defaultRuleMode: 'standard',
    label: 'Lower Tray Wrap-Around',
    usage: 'Clean 360-degree horizontal perforation line separating upper sleeve into a neat lower display tray.',
  },
  {
    id: 'tear-strip',
    category: 'logistics',
    categoryLabel: 'Logistics & Vent',
    defaultRuleMode: 'fine',
    label: 'Horizontal Tear Strip',
    usage: '10mm easy-open pull band wrapping four body walls with a triangular front starter tab.',
  },
  {
    id: 'zipper-rule',
    category: 'logistics',
    categoryLabel: 'Logistics & Vent',
    defaultRuleMode: 'fine',
    label: 'Courier Zipper Rule',
    usage: '12mm reinforced courier tear-strip with an accessible pull-tab on Panel L1.',
  },
  {
    id: 'thumb-hole-punch',
    category: 'logistics',
    categoryLabel: 'Logistics & Vent',
    defaultRuleMode: 'solid',
    label: 'Thumb Hole Punch',
    usage: 'Semi-circular finger notch along top front crease for quick lid opening.',
  },
  {
    id: 'carry-handles',
    category: 'logistics',
    categoryLabel: 'Logistics & Vent',
    defaultRuleMode: 'solid',
    label: 'Side Carry Handles',
    usage: 'Ergonomic pill-shaped punch-out hand holds centered on both W1 and W2 side panels.',
  },
  {
    id: 'ventilation-slots',
    category: 'logistics',
    categoryLabel: 'Logistics & Vent',
    defaultRuleMode: 'solid',
    label: 'Airflow Ventilation Slots',
    usage: 'Dual vertical capsule vents on side panels for produce cooling and moisture release.',
  },
];

export type PaperCategory = 'kraft' | 'white-top' | 'testliner' | 'medium' | 'semi-chem';

export interface PaperGradeSpec {
  id: PaperGradeId;
  rct: number; // kgf/cm
  gsm: number; // g/m^2
  burstKpa: number; // Mullen single-ply burst contribution (kPa, ISO 2759)
  frictionCoeff: number; // Static/kinetic corrugated-on-corrugated outer CoF (μ)
  name: string;
  category: PaperCategory;
}

export const KRAFT_GRADES: Record<KraftGradeId, PaperGradeSpec> = {
  K110: { id: 'K110', rct: 1.1, gsm: 110, burstKpa: 310, frictionCoeff: 0.43, name: 'Kraft 110', category: 'kraft' },
  K125: { id: 'K125', rct: 1.4, gsm: 125, burstKpa: 365, frictionCoeff: 0.43, name: 'Kraft 125', category: 'kraft' },
  K140: { id: 'K140', rct: 1.6, gsm: 140, burstKpa: 410, frictionCoeff: 0.42, name: 'Kraft 140', category: 'kraft' },
  K150: { id: 'K150', rct: 1.75, gsm: 150, burstKpa: 445, frictionCoeff: 0.42, name: 'Kraft 150', category: 'kraft' },
  K175: { id: 'K175', rct: 1.95, gsm: 175, burstKpa: 520, frictionCoeff: 0.42, name: 'Kraft 175', category: 'kraft' },
  K200: { id: 'K200', rct: 2.2, gsm: 200, burstKpa: 605, frictionCoeff: 0.41, name: 'Kraft 200', category: 'kraft' },
  K220: { id: 'K220', rct: 2.45, gsm: 220, burstKpa: 665, frictionCoeff: 0.41, name: 'Kraft 220', category: 'kraft' },
  K250: { id: 'K250', rct: 2.8, gsm: 250, burstKpa: 760, frictionCoeff: 0.4, name: 'Kraft 250', category: 'kraft' },
  K275: { id: 'K275', rct: 3.1, gsm: 275, burstKpa: 835, frictionCoeff: 0.4, name: 'Kraft 275', category: 'kraft' },
  K300: { id: 'K300', rct: 3.4, gsm: 300, burstKpa: 910, frictionCoeff: 0.4, name: 'Kraft 300', category: 'kraft' },
};

export const WHITE_TOP_GRADES: Record<WhiteTopGradeId, PaperGradeSpec> = {
  WKL140: { id: 'WKL140', rct: 1.5, gsm: 140, burstKpa: 390, frictionCoeff: 0.34, name: 'White Top 140', category: 'white-top' },
  WKL175: { id: 'WKL175', rct: 1.85, gsm: 175, burstKpa: 495, frictionCoeff: 0.34, name: 'White Top 175', category: 'white-top' },
  WKL200: { id: 'WKL200', rct: 2.15, gsm: 200, burstKpa: 575, frictionCoeff: 0.33, name: 'White Top 200', category: 'white-top' },
};

export const TESTLINER_GRADES: Record<TestlinerGradeId, PaperGradeSpec> = {
  TL115: { id: 'TL115', rct: 0.95, gsm: 115, burstKpa: 235, frictionCoeff: 0.39, name: 'Testliner 115', category: 'testliner' },
  TL125: { id: 'TL125', rct: 1.15, gsm: 125, burstKpa: 265, frictionCoeff: 0.39, name: 'Testliner 125', category: 'testliner' },
  TL140: { id: 'TL140', rct: 1.3, gsm: 140, burstKpa: 300, frictionCoeff: 0.38, name: 'Testliner 140', category: 'testliner' },
  TL150: { id: 'TL150', rct: 1.45, gsm: 150, burstKpa: 330, frictionCoeff: 0.38, name: 'Testliner 150', category: 'testliner' },
  TL175: { id: 'TL175', rct: 1.65, gsm: 175, burstKpa: 390, frictionCoeff: 0.38, name: 'Testliner 175', category: 'testliner' },
  TL200: { id: 'TL200', rct: 1.9, gsm: 200, burstKpa: 455, frictionCoeff: 0.37, name: 'Testliner 200', category: 'testliner' },
};

export const MEDIUM_GRADES: Record<MediumGradeId, PaperGradeSpec> = {
  M100: { id: 'M100', rct: 0.8, gsm: 100, burstKpa: 170, frictionCoeff: 0.4, name: 'Medium 100', category: 'medium' },
  M110: { id: 'M110', rct: 0.9, gsm: 110, burstKpa: 190, frictionCoeff: 0.4, name: 'Medium 110', category: 'medium' },
  M125: { id: 'M125', rct: 0.95, gsm: 125, burstKpa: 215, frictionCoeff: 0.4, name: 'Medium 125', category: 'medium' },
  M140: { id: 'M140', rct: 1.15, gsm: 140, burstKpa: 245, frictionCoeff: 0.4, name: 'Medium 140', category: 'medium' },
  M150: { id: 'M150', rct: 1.35, gsm: 150, burstKpa: 270, frictionCoeff: 0.39, name: 'Medium 150', category: 'medium' },
  M165: { id: 'M165', rct: 1.5, gsm: 165, burstKpa: 305, frictionCoeff: 0.39, name: 'Medium 165', category: 'medium' },
  M180: { id: 'M180', rct: 1.65, gsm: 180, burstKpa: 340, frictionCoeff: 0.39, name: 'Medium 180', category: 'medium' },
  M200: { id: 'M200', rct: 1.85, gsm: 200, burstKpa: 380, frictionCoeff: 0.39, name: 'Medium 200', category: 'medium' },
  SC125: { id: 'SC125', rct: 1.2, gsm: 125, burstKpa: 260, frictionCoeff: 0.41, name: 'Semi-Chem 125', category: 'semi-chem' },
  SC150: { id: 'SC150', rct: 1.55, gsm: 150, burstKpa: 325, frictionCoeff: 0.41, name: 'Semi-Chem 150', category: 'semi-chem' },
  SC175: { id: 'SC175', rct: 1.85, gsm: 175, burstKpa: 390, frictionCoeff: 0.41, name: 'Semi-Chem 175', category: 'semi-chem' },
};

export const ALL_PAPER_GRADES: Record<PaperGradeId, PaperGradeSpec> = {
  ...KRAFT_GRADES,
  ...WHITE_TOP_GRADES,
  ...TESTLINER_GRADES,
  ...MEDIUM_GRADES,
};

// Legacy 10-entry BCT Pro table + extended factory Single & Double Wall calibrated ECT (kgf/cm)
export const BCT_PRO_STANDARD_ECT_TABLE: Record<string, number> = {
  'K125-M125-K125-B': 3.3,
  'K125-M125-K125-C': 3.5,
  'K150-M125-K150-B': 4.2,
  'K150-M125-K150-C': 4.5,
  'K150-M150-K150-B': 5.0,
  'K150-M150-K150-C': 5.3,
  'K175-M150-K175-B': 6.0,
  'K175-M150-K175-C': 6.4,
  'K200-M150-K200-B': 7.0,
  'K200-M150-K200-C': 7.5,
};

export const EXTENDED_STANDARD_ECT_TABLE: Record<string, number> = {
  ...BCT_PRO_STANDARD_ECT_TABLE,
  // Common Indonesian local converter single-wall recipes (incl. inner liner Medium 125 / Kraft 125)
  'K125-M125-M125-B': 3.05,
  'K125-M125-M125-C': 3.25,
  'K150-M125-M125-B': 3.65,
  'K150-M125-M125-C': 3.9,
  'K150-M125-K125-B': 3.85,
  'K150-M125-K125-C': 4.1,
  'K150-M150-M125-C': 4.45,
  'K175-M125-M125-C': 4.2,
  'K200-M125-K150-C': 5.2,
  'WKL140-M125-K125-C': 3.85,
  'WKL175-M150-K175-C': 6.1,
  'K125-M125-K125-E': 3.2,
  'K150-M125-K150-E': 4.1,
  'K150-M150-K150-A': 5.6,
  'K200-M150-K200-A': 7.9,
  'K275-M150-K275-C': 9.4,
  // Double-wall standard factory presets
  'K125-M125-M125-M125-K125-BC': 5.5,
  'K150-M125-M125-M125-K150-BC': 6.4,
  'K150-M125-M125-M125-M125-BC': 5.85,
  'K150-M150-M125-M150-K150-BC': 7.4,
  'K200-M150-M125-M150-K200-BC': 8.8,
  'K200-M150-K200-M150-K200-BC': 10.2,
  'K275-M150-K200-M150-K275-BC': 11.6,
  'K200-M150-M125-M150-K200-AB': 9.3,
};

export interface FluteSpec {
  id: BctFluteId;
  name: string;
  thickness: number;
  tuf1: number; // Real medium 1 take-up factor (TAPPI/FEFCO)
  tuf2?: number; // Real medium 2 take-up factor for double-wall
  legacyTuf: number; // Original BCT Pro TUF value
  fctKpa: number; // Flat Crush Test baseline (kPa, TAPPI T825)
  punctureJ: number; // Typical puncture resistance baseline (Joules)
  defaultEct: number;
  wall: 'single-wall' | 'double-wall';
}

export const FLUTE_SPECS: Record<BctFluteId, FluteSpec> = {
  F: { id: 'F', name: 'F-Flute (0.8mm)', thickness: 0.8, tuf1: 1.21, legacyTuf: 0.7, fctKpa: 310, punctureJ: 2.1, defaultEct: 26, wall: 'single-wall' },
  E: { id: 'E', name: 'E-Flute (1.5mm)', thickness: 1.5, tuf1: 1.26, legacyTuf: 0.85, fctKpa: 280, punctureJ: 2.6, defaultEct: 29, wall: 'single-wall' },
  B: { id: 'B', name: 'Flute B (3.18mm)', thickness: 3.18, tuf1: 1.33, legacyTuf: 1.0, fctKpa: 245, punctureJ: 3.8, defaultEct: 32, wall: 'single-wall' },
  C: { id: 'C', name: 'Flute C (3.97mm)', thickness: 3.97, tuf1: 1.44, legacyTuf: 1.4, fctKpa: 210, punctureJ: 4.4, defaultEct: 36, wall: 'single-wall' },
  A: { id: 'A', name: 'Flute A (4.76mm)', thickness: 4.76, tuf1: 1.54, legacyTuf: 1.6, fctKpa: 185, punctureJ: 5.0, defaultEct: 40, wall: 'single-wall' },
  EB: { id: 'EB', name: 'EB-Flute (4.5mm DW)', thickness: 4.5, tuf1: 1.26, tuf2: 1.33, legacyTuf: 2.1, fctKpa: 295, punctureJ: 6.2, defaultEct: 44, wall: 'double-wall' },
  BC: { id: 'BC', name: 'Flute BC (7.14mm DW)', thickness: 7.14, tuf1: 1.33, tuf2: 1.44, legacyTuf: 2.6, fctKpa: 260, punctureJ: 7.6, defaultEct: 48, wall: 'double-wall' },
  AB: { id: 'AB', name: 'Flute AB (7.94mm DW)', thickness: 7.94, tuf1: 1.54, tuf2: 1.33, legacyTuf: 2.8, fctKpa: 235, punctureJ: 8.4, defaultEct: 54, wall: 'double-wall' },
  AA: { id: 'AA', name: 'AA-Flute (10.0mm DW)', thickness: 10.0, tuf1: 1.54, tuf2: 1.54, legacyTuf: 3.1, fctKpa: 205, punctureJ: 9.2, defaultEct: 61, wall: 'double-wall' },
};

export const FLUTE_TYPES = {
  'single-wall': [FLUTE_SPECS.F, FLUTE_SPECS.E, FLUTE_SPECS.B, FLUTE_SPECS.C, FLUTE_SPECS.A],
  'double-wall': [FLUTE_SPECS.EB, FLUTE_SPECS.BC, FLUTE_SPECS.AB, FLUTE_SPECS.AA],
};

export const SAFETY_FACTOR_PRESETS: Array<{
  value: number;
  label: string;
  environment: string;
}> = [
  { value: 2.2, label: '2.2:1 · Light Warehouse', environment: 'Dry indoor storage, short term' },
  { value: 3, label: '3:1 · Standard Transit', environment: 'Controlled humidity, < 30 days' },
  { value: 4, label: '4:1 · Multi-Tier Stack', environment: 'General palletization, 30-90 days' },
  { value: 5, label: '5:1 · Industrial (BCT Pro)', environment: 'Standard BCT Pro default factor' },
  { value: 6, label: '6:1 · Export / Cold Chain', environment: 'High humidity or long sea freight' },
];

export const PRINT_COVERAGE_PRESETS: Array<{
  id: Exclude<PrintPresetId, 'custom'>;
  label: string;
  panels: [number, number, number, number]; // [L1, W1, L2, W2]
  colorsHint: number;
  summary: string;
}> = [
  {
    id: 'none',
    label: '0% Unprinted',
    panels: [0, 0, 0, 0],
    colorsHint: 0,
    summary: 'Plain kraft / white carton',
  },
  {
    id: 'shipping-mark',
    label: '~10% Mark',
    panels: [15, 5, 15, 5],
    colorsHint: 1,
    summary: 'Logo & handling icons on corners',
  },
  {
    id: 'brand-band',
    label: '~25% Band',
    panels: [35, 15, 35, 15],
    colorsHint: 2,
    summary: 'Brand banner + barcode belt',
  },
  {
    id: 'two-panel',
    label: '~50% Half',
    panels: [75, 25, 75, 25],
    colorsHint: 3,
    summary: 'Heavy main panels + light sides',
  },
  {
    id: 'full-flood',
    label: '~80% Flood',
    panels: [85, 75, 85, 75],
    colorsHint: 4,
    summary: 'Near full litho/flexo flood coat',
  },
];

export const CURRENCY_META: Record<CurrencyCode, { symbol: string; defaultPerSqm: number; step: number }> = {
  IDR: { symbol: 'Rp', defaultPerSqm: 12500, step: 500 },
  USD: { symbol: '$', defaultPerSqm: 1.45, step: 0.05 },
  EUR: { symbol: '€', defaultPerSqm: 1.35, step: 0.05 },
};

export interface DimensionLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  text: string;
  isVertical: boolean;
}

export interface HeadspaceDiagnostic {
  headspaceMm: number;
  clearanceLMm: number;
  clearanceWMm: number;
  volumeUtilizationPct: number;
  status: 'optimal' | 'tight' | 'excessive' | 'interference';
  message: string;
}

export interface DielinePaths {
  cutSegments: string[];
  creaseSegments: string[];
  perforationSegments: string[];
  perforationFoldSegments: string[];
  bleedPath: string;
  safeZoneBoxes: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
    panelName: string;
  }>;
  glueKnockoutPolygon: string;
  glueKnockoutBounds: {
    cx: number;
    cy: number;
    width: number;
    height: number;
  };
  fluteIndicator: {
    cx: number;
    cy: number;
    direction: FluteDirection;
    span: number;
  };
  productSimulationBoxes: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
    label: string;
    headspaceMm: number;
  }>;
  dimensionLines: DimensionLine[];
  barcodeBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
    frameWidth: number;
    frameHeight: number;
    hriHeight: number;
    magnificationPct: number;
    xDimensionMm: number;
    bearerThicknessMm: number;
    quietZoneMm: number;
    gs1Compliant: boolean;
    text: string;
  };
  width: number;
  height: number;
  panelCoords: {
    x0: number;
    x1: number;
    x2: number;
    x3: number;
    x4: number;
    x5: number;
    pL1_x1: number;
    pL1_x2: number;
    pW1_x1: number;
    pW1_x2: number;
    pL2_x1: number;
    pL2_x2: number;
    pW2_x1: number;
    pW2_x2: number;
    pGlue_x1: number;
    pGlue_x2: number;
    y0_L: number;
    y0_W: number;
    y1: number;
    y2: number;
    y3_L: number;
    y3_W: number;
    lPanel: number;
    wPanel: number;
    dPanel: number;
    flapL: number;
    flapW: number;
    topFlapL: number;
    topFlapW: number;
    hasTopFlaps: boolean;
  };
  info: {
    outerDimensions: BoxDimensions;
    innerDimensions: BoxDimensions;
    blankDimensions: { width: number; height: number };
    totalAreaSqM: number;
    depthAllowanceMm: number;
    headspaceDiagnostic?: HeadspaceDiagnostic;
  };
  dielineBounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  boundingBox: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
}

export interface BatchCostTier {
  qty: number;
  label: string;
  discountFactor: number;
  totalAreaSqm: number;
  unitCost: number;
  totalCost: number;
  statusLabel: string;
  statusHue: 'neutral' | 'info' | 'green';
}

export interface FieldDefectIssue {
  id: string;
  severity: 'critical' | 'warning' | 'pass';
  title: string;
  detail: string;
  fixLabel?: string;
  applyFix?: (cfg: BoxConfig) => BoxConfig;
}

export interface BctCorrectionFactors {
  printing: number;
  humidity: number;
  handling: number;
  stability: number;
  fluteGrain: number;
  combined: number;
}

export interface BctMethodResult {
  method: BctCalculationMethod;
  ectKgfCm: number;
  ectLbfIn: number;
  ectSource: EctSource;
  ectConfidence: EctConfidence;
  perimeterMm: number;
  perimeterBasis: 'outer' | 'inner';
  bctEstimateKgf: number;
  bctEstimateLbf: number;
  correctedBctKgf: number;
  correctedBctLbf: number;
  maxStackingLoadKgf: number;
  maxStackingLoadLbf: number;
  factors: BctCorrectionFactors;
}

export interface AuditFindingNote {
  id: string;
  title: string;
  detail: string;
  severity: 'info' | 'warning';
}

export interface EngineeringAnalysis {
  ectKgfCm: number;
  ectLbfIn: number;
  ectSource: EctSource;
  ectConfidence: EctConfidence;
  boardGsm: number;
  bctEstimateKgf: number;
  bctEstimateLbf: number;
  correctedBctKgf: number;
  correctedBctLbf: number;
  maxStackingLoadKgf: number;
  maxStackingLoadLbf: number;
  factors: BctCorrectionFactors;
  methodComparison: {
    tappi: BctMethodResult;
    bctPro: BctMethodResult;
    ectDiffPct: number;
    correctedBctDiffPct: number;
    auditFindings: AuditFindingNote[];
  };
  // Aliases kept consistent with active method for header/footer/Pre-flight
  theoreticalBctLbf: number;
  theoreticalBctKgf: number;
  effectiveBctLbf: number;
  effectiveBctKgf: number;
  safeLoadLbf: number;
  safeLoadKgf: number;
  fluteOrientationFactor: number;
  grossBlankAreaSqm: number;
  netBoxAreaSqm: number;
  scrapWastePct: number;
  unitCost: number;
  batchTiers: BatchCostTier[];
  fieldIssues: FieldDefectIssue[];
  criticalCount: number;
  warningCount: number;
  passCount: number;
}

export interface BctHistoryEntry {
  id: string;
  createdAt: string;
  label: string;
  calculationMethod?: BctCalculationMethod;
  boxStyle: BoxStyle;
  dimensions: BoxDimensions;
  fluteId: BctFluteId;
  fluteThickness: number;
  boardGrade: 'single-wall' | 'double-wall';
  fluteDirection: FluteDirection;
  materials: {
    top: PaperGradeId;
    medium: MediumGradeId;
    center?: PaperGradeId;
    medium2?: MediumGradeId;
    bottom: PaperGradeId;
  };
  customRct?: CustomRctOverrides;
  conditions: {
    printCoverage: number;
    panelPrintCoverage?: [number, number, number, number];
    printPresetId?: PrintPresetId;
    numberOfColors: number;
    relativeHumidity: number;
    handlingRisk: boolean;
    useActualEct: boolean;
    actualEctKgfCm: number | null;
  };
  safetyFactor: number;
  results: {
    ectKgfCm: number;
    ectSource: EctSource;
    bctEstimateKgf: number;
    correctedBctKgf: number;
    maxStackingLoadKgf: number;
    combinedFactor: number;
  };
}

export type UserRole = 'admin' | 'user';
export type UserStatus = 'pending' | 'active' | 'disabled';

export interface ClientAccessMetadata {
  origin: string;
  hostname: string;
  path: string;
  fullUrl: string;
  referrer: string;
  deviceSummary: string;
  screenInfo: string;
  displayMode: 'Standalone PWA' | 'Web Browser';
  timezone: string;
  timestamp: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  company: string;
  role: UserRole;
  status: UserStatus;
  accessOrigin: string;
  accessPath: string;
  accessReferrer: string;
  deviceSummary: string;
  timezone: string;
  lastIp: string;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AdminUserRecord extends AuthUser {
  historyCount: number;
  projectCount: number;
  failedLoginCount: number;
  lockedUntil: string | null;
  tokenVersion: number;
}

export type AuditEventCategory = 'all' | 'auth' | 'failed' | 'account' | 'security';

export interface AuditLogEntry {
  id: string;
  eventType: string;
  severity: 'info' | 'warning' | 'critical';
  actorEmail: string;
  targetEmail: string;
  detail: string;
  ipAddress: string;
  origin: string;
  createdAt: string;
}

export interface AdminAlertItem {
  id: string;
  severity: 'critical' | 'warning' | 'info' | 'ok';
  title: string;
  detail: string;
  actionTab?: 'users' | 'audit' | 'security';
  actionFilter?: 'pending' | 'all';
}

export interface AdminSmtpSettings {
  source: 'console' | 'env' | 'none';
  host: string;
  port: number;
  secure: boolean;
  user: string;
  from: string;
  hasPassword: boolean;
}

export interface AdminHealthRadar {
  generatedAt: string;
  runtime: {
    nodeVersion: string;
    platform: string;
    uptimeSec: number;
    rssMb: number;
    heapUsedMb: number;
    memLimitMb: number;
    rssPctOfLimit: number;
    dbSizeBytes: number;
    walSizeBytes: number;
    diskFreeBytes: number | null;
    diskTotalBytes: number | null;
  };
  environment: {
    nodeEnv: string;
    isHttps: boolean;
    trustProxy: boolean;
    cookieMode: string;
    hasStrongSessionSecret: boolean;
    hasEnvRecoveryKey: boolean;
    hasDbRecoveryKey: boolean;
    recoveryKeyRotatedAt: string | null;
    smtpConfigured: boolean;
    smtpSource: 'console' | 'env' | 'none';
    lastBackupAt: string | null;
    distBuilt: boolean;
    swBuilt: boolean;
  };
  metrics: {
    totalUsers: number;
    pendingUsers: number;
    stalePendingUsers: number;
    activeUsers: number;
    activeAdmins: number;
    disabledUsers: number;
    lockedUsers: number;
    failedLogins24h: number;
    totalProjects: number;
    totalHistory: number;
  };
  alerts: AdminAlertItem[];
}

export interface SavedBoxProject {
  id: string;
  name: string;
  boxStyle: BoxStyle;
  dimsSummary: string;
  config: BoxConfig;
  updatedAt: string;
}

// TOPS Pro Inspired Case Pack Right-Sizing & 3D Palletizer Types
export type PrimaryProductShape = 'carton' | 'cylinder' | 'pouch';

export interface CasePackConfig {
  shape: PrimaryProductShape;
  unitLengthMm: number; // Diameter when cylinder
  unitWidthMm: number; // Ignored (equal to length) when cylinder
  unitDepthMm: number; // Height when cylinder
  unitWeightGrams: number;
  bulgeL: number; // +/- mm bulge (expand or compress)
  bulgeW: number;
  bulgeD: number;
  unitsPerCase: number;
  dividerThicknessMm: number; // Vertical cell divider thickness between items
  layerPadThicknessMm: number; // Horizontal pad thickness between tiers inside case
  uprightOnly: boolean;
  cylinderStagger: boolean; // Honeycomb nesting for cylinders
  selectedPlanIndex: number;
}

export interface CasePackSolution {
  id: string;
  nx: number;
  ny: number;
  nz: number;
  unitOriented: [number, number, number];
  innerL: number;
  innerW: number;
  innerD: number;
  outerL: number;
  outerW: number;
  outerD: number;
  packingEfficiencyPct: number;
  staggered: boolean;
  palletAreaEstPct: number;
  netProductKg: number;
  caseGrossKg: number;
  description: string;
}

export type PalletStandardId = 'iso2-asia' | 'eur-epal' | 'gma-us' | 'cp-square' | 'custom';
export type PalletPatternType = 'column' | 'interlock' | 'pinwheel' | 'split-block';
export type PalletViewOverlayMode = 'normal' | 'lock-heatmap';
export type PalletLockStatus = 'locked' | 'column' | 'at-risk';
export type PalletEdgeStatus = 'optimal' | 'flush-risk' | 'excessive-underhang' | 'overhang';
export type PalletPerimeterAlignMode = 'auto' | 'flush' | 'compact';

export interface PalletInternalGap {
  x: number; // Center X in pallet mm coords
  z: number; // Center Z in pallet mm coords
  sizeX: number; // Gap span along X (mm)
  sizeZ: number; // Gap span along Z (mm)
  axis: 'x' | 'z'; // Direction of separation ('x' = horizontal gap, 'z' = vertical gap)
  gapMm: number; // Gap thickness along separation axis (mm)
}

export const PALLET_MARGIN_MIN_MM = -50;
export const PALLET_MARGIN_MAX_MM = 0;

export const PALLET_MARGIN_PRESETS: Array<{
  value: number;
  label: string;
  hint: string;
}> = [
  { value: 0, label: '0 Flush', hint: 'Maks 0 mm (tepat tepi dek · waspada bulge karton)' },
  { value: -5, label: '-5', hint: 'Inset 5 mm/sisi — gudang kering & efisiensi muat tinggi' },
  { value: -10, label: '-10 Std', hint: 'Standar aman 10 mm/sisi — anti-senggol & toleransi bulge' },
  { value: -15, label: '-15 ASRS', hint: 'Ekstra aman 15 mm/sisi — ASRS, kontainer, & dus mudah bulge' },
  { value: -25, label: '-25 Max', hint: 'Inset 25 mm/sisi — jarak aman besar (cek slip sheet)' },
];

export interface PalletConfig {
  standardId: PalletStandardId;
  palletLengthMm: number;
  palletWidthMm: number;
  palletHeightMm: number;
  maxStackHeightMm: number; // Including pallet height
  maxPalletWeightKg: number;
  allowedOverhangMm: number; // Per side: locked [-50, 0] mm (<= 0 = safe underhang / edge setback)
  patternType: PalletPatternType;
  patternAutoMode?: boolean;
  perimeterAlignMode?: PalletPerimeterAlignMode;
  useTierSheets: boolean;
  tierSheetThicknessMm: number;
  useSlipSheet: boolean;
  useCornerPosts: boolean;
  useTopLayerPlakban?: boolean;
  selectedCandidateKey?: string | null;
  recommendationMode?: 'smart' | 'max-density';
  manualLayerCount: number | null;
}

export interface PalletBoxPlacement {
  x: number; // Center offset from pallet center (mm) along pallet length
  y: number; // Bottom elevation (mm) from ground
  z: number; // Center offset from pallet center (mm) along pallet width
  sizeX: number; // Footprint along X (mm)
  sizeY: number; // Vertical height (mm)
  sizeZ: number; // Footprint along Z (mm)
  rotated90: boolean;
  angleDeg: 0 | 90 | 180 | 270;
  layer: number; // 1-indexed
  patternUsed?: PalletPatternType;
  bridgedBelowCount?: number;
  supportOverlapPct?: number;
  supportedCorners?: number; // 0..4 vertical corner columns resting cleanly on deck/carton below
  unsupportedCornerCoords?: Array<[number, number]>; // World [x, z] mm of unsupported corners
  lockStatus?: PalletLockStatus;
}

export interface PalletFaultLine {
  axis: 'x' | 'z';
  posMm: number;
  severity: 'critical' | 'warning';
  label: string;
}

export interface PalletStabilityMetrics {
  seamLockPct: number;
  topLayerLockPct: number;
  supportedCornerPct: number;
  unsupportedCornerCount: number;
  cornerCrushDerateFactor: number;
  faultLineCount: number;
  faultLines: PalletFaultLine[];
  cogOffsetXMm: number;
  cogOffsetZMm: number;
  cogOffsetMm: number;
  slendernessRatio: number;
  surfaceFrictionCoeff: number;
  noPlakbanSafeG: number;
  noPlakbanPass035g: boolean;
  noPlakbanPass045g: boolean;
  lateralGCapacity: number;
  burstStrengthKpa: number;
  burstMarginRatio: number;
  burstStatus: 'strong' | 'marginal' | 'weak';
  forkliftSafetyLabel: 'Stabil Kuat' | 'Butuh Plakban / Wrap' | 'Rawan Rubuh';
  stabilityScore: number;
  smartScore: number;
  recommendations: string[];
}

export interface PalletCandidateVariant {
  key: string;
  title: string;
  subtitle: string;
  basePattern: PalletPatternType;
  casesPerLayer: number;
  totalCases: number;
  areaEfficiencyPct: number;
  seamLockPct: number;
  supportedCornerPct: number;
  faultLineCount: number;
  noPlakbanSafeG: number;
  smartScore: number;
  bctStatus: 'safe' | 'marginal' | 'overload';
}

export interface PerfectionistSizeSuggestion {
  tier: 'micro-5mm' | 'sweetspot-20mm' | 'density-20mm';
  label: string;
  innerDims: BoxDimensions;
  outerDims: BoxDimensions;
  deltaL: number;
  deltaW: number;
  deltaD: number;
  patternType: PalletPatternType;
  patternSummary: string;
  casesPerLayer: number;
  totalCases: number;
  areaEfficiencyPct: number;
  seamLockPct: number;
  topLayerLockPct: number;
  supportedCornerPct: number;
  faultLineCount: number;
  noPlakbanSafeG: number;
  noPlakbanPass035g: boolean;
  bctStatus: 'safe' | 'marginal' | 'overload';
  effectiveBctKgf: number;
  smartScore: number;
  evaluation: PalletPatternEvaluation;
  reason: string;
}

export interface BoardSpecAdvice {
  recommendedRecipe: string;
  topLayer: PaperGradeId;
  mediumLayer: MediumGradeId;
  bottomLayer: PaperGradeId;
  fluteId: BctFluteId;
  burstKpa: number;
  ectKgfCm: number;
  bctKgf: number;
  bctGainPct: number;
  reason: string;
}

export interface PerfectionistTuningReport {
  baselineEval: PalletPatternEvaluation;
  baselineInner: BoxDimensions;
  baselineOuter: BoxDimensions;
  micro5mm: PerfectionistSizeSuggestion | null;
  sweetSpot20mm: PerfectionistSizeSuggestion | null;
  density20mm: PerfectionistSizeSuggestion | null;
  boardAdvice: BoardSpecAdvice | null;
}

export interface PalletPatternEvaluation {
  patternType: PalletPatternType;
  label: string;
  patternSummary?: string;
  casesPerLayer: number;
  layerCount: number;
  totalCases: number;
  totalUnits: number;
  footprintL: number;
  footprintW: number;
  overhangL: number;
  overhangW: number;
  underhangL: number;
  underhangW: number;
  effectivePalletL: number;
  effectivePalletW: number;
  edgeStatus: PalletEdgeStatus;
  perimeterAlignMode: PalletPerimeterAlignMode;
  perimeterAligned: boolean;
  maxInternalGapMm: number;
  oddInternalGaps: PalletInternalGap[];
  evenInternalGaps: PalletInternalGap[];
  areaEfficiencyPct: number;
  cubeEfficiencyPct: number;
  netLoadKg: number;
  grossLoadKg: number; // Includes ~22 kg pallet weight
  patternAlignmentFactor: number;
  overhangPenaltyFactor: number;
  effectivePalletBctKgf: number;
  bottomLayerLoadKgf: number;
  actualSafetyFactor: number;
  maxSafeLayersByBct: number;
  layerBreakdown: {
    maxByHeight: number;
    maxByWeight: number;
    maxByBct: number;
  };
  bctStatus: 'safe' | 'marginal' | 'overload';
  placements: PalletBoxPlacement[];
  layerHeightMm: number;
  totalStackHeightMm: number;
  layerPatterns: PalletPatternType[];
  layerCaseCounts: number[];
  stability: PalletStabilityMetrics;
  isSmartRecommended?: boolean;
}

export const PALLET_PRESETS: Array<{
  id: Exclude<PalletStandardId, 'custom'>;
  label: string;
  region: string;
  lengthMm: number;
  widthMm: number;
  heightMm: number;
}> = [
  {
    id: 'iso2-asia',
    label: 'ISO2 / Asia-ID (1200 × 1000 mm)',
    region: 'Indonesia / Asia / UK',
    lengthMm: 1200,
    widthMm: 1000,
    heightMm: 150,
  },
  {
    id: 'eur-epal',
    label: 'EUR / EPAL 1 (1200 × 800 mm)',
    region: 'Europe',
    lengthMm: 1200,
    widthMm: 800,
    heightMm: 144,
  },
  {
    id: 'gma-us',
    label: 'GMA / Grocery (1219 × 1016 mm)',
    region: 'North America 48"×40"',
    lengthMm: 1219,
    widthMm: 1016,
    heightMm: 140,
  },
  {
    id: 'cp-square',
    label: 'Square Export (1100 × 1100 mm)',
    region: 'Container / Japan / Sea',
    lengthMm: 1100,
    widthMm: 1100,
    heightMm: 140,
  },
];

export const DEFAULT_CASE_PACK_CONFIG: CasePackConfig = {
  shape: 'carton',
  unitLengthMm: 95,
  unitWidthMm: 70,
  unitDepthMm: 95,
  unitWeightGrams: 450,
  bulgeL: 0,
  bulgeW: 0,
  bulgeD: 0,
  unitsPerCase: 12,
  dividerThicknessMm: 0,
  layerPadThicknessMm: 0,
  uprightOnly: true,
  cylinderStagger: false,
  selectedPlanIndex: 0,
};

export const DEFAULT_PALLET_CONFIG: PalletConfig = {
  standardId: 'iso2-asia',
  palletLengthMm: 1200,
  palletWidthMm: 1000,
  palletHeightMm: 150,
  maxStackHeightMm: 1800,
  maxPalletWeightKg: 1000,
  allowedOverhangMm: -10,
  patternType: 'interlock',
  patternAutoMode: true,
  perimeterAlignMode: 'auto',
  useTierSheets: false,
  tierSheetThicknessMm: 3,
  useSlipSheet: true,
  useCornerPosts: false,
  useTopLayerPlakban: false,
  selectedCandidateKey: null,
  recommendationMode: 'smart',
  manualLayerCount: null,
};

export interface AgentApiKeyInfo {
  configured: boolean;
  prefix: string | null;
  updatedAt: string | null;
  skillVersion: string;
}


