import {
  DEFAULT_VEHICLE_CONFIG,
  FloorLoadingEvaluation,
  FloorLoadingSlot,
  INDONESIAN_VEHICLE_PRESETS,
  PalletConfig,
  PalletPatternEvaluation,
  PalletVehicleConfig,
  VehicleAuditWarning,
  VehicleHeightSyncResult,
  VehicleLoadingEvaluation,
  VehiclePalletPlacement,
  VehiclePalletVsFloorComparison,
  VehiclePresetId,
} from '../types';

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function buildVehicleConfigFromPreset(
  presetId: VehiclePresetId,
  current?: Partial<PalletVehicleConfig>
): PalletVehicleConfig {
  const base: PalletVehicleConfig = {
    ...DEFAULT_VEHICLE_CONFIG,
    ...current,
  };
  if (presetId === 'custom') {
    return {
      ...base,
      presetId: 'custom',
      name: current?.name && current.name.trim() ? current.name : 'Armada / Kontainer Kustom',
    };
  }
  const spec = INDONESIAN_VEHICLE_PRESETS.find((p) => p.id === presetId);
  if (!spec) return base;
  return {
    ...base,
    presetId: spec.id,
    name: spec.name,
    category: spec.category,
    loadingAccess: spec.loadingAccess,
    internalLengthMm: spec.internalLengthMm,
    internalWidthMm: spec.internalWidthMm,
    internalHeightMm: spec.internalHeightMm,
    doorWidthMm: spec.doorWidthMm,
    doorHeightMm: spec.doorHeightMm,
    reeferLoadLineMm: spec.reeferLoadLineMm,
    maxPayloadKg: spec.maxPayloadKg,
    nonStandardToleranceMm: spec.defaultNonStandardTolMm,
    sideWallClearanceMm: spec.defaultSideClearanceMm,
    palletGapMm: spec.defaultPalletGapMm,
    rearDoorClearanceMm: spec.defaultRearDoorClearanceMm,
    forkliftLiftClearanceMm: spec.defaultForkliftLiftClearanceMm,
  };
}

/**
 * Computes effective vertical clearance envelope inside a vehicle/container,
 * accounting for door-opening header (forklift lift clearance), internal roof margin,
 * and Reefer Red Load Line (airflow ceiling).
 */
export function computeVehicleVerticalLimits(vehicle: PalletVehicleConfig): {
  effectiveClearHeightMm: number;
  singleTierMaxHeightMm: number;
  doubleTierMaxHeightMm: number;
  bottleneck: 'door-header' | 'internal-roof' | 'reefer-load-line';
} {
  const liftClear = Math.max(0, vehicle.forkliftLiftClearanceMm);
  const roofMargin = Math.max(40, Math.round(liftClear * 0.55));
  const doorLimit = Math.max(400, vehicle.doorHeightMm - liftClear);
  const roofLimit = Math.max(400, vehicle.internalHeightMm - roofMargin);
  const reeferLimit =
    vehicle.reeferLoadLineMm && vehicle.reeferLoadLineMm > 0
      ? Math.max(400, vehicle.reeferLoadLineMm)
      : Infinity;

  let effectiveClearHeightMm = doorLimit;
  let bottleneck: 'door-header' | 'internal-roof' | 'reefer-load-line' = 'door-header';

  if (roofLimit < effectiveClearHeightMm) {
    effectiveClearHeightMm = roofLimit;
    bottleneck = 'internal-roof';
  }
  if (reeferLimit <= effectiveClearHeightMm) {
    effectiveClearHeightMm = reeferLimit;
    bottleneck = 'reefer-load-line';
  }

  const singleTierMaxHeightMm = Math.floor(effectiveClearHeightMm);
  const doubleGap = Math.max(20, vehicle.doubleStackGapMm);
  // In 2-tier stacking, the top pallet must be lifted onto the bottom pallet inside the container,
  // and each tier clears the door opening individually.
  const doubleTierMaxHeightMm = Math.max(
    350,
    Math.floor((effectiveClearHeightMm - doubleGap) / 2)
  );

  return {
    effectiveClearHeightMm: Math.floor(effectiveClearHeightMm),
    singleTierMaxHeightMm,
    doubleTierMaxHeightMm,
    bottleneck,
  };
}

/**
 * Computes the optimal synchronized pallet maxStackHeightMm for the active vehicle & stacking mode.
 * In 'auto' mode, compares 1-tier vs 2-tier total box layers per floor slot (checking BCT feasibility).
 */
export function computeSyncedPalletMaxHeight(
  vehicle: PalletVehicleConfig,
  pallet: PalletConfig,
  caseOuterDepthMm: number,
  caseGrossKg: number,
  correctedBctKgf: number,
  safetyFactor: number
): VehicleHeightSyncResult {
  const { effectiveClearHeightMm, singleTierMaxHeightMm, doubleTierMaxHeightMm, bottleneck } =
    computeVehicleVerticalLimits(vehicle);

  const boxD = Math.max(30, caseOuterDepthMm);
  const slipH = pallet.useSlipSheet ? 2 : 0;
  const tierPadH = pallet.useTierSheets ? Math.max(1, pallet.tierSheetThicknessMm) : 0;
  const baseOverhead = pallet.palletHeightMm + slipH;

  const layersForMaxH = (maxH: number) => {
    const avail = maxH - baseOverhead;
    if (avail < boxD) return 0;
    return Math.floor((avail + tierPadH) / (boxD + tierPadH));
  };

  const singleLayers = layersForMaxH(singleTierMaxHeightMm);
  const doubleLayers = layersForMaxH(doubleTierMaxHeightMm);

  let chosenTiers: 1 | 2 = 1;
  if (vehicle.stackingMode === 'double') {
    chosenTiers = 2;
  } else if (vehicle.stackingMode === 'single') {
    chosenTiers = 1;
  } else {
    // Auto mode: compare total layers per floor position (2 * doubleLayers vs singleLayers)
    // AND ensure double-stacking actually delivers more layers without violating severe BCT overload
    const totalDoubleLayers = doubleLayers * 2;
    const estBottomLoadDouble = Math.max(0, totalDoubleLayers - 1) * caseGrossKg + 2.5;
    const estDoubleSf =
      estBottomLoadDouble > 0.1 ? correctedBctKgf / estBottomLoadDouble : 99;
    const bctViableForDouble = estDoubleSf >= Math.max(1.8, safetyFactor * 0.65);

    if (doubleLayers >= 1 && totalDoubleLayers > singleLayers && bctViableForDouble) {
      chosenTiers = 2;
    } else {
      chosenTiers = 1;
    }
  }

  const targetMaxStackHeightMm =
    chosenTiers === 2 ? doubleTierMaxHeightMm : singleTierMaxHeightMm;

  const bottleneckLabel =
    bottleneck === 'reefer-load-line'
      ? `Red Load Line ${vehicle.reeferLoadLineMm} mm`
      : bottleneck === 'door-header'
      ? `Pintu ${vehicle.doorHeightMm} − Garpu ${vehicle.forkliftLiftClearanceMm} mm`
      : `Plafon ${vehicle.internalHeightMm} mm`;

  const summaryText =
    chosenTiers === 2
      ? `2 Tier (Double-Stack): maks ${doubleTierMaxHeightMm} mm/palet (${doubleLayers}×2 lyr · ${bottleneckLabel})`
      : `1 Tier (Single-Stack): maks ${singleTierMaxHeightMm} mm/palet (${singleLayers} lyr · ${bottleneckLabel})`;

  return {
    targetMaxStackHeightMm,
    chosenTiers,
    effectiveClearHeightMm,
    singleTierMaxHeightMm,
    doubleTierMaxHeightMm,
    singleLayersPerPallet: singleLayers,
    doubleLayersPerPallet: doubleLayers,
    bottleneck,
    summaryText,
  };
}

interface FloorCandidate {
  layoutUsed: 'lengthwise' | 'crosswise' | 'mixed';
  layoutLabel: string;
  slots: Array<{ x: number; z: number; sizeX: number; sizeZ: number; rotated90: boolean }>;
  usedLengthMm: number;
  usedWidthMm: number;
}

function buildUniformFloorCandidate(
  effL: number,
  effW: number,
  sizeX: number,
  sizeZ: number,
  gap: number,
  rotated90: boolean,
  layoutUsed: 'lengthwise' | 'crosswise',
  layoutLabel: string
): FloorCandidate {
  const colsX = Math.floor((effL + gap) / (sizeX + gap));
  const rowsZ = Math.floor((effW + gap) / (sizeZ + gap));
  if (colsX <= 0 || rowsZ <= 0) {
    return { layoutUsed, layoutLabel, slots: [], usedLengthMm: 0, usedWidthMm: 0 };
  }

  const usedL = colsX * sizeX + Math.max(0, colsX - 1) * gap;
  const usedW = rowsZ * sizeZ + Math.max(0, rowsZ - 1) * gap;
  const startZ = -usedW / 2;

  const slots: FloorCandidate['slots'] = [];
  for (let c = 0; c < colsX; c++) {
    const cx = c * (sizeX + gap) + sizeX / 2;
    for (let r = 0; r < rowsZ; r++) {
      const cz = startZ + r * (sizeZ + gap) + sizeZ / 2;
      slots.push({ x: cx, z: cz, sizeX, sizeZ, rotated90 });
    }
  }
  return { layoutUsed, layoutLabel, slots, usedLengthMm: usedL, usedWidthMm: usedW };
}

function buildMixedFloorCandidates(
  effL: number,
  effW: number,
  pL: number,
  pW: number,
  gap: number
): FloorCandidate[] {
  const candidates: FloorCandidate[] = [];

  // 1. Side-by-Side Pinwheel Lanes (e.g. 1200 + gap + 1000 = 2225 mm inside 2350 mm container!)
  if (pL + gap + pW <= effW + 0.5) {
    const usedW = pL + gap + pW;
    const zLeft = -usedW / 2 + pL / 2; // Lane A: rotated90 (sizeZ = pL, sizeX = pW)
    const zRight = -usedW / 2 + pL + gap + pW / 2; // Lane B: 0 deg (sizeZ = pW, sizeX = pL)

    const nA = Math.floor((effL + gap) / (pW + gap));
    const nB = Math.floor((effL + gap) / (pL + gap));

    const slots: FloorCandidate['slots'] = [];
    for (let i = 0; i < nA; i++) {
      slots.push({
        x: i * (pW + gap) + pW / 2,
        z: zLeft,
        sizeX: pW,
        sizeZ: pL,
        rotated90: true,
      });
    }
    for (let j = 0; j < nB; j++) {
      slots.push({
        x: j * (pL + gap) + pL / 2,
        z: zRight,
        sizeX: pL,
        sizeZ: pW,
        rotated90: false,
      });
    }

    const lenA = nA > 0 ? nA * pW + Math.max(0, nA - 1) * gap : 0;
    const lenB = nB > 0 ? nB * pL + Math.max(0, nB - 1) * gap : 0;

    // Check if an extra rotated pallet fits in the tail of Lane B if Lane B is shorter and full width allows,
    // or if a single crosswise pallet fits behind both lanes!
    const remAfterBoth = effL - Math.max(lenA, lenB) - (Math.max(lenA, lenB) > 0 ? gap : 0);
    if (remAfterBoth >= pW - 0.5 && pL <= effW + 0.5) {
      const extraRowsZ = Math.floor((effW + gap) / (pL + gap));
      const extraUsedW = extraRowsZ * pL + Math.max(0, extraRowsZ - 1) * gap;
      const tailX = Math.max(lenA, lenB) + gap + pW / 2;
      for (let r = 0; r < extraRowsZ; r++) {
        slots.push({
          x: tailX,
          z: -extraUsedW / 2 + r * (pL + gap) + pL / 2,
          sizeX: pW,
          sizeZ: pL,
          rotated90: true,
        });
      }
    }

    const maxUsedL = slots.reduce((m, s) => Math.max(m, s.x + s.sizeX / 2), 0);
    const minZ = slots.reduce((m, s) => Math.min(m, s.z - s.sizeZ / 2), Infinity);
    const maxZ = slots.reduce((m, s) => Math.max(m, s.z + s.sizeZ / 2), -Infinity);

    if (slots.length > 0) {
      candidates.push({
        layoutUsed: 'mixed',
        layoutLabel: 'Campuran / Pinwheel (L + W)',
        slots,
        usedLengthMm: maxUsedL,
        usedWidthMm: maxZ - minZ,
      });
    }
  }

  // 2. Tail-Split Mixed: k lengthwise columns + remaining length crosswise columns (and vice versa)
  const rows0 = Math.floor((effW + gap) / (pW + gap));
  const rows90 = Math.floor((effW + gap) / (pL + gap));

  if (rows0 > 0 && rows90 > 0) {
    const maxC0 = Math.floor((effL + gap) / (pL + gap));
    for (let c0 = 1; c0 <= maxC0; c0++) {
      const len0 = c0 * pL + (c0 - 1) * gap;
      const remL = effL - len0 - gap;
      if (remL < pW) continue;
      const c90 = Math.floor((remL + gap) / (pW + gap));
      if (c90 <= 0) continue;

      const slots: FloorCandidate['slots'] = [];
      const w0 = rows0 * pW + (rows0 - 1) * gap;
      for (let c = 0; c < c0; c++) {
        for (let r = 0; r < rows0; r++) {
          slots.push({
            x: c * (pL + gap) + pL / 2,
            z: -w0 / 2 + r * (pW + gap) + pW / 2,
            sizeX: pL,
            sizeZ: pW,
            rotated90: false,
          });
        }
      }
      const w90 = rows90 * pL + (rows90 - 1) * gap;
      const startX90 = len0 + gap;
      for (let c = 0; c < c90; c++) {
        for (let r = 0; r < rows90; r++) {
          slots.push({
            x: startX90 + c * (pW + gap) + pW / 2,
            z: -w90 / 2 + r * (pL + gap) + pL / 2,
            sizeX: pW,
            sizeZ: pL,
            rotated90: true,
          });
        }
      }

      candidates.push({
        layoutUsed: 'mixed',
        layoutLabel: 'Campuran (Baris Ekor Rotasi)',
        slots,
        usedLengthMm: startX90 + c90 * pW + (c90 - 1) * gap,
        usedWidthMm: Math.max(w0, w90),
      });
    }
  }

  return candidates;
}

/**
 * Full Vehicle & Container Loading Solver:
 * Solves optimal pallet arrangement (Lengthwise, Crosswise, Mixed/Pinwheel),
 * forklift clearances, Karoseri non-standard tolerances, door header limits,
 * payload weight cap, volume utilization, and Double-Stack BCT audit.
 */
export function solveVehicleLoading(
  vehicle: PalletVehicleConfig,
  pallet: PalletConfig,
  evaluation: PalletPatternEvaluation,
  correctedBctKgf: number,
  safetyFactor: number
): VehicleLoadingEvaluation {
  const wallTol = Math.max(0, vehicle.nonStandardToleranceMm);
  const sideClear = Math.max(0, vehicle.sideWallClearanceMm);
  const gap = Math.max(0, vehicle.palletGapMm);
  const rearClear = Math.max(0, vehicle.rearDoorClearanceMm);

  const limitingWidthMm =
    vehicle.loadingAccess === 'side-wingbox'
      ? vehicle.internalWidthMm
      : Math.min(vehicle.internalWidthMm, vehicle.doorWidthMm);

  const effL = Math.max(100, vehicle.internalLengthMm - rearClear - wallTol);
  const effW = Math.max(100, limitingWidthMm - 2 * (sideClear + wallTol));

  const { effectiveClearHeightMm, bottleneck } = computeVehicleVerticalLimits(vehicle);

  // Actual pallet outer floor footprint (includes any carton overhang if present)
  const pL = Math.max(pallet.palletLengthMm, evaluation.footprintL);
  const pW = Math.max(pallet.palletWidthMm, evaluation.footprintW);

  const candLen = buildUniformFloorCandidate(
    effL,
    effW,
    pL,
    pW,
    gap,
    false,
    'lengthwise',
    'Sejajar Panjang (0°)'
  );
  const candCross = buildUniformFloorCandidate(
    effL,
    effW,
    pW,
    pL,
    gap,
    true,
    'crosswise',
    'Melintang Lebar (90°)'
  );
  const candMixedList = buildMixedFloorCandidates(effL, effW, pL, pW, gap);

  let bestMixed: FloorCandidate = {
    layoutUsed: 'mixed',
    layoutLabel: 'Campuran / Pinwheel',
    slots: [],
    usedLengthMm: 0,
    usedWidthMm: 0,
  };
  for (const mc of candMixedList) {
    if (
      mc.slots.length > bestMixed.slots.length ||
      (mc.slots.length === bestMixed.slots.length && mc.usedWidthMm < bestMixed.usedWidthMm)
    ) {
      bestMixed = mc;
    }
  }

  let chosen: FloorCandidate;
  if (vehicle.layoutPreference === 'lengthwise') {
    chosen = candLen;
  } else if (vehicle.layoutPreference === 'crosswise') {
    chosen = candCross;
  } else if (vehicle.layoutPreference === 'mixed' && bestMixed.slots.length > 0) {
    chosen = bestMixed;
  } else {
    // Auto: pick highest pallet count; break ties by preferring uniform layout with more side clearance
    const pool = [candLen, candCross, ...(bestMixed.slots.length > 0 ? [bestMixed] : [])];
    pool.sort((a, b) => {
      if (b.slots.length !== a.slots.length) return b.slots.length - a.slots.length;
      if (a.layoutUsed !== 'mixed' && b.layoutUsed === 'mixed') return -1;
      if (b.layoutUsed !== 'mixed' && a.layoutUsed === 'mixed') return 1;
      return a.usedWidthMm - b.usedWidthMm;
    });
    chosen = pool[0];
  }

  // Sort floor slots logically from front bulkhead -> rear door, left -> right
  const sortedFloorSlots = [...chosen.slots].sort((a, b) => {
    if (Math.abs(a.x - b.x) > 80) return a.x - b.x;
    return a.z - b.z;
  });

  // Determine active tiers (1 vs 2) based on actual current pallet stack height
  const palletH = Math.max(pallet.palletHeightMm, evaluation.totalStackHeightMm);
  const doubleGap = Math.max(20, vehicle.doubleStackGapMm);
  const twoTierHeight = palletH * 2 + doubleGap;
  const canPhysicallyDoubleStack = twoTierHeight <= effectiveClearHeightMm + 1;

  let activeTiers: 1 | 2 = 1;
  if (vehicle.stackingMode === 'double') {
    activeTiers = 2;
  } else if (vehicle.stackingMode === 'single') {
    activeTiers = 1;
  } else {
    activeTiers = canPhysicallyDoubleStack ? 2 : 1;
  }

  const totalStackHeightInVehicleMm =
    activeTiers === 2 ? round1(palletH * 2) : round1(palletH);
  const fitsHeight =
    activeTiers === 2
      ? twoTierHeight <= effectiveClearHeightMm + 1
      : palletH <= effectiveClearHeightMm + 1;

  const fitsDoorWidth = chosen.usedWidthMm <= limitingWidthMm + 0.5 && sortedFloorSlots.length > 0;

  // Payload weight cap
  const palletGrossKg = Math.max(1, evaluation.grossLoadKg);
  const spaceMaxPallets = sortedFloorSlots.length * activeTiers;
  const weightMaxPallets = Math.floor(vehicle.maxPayloadKg / palletGrossKg);
  const totalPallets = Math.min(spaceMaxPallets, weightMaxPallets);
  const limitedByWeight = weightMaxPallets < spaceMaxPallets;

  // Build actual placed pallets (front bulkhead offset = wallTol)
  const placements: VehiclePalletPlacement[] = [];
  let seq = 1;
  for (let tierIdx = 1; tierIdx <= activeTiers; tierIdx++) {
    for (const s of sortedFloorSlots) {
      if (placements.length >= totalPallets) break;
      placements.push({
        index: seq++,
        x: round1(wallTol + s.x),
        z: round1(s.z),
        sizeX: round1(s.sizeX),
        sizeZ: round1(s.sizeZ),
        rotated90: s.rotated90,
        tier: tierIdx as 1 | 2,
      });
    }
  }

  const floorPlacements = placements.filter((p) => p.tier === 1);
  const floorPalletCount = floorPlacements.length;
  const actualUsedL =
    floorPlacements.length > 0
      ? Math.max(...floorPlacements.map((p) => p.x + p.sizeX / 2)) - wallTol
      : 0;
  const actualMinZ =
    floorPlacements.length > 0
      ? Math.min(...floorPlacements.map((p) => p.z - p.sizeZ / 2))
      : 0;
  const actualMaxZ =
    floorPlacements.length > 0
      ? Math.max(...floorPlacements.map((p) => p.z + p.sizeZ / 2))
      : 0;
  const actualUsedW = floorPlacements.length > 0 ? actualMaxZ - actualMinZ : 0;

  const actualSideClearancePerSideMm =
    floorPlacements.length > 0 ? round1((limitingWidthMm - actualUsedW) / 2) : round1(limitingWidthMm / 2);
  const actualRearDoorClearanceMm =
    floorPlacements.length > 0
      ? round1(vehicle.internalLengthMm - (wallTol + actualUsedL))
      : vehicle.internalLengthMm;
  const actualVerticalDoorClearanceMm = round1(
    vehicle.doorHeightMm - (activeTiers === 2 ? palletH * 2 : palletH)
  );
  const actualVerticalRoofClearanceMm = round1(
    vehicle.internalHeightMm - (activeTiers === 2 ? palletH * 2 : palletH)
  );

  // Totals & Utilization
  const totalCases = totalPallets * evaluation.totalCases;
  const totalUnits = totalPallets * evaluation.totalUnits;
  const totalGrossWeightKg = round1(totalPallets * evaluation.grossLoadKg);
  const totalNetCargoKg = round1(totalPallets * evaluation.netLoadKg);
  const weightUtilizationPct = round1(
    Math.min(999, (totalGrossWeightKg / Math.max(1, vehicle.maxPayloadKg)) * 100)
  );

  const vehicleFloorArea = Math.max(1, vehicle.internalLengthMm * vehicle.internalWidthMm);
  const usedFloorArea = floorPlacements.reduce((sum, p) => sum + p.sizeX * p.sizeZ, 0);
  const floorUtilizationPct = round1(Math.min(100, (usedFloorArea / vehicleFloorArea) * 100));

  const vehicleVolume = Math.max(
    1,
    vehicle.internalLengthMm * vehicle.internalWidthMm * vehicle.internalHeightMm
  );
  const usedCargoVolume =
    totalPallets * evaluation.footprintL * evaluation.footprintW * evaluation.totalStackHeightMm;
  const volumeUtilizationPct = round1(Math.min(100, (usedCargoVolume / vehicleVolume) * 100));

  // Double-Stack BCT Audit (bottom layer of Tier 1 carries its own upper layers + entire Tier 2 pallet!)
  let doubleStackBottomLoadKgf: number | null = null;
  let doubleStackSafetyFactor: number | null = null;
  let doubleStackBctStatus: VehicleLoadingEvaluation['doubleStackBctStatus'] = 'n/a';

  if (activeTiers === 2 && totalPallets > floorPalletCount) {
    const bottomCases = Math.max(1, evaluation.layerCaseCounts[0] || evaluation.casesPerLayer || 1);
    const extraPerBottomBoxKgf = evaluation.grossLoadKg / bottomCases;
    doubleStackBottomLoadKgf = round1(evaluation.bottomLayerLoadKgf + extraPerBottomBoxKgf);
    doubleStackSafetyFactor =
      doubleStackBottomLoadKgf > 0.1
        ? round1(evaluation.effectivePalletBctKgf / doubleStackBottomLoadKgf)
        : 99.9;
    if (doubleStackSafetyFactor < 1.5) {
      doubleStackBctStatus = 'overload';
    } else if (doubleStackSafetyFactor < safetyFactor) {
      doubleStackBctStatus = 'marginal';
    } else {
      doubleStackBctStatus = 'safe';
    }
  }

  // Operational & Indonesian Field Audit Warnings
  const warnings: VehicleAuditWarning[] = [];

  if (sortedFloorSlots.length === 0) {
    warnings.push({
      severity: 'critical',
      title: 'Palet Tidak Muat di Ruang Armada',
      detail: `Lebar efektif ${Math.round(effW)} mm atau panjang efektif ${Math.round(effL)} mm lebih kecil dari dimensi palet ${Math.round(pL)}×${Math.round(pW)} mm.`,
    });
  }

  if (!fitsHeight) {
    warnings.push({
      severity: 'critical',
      title: 'Tinggi Tumpukan Melebihi Batas Pintu / Plafon',
      detail: `Tinggi total ${totalStackHeightInVehicleMm} mm (${activeTiers} tier) melebihi batas aman ${effectiveClearHeightMm} mm. Aktifkan Auto-Sinkron Tinggi Palet atau kurangi jumlah layer.`,
    });
  }

  if (limitedByWeight) {
    warnings.push({
      severity: 'warning',
      title: `Dibatasi Batas Payload (${vehicle.maxPayloadKg.toLocaleString('id-ID')} kg)`,
      detail: `Ruang lantai muat ${spaceMaxPallets} palet, namun batas muat berat membatasi menjadi ${totalPallets} palet (${totalGrossWeightKg.toLocaleString('id-ID')} kg).`,
    });
  }

  if (doubleStackBctStatus === 'overload') {
    warnings.push({
      severity: 'critical',
      title: 'BCT Layer Bawah Tidak Kuat Double-Stack (2 Tier)',
      detail: `Beban dus dasar naik ke ${doubleStackBottomLoadKgf} kgf (SF ${doubleStackSafetyFactor}:1 vs target ${safetyFactor}:1). Gunakan 1 Tier, tambah Corner Posts, atau naikkan grade kertas/flute.`,
    });
  } else if (doubleStackBctStatus === 'marginal') {
    warnings.push({
      severity: 'warning',
      title: 'Margin BCT Double-Stack Tipis',
      detail: `Safety Factor 2-tier turun ke ${doubleStackSafetyFactor}:1 (target ${safetyFactor}:1). Disarankan pasang Tier Sheet & Corner Posts pada palet bawah.`,
    });
  }

  if (floorPalletCount > 0 && actualSideClearancePerSideMm < 25) {
    warnings.push({
      severity: 'warning',
      title: `Clearance Sisi Dinding Sangat Sempit (${actualSideClearancePerSideMm} mm/sisi)`,
      detail:
        'Berisiko menyenggol dinding baja bergelombang kontainer/box saat manuver forklift. Pastikan overhang dus = 0 mm dan operator sangat presisi.',
    });
  } else if (floorPalletCount > 0 && actualSideClearancePerSideMm > 110) {
    warnings.push({
      severity: 'info',
      title: `Ruang Samping Lebar (±${actualSideClearancePerSideMm} mm/sisi)`,
      detail:
        'Disarankan memasang dunnage airbag / papan pengganjal samping agar tumpukan palet tidak bergeser saat perjalanan jauh.',
    });
  }

  if (vehicle.category === 'container-reefer' && vehicle.reeferLoadLineMm) {
    warnings.push({
      severity: 'info',
      title: `Aturan Kontainer Reefer (Load Line ${vehicle.reeferLoadLineMm} mm)`,
      detail:
        'Dilarang menumpuk melewati garis merah sirkulasi dingin, dan batasi beban gandar forklift <= 5.460 kg agar lantai aluminium T-bar tidak penyok.',
    });
  }

  if (
    vehicle.loadingAccess === 'rear' &&
    vehicle.doorHeightMm < vehicle.internalHeightMm - 30
  ) {
    warnings.push({
      severity: 'info',
      title: `Batas Pintu Masuk ${vehicle.doorHeightMm} mm (vs Plafon ${vehicle.internalHeightMm} mm)`,
      detail:
        'Gunakan forklift dengan Full Free-Lift Mast agar tiang mast tidak menabrak ambang pintu maupun plafon saat masuk ruang muat.',
    });
  }

  if (vehicle.category === 'truck-box' || vehicle.category === 'truck-wingbox') {
    warnings.push({
      severity: 'info',
      title: 'Waspada Selisih Dimensi Karoseri Truk Indonesia',
      detail: `Toleransi ketidakstandaran aktif ±${wallTol} mm/sisi. Ukur ulang dimensi dalam aktual truk armada sebelum stuffing penuh.`,
    });
  }

  let overallStatus: VehicleLoadingEvaluation['overallStatus'] = 'optimal';
  if (warnings.some((w) => w.severity === 'critical')) {
    overallStatus = 'critical';
  } else if (warnings.some((w) => w.severity === 'warning')) {
    overallStatus = 'warning';
  }

  return {
    vehicleName: vehicle.name,
    layoutUsed: chosen.layoutUsed,
    layoutLabel: chosen.layoutLabel,
    activeTiers,
    floorPalletCount,
    spaceMaxPallets,
    weightMaxPallets,
    totalPallets,
    limitedByWeight,
    totalCases,
    totalUnits,
    totalGrossWeightKg,
    totalNetCargoKg,
    weightUtilizationPct,
    floorUtilizationPct,
    volumeUtilizationPct,
    effectiveLengthMm: round1(effL),
    effectiveWidthMm: round1(effW),
    effectiveClearHeightMm,
    heightBottleneck: bottleneck,
    actualSideClearancePerSideMm,
    actualRearDoorClearanceMm,
    actualVerticalDoorClearanceMm,
    actualVerticalRoofClearanceMm,
    usedLengthMm: round1(actualUsedL),
    usedWidthMm: round1(actualUsedW),
    totalStackHeightInVehicleMm,
    fitsHeight,
    fitsDoorWidth,
    doubleStackBottomLoadKgf,
    doubleStackSafetyFactor,
    doubleStackBctStatus,
    overallStatus,
    placements,
    warnings,
  };
}

/**
 * Floor Loading (Loose-Load / Hand-Stacking / Deadpiling) Solver:
 * Packs master cartons directly onto the container/truck floor without wooden pallets
 * to maximize cube utilization (+15% to +35%), while auditing tall-stack bottom-layer BCT,
 * dunnage/airbag voids, Reefer Red Load Line, and manual loading duration.
 */
export function solveFloorLoading(
  vehicle: PalletVehicleConfig,
  caseOuterDims: { length: number; width: number; depth: number },
  caseGrossKg: number,
  unitsPerCase: number,
  correctedBctKgf: number,
  safetyFactor: number
): FloorLoadingEvaluation {
  const cL = Math.max(40, caseOuterDims.length);
  const cW = Math.max(40, caseOuterDims.width);
  const cD = Math.max(30, caseOuterDims.depth);

  const wallTol = Math.max(0, vehicle.nonStandardToleranceMm);
  const handWallClear = Math.max(5, vehicle.floorWallClearanceMm ?? 15);
  const rearClear = Math.max(40, Math.min(vehicle.rearDoorClearanceMm, 100));
  const cartonGap = 2; // 2 mm natural hand-stacking carton contact clearance

  const limitingWidthMm =
    vehicle.loadingAccess === 'side-wingbox'
      ? vehicle.internalWidthMm
      : Math.min(vehicle.internalWidthMm, vehicle.doorWidthMm);

  const effL = Math.max(0, vehicle.internalLengthMm - 2 * wallTol - rearClear);
  const effW = Math.max(0, limitingWidthMm - 2 * wallTol - 2 * handWallClear);

  // Vertical limit for hand-stacked loose loading (no forklift mast/fork lift needed inside!)
  const roofBuffer = 40; // Hand clearance to slide top carton under ceiling
  const roofCap = Math.max(400, vehicle.internalHeightMm - wallTol - roofBuffer);
  // Hand-stacked cartons pass through door individually (only top carton needs ~30 mm door drop margin if near door)
  const doorCap = Math.max(400, vehicle.doorHeightMm - wallTol - 25);
  const reeferCap =
    vehicle.category === 'container-reefer' && vehicle.reeferLoadLineMm
      ? Math.max(400, vehicle.reeferLoadLineMm - 20)
      : Infinity;

  let effectiveClearHeightMm = roofCap;
  let heightBottleneck: FloorLoadingEvaluation['heightBottleneck'] = 'internal-roof';
  if (reeferCap < effectiveClearHeightMm) {
    effectiveClearHeightMm = reeferCap;
    heightBottleneck = 'reefer-load-line';
  }
  if (doorCap < effectiveClearHeightMm) {
    effectiveClearHeightMm = doorCap;
    heightBottleneck = 'door-header';
  }

  const cand0 = buildUniformFloorCandidate(
    effL,
    effW,
    cL,
    cW,
    cartonGap,
    false,
    'lengthwise',
    'Memanjang (0°)'
  );
  const cand90 = buildUniformFloorCandidate(
    effL,
    effW,
    cW,
    cL,
    cartonGap,
    true,
    'crosswise',
    'Melintang (90°)'
  );
  const mixedCands = buildMixedFloorCandidates(effL, effW, cL, cW, cartonGap);

  let pool: FloorCandidate[];
  if (vehicle.layoutPreference === 'lengthwise') {
    pool = [cand0];
  } else if (vehicle.layoutPreference === 'crosswise') {
    pool = [cand90];
  } else if (vehicle.layoutPreference === 'mixed') {
    pool = mixedCands.length > 0 ? mixedCands : [cand0, cand90];
  } else {
    pool = [cand0, cand90, ...mixedCands];
  }

  const chosen = pool.reduce((best, cur) => {
    if (cur.slots.length !== best.slots.length) {
      return cur.slots.length > best.slots.length ? cur : best;
    }
    const curCompact = cur.usedWidthMm + cur.usedLengthMm * 0.25;
    const bestCompact = best.usedWidthMm + best.usedLengthMm * 0.25;
    return curCompact < bestCompact ? cur : best;
  }, pool[0]);

  const sortedSlots: FloorLoadingSlot[] = [...chosen.slots]
    .sort((a, b) => (Math.abs(a.x - b.x) > 15 ? a.x - b.x : a.z - b.z))
    .map((s) => ({
      x: round1(wallTol + s.x),
      z: round1(s.z),
      sizeX: s.sizeX,
      sizeZ: s.sizeZ,
      rotated90: s.rotated90,
    }));

  const casesPerLayer = sortedSlots.length;
  const maxLayersByHeight =
    casesPerLayer > 0 ? Math.max(1, Math.floor(effectiveClearHeightMm / cD)) : 0;

  // Floor-loading column/loose alignment factor (~0.92 for hand-stacked column alignment)
  const effectiveFloorBct = Math.max(1, correctedBctKgf * 0.92);
  const safeCaseKg = Math.max(0.1, caseGrossKg);
  const safeFactor = Math.max(1, safetyFactor);
  const maxSafeLayersByBct = Math.max(
    1,
    Math.floor(effectiveFloorBct / (safeCaseKg * safeFactor)) + 1
  );

  const spaceMaxCases = casesPerLayer * maxLayersByHeight;
  const weightMaxCases = Math.max(0, Math.floor(vehicle.maxPayloadKg / safeCaseKg));
  const totalCases = Math.min(spaceMaxCases, weightMaxCases);
  const limitedByWeight = spaceMaxCases > weightMaxCases && weightMaxCases > 0;
  const layersLoaded =
    casesPerLayer > 0 ? Math.min(maxLayersByHeight, Math.ceil(totalCases / casesPerLayer)) : 0;

  const stackHeightMm = Math.round(layersLoaded * cD);
  const totalUnits = totalCases * Math.max(1, unitsPerCase);
  const totalGrossWeightKg = round1(totalCases * safeCaseKg);

  const vehicleVolumeCbm = round1(
    (vehicle.internalLengthMm * vehicle.internalWidthMm * vehicle.internalHeightMm) / 1e9
  );
  const cargoVolumeCbm = round1((totalCases * cL * cW * cD) / 1e9);

  const usedLengthMm =
    sortedSlots.length > 0
      ? round1(Math.max(...sortedSlots.map((s) => s.x + s.sizeX / 2)) - wallTol)
      : 0;
  const usedWidthMm =
    sortedSlots.length > 0
      ? round1(
          Math.max(...sortedSlots.map((s) => s.z + s.sizeZ / 2)) -
            Math.min(...sortedSlots.map((s) => s.z - s.sizeZ / 2))
        )
      : 0;

  const actualSideVoidPerSideMm =
    sortedSlots.length > 0 ? round1(Math.max(0, (vehicle.internalWidthMm - usedWidthMm) / 2)) : 0;
  const actualRearVoidMm =
    sortedSlots.length > 0 ? round1(Math.max(0, vehicle.internalLengthMm - wallTol - usedLengthMm)) : 0;
  const actualVerticalRoofClearanceMm = Math.round(vehicle.internalHeightMm - stackHeightMm);
  const needsDunnageAirbag =
    sortedSlots.length > 0 && (actualSideVoidPerSideMm >= 60 || actualRearVoidMm >= 140);

  const vehicleFloorArea = Math.max(1, vehicle.internalLengthMm * vehicle.internalWidthMm);
  const usedFloorArea = sortedSlots.reduce((acc, s) => acc + s.sizeX * s.sizeZ, 0);
  const floorUtilizationPct = round1(Math.min(100, (usedFloorArea / vehicleFloorArea) * 100));

  const vehicleVolMm3 = Math.max(
    1,
    vehicle.internalLengthMm * vehicle.internalWidthMm * vehicle.internalHeightMm
  );
  const volumeUtilizationPct = round1(
    Math.min(100, ((totalCases * cL * cW * cD) / vehicleVolMm3) * 100)
  );
  const weightUtilizationPct = round1(
    Math.min(150, (totalGrossWeightKg / Math.max(1, vehicle.maxPayloadKg)) * 100)
  );

  // Bottom-layer BCT audit for loose-stacked full height
  const bottomLayerLoadKgf = round1(Math.max(0, layersLoaded - 1) * safeCaseKg);
  const bottomLayerSafetyFactor =
    bottomLayerLoadKgf > 0.05 ? round1(effectiveFloorBct / bottomLayerLoadKgf) : 99;
  const bctStatus: FloorLoadingEvaluation['bctStatus'] =
    bottomLayerSafetyFactor < 1.2
      ? 'overload'
      : bottomLayerSafetyFactor < safeFactor
      ? 'marginal'
      : 'safe';

  // Typical 2-person warehouse crew hand-stacking speed (~260 cartons/hour)
  const estimatedHandLoadMinutes = totalCases > 0 ? Math.max(15, Math.round((totalCases / 260) * 60)) : 0;

  const warnings: VehicleAuditWarning[] = [];

  if (casesPerLayer === 0) {
    warnings.push({
      severity: 'critical',
      title: 'Karton Tidak Muat di Ruang Armada',
      detail: `Dimensi luar dus ${Math.round(cL)}×${Math.round(cW)} mm melebihi ruang efektif armada.`,
    });
  }

  if (bctStatus === 'overload') {
    warnings.push({
      severity: 'critical',
      title: `BCT Lapisan Bawah Overload (${layersLoaded} Layer Floor-Stack)`,
      detail: `Beban dus dasar ${bottomLayerLoadKgf} kgf (SF ${bottomLayerSafetyFactor}:1; batas aman BCT maks ${maxSafeLayersByBct} layer). Naikkan grade board/flute atau batasi tinggi tumpukan manual.`,
    });
  } else if (bctStatus === 'marginal') {
    warnings.push({
      severity: 'warning',
      title: `Margin BCT Tipis pada ${layersLoaded} Layer (SF ${bottomLayerSafetyFactor}:1 vs ${safeFactor}:1)`,
      detail: `Tumpukan floor-loading setinggi ${stackHeightMm} mm melampaui target SF ${safeFactor}:1 (aman penuh <= ${maxSafeLayersByBct} layer). Pastikan susunan kolom rapi atau naikkan ECT.`,
    });
  }

  if (limitedByWeight) {
    warnings.push({
      severity: 'warning',
      title: `Dibatasi Payload Maksimum (${vehicle.maxPayloadKg.toLocaleString('id-ID')} kg)`,
      detail: `Ruang fisik muat ${spaceMaxCases.toLocaleString('id-ID')} dus, tetapi kapasitas berat membatasi ke ${totalCases.toLocaleString('id-ID')} dus.`,
    });
  }

  if (needsDunnageAirbag) {
    warnings.push({
      severity: 'info',
      title: `Disarankan Dunnage / Airbag (Sisi ±${actualSideVoidPerSideMm} mm · Belakang ${actualRearVoidMm} mm)`,
      detail:
        'Pasang airbag pengisi celah atau lashing net di dekat pintu belakang agar tumpukan karton tidak roboh saat kontainer dibuka.',
    });
  }

  if (vehicle.category === 'container-reefer' && vehicle.reeferLoadLineMm) {
    warnings.push({
      severity: 'info',
      title: `Sirkulasi Udara Reefer (Red Load Line ${vehicle.reeferLoadLineMm} mm)`,
      detail:
        'Pastikan saluran lantai T-bar tidak tertutup penuh oleh karton dan tinggi susunan tidak melewati garis merah evaporator.',
    });
  }

  let overallStatus: FloorLoadingEvaluation['overallStatus'] = 'optimal';
  if (warnings.some((w) => w.severity === 'critical')) {
    overallStatus = 'critical';
  } else if (warnings.some((w) => w.severity === 'warning')) {
    overallStatus = 'warning';
  }

  return {
    vehicleName: vehicle.name,
    layoutUsed: chosen.layoutUsed,
    layoutLabel: chosen.layoutLabel,
    casesPerLayer,
    maxLayersByHeight,
    maxSafeLayersByBct,
    layersLoaded,
    spaceMaxCases,
    weightMaxCases,
    totalCases,
    totalUnits,
    limitedByWeight,
    totalGrossWeightKg,
    cargoVolumeCbm,
    vehicleVolumeCbm,
    weightUtilizationPct,
    floorUtilizationPct,
    volumeUtilizationPct,
    effectiveLengthMm: round1(effL),
    effectiveWidthMm: round1(effW),
    effectiveClearHeightMm: Math.floor(effectiveClearHeightMm),
    heightBottleneck,
    stackHeightMm,
    usedLengthMm,
    usedWidthMm,
    actualSideVoidPerSideMm,
    actualRearVoidMm,
    actualVerticalRoofClearanceMm,
    needsDunnageAirbag,
    bottomLayerLoadKgf,
    bottomLayerSafetyFactor,
    bctStatus,
    estimatedHandLoadMinutes,
    overallStatus,
    floorSlots: sortedSlots,
    warnings,
  };
}

/**
 * Compares Palletized vs Floor Loading performance side-by-side for the active vehicle.
 */
export function comparePalletVsFloor(
  palletEval: VehicleLoadingEvaluation,
  floorEval: FloorLoadingEvaluation,
  palletSingleBctSafe: boolean
): VehiclePalletVsFloorComparison {
  const palletCases = palletEval.totalCases;
  const floorCases = floorEval.totalCases;
  const deltaCases = floorCases - palletCases;
  const deltaCasesPct =
    palletCases > 0 ? round1(((floorCases - palletCases) / palletCases) * 100) : 0;
  const deltaVolumePct = round1(floorEval.volumeUtilizationPct - palletEval.volumeUtilizationPct);

  // Forklift loading ~2.5 min/pallet vs manual hand-stacking
  const palletLoadMinutesEst =
    palletEval.totalPallets > 0 ? Math.max(10, Math.round(palletEval.totalPallets * 2.5)) : 0;
  const floorLoadMinutesEst = floorEval.estimatedHandLoadMinutes;

  const palletBctSafe =
    palletSingleBctSafe && palletEval.doubleStackBctStatus !== 'overload';
  const floorBctSafe = floorEval.bctStatus !== 'overload';

  let recommendationNote: string;
  if (!floorBctSafe && palletBctSafe) {
    recommendationNote = `Floor Loading memuat +${Math.max(0, deltaCases).toLocaleString('id-ID')} dus, namun BCT layer bawah overload — pilih Palet atau perkuat grade kertas.`;
  } else if (deltaCasesPct >= 15) {
    recommendationNote = `Floor Loading unggul +${deltaCasesPct}% (${deltaCases >= 0 ? '+' : ''}${deltaCases.toLocaleString('id-ID')} dus) & hemat biaya palet; ideal untuk freight jauh bila tenaga bongkar tersedia.`;
  } else if (deltaCasesPct > 0) {
    recommendationNote = `Selisih kapasitas moderat (+${deltaCasesPct}%). Mode Palet lebih cepat bongkar-muat (~${palletLoadMinutesEst} mnt vs ~${floorLoadMinutesEst} mnt manual).`;
  } else {
    recommendationNote = `Mode Palet setara atau lebih efisien (dibatasi payload berat) dengan bongkar-muat forklift jauh lebih cepat.`;
  }

  return {
    palletCases,
    floorCases,
    deltaCases,
    deltaCasesPct,
    palletVolumePct: palletEval.volumeUtilizationPct,
    floorVolumePct: floorEval.volumeUtilizationPct,
    deltaVolumePct,
    palletLoadMinutesEst,
    floorLoadMinutesEst,
    palletBctSafe,
    floorBctSafe,
    recommendationNote,
  };
}

