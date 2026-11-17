import {
  ALL_PAPER_GRADES,
  BctFluteId,
  BoardSpecAdvice,
  BoxDimensions,
  BoxStyle,
  CasePackConfig,
  CasePackSolution,
  EngineeringConfig,
  EXTENDED_STANDARD_ECT_TABLE,
  FLUTE_SPECS,
  MediumGradeId,
  PalletBoxPlacement,
  PalletCandidateVariant,
  PalletConfig,
  PalletFaultLine,
  PalletLockStatus,
  PalletPatternEvaluation,
  PalletPatternType,
  PalletStabilityMetrics,
  PaperGradeId,
  PerfectionistSizeSuggestion,
  PerfectionistTuningReport,
} from '../types';
import {
  computeBoardBurstKpa,
  computeMcKeeBctKgf,
  computeSurfaceFrictionCoeff,
  estimateTappiEctFromLayers,
} from './engineering';

export interface PalletPhysicsContext {
  surfaceFrictionCoeff?: number;
  burstStrengthKpa?: number;
  fluteThicknessMm?: number;
  boardGrade?: 'single-wall' | 'double-wall';
  boxStyle?: BoxStyle;
  engineering?: EngineeringConfig;
}

const PALLET_TARE_KG = 22;

function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

function round2(val: number): number {
  return Math.round(val * 100) / 100;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function clampMin(val: number, min: number): number {
  return val < min ? min : val;
}

/**
 * Generates ranked Master Carton ID/OD dimensions from primary product dimensions,
 * bulge allowance, cell dividers, layer pads, and item count.
 */
export function computeCasePackSolutions(
  cfg: CasePackConfig,
  fluteThickness: number,
  currentNetBoxAreaSqm: number,
  currentBoardGsm: number
): CasePackSolution[] {
  const count = Math.max(1, Math.min(200, Math.round(cfg.unitsPerCase || 1)));
  const effUnitL = clampMin(cfg.unitLengthMm + cfg.bulgeL, 8);
  const effUnitW = clampMin(
    cfg.shape === 'cylinder' ? cfg.unitLengthMm + cfg.bulgeL : cfg.unitWidthMm + cfg.bulgeW,
    8
  );
  const effUnitD = clampMin(cfg.unitDepthMm + cfg.bulgeD, 8);

  const orientations: Array<[number, number, number]> = [];
  if (cfg.shape === 'cylinder') {
    orientations.push([effUnitL, effUnitL, effUnitD]);
    if (!cfg.uprightOnly) {
      orientations.push([effUnitD, effUnitL, effUnitL]);
      orientations.push([effUnitL, effUnitD, effUnitL]);
    }
  } else {
    const raw: Array<[number, number, number]> = cfg.uprightOnly
      ? [
          [effUnitL, effUnitW, effUnitD],
          [effUnitW, effUnitL, effUnitD],
        ]
      : [
          [effUnitL, effUnitW, effUnitD],
          [effUnitW, effUnitL, effUnitD],
          [effUnitL, effUnitD, effUnitW],
          [effUnitD, effUnitL, effUnitW],
          [effUnitW, effUnitD, effUnitL],
          [effUnitD, effUnitW, effUnitL],
        ];
    const seen = new Set<string>();
    for (const o of raw) {
      const k = `${round1(o[0])}_${round1(o[1])}_${round1(o[2])}`;
      if (!seen.has(k)) {
        seen.add(k);
        orientations.push(o);
      }
    }
  }

  const triplets: Array<[number, number, number]> = [];
  for (let nx = 1; nx <= count; nx++) {
    if (count % nx !== 0) continue;
    const rem = count / nx;
    for (let ny = 1; ny <= rem; ny++) {
      if (rem % ny !== 0) continue;
      const nz = rem / ny;
      triplets.push([nx, ny, nz]);
    }
  }

  const dedup = new Map<string, CasePackSolution>();
  const div = Math.max(0, cfg.dividerThicknessMm);
  const pad = Math.max(0, cfg.layerPadThicknessMm);
  const unitVolumeMm3 =
    cfg.shape === 'cylinder'
      ? Math.PI * Math.pow(effUnitL / 2, 2) * effUnitD
      : cfg.shape === 'pouch'
      ? effUnitL * effUnitW * effUnitD * 0.78
      : effUnitL * effUnitW * effUnitD;

  const tareBoxKg = Math.max(0.08, (currentNetBoxAreaSqm * currentBoardGsm) / 1000);
  const netProductKg = (count * Math.max(1, cfg.unitWeightGrams)) / 1000;

  for (const [nx, ny, nz] of triplets) {
    for (const orient of orientations) {
      const [uL, uW, uD] = orient;
      const canStagger =
        cfg.shape === 'cylinder' &&
        cfg.cylinderStagger &&
        Math.abs(uL - uW) < 0.5 &&
        nx > 1 &&
        ny > 1;

      const rawSpanL = canStagger ? nx * uL + 0.5 * uL : nx * uL;
      const rawSpanW = canStagger
        ? uW + (ny - 1) * uW * 0.8660254
        : ny * uW;
      const rawSpanD = nz * uD;

      const innerL = Math.ceil(rawSpanL + Math.max(0, nx - 1) * div + 2);
      const innerW = Math.ceil(rawSpanW + Math.max(0, ny - 1) * div + 2);
      const innerD = Math.ceil(rawSpanD + Math.max(0, nz - 1) * pad + 2);

      const normL = Math.max(innerL, innerW);
      const normW = Math.min(innerL, innerW);
      const normNx = innerL >= innerW ? nx : ny;
      const normNy = innerL >= innerW ? ny : nx;
      const normOrient: [number, number, number] =
        innerL >= innerW ? [uL, uW, uD] : [uW, uL, uD];

      if (normL / normW > 4.2 || innerD > 3.2 * normW) continue;

      const outerL = round1(normL + fluteThickness * 2);
      const outerW = round1(normW + fluteThickness * 2);
      const outerD = round1(innerD + fluteThickness * 4);

      if (outerL > 1150 || outerW > 950 || outerD > 950) continue;

      const key = `${normNx}x${normNy}x${nz}_${normL}x${normW}x${innerD}`;
      if (dedup.has(key)) continue;

      const boxVol = normL * normW * innerD;
      const packingEfficiencyPct = Math.min(100, (unitVolumeMm3 * count * 100) / boxVol);

      const fitA = Math.floor(1200 / outerL) * Math.floor(1000 / outerW);
      const fitB = Math.floor(1200 / outerW) * Math.floor(1000 / outerL);
      const bestCases = Math.max(fitA, fitB);
      const palletAreaEstPct = Math.min(100, ((bestCases * outerL * outerW) / (1200 * 1000)) * 100);

      const divAreaSqm =
        ((Math.max(0, normNx - 1) * normW * innerD +
          Math.max(0, normNy - 1) * normL * innerD) *
          (div > 0 ? 1 : 0) +
          Math.max(0, nz - 1) * normL * normW * (pad > 0 ? 1 : 0)) /
        1_000_000;
      const dividerKg = divAreaSqm * 0.48;
      const caseGrossKg = round1(netProductKg + tareBoxKg + dividerKg);

      const desc = `${normNx} × ${normNy} × ${nz}${canStagger ? ' (Nested)' : ''}`;
      dedup.set(key, {
        id: key,
        nx: normNx,
        ny: normNy,
        nz,
        unitOriented: normOrient,
        innerL: normL,
        innerW: normW,
        innerD,
        outerL,
        outerW,
        outerD,
        packingEfficiencyPct: round1(packingEfficiencyPct),
        staggered: canStagger,
        palletAreaEstPct: round1(palletAreaEstPct),
        netProductKg: round1(netProductKg),
        caseGrossKg,
        description: desc,
      });
    }
  }

  return Array.from(dedup.values())
    .sort((a, b) => {
      const aspectA = Math.max(a.innerL, a.innerW) / Math.min(a.innerL, a.innerW);
      const aspectB = Math.max(b.innerL, b.innerW) / Math.min(b.innerL, b.innerW);
      const scoreA = a.palletAreaEstPct * 0.58 + a.packingEfficiencyPct * 0.42 - aspectA * 2;
      const scoreB = b.palletAreaEstPct * 0.58 + b.packingEfficiencyPct * 0.42 - aspectB * 2;
      return scoreB - scoreA;
    })
    .slice(0, 14);
}

interface LayerSlot {
  x: number;
  z: number;
  sizeX: number;
  sizeZ: number;
  rotated90: boolean;
  angleDeg: 0 | 90 | 180 | 270;
}

function centerSlots(slots: LayerSlot[]): {
  centered: LayerSlot[];
  footprintL: number;
  footprintW: number;
} {
  if (slots.length === 0) {
    return { centered: [], footprintL: 0, footprintW: 0 };
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const s of slots) {
    minX = Math.min(minX, s.x - s.sizeX / 2);
    maxX = Math.max(maxX, s.x + s.sizeX / 2);
    minZ = Math.min(minZ, s.z - s.sizeZ / 2);
    maxZ = Math.max(maxZ, s.z + s.sizeZ / 2);
  }
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  return {
    centered: slots.map((s) => ({ ...s, x: round1(s.x - cx), z: round1(s.z - cz) })),
    footprintL: round1(maxX - minX),
    footprintW: round1(maxZ - minZ),
  };
}

function flipLayer180(slots: LayerSlot[]): LayerSlot[] {
  return slots.map((s) => ({
    ...s,
    x: round1(-s.x),
    z: round1(-s.z),
    angleDeg: ((s.angleDeg + 180) % 360) as 0 | 90 | 180 | 270,
  }));
}

function mirrorLayerX(slots: LayerSlot[]): LayerSlot[] {
  return slots.map((s) => ({
    ...s,
    x: round1(-s.x),
    angleDeg: (s.angleDeg === 0 ? 180 : s.angleDeg === 180 ? 0 : s.angleDeg) as 0 | 90 | 180 | 270,
  }));
}

function mirrorLayerZ(slots: LayerSlot[]): LayerSlot[] {
  return slots.map((s) => ({
    ...s,
    z: round1(-s.z),
    angleDeg: (s.angleDeg === 90 ? 270 : s.angleDeg === 270 ? 90 : s.angleDeg) as 0 | 90 | 180 | 270,
  }));
}

function rotateLayer90(slots: LayerSlot[]): LayerSlot[] {
  return slots.map((s) => ({
    x: round1(-s.z),
    z: round1(s.x),
    sizeX: s.sizeZ,
    sizeZ: s.sizeX,
    rotated90: !s.rotated90,
    angleDeg: ((s.angleDeg + 90) % 360) as 0 | 90 | 180 | 270,
  }));
}

/**
 * TOPS-style flush-edge grid builder:
 * Instead of leaving asymmetric orphan gaps between adjacent zones, when targetXSpan or
 * targetZSpan is supplied within a reasonable tolerance (gap <= 28mm/carton), distributes
 * slight breathing space evenly so outer box edges sit dead-flush with neighbor blocks.
 */
function buildGridSlots(
  nx: number,
  nz: number,
  stepX: number,
  stepZ: number,
  rotated90: boolean,
  offsetX = 0,
  offsetZ = 0,
  targetZSpan?: number,
  targetXSpan?: number,
  spreadFlush = false
): LayerSlot[] {
  const out: LayerSlot[] = [];
  if (nx <= 0 || nz <= 0) return out;
  const usedX = nx * stepX;
  const usedZ = nz * stepZ;

  let gapX = 0;
  let padX = 0;
  if (targetXSpan && targetXSpan > usedX) {
    const slackX = targetXSpan - usedX;
    if (spreadFlush && nx > 1 && slackX / (nx - 1) <= 28) {
      gapX = slackX / (nx - 1);
    } else {
      padX = slackX / 2;
    }
  }

  let gapZ = 0;
  let padZ = 0;
  if (targetZSpan && targetZSpan > usedZ) {
    const slackZ = targetZSpan - usedZ;
    if (spreadFlush && nz > 1 && slackZ / (nz - 1) <= 28) {
      gapZ = slackZ / (nz - 1);
    } else {
      padZ = slackZ / 2;
    }
  }

  const angleDeg: 0 | 90 = rotated90 ? 90 : 0;

  for (let ix = 0; ix < nx; ix++) {
    for (let iz = 0; iz < nz; iz++) {
      out.push({
        x: offsetX + padX + ix * (stepX + gapX) + stepX / 2,
        z: offsetZ + padZ + iz * (stepZ + gapZ) + stepZ / 2,
        sizeX: stepX,
        sizeZ: stepZ,
        rotated90,
        angleDeg,
      });
    }
  }
  return out;
}

/**
 * Normalizes a multi-zone layer so sub-bands spanning nearly the same full width or length
 * equalize edge-to-edge cleanly (e.g. 5x203=1015mm aligns flush with 3x348=1044mm like TOPS Pro).
 */
function harmonizeMultiZoneFlushEdges(slots: LayerSlot[]): LayerSlot[] {
  if (slots.length <= 2) return slots;
  // Detect horizontal row bands sharing similar Z bands
  let overallMinX = Infinity;
  let overallMaxX = -Infinity;
  let overallMinZ = Infinity;
  let overallMaxZ = -Infinity;
  for (const s of slots) {
    overallMinX = Math.min(overallMinX, s.x - s.sizeX / 2);
    overallMaxX = Math.max(overallMaxX, s.x + s.sizeX / 2);
    overallMinZ = Math.min(overallMinZ, s.z - s.sizeZ / 2);
    overallMaxZ = Math.max(overallMaxZ, s.z + s.sizeZ / 2);
  }
  const spanX = overallMaxX - overallMinX;
  const spanZ = overallMaxZ - overallMinZ;

  // Group boxes by exact sizeZ + rounded Z center (horizontal strip detection)
  const zBands = new Map<string, LayerSlot[]>();
  for (const s of slots) {
    const key = `${Math.round(s.z)}_${Math.round(s.sizeZ)}`;
    const arr = zBands.get(key) || [];
    arr.push(s);
    zBands.set(key, arr);
  }

  const adjusted: LayerSlot[] = [];
  for (const band of zBands.values()) {
    if (band.length >= 2) {
      band.sort((a, b) => a.x - b.x);
      let bMin = Infinity;
      let bMax = -Infinity;
      let sumW = 0;
      for (const b of band) {
        bMin = Math.min(bMin, b.x - b.sizeX / 2);
        bMax = Math.max(bMax, b.x + b.sizeX / 2);
        sumW += b.sizeX;
      }
      const bandSpan = bMax - bMin;
      const deficit = spanX - bandSpan;
      // If this band spans >= 82% of overall footprint width and gap/carton <= 24mm, equalize flush!
      if (
        bandSpan / Math.max(1, spanX) >= 0.82 &&
        spanX - sumW > 1 &&
        (spanX - sumW) / (band.length - 1) <= 24 &&
        deficit >= -1
      ) {
        const gap = (spanX - sumW) / (band.length - 1);
        let cursor = overallMinX;
        for (const b of band) {
          adjusted.push({ ...b, x: round1(cursor + b.sizeX / 2) });
          cursor += b.sizeX + gap;
        }
        continue;
      }
    }
    adjusted.push(...band);
  }

  // Only accept harmonized layout if zero overlap introduced
  if (!hasAnyOverlap(adjusted)) {
    // Also equalize vertical strips along Z if applicable
    const xBands = new Map<string, LayerSlot[]>();
    for (const s of adjusted) {
      const key = `${Math.round(s.x)}_${Math.round(s.sizeX)}`;
      const arr = xBands.get(key) || [];
      arr.push(s);
      xBands.set(key, arr);
    }
    const adjustedZ: LayerSlot[] = [];
    for (const band of xBands.values()) {
      if (band.length >= 2) {
        band.sort((a, b) => a.z - b.z);
        let bMin = Infinity;
        let bMax = -Infinity;
        let sumH = 0;
        for (const b of band) {
          bMin = Math.min(bMin, b.z - b.sizeZ / 2);
          bMax = Math.max(bMax, b.z + b.sizeZ / 2);
          sumH += b.sizeZ;
        }
        const bandSpan = bMax - bMin;
        if (
          bandSpan / Math.max(1, spanZ) >= 0.82 &&
          spanZ - sumH > 1 &&
          (spanZ - sumH) / (band.length - 1) <= 24 &&
          spanZ - bandSpan >= -1
        ) {
          const gap = (spanZ - sumH) / (band.length - 1);
          let cursor = overallMinZ;
          for (const b of band) {
            adjustedZ.push({ ...b, z: round1(cursor + b.sizeZ / 2) });
            cursor += b.sizeZ + gap;
          }
          continue;
        }
      }
      adjustedZ.push(...band);
    }
    if (!hasAnyOverlap(adjustedZ)) {
      return adjustedZ;
    }
    return adjusted;
  }
  return slots;
}

function hasAnyOverlap(slots: LayerSlot[]): boolean {
  for (let i = 0; i < slots.length; i++) {
    const a = slots[i];
    for (let j = i + 1; j < slots.length; j++) {
      const b = slots[j];
      const ox = Math.min(a.x + a.sizeX / 2, b.x + b.sizeX / 2) - Math.max(a.x - a.sizeX / 2, b.x - b.sizeX / 2);
      const oz = Math.min(a.z + a.sizeZ / 2, b.z + b.sizeZ / 2) - Math.max(a.z - a.sizeZ / 2, b.z - b.sizeZ / 2);
      if (ox > 1.0 && oz > 1.0) return true;
    }
  }
  return false;
}

interface GuillotineResult {
  slots: LayerSlot[];
  hasMixed: boolean;
  footprintArea: number;
}

/**
 * Recursive 2D Multi-Zone Guillotine Orthogonal Packer (depth <= 2).
 */
function solveGuillotinePack(
  regX: number,
  regZ: number,
  boxL: number,
  boxW: number,
  depth = 2,
  memo = new Map<string, GuillotineResult>()
): GuillotineResult {
  if (regX + 0.01 < Math.min(boxL, boxW) || regZ + 0.01 < Math.min(boxL, boxW)) {
    return { slots: [], hasMixed: false, footprintArea: 0 };
  }

  const key = `${Math.round(regX * 10)}x${Math.round(regZ * 10)}_${depth}`;
  const cached = memo.get(key);
  if (cached) return cached;

  const nLA = Math.floor((regX + 0.05) / boxL);
  const nWA = Math.floor((regZ + 0.05) / boxW);
  const pureA = buildGridSlots(nLA, nWA, boxL, boxW, false, 0, 0, regZ, regX);

  const nLB = Math.floor((regX + 0.05) / boxW);
  const nWB = Math.floor((regZ + 0.05) / boxL);
  const pureB = buildGridSlots(nLB, nWB, boxW, boxL, true, 0, 0, regZ, regX);

  let best: GuillotineResult =
    pureB.length > pureA.length
      ? { slots: pureB, hasMixed: false, footprintArea: pureB.length * boxL * boxW }
      : { slots: pureA, hasMixed: false, footprintArea: pureA.length * boxL * boxW };

  const consider = (candidateSlots: LayerSlot[]) => {
    if (candidateSlots.length === 0) return;
    const has0 = candidateSlots.some((s) => !s.rotated90);
    const has90 = candidateSlots.some((s) => s.rotated90);
    const mixed = has0 && has90;
    const isBetter =
      candidateSlots.length > best.slots.length ||
      (candidateSlots.length === best.slots.length && mixed && !best.hasMixed);
    if (isBetter) {
      best = {
        slots: candidateSlots,
        hasMixed: mixed,
        footprintArea: candidateSlots.length * boxL * boxW,
      };
    }
  };

  if (depth > 0) {
    const tryVerticalCuts = (stepX: number, stepZ: number, rot90: boolean) => {
      const maxK = Math.floor((regX + 0.05) / stepX);
      const maxRows = Math.floor((regZ + 0.05) / stepZ);
      if (maxRows <= 0) return;

      for (let k = 1; k <= maxK; k++) {
        const cutX = k * stepX;
        const leftZone = buildGridSlots(k, maxRows, stepX, stepZ, rot90, 0, 0, regZ);
        const remX = regX - cutX;
        const rightRes = solveGuillotinePack(remX, regZ, boxL, boxW, depth - 1, memo);

        const remZLeft = regZ - maxRows * stepZ;
        const bottomLeftRes = solveGuillotinePack(cutX, remZLeft, boxL, boxW, depth - 1, memo);

        const effectiveLeft =
          bottomLeftRes.slots.length > 0
            ? [
                ...buildGridSlots(k, maxRows, stepX, stepZ, rot90, 0, 0),
                ...bottomLeftRes.slots.map((s) => ({ ...s, z: s.z + maxRows * stepZ })),
              ]
            : leftZone;

        consider([
          ...effectiveLeft,
          ...rightRes.slots.map((s) => ({ ...s, x: s.x + cutX })),
        ]);
      }
    };

    const tryHorizontalCuts = (stepX: number, stepZ: number, rot90: boolean) => {
      const maxK = Math.floor((regZ + 0.05) / stepZ);
      const maxCols = Math.floor((regX + 0.05) / stepX);
      if (maxCols <= 0) return;

      for (let k = 1; k <= maxK; k++) {
        const cutZ = k * stepZ;
        const topZone = buildGridSlots(maxCols, k, stepX, stepZ, rot90, 0, 0, undefined, regX);
        const remZ = regZ - cutZ;
        const bottomRes = solveGuillotinePack(regX, remZ, boxL, boxW, depth - 1, memo);

        const remXTop = regX - maxCols * stepX;
        const sideTopRes = solveGuillotinePack(remXTop, cutZ, boxL, boxW, depth - 1, memo);

        const effectiveTop =
          sideTopRes.slots.length > 0
            ? [
                ...buildGridSlots(maxCols, k, stepX, stepZ, rot90, 0, 0),
                ...sideTopRes.slots.map((s) => ({ ...s, x: s.x + maxCols * stepX })),
              ]
            : topZone;

        consider([
          ...effectiveTop,
          ...bottomRes.slots.map((s) => ({ ...s, z: s.z + cutZ })),
        ]);
      }
    };

    tryVerticalCuts(boxL, boxW, false);
    tryVerticalCuts(boxW, boxL, true);
    tryHorizontalCuts(boxL, boxW, false);
    tryHorizontalCuts(boxW, boxL, true);
  }

  memo.set(key, best);
  return best;
}

/**
 * Generates alternative guillotine candidates emphasizing symmetric anti-cleavage interlocking
 * (prefers layouts where cuts sit off-center or reverse axes vs pure strip splits).
 */
function solveSplitBlockAlternate(
  regX: number,
  regZ: number,
  boxL: number,
  boxW: number
): LayerSlot[] {
  const candidates: Array<{ slots: LayerSlot[]; offCenterScore: number }> = [];

  const evalCand = (slots: LayerSlot[], hasVerticalPreferred: boolean) => {
    if (slots.length === 0 || hasAnyOverlap(slots)) return;
    const has0 = slots.some((s) => !s.rotated90);
    const has90 = slots.some((s) => s.rotated90);
    const mixedBonus = has0 && has90 ? 15 : 0;
    // Measure centroid asymmetry relative to bounding center (high asymmetry = strong 180-deg brick shift!)
    const { centered } = centerSlots(slots);
    const meanX = centered.filter((s) => !s.rotated90).reduce((acc, s) => acc + s.x, 0);
    const meanZ = centered.filter((s) => !s.rotated90).reduce((acc, s) => acc + s.z, 0);
    const shiftMag = Math.hypot(meanX, meanZ);
    candidates.push({
      slots: harmonizeMultiZoneFlushEdges(centered),
      offCenterScore: slots.length * 1000 + mixedBonus + (hasVerticalPreferred ? 8 : 0) + Math.min(40, shiftMag * 0.01),
    });
  };

  // Vertical-split preference first so split-block produces complementary seam axis vs interlock!
  const maxCols0 = Math.floor((regX + 0.05) / boxL);
  const maxRows0 = Math.floor((regZ + 0.05) / boxW);
  for (let k = 1; k <= maxCols0; k++) {
    const cutX = k * boxL;
    const remX = regX - cutX;
    const nColB = Math.floor((remX + 0.05) / boxW);
    const nRowB = Math.floor((regZ + 0.05) / boxL);
    if (maxRows0 > 0 && nColB > 0 && nRowB > 0) {
      evalCand(
        [
          ...buildGridSlots(k, maxRows0, boxL, boxW, false, 0, 0, regZ),
          ...buildGridSlots(nColB, nRowB, boxW, boxL, true, cutX, 0, regZ),
        ],
        true
      );
    }
  }

  const maxCols1 = Math.floor((regX + 0.05) / boxW);
  const maxRows1 = Math.floor((regZ + 0.05) / boxL);
  for (let k = 1; k <= maxCols1; k++) {
    const cutX = k * boxW;
    const remX = regX - cutX;
    const nColB = Math.floor((remX + 0.05) / boxL);
    const nRowB = Math.floor((regZ + 0.05) / boxW);
    if (maxRows1 > 0 && nColB > 0 && nRowB > 0) {
      evalCand(
        [
          ...buildGridSlots(k, maxRows1, boxW, boxL, true, 0, 0, regZ),
          ...buildGridSlots(nColB, nRowB, boxL, boxW, false, cutX, 0, regZ),
        ],
        true
      );
    }
  }

  // Fallback to full multi-zone guillotine
  const multi = solveGuillotinePack(regX, regZ, boxL, boxW, 2);
  evalCand(multi.slots, false);

  candidates.sort((a, b) => b.offCenterScore - a.offCenterScore);
  return candidates[0]?.slots || centerSlots(multi.slots).centered;
}

function generatePinwheelSlots(
  effL: number,
  effW: number,
  boxL: number,
  boxW: number
): {
  oddLayer: LayerSlot[];
  evenLayer: LayerSlot[];
  footprintL: number;
  footprintW: number;
  variantNote: string;
} {
  const cellSpan = boxL + boxW;
  if (cellSpan <= effL + 0.5 && cellSpan <= effW + 0.5) {
    const unitCols = Math.floor((effL + 0.5) / cellSpan);
    const unitRows = Math.floor((effW + 0.5) / cellSpan);
    const coreSlots: LayerSlot[] = [];

    for (let ux = 0; ux < unitCols; ux++) {
      for (let uz = 0; uz < unitRows; uz++) {
        const ox = ux * cellSpan;
        const oz = uz * cellSpan;
        coreSlots.push({
          x: ox + boxL / 2,
          z: oz + boxW / 2,
          sizeX: boxL,
          sizeZ: boxW,
          rotated90: false,
          angleDeg: 0,
        });
        coreSlots.push({
          x: ox + boxL + boxW / 2,
          z: oz + boxL / 2,
          sizeX: boxW,
          sizeZ: boxL,
          rotated90: true,
          angleDeg: 90,
        });
        coreSlots.push({
          x: ox + boxW + boxL / 2,
          z: oz + boxL + boxW / 2,
          sizeX: boxL,
          sizeZ: boxW,
          rotated90: false,
          angleDeg: 180,
        });
        coreSlots.push({
          x: ox + boxW / 2,
          z: oz + boxW + boxL / 2,
          sizeX: boxW,
          sizeZ: boxL,
          rotated90: true,
          angleDeg: 270,
        });
      }
    }

    const usedX = unitCols * cellSpan;
    const usedZ = unitRows * cellSpan;
    const remX = effL - usedX;
    const remZ = effW - usedZ;

    const rightFull = solveGuillotinePack(remX, effW, boxL, boxW, 1);
    const bottomCore = solveGuillotinePack(usedX, remZ, boxL, boxW, 1);
    const candA: LayerSlot[] = [
      ...coreSlots,
      ...rightFull.slots.map((s) => ({ ...s, x: s.x + usedX })),
      ...bottomCore.slots.map((s) => ({ ...s, z: s.z + usedZ })),
    ];

    const bottomFull = solveGuillotinePack(effL, remZ, boxL, boxW, 1);
    const rightCore = solveGuillotinePack(remX, usedZ, boxL, boxW, 1);
    const candB: LayerSlot[] = [
      ...coreSlots,
      ...bottomFull.slots.map((s) => ({ ...s, z: s.z + usedZ })),
      ...rightCore.slots.map((s) => ({ ...s, x: s.x + usedX })),
    ];

    const bestPin = candB.length > candA.length ? candB : candA;
    const centered = centerSlots(harmonizeMultiZoneFlushEdges(bestPin));
    const bestSecond = pickBestInterlockTransform(centered.centered, effL, effW);
    return {
      oddLayer: centered.centered,
      evenLayer: bestSecond.slots,
      footprintL: centered.footprintL,
      footprintW: centered.footprintW,
      variantNote: `Swirl ${unitCols}×${unitRows} + Strip (${bestSecond.transformName})`,
    };
  }

  const fallback = solveGuillotinePack(effL, effW, boxL, boxW, 2);
  const centered = centerSlots(harmonizeMultiZoneFlushEdges(fallback.slots));
  const bestSecond = pickBestInterlockTransform(centered.centered, effL, effW);
  return {
    oddLayer: centered.centered,
    evenLayer: bestSecond.slots,
    footprintL: centered.footprintL,
    footprintW: centered.footprintW,
    variantNote: `Pinwheel Fallback (${bestSecond.transformName})`,
  };
}

/**
 * Computes exact pairwise geometric intersection + 4-corner column bearing diagnostics
 * for layer `upper` resting on `lower`.
 */
function measurePairBridging(
  upper: LayerSlot[],
  lower: LayerSlot[],
  useTierSheets = false
): {
  seamLockPct: number;
  avgSupportPct: number;
  supportedCornerPct: number;
  unsupportedCornerCount: number;
  faultCount: number;
  perBox: Array<{
    bridgedCount: number;
    supportPct: number;
    supportedCorners: number;
    unsupportedCornerCoords: Array<[number, number]>;
  }>;
} {
  if (upper.length === 0 || lower.length === 0) {
    return {
      seamLockPct: 0,
      avgSupportPct: 100,
      supportedCornerPct: 100,
      unsupportedCornerCount: 0,
      faultCount: 0,
      perBox: upper.map(() => ({
        bridgedCount: 1,
        supportPct: 100,
        supportedCorners: 4,
        unsupportedCornerCoords: [],
      })),
    };
  }

  let lockedBoxes = 0;
  let supportSum = 0;
  let totalCorners = 0;
  let totalSupportedCorners = 0;
  const perBox: Array<{
    bridgedCount: number;
    supportPct: number;
    supportedCorners: number;
    unsupportedCornerCoords: Array<[number, number]>;
  }> = [];

  // Corrugated box corner walls bear ~65% of compressive stacking force inside the outer ~12mm rim
  const cornerMargin = useTierSheets ? 18 : 11;
  const cornerTol = useTierSheets ? 8 : 2;

  for (const b of upper) {
    const areaB = Math.max(1, b.sizeX * b.sizeZ);
    const bx1 = b.x - b.sizeX / 2;
    const bx2 = b.x + b.sizeX / 2;
    const bz1 = b.z - b.sizeZ / 2;
    const bz2 = b.z + b.sizeZ / 2;

    const overlaps: number[] = [];
    let totalOverlap = 0;
    for (const a of lower) {
      const ox = Math.max(0, Math.min(bx2, a.x + a.sizeX / 2) - Math.max(bx1, a.x - a.sizeX / 2));
      const oz = Math.max(0, Math.min(bz2, a.z + a.sizeZ / 2) - Math.max(bz1, a.z - a.sizeZ / 2));
      const area = ox * oz;
      if (area > 150) {
        overlaps.push(area);
        totalOverlap += area;
      }
    }

    const supportPct = Math.min(100, (totalOverlap / areaB) * 100);
    supportSum += supportPct;

    // Evaluate all 4 vertical load-bearing corner columns of box `b`
    const insetX = Math.min(cornerMargin, b.sizeX * 0.14);
    const insetZ = Math.min(cornerMargin, b.sizeZ * 0.14);
    const cornerPoints: Array<[number, number]> = [
      [bx1 + insetX, bz1 + insetZ],
      [bx2 - insetX, bz1 + insetZ],
      [bx2 - insetX, bz2 - insetZ],
      [bx1 + insetX, bz2 - insetZ],
    ];
    let supportedCorners = 0;
    const unsupportedCornerCoords: Array<[number, number]> = [];
    for (const [cx, cz] of cornerPoints) {
      const hasSolidDeck = lower.some(
        (a) =>
          cx >= a.x - a.sizeX / 2 - cornerTol &&
          cx <= a.x + a.sizeX / 2 + cornerTol &&
          cz >= a.z - a.sizeZ / 2 - cornerTol &&
          cz <= a.z + a.sizeZ / 2 + cornerTol
      );
      if (hasSolidDeck) {
        supportedCorners++;
      } else {
        unsupportedCornerCoords.push([round1(cx), round1(cz)]);
      }
    }
    totalCorners += 4;
    totalSupportedCorners += supportedCorners;

    const loadBearingSupports = overlaps.filter((ov) => ov / Math.max(1, totalOverlap) >= 0.14);
    const bridgedCount = loadBearingSupports.length;
    if (bridgedCount >= 2 && supportPct >= 85) {
      lockedBoxes++;
    }
    perBox.push({
      bridgedCount,
      supportPct: round1(supportPct),
      supportedCorners,
      unsupportedCornerCoords,
    });
  }

  const faults = detectFaultLines([lower, upper]);
  const supportedCornerPct =
    totalCorners > 0 ? round1((totalSupportedCorners / totalCorners) * 100) : 100;

  return {
    seamLockPct: round1((lockedBoxes / upper.length) * 100),
    avgSupportPct: round1(supportSum / upper.length),
    supportedCornerPct,
    unsupportedCornerCount: totalCorners - totalSupportedCorners,
    faultCount: faults.length,
    perBox,
  };
}

/**
 * Evaluates possible Layer-2 transforms (180° flip, Mirror-X, Mirror-Z, Alternate-90°)
 * and returns whichever maximizes seam-bridging + 4-corner support with minimum cleavage faults.
 */
function pickBestInterlockTransform(
  oddCentered: LayerSlot[],
  effL: number,
  effW: number
): {
  slots: LayerSlot[];
  transformName: string;
  seamLockPct: number;
} {
  const candidates: Array<{ name: string; slots: LayerSlot[] }> = [
    { name: 'Flip 180°', slots: flipLayer180(oddCentered) },
    { name: 'Mirror-X', slots: mirrorLayerX(oddCentered) },
    { name: 'Mirror-Z', slots: mirrorLayerZ(oddCentered) },
  ];

  const rot90 = centerSlots(rotateLayer90(oddCentered));
  if (rot90.footprintL <= effL + 2 && rot90.footprintW <= effW + 2) {
    candidates.push({ name: 'Rotate 90°', slots: rot90.centered });
  }

  let best = candidates[0];
  let bestScore = -Infinity;
  let bestLockPct = 0;

  for (const cand of candidates) {
    const fwd = measurePairBridging(cand.slots, oddCentered);
    const rev = measurePairBridging(oddCentered, cand.slots);
    const avgSeam = (fwd.seamLockPct + rev.seamLockPct) / 2;
    const avgCorner = (fwd.supportedCornerPct + rev.supportedCornerPct) / 2;
    const avgSupport = (fwd.avgSupportPct + rev.avgSupportPct) / 2;
    const worstFault = Math.max(fwd.faultCount, rev.faultCount);
    const score =
      avgSeam * 1.15 +
      avgCorner * 0.45 -
      worstFault * 30 +
      avgSupport * 0.25;
    if (score > bestScore) {
      bestScore = score;
      best = cand;
      bestLockPct = round1(avgSeam);
    }
  }

  return {
    slots: best.slots,
    transformName: best.name,
    seamLockPct: bestLockPct,
  };
}

/**
 * Generates pure Alternating Otomatis slot geometry (or straight 1:1 Column baseline).
 */
function generateSingleLayerSlots(
  pattern: PalletPatternType,
  effL: number,
  effW: number,
  boxL: number,
  boxW: number
): {
  oddLayer: LayerSlot[];
  evenLayer: LayerSlot[];
  footprintL: number;
  footprintW: number;
  variantNote: string;
} {
  const nLA = Math.floor((effL + 0.05) / boxL);
  const nWA = Math.floor((effW + 0.05) / boxW);
  const countA = nLA * nWA;

  const nLB = Math.floor((effL + 0.05) / boxW);
  const nWB = Math.floor((effW + 0.05) / boxL);
  const countB = nLB * nWB;

  if (pattern === 'column') {
    const useB = countB > countA;
    const raw = useB
      ? buildGridSlots(nLB, nWB, boxW, boxL, true)
      : buildGridSlots(nLA, nWA, boxL, boxW, false);
    const { centered, footprintL, footprintW } = centerSlots(raw);
    return {
      oddLayer: centered,
      evenLayer: centered,
      footprintL,
      footprintW,
      variantNote: `${useB ? `${nLB}×${nWB} (90°)` : `${nLA}×${nWA} (0°)`} lurus 1:1`,
    };
  }

  if (pattern === 'interlock') {
    const multi = solveGuillotinePack(effL, effW, boxL, boxW, 2);
    const harmonized = harmonizeMultiZoneFlushEdges(centerSlots(multi.slots).centered);
    const maxPure = Math.max(countA, countB);
    const canAlt90 = countA > 0 && countB > 0 && countA === countB;

    if (canAlt90 && countA >= multi.slots.length) {
      const odd = centerSlots(buildGridSlots(nLA, nWA, boxL, boxW, false));
      const even = centerSlots(buildGridSlots(nLB, nWB, boxW, boxL, true));
      const altScore = measurePairBridging(even.centered, odd.centered);
      const multiTransform = pickBestInterlockTransform(harmonized, effL, effW);

      if (altScore.seamLockPct >= multiTransform.seamLockPct) {
        return {
          oddLayer: odd.centered,
          evenLayer: even.centered,
          footprintL: Math.max(odd.footprintL, even.footprintL),
          footprintW: Math.max(odd.footprintW, even.footprintW),
          variantNote: 'Cross-90° Alt',
        };
      }
    }

    if (multi.slots.length >= maxPure) {
      const centered = centerSlots(harmonized);
      const bestSecond = pickBestInterlockTransform(centered.centered, effL, effW);
      return {
        oddLayer: centered.centered,
        evenLayer: bestSecond.slots,
        footprintL: centered.footprintL,
        footprintW: centered.footprintW,
        variantNote: `Flush-Brick (${bestSecond.transformName})`,
      };
    }

    const bestSecond = pickBestInterlockTransform(harmonized, effL, effW);
    const centered = centerSlots(harmonized);
    return {
      oddLayer: centered.centered,
      evenLayer: bestSecond.slots,
      footprintL: centered.footprintL,
      footprintW: centered.footprintW,
      variantNote: bestSecond.transformName,
    };
  }

  if (pattern === 'pinwheel') {
    return generatePinwheelSlots(effL, effW, boxL, boxW);
  }

  // 'split-block': Alternative guillotine axis split (vertical-preferred vs interlock horizontal)
  const altSlots = solveSplitBlockAlternate(effL, effW, boxL, boxW);
  const centered = centerSlots(altSlots);
  const bestSecond = pickBestInterlockTransform(centered.centered, effL, effW);
  return {
    oddLayer: centered.centered,
    evenLayer: bestSecond.slots,
    footprintL: centered.footprintL,
    footprintW: centered.footprintW,
    variantNote: `Split-Zone (${bestSecond.transformName})`,
  };
}

/**
 * Sweeps all interior X and Z seam lines across stacked layers to detect straight vertical
 * cleavage planes (Fault Lines) where zero boxes bridge across the seam.
 */
function detectFaultLines(layersSlots: LayerSlot[][]): PalletFaultLine[] {
  if (layersSlots.length <= 1) return [];
  const allMinX = Math.min(...layersSlots.flat().map((s) => s.x - s.sizeX / 2));
  const allMaxX = Math.max(...layersSlots.flat().map((s) => s.x + s.sizeX / 2));
  const allMinZ = Math.min(...layersSlots.flat().map((s) => s.z - s.sizeZ / 2));
  const allMaxZ = Math.max(...layersSlots.flat().map((s) => s.z + s.sizeZ / 2));

  const collectInteriorPlanes = (axis: 'x' | 'z', boundMin: number, boundMax: number): number[] => {
    const raw: number[] = [];
    for (const s of layersSlots.flat()) {
      const lo = axis === 'x' ? s.x - s.sizeX / 2 : s.z - s.sizeZ / 2;
      const hi = axis === 'x' ? s.x + s.sizeX / 2 : s.z + s.sizeZ / 2;
      if (lo > boundMin + 55 && lo < boundMax - 55) raw.push(lo);
      if (hi > boundMin + 55 && hi < boundMax - 55) raw.push(hi);
    }
    raw.sort((a, b) => a - b);
    const deduped: number[] = [];
    for (const v of raw) {
      if (deduped.length === 0 || Math.abs(v - deduped[deduped.length - 1]) > 14) {
        deduped.push(v);
      }
    }
    return deduped;
  };

  const faultLines: PalletFaultLine[] = [];

  const checkAxis = (axis: 'x' | 'z', planes: number[]) => {
    for (const plane of planes) {
      let unbridgedLayers = 0;
      let seamPresentLayers = 0;
      let topConsecutiveUnbridged = 0;

      for (let li = layersSlots.length - 1; li >= 0; li--) {
        const layer = layersSlots[li];
        let isBridgedInLayer = false;
        let hasSeamEdge = false;

        for (const s of layer) {
          const lo = axis === 'x' ? s.x - s.sizeX / 2 : s.z - s.sizeZ / 2;
          const hi = axis === 'x' ? s.x + s.sizeX / 2 : s.z + s.sizeZ / 2;
          // Bridges plane cleanly if box extends >= 32mm on BOTH sides of plane
          if (lo < plane - 32 && hi > plane + 32) {
            isBridgedInLayer = true;
            break;
          }
          if (Math.abs(lo - plane) <= 18 || Math.abs(hi - plane) <= 18) {
            hasSeamEdge = true;
          }
        }

        if (!isBridgedInLayer) {
          unbridgedLayers++;
          if (hasSeamEdge) seamPresentLayers++;
          if (li === layersSlots.length - 1 - (layersSlots.length - 1 - li) && topConsecutiveUnbridged === layersSlots.length - 1 - li) {
            topConsecutiveUnbridged++;
          }
        }
      }

      // Critical fault line: zero layers bridge this vertical seam from bottom to top
      if (unbridgedLayers === layersSlots.length && seamPresentLayers >= Math.max(2, Math.ceil(layersSlots.length * 0.6))) {
        faultLines.push({
          axis,
          posMm: round1(plane),
          severity: 'critical',
          label: `Belah ${axis.toUpperCase()}=${Math.round(plane)}mm (Tembus ${layersSlots.length} lyr)`,
        });
      } else if (layersSlots.length >= 3 && topConsecutiveUnbridged >= 2 && seamPresentLayers >= 2 && unbridgedLayers >= layersSlots.length - 1) {
        faultLines.push({
          axis,
          posMm: round1(plane),
          severity: 'warning',
          label: `Retak atas ${axis.toUpperCase()}=${Math.round(plane)}mm`,
        });
      }
    }
  };

  checkAxis('x', collectInteriorPlanes('x', allMinX, allMaxX));
  checkAxis('z', collectInteriorPlanes('z', allMinZ, allMaxZ));

  return faultLines.slice(0, 6);
}

/**
 * Builds pure Alternating Otomatis stack evaluation with real seam-bridging, 4-corner support,
 * corrugated Mullen burst margin, and dry-friction No-Plakban forklift braking survival physics.
 */
function buildAndScoreEvaluation(
  patternType: PalletPatternType,
  label: string,
  palletCfg: PalletConfig,
  caseOuterDims: { length: number; width: number; depth: number },
  caseGrossKg: number,
  correctedBctKgf: number,
  safetyFactor: number,
  unitsPerCase: number,
  maxLayersByHeight: number,
  palletPayloadLimitKg: number,
  physicsCtx?: PalletPhysicsContext
): PalletPatternEvaluation {
  const effPalletL = palletCfg.palletLengthMm + 2 * Math.max(0, palletCfg.allowedOverhangMm);
  const effPalletW = palletCfg.palletWidthMm + 2 * Math.max(0, palletCfg.allowedOverhangMm);
  const boxL = Math.max(30, caseOuterDims.length);
  const boxW = Math.max(30, caseOuterDims.width);
  const boxD = Math.max(30, caseOuterDims.depth);

  const slipSheetH = palletCfg.useSlipSheet ? 2 : 0;
  const tierPadH = palletCfg.useTierSheets ? Math.max(1, palletCfg.tierSheetThicknessMm) : 0;
  const palletArea = Math.max(1, palletCfg.palletLengthMm * palletCfg.palletWidthMm);

  const tpl = generateSingleLayerSlots(patternType, effPalletL, effPalletW, boxL, boxW);
  const refCasesPerLayer = Math.max(
    1,
    Math.min(tpl.oddLayer.length, tpl.evenLayer.length || tpl.oddLayer.length)
  );

  const maxLayersByWeight = Math.max(
    1,
    Math.floor(palletPayloadLimitKg / Math.max(0.1, refCasesPerLayer * caseGrossKg))
  );
  const autoMaxLayers = Math.max(1, Math.min(maxLayersByHeight, maxLayersByWeight));
  const layerCount =
    palletCfg.manualLayerCount !== null && palletCfg.manualLayerCount >= 1
      ? Math.min(20, Math.round(palletCfg.manualLayerCount))
      : autoMaxLayers;

  const layerPatterns: PalletPatternType[] = Array.from({ length: layerCount }, () => patternType);

  // Pure Alternating Otomatis: odd layers vs even layers
  const layersSlots: LayerSlot[][] = [];
  for (let li = 0; li < layerCount; li++) {
    if (patternType === 'column' || li % 2 === 0) {
      layersSlots.push(tpl.oddLayer);
    } else {
      layersSlots.push(tpl.evenLayer);
    }
  }

  const faultLines = detectFaultLines(layersSlots);
  const hasCriticalFault = faultLines.some((f) => f.severity === 'critical');

  let totalCases = 0;
  let footprintL = 0;
  let footprintW = 0;
  let sumX = 0;
  let sumZ = 0;

  let bridgedUpperCount = 0;
  let totalUpperCount = 0;
  let upperCornersTotal = 0;
  let upperCornersSupported = 0;
  let topLockedOrSupported = 0;
  const layerCaseCounts: number[] = [];
  const placements: PalletBoxPlacement[] = [];

  for (let li = 0; li < layerCount; li++) {
    const layerNum = li + 1;
    const curSlots = layersSlots[li];
    layerCaseCounts.push(curSlots.length);
    totalCases += curSlots.length;

    const yBottom = palletCfg.palletHeightMm + slipSheetH + li * (boxD + tierPadH);
    const pairStats =
      li > 0 ? measurePairBridging(curSlots, layersSlots[li - 1], palletCfg.useTierSheets) : null;
    const aboveStats =
      li < layerCount - 1
        ? measurePairBridging(layersSlots[li + 1], curSlots, palletCfg.useTierSheets)
        : null;

    const lMinX = curSlots.length ? Math.min(...curSlots.map((s) => s.x - s.sizeX / 2)) : 0;
    const lMaxX = curSlots.length ? Math.max(...curSlots.map((s) => s.x + s.sizeX / 2)) : 0;
    const lMinZ = curSlots.length ? Math.min(...curSlots.map((s) => s.z - s.sizeZ / 2)) : 0;
    const lMaxZ = curSlots.length ? Math.max(...curSlots.map((s) => s.z + s.sizeZ / 2)) : 0;
    footprintL = Math.max(footprintL, round1(lMaxX - lMinX));
    footprintW = Math.max(footprintW, round1(lMaxZ - lMinZ));

    const isTopLayer = li === layerCount - 1;

    curSlots.forEach((s, idx) => {
      sumX += s.x;
      sumZ += s.z;

      const pairBox = pairStats?.perBox[idx];
      const bridgedBelowCount = pairBox ? pairBox.bridgedCount : 1;
      const supportOverlapPct = pairBox ? pairBox.supportPct : 100;
      const supportedCorners = pairBox ? pairBox.supportedCorners : 4;
      const unsupportedCornerCoords = pairBox ? pairBox.unsupportedCornerCoords : [];

      if (li > 0) {
        totalUpperCount++;
        if (bridgedBelowCount >= 2 && supportOverlapPct >= 85) bridgedUpperCount++;
        upperCornersTotal += 4;
        upperCornersSupported += supportedCorners;
      }

      const isPerimeter =
        s.x - s.sizeX / 2 <= lMinX + 12 ||
        s.x + s.sizeX / 2 >= lMaxX - 12 ||
        s.z - s.sizeZ / 2 <= lMinZ + 12 ||
        s.z + s.sizeZ / 2 >= lMaxZ - 12;

      const nearCriticalFault = faultLines.some(
        (fl) =>
          fl.severity === 'critical' &&
          (fl.axis === 'x'
            ? Math.abs(s.x - s.sizeX / 2 - fl.posMm) <= 22 || Math.abs(s.x + s.sizeX / 2 - fl.posMm) <= 22
            : Math.abs(s.z - s.sizeZ / 2 - fl.posMm) <= 22 || Math.abs(s.z + s.sizeZ / 2 - fl.posMm) <= 22)
      );

      let lockStatus: PalletLockStatus = 'column';
      if (layerCount === 1) {
        lockStatus = isPerimeter && !palletCfg.useTopLayerPlakban ? 'at-risk' : 'column';
      } else if (li === 0) {
        const lockedFromAbove = aboveStats
          ? layersSlots[1].some((_, ui) => (aboveStats.perBox[ui]?.bridgedCount || 0) >= 2) &&
            patternType !== 'column'
          : false;
        lockStatus = nearCriticalFault ? 'at-risk' : lockedFromAbove ? 'locked' : 'column';
      } else {
        const poorlySupported = supportOverlapPct < 88 || supportedCorners <= 1;
        const looseTopPerimeter =
          isTopLayer && bridgedBelowCount <= 1 && isPerimeter && !palletCfg.useTopLayerPlakban;
        if (poorlySupported || looseTopPerimeter || (nearCriticalFault && bridgedBelowCount <= 1)) {
          lockStatus = 'at-risk';
        } else if (bridgedBelowCount >= 2 && supportedCorners >= 3) {
          lockStatus = 'locked';
        } else if (bridgedBelowCount >= 2 && supportedCorners === 2) {
          // Interlocked seam, though 2 corners sit over gaps — still locked against slide but corner marker warns!
          lockStatus = 'locked';
        } else {
          lockStatus = 'column';
        }
      }

      if (isTopLayer) {
        if (
          (lockStatus === 'locked' && supportedCorners >= 3) ||
          (lockStatus === 'locked' && bridgedBelowCount >= 2) ||
          (palletCfg.useTopLayerPlakban && supportOverlapPct >= 88)
        ) {
          topLockedOrSupported++;
        }
      }

      placements.push({
        x: s.x,
        y: yBottom,
        z: s.z,
        sizeX: s.sizeX,
        sizeY: boxD,
        sizeZ: s.sizeZ,
        rotated90: s.rotated90,
        angleDeg: s.angleDeg,
        layer: layerNum,
        patternUsed: patternType,
        bridgedBelowCount,
        supportOverlapPct,
        supportedCorners,
        unsupportedCornerCoords,
        lockStatus,
      });
    });
  }

  const casesPerLayer = layerCaseCounts[0] || 0;
  const totalUnits = totalCases * Math.max(1, unitsPerCase);

  const overhangL = Math.max(0, round1((footprintL - palletCfg.palletLengthMm) / 2));
  const overhangW = Math.max(0, round1((footprintW - palletCfg.palletWidthMm) / 2));
  const maxOverhang = Math.max(overhangL, overhangW);

  const seamLockPct = totalUpperCount > 0 ? round1((bridgedUpperCount / totalUpperCount) * 100) : 0;
  const supportedCornerPct =
    upperCornersTotal > 0 ? round1((upperCornersSupported / upperCornersTotal) * 100) : 100;
  const unsupportedCornerCount = upperCornersTotal - upperCornersSupported;

  // Vertical corners carry ~65% of compressive corrugated BCT; unsupported corners accelerate local buckling
  const cornerCrushDerateFactor =
    patternType === 'column'
      ? 1.0
      : round2(clamp(0.82 + (supportedCornerPct / 100) * 0.18 + (palletCfg.useTierSheets ? 0.08 : 0), 0.78, 1.0));

  let patternAlignmentFactor = 1.0;
  if (patternType !== 'column') {
    const baseDerate =
      patternType === 'interlock'
        ? 0.72 + (1 - seamLockPct / 100) * 0.12
        : patternType === 'pinwheel'
        ? 0.78
        : 0.79;
    const rawAlign = baseDerate * (0.9 + 0.1 * (supportedCornerPct / 100));
    patternAlignmentFactor = palletCfg.useTierSheets
      ? Math.min(0.94, round2(rawAlign + 0.14))
      : round2(rawAlign);
  }

  const overhangPenaltyFactor =
    maxOverhang > 0.5
      ? Math.max(0.55, round2(1 - 0.35 * (maxOverhang / Math.min(boxL, boxW))))
      : 1.0;

  const effectivePalletBctKgf = round1(
    correctedBctKgf * patternAlignmentFactor * cornerCrushDerateFactor * overhangPenaltyFactor
  );
  const weightAboveBottomCases = Math.max(0, totalCases - (layerCaseCounts[0] || 0));
  const bottomBoxCount = Math.max(1, layerCaseCounts[0] || 1);
  const bottomLayerLoadKgf = round1((weightAboveBottomCases / bottomBoxCount) * caseGrossKg);
  const actualSafetyFactor =
    bottomLayerLoadKgf > 0.01 ? round1(effectivePalletBctKgf / bottomLayerLoadKgf) : 99.9;

  const maxSafeLayersByBct =
    caseGrossKg > 0.01
      ? 1 + Math.floor(effectivePalletBctKgf / (caseGrossKg * Math.max(1, safetyFactor)))
      : 20;

  let bctStatus: 'safe' | 'marginal' | 'overload' = 'safe';
  if (layerCount > 1) {
    if (actualSafetyFactor < 1.5 || layerCount > maxSafeLayersByBct + 1) {
      bctStatus = 'overload';
    } else if (actualSafetyFactor < safetyFactor) {
      bctStatus = 'marginal';
    }
  }

  const totalStackHeightMm = round1(
    palletCfg.palletHeightMm +
      slipSheetH +
      layerCount * boxD +
      Math.max(0, layerCount - 1) * tierPadH
  );

  const usedCaseFootprintArea = layersSlots[0].reduce((sum, s) => sum + s.sizeX * s.sizeZ, 0);
  const areaEfficiencyPct = round1(Math.min(100, (usedCaseFootprintArea / palletArea) * 100));
  const maxEnvelopeVol = Math.max(
    1,
    palletArea * Math.max(1, palletCfg.maxStackHeightMm - palletCfg.palletHeightMm)
  );
  const cubeEfficiencyPct = round1(
    Math.min(100, ((totalCases * boxL * boxW * boxD) / maxEnvelopeVol) * 100)
  );

  const netLoadKg = round1(totalCases * caseGrossKg);
  const grossLoadKg = round1(netLoadKg + PALLET_TARE_KG);

  const cogOffsetXMm = totalCases > 0 ? round1(sumX / totalCases) : 0;
  const cogOffsetZMm = totalCases > 0 ? round1(sumZ / totalCases) : 0;
  const cogOffsetMm = round1(Math.hypot(cogOffsetXMm, cogOffsetZMm));

  const cargoHeightMm = Math.max(boxD, totalStackHeightMm - palletCfg.palletHeightMm);
  const minFootprint = Math.max(
    120,
    Math.min(footprintL || palletCfg.palletLengthMm, footprintW || palletCfg.palletWidthMm)
  );
  const slendernessRatio = round2(cargoHeightMm / minFootprint);

  const topCount = Math.max(1, layerCaseCounts[layerCount - 1] || 1);
  let topLayerLockPct = round1((topLockedOrSupported / topCount) * 100);
  if (palletCfg.useTopLayerPlakban) {
    topLayerLockPct = Math.max(topLayerLockPct, 94);
  } else if (palletCfg.useTierSheets && layerCount > 1) {
    topLayerLockPct = Math.min(100, round1(topLayerLockPct + 12));
  }

  // Tribology & Burst Evaluation
  const surfaceFrictionCoeff = physicsCtx?.surfaceFrictionCoeff ?? 0.42;
  const burstStrengthKpa = physicsCtx?.burstStrengthKpa ?? 720;
  const requiredBurstKpa = 420 + caseGrossKg * 52 + (bctStatus !== 'safe' ? 140 : 0);
  const burstMarginRatio = round2(burstStrengthKpa / Math.max(250, requiredBurstKpa));
  const burstStatus: PalletStabilityMetrics['burstStatus'] =
    burstMarginRatio >= 1.25 ? 'strong' : burstMarginRatio >= 0.98 ? 'marginal' : 'weak';

  // Dry-friction No-Plakban lateral braking G survival (without top strapping!)
  const frictionBonus = (surfaceFrictionCoeff - 0.35) * 0.45;
  const rawNoPlakbanG =
    0.22 +
    frictionBonus +
    (seamLockPct / 100) * 0.13 +
    (topLayerLockPct / 100) * 0.08 +
    (supportedCornerPct / 100) * 0.05 +
    (palletCfg.useTierSheets ? 0.04 : 0) +
    (palletCfg.useCornerPosts ? 0.05 : 0) -
    (hasCriticalFault ? 0.12 : faultLines.length > 0 ? 0.05 : 0) -
    Math.max(0, slendernessRatio - 1.15) * 0.08 -
    Math.min(0.08, (cogOffsetMm / 100) * 0.04) -
    (maxOverhang > 0 ? 0.06 : 0);

  const noPlakbanSafeG = round2(clamp(rawNoPlakbanG, 0.12, 0.56));
  const noPlakbanPass035g = noPlakbanSafeG >= 0.35 && !hasCriticalFault;
  const noPlakbanPass045g = noPlakbanSafeG >= 0.45 && !hasCriticalFault;

  const lateralGCapacity = round2(
    clamp(noPlakbanSafeG + (palletCfg.useTopLayerPlakban ? 0.1 : 0), 0.12, 0.65)
  );

  const forkliftSafetyLabel: PalletStabilityMetrics['forkliftSafetyLabel'] =
    lateralGCapacity >= 0.36 && !hasCriticalFault
      ? 'Stabil Kuat'
      : lateralGCapacity >= 0.27
      ? 'Butuh Plakban / Wrap'
      : 'Rawan Rubuh';

  const stabilityScore = Math.round(
    clamp(
      seamLockPct * 0.36 +
        topLayerLockPct * 0.24 +
        supportedCornerPct * 0.16 +
        clamp((lateralGCapacity / 0.45) * 24, 0, 24) -
        faultLines.length * 10 -
        Math.min(12, cogOffsetMm * 0.15),
      8,
      100
    )
  );

  const bctComponent =
    bctStatus === 'safe'
      ? 100
      : bctStatus === 'marginal'
      ? 68
      : clamp(42 * (actualSafetyFactor / Math.max(1, safetyFactor)), 8, 45);
  const spaceComponent = areaEfficiencyPct * 0.55 + cubeEfficiencyPct * 0.45;
  const smartScore = Math.round(
    clamp(spaceComponent * 0.33 + bctComponent * 0.29 + stabilityScore * 0.38, 5, 100)
  );

  const recommendations: string[] = [];
  if (hasCriticalFault) {
    recommendations.push(
      `Terdeteksi ${faultLines.length} garis belah vertikal penuh: gunakan pola Alternating Interlock/Pinwheel atau sesuaikan dimensi +5/+20mm.`
    );
  }
  if (!noPlakbanPass035g && !palletCfg.useTopLayerPlakban) {
    recommendations.push(
      `Tanpa plakban baru tahan ±${noPlakbanSafeG}g (<0.35g standar rem forklift) — ubah dimensi ke titik Sweet-Spot atau tingkatkan kekasaran Kraft.`
    );
  } else if (noPlakbanPass035g && !palletCfg.useTopLayerPlakban) {
    recommendations.push(
      `Lolos tanpa plakban untuk rem normal (±${noPlakbanSafeG}g ≥ 0.35g, μ=${surfaceFrictionCoeff}).`
    );
  }
  if (supportedCornerPct < 88 && patternType !== 'column') {
    recommendations.push(
      `${unsupportedCornerCount} titik sudut dus menggantung di atas celah (${supportedCornerPct}% menumpu) — cek Heat-Map untuk mencegah penyok dinding.`
    );
  }
  if (burstStatus !== 'strong') {
    recommendations.push(
      `Ketahanan pecah (Burst ${burstStrengthKpa} kPa) mendekati batas beban — perkuat inner liner (hindari Medium 125 di liner dalam).`
    );
  }
  if (recommendations.length === 0) {
    recommendations.push(
      `Perfeksionis: 0 garis belah, Lock ${seamLockPct}%, Sudut ${supportedCornerPct}%, Burst ${burstStrengthKpa} kPa, kuat tanpa plakban.`
    );
  }

  return {
    patternType,
    label,
    patternSummary: tpl.variantNote,
    casesPerLayer,
    layerCount,
    totalCases,
    totalUnits,
    footprintL,
    footprintW,
    overhangL,
    overhangW,
    areaEfficiencyPct,
    cubeEfficiencyPct,
    netLoadKg,
    grossLoadKg,
    patternAlignmentFactor,
    overhangPenaltyFactor,
    effectivePalletBctKgf,
    bottomLayerLoadKgf,
    actualSafetyFactor,
    maxSafeLayersByBct,
    layerBreakdown: {
      maxByHeight: maxLayersByHeight,
      maxByWeight: maxLayersByWeight,
      maxByBct: maxSafeLayersByBct,
    },
    bctStatus,
    placements,
    layerHeightMm: round1(boxD + tierPadH),
    totalStackHeightMm,
    layerPatterns,
    layerCaseCounts,
    stability: {
      seamLockPct,
      topLayerLockPct,
      supportedCornerPct,
      unsupportedCornerCount,
      cornerCrushDerateFactor,
      faultLineCount: faultLines.length,
      faultLines,
      cogOffsetXMm,
      cogOffsetZMm,
      cogOffsetMm,
      slendernessRatio,
      surfaceFrictionCoeff,
      noPlakbanSafeG,
      noPlakbanPass035g,
      noPlakbanPass045g,
      lateralGCapacity,
      burstStrengthKpa,
      burstMarginRatio,
      burstStatus,
      forkliftSafetyLabel,
      stabilityScore,
      smartScore,
      recommendations,
    },
  };
}

const PATTERN_LABELS: Record<PalletPatternType, string> = {
  column: 'Column / Block Stack',
  interlock: 'Interlocked / Brick Stack',
  pinwheel: 'Pinwheel / Swirl',
  'split-block': 'Split-Block Multi-Zone',
};

export function pickOptimalPatternType(
  evaluations: PalletPatternEvaluation[],
  mode: 'smart' | 'max-density' = 'smart'
): PalletPatternType {
  if (evaluations.length === 0) return 'interlock';
  const sorted = [...evaluations].sort((a, b) => {
    if (mode === 'max-density') {
      if (b.totalCases !== a.totalCases) return b.totalCases - a.totalCases;
      return b.stability.smartScore - a.stability.smartScore;
    }
    if (b.stability.smartScore !== a.stability.smartScore) {
      return b.stability.smartScore - a.stability.smartScore;
    }
    return b.totalCases - a.totalCases;
  });
  return sorted[0].patternType;
}

export function computeSmartPalletAdvisor(
  palletCfg: PalletConfig,
  caseOuterDims: { length: number; width: number; depth: number },
  caseGrossKg: number,
  correctedBctKgf: number,
  safetyFactor: number,
  unitsPerCase: number,
  physicsCtx?: PalletPhysicsContext
): {
  bestEvaluation: PalletPatternEvaluation;
  bestPatternType: PalletPatternType;
  suggestTopPlakban: boolean;
  suggestTierSheets: boolean;
  variants: PalletCandidateVariant[];
} {
  const evals = evaluateAllPalletPatterns(
    palletCfg,
    caseOuterDims,
    caseGrossKg,
    correctedBctKgf,
    safetyFactor,
    unitsPerCase,
    physicsCtx
  );

  const sorted = [...evals].sort((a, b) => {
    if (b.stability.smartScore !== a.stability.smartScore) {
      return b.stability.smartScore - a.stability.smartScore;
    }
    return b.totalCases - a.totalCases;
  });

  const best = sorted[0];
  const variants: PalletCandidateVariant[] = sorted.map((ev, idx) => ({
    key: `${ev.patternType}__alt__${idx}`,
    title: ev.label,
    subtitle: ev.patternSummary || ev.label,
    basePattern: ev.patternType,
    casesPerLayer: ev.casesPerLayer,
    totalCases: ev.totalCases,
    areaEfficiencyPct: ev.areaEfficiencyPct,
    seamLockPct: ev.stability.seamLockPct,
    supportedCornerPct: ev.stability.supportedCornerPct,
    faultLineCount: ev.stability.faultLineCount,
    noPlakbanSafeG: ev.stability.noPlakbanSafeG,
    smartScore: ev.stability.smartScore,
    bctStatus: ev.bctStatus,
  }));

  return {
    bestEvaluation: best,
    bestPatternType: best.patternType,
    suggestTopPlakban: !best.stability.noPlakbanPass035g,
    suggestTierSheets:
      (best.bctStatus !== 'safe' || best.stability.supportedCornerPct < 80) &&
      best.patternType !== 'column',
    variants,
  };
}

/**
 * Evaluates all 4 TOPS patterns strictly under Alternating Otomatis (plus Column baseline)
 * with complete geometric Seam-Lock, 4-Corner Support, Mullen Burst, & No-Plakban metrics.
 */
export function evaluateAllPalletPatterns(
  palletCfg: PalletConfig,
  caseOuterDims: { length: number; width: number; depth: number },
  caseGrossKg: number,
  correctedBctKgf: number,
  safetyFactor: number,
  unitsPerCase: number,
  physicsCtx?: PalletPhysicsContext
): PalletPatternEvaluation[] {
  const patterns: PalletPatternType[] = ['column', 'interlock', 'pinwheel', 'split-block'];
  const boxD = Math.max(30, caseOuterDims.depth);

  const slipSheetH = palletCfg.useSlipSheet ? 2 : 0;
  const tierPadH = palletCfg.useTierSheets ? Math.max(1, palletCfg.tierSheetThicknessMm) : 0;
  const availLoadHeight = Math.max(
    boxD,
    palletCfg.maxStackHeightMm - palletCfg.palletHeightMm - slipSheetH
  );
  const maxLayersByHeight = Math.max(
    1,
    Math.floor((availLoadHeight + tierPadH) / (boxD + tierPadH))
  );
  const palletPayloadLimitKg = Math.max(50, palletCfg.maxPalletWeightKg - PALLET_TARE_KG);

  const evaluations = patterns.map((pattern) =>
    buildAndScoreEvaluation(
      pattern,
      PATTERN_LABELS[pattern],
      palletCfg,
      caseOuterDims,
      caseGrossKg,
      correctedBctKgf,
      safetyFactor,
      unitsPerCase,
      maxLayersByHeight,
      palletPayloadLimitKg,
      physicsCtx
    )
  );

  const bestType = pickOptimalPatternType(
    evaluations,
    palletCfg.recommendationMode || 'smart'
  );
  return evaluations.map((ev) => ({
    ...ev,
    isSmartRecommended: ev.patternType === bestType,
  }));
}

function estimateScaledBct(
  baseInner: BoxDimensions,
  baseCorrectedBctKgf: number,
  candInner: BoxDimensions,
  T: number
): number {
  const basePerim = Math.max(40, 2 * (baseInner.length + 2 * T + baseInner.width + 2 * T));
  const candPerim = Math.max(40, 2 * (candInner.length + 2 * T + candInner.width + 2 * T));
  const perimScale = Math.pow(candPerim / basePerim, 0.492);
  const stab = (d: number, l: number, w: number) => {
    const r = d / Math.max(1, Math.min(l, w));
    return r <= 1.5 ? 1.0 : r <= 2.0 ? 0.95 : r <= 2.5 ? 0.9 : 0.85;
  };
  const stabScale =
    stab(candInner.depth, candInner.length, candInner.width) /
    stab(baseInner.depth, baseInner.length, baseInner.width);
  return round1(baseCorrectedBctKgf * perimScale * stabScale);
}

function buildBoardSpecAdvice(
  eng: EngineeringConfig,
  boardGrade: 'single-wall' | 'double-wall',
  innerDims: BoxDimensions,
  caliperMm: number,
  currentCorrectedBctKgf: number,
  requiredLayerLoadKgf: number,
  safetyFactor: number,
  burstStatus: PalletStabilityMetrics['burstStatus']
): BoardSpecAdvice | null {
  const needsUpgrade =
    burstStatus !== 'strong' ||
    eng.bottomLayer.startsWith('M') ||
    (requiredLayerLoadKgf > 0 && currentCorrectedBctKgf / requiredLayerLoadKgf < safetyFactor);

  if (!needsUpgrade) return null;

  const targetCandidates: Array<{
    top: PaperGradeId;
    med: MediumGradeId;
    bot: PaperGradeId;
    flute: BctFluteId;
    dw: 'single-wall' | 'double-wall';
    label: string;
  }> = [
    { top: eng.topLayer, med: eng.mediumLayer, bot: 'K150', flute: eng.fluteId, dw: boardGrade, label: `${eng.topLayer}/${eng.mediumLayer}/K150 (${eng.fluteId})` },
    { top: 'K150', med: 'M150', bot: 'K150', flute: eng.fluteId, dw: boardGrade, label: `K150/M150/K150 (${eng.fluteId})` },
    { top: 'K175', med: 'M150', bot: 'K175', flute: eng.fluteId, dw: boardGrade, label: `K175/M150/K175 (${eng.fluteId})` },
    { top: 'K150', med: 'M125', bot: 'K150', flute: 'BC', dw: 'double-wall', label: 'K150/M125/M125/M125/K150 (BC)' },
  ];

  const perimMm = 2 * (innerDims.length + 2 * caliperMm + innerDims.width + 2 * caliperMm);

  for (const cand of targetCandidates) {
    if (
      cand.top === eng.topLayer &&
      cand.med === eng.mediumLayer &&
      cand.bot === eng.bottomLayer &&
      cand.flute === eng.fluteId &&
      cand.dw === boardGrade
    ) {
      continue;
    }
    const candEng: EngineeringConfig = {
      ...eng,
      fluteId: cand.flute,
      topLayer: cand.top,
      mediumLayer: cand.med,
      bottomLayer: cand.bot,
      centerLayer: cand.dw === 'double-wall' ? 'M125' : eng.centerLayer,
      mediumLayer2: cand.dw === 'double-wall' ? 'M125' : eng.mediumLayer2,
    };
    const key =
      cand.dw === 'double-wall'
        ? `${candEng.topLayer}-${candEng.mediumLayer}-${candEng.centerLayer}-${candEng.mediumLayer2}-${candEng.bottomLayer}-${candEng.fluteId}`
        : `${candEng.topLayer}-${candEng.mediumLayer}-${candEng.bottomLayer}-${candEng.fluteId}`;
    const ect =
      EXTENDED_STANDARD_ECT_TABLE[key] ??
      estimateTappiEctFromLayers(candEng, cand.flute, cand.dw, eng.customRct);
    const fSpec = FLUTE_SPECS[cand.flute] || FLUTE_SPECS.C;
    const rawBct = computeMcKeeBctKgf(ect, fSpec.thickness, perimMm);
    const burstKpa = computeBoardBurstKpa(candEng, cand.dw);
    const ratio = currentCorrectedBctKgf > 0 ? rawBct / Math.max(1, computeMcKeeBctKgf(eng.ectValue / 5.59974 || ect, caliperMm, perimMm)) : 1.15;
    const estCorrected = round1(Math.max(currentCorrectedBctKgf * 1.1, currentCorrectedBctKgf * Math.max(1.05, ratio)));
    const bctGainPct = Math.round(((estCorrected - currentCorrectedBctKgf) / Math.max(1, currentCorrectedBctKgf)) * 100);

    if (burstKpa >= 860 && (requiredLayerLoadKgf <= 0 || estCorrected / requiredLayerLoadKgf >= Math.min(safetyFactor, 3.2))) {
      const botWasMedium = eng.bottomLayer.startsWith('M');
      return {
        recommendedRecipe: cand.label,
        topLayer: cand.top,
        mediumLayer: cand.med,
        bottomLayer: cand.bot,
        fluteId: cand.flute,
        burstKpa,
        ectKgfCm: ect,
        bctKgf: estCorrected,
        bctGainPct: Math.max(10, bctGainPct),
        reason: botWasMedium
          ? `Ganti inner liner ${ALL_PAPER_GRADES[eng.bottomLayer]?.name || eng.bottomLayer} menjadi ${cand.bot} menaikkan ketahanan pecah ke ${burstKpa} kPa dan mendongkrak BCT tanpa ubah ukuran dus.`
          : `Upgrade ke ${cand.label} menaikkan ketahanan pecah (${burstKpa} kPa) & batas aman tumpukan bawah.`,
      };
    }
  }
  return null;
}

/**
 * Runs a fast multi-horizon Perfectionist Sweep (±5mm Micro-Nudge & ±20mm Sweet-Spot)
 * from current CAD Inner Dimensions to eliminate fault lines, maximize Seam-Lock & Corner Support,
 * and pass 0.35g+ forklift braking WITHOUT plakban.
 */
export function computePerfectionistTuningReport(
  baseInnerDims: BoxDimensions,
  palletCfg: PalletConfig,
  caseGrossKg: number,
  correctedBctKgf: number,
  safetyFactor: number,
  unitsPerCase: number,
  physicsCtx?: PalletPhysicsContext
): PerfectionistTuningReport {
  const T = Math.max(0.8, physicsCtx?.fluteThicknessMm ?? 3.97);
  const hasTop = (physicsCtx?.boxStyle ?? '0201') !== '0200';
  const toOuter = (d: BoxDimensions) => ({
    length: round1(d.length + 2 * T),
    width: round1(d.width + 2 * T),
    depth: round1(d.depth + (hasTop ? 4 * T : 2 * T)),
  });

  // Always benchmark Perfectionist targets WITHOUT forced plakban so true lock & friction win!
  const probeCfg: PalletConfig = { ...palletCfg, useTopLayerPlakban: false };
  const baseOuter = toOuter(baseInnerDims);

  const baseEvals = evaluateAllPalletPatterns(
    probeCfg,
    baseOuter,
    caseGrossKg,
    correctedBctKgf,
    safetyFactor,
    unitsPerCase,
    physicsCtx
  );
  const baselineEval =
    [...baseEvals].sort((a, b) => b.stability.smartScore - a.stability.smartScore || b.totalCases - a.totalCases)[0] ||
    baseEvals[0];

  const effL = probeCfg.palletLengthMm + 2 * Math.max(0, probeCfg.allowedOverhangMm);
  const effW = probeCfg.palletWidthMm + 2 * Math.max(0, probeCfg.allowedOverhangMm);

  const scorePerfectionist = (ev: PalletPatternEvaluation) => {
    const st = ev.stability;
    return (
      st.smartScore +
      st.seamLockPct * 0.25 +
      st.supportedCornerPct * 0.3 +
      st.topLayerLockPct * 0.14 +
      (st.faultLineCount === 0 ? 14 : -st.faultLineCount * 22) +
      (st.noPlakbanPass035g ? 8 : 0) +
      (st.noPlakbanPass045g ? 4 : 0) +
      (ev.bctStatus === 'safe' ? 10 : ev.bctStatus === 'marginal' ? -8 : -28)
    );
  };

  // Fast 2-layer pre-screen followed by full evaluation of finalists
  interface RawCand {
    dL: number;
    dW: number;
    dD: number;
    id: BoxDimensions;
    od: { length: number; width: number; depth: number };
    fastScore: number;
    fastCases: number;
  }

  const probeFast = (dL: number, dW: number, dD: number): RawCand | null => {
    const id: BoxDimensions = {
      length: Math.max(60, Math.round(baseInnerDims.length + dL)),
      width: Math.max(60, Math.round(baseInnerDims.width + dW)),
      depth: Math.max(50, Math.round(baseInnerDims.depth + dD)),
    };
    const od = toOuter(id);
    if (od.length < od.width) return null;

    let bestPairScore = -Infinity;
    let bestCount = 0;

    for (const pat of ['interlock', 'pinwheel', 'split-block'] as const) {
      const tpl = generateSingleLayerSlots(pat, effL, effW, od.length, od.width);
      const cnt = tpl.oddLayer.length;
      if (cnt <= 0) continue;
      const pair = measurePairBridging(tpl.evenLayer, tpl.oddLayer, probeCfg.useTierSheets);
      const areaPct = ((cnt * od.length * od.width) / Math.max(1, effL * effW)) * 100;
      const sc =
        pair.seamLockPct * 1.15 +
        pair.supportedCornerPct * 0.75 +
        areaPct * 0.35 -
        pair.faultCount * 35 +
        (cnt >= baselineEval.casesPerLayer ? 12 : (cnt - baselineEval.casesPerLayer) * 4);
      if (sc > bestPairScore) {
        bestPairScore = sc;
        bestCount = cnt;
      }
    }

    return { dL, dW, dD, id, od, fastScore: bestPairScore, fastCases: bestCount };
  };

  // Sweep 1: Micro-Nudge within +-5mm (step 1mm on L & W)
  const microPool: RawCand[] = [];
  for (let dL = -5; dL <= 5; dL += 1) {
    for (let dW = -5; dW <= 5; dW += 1) {
      if (dL === 0 && dW === 0) continue;
      const res = probeFast(dL, dW, 0);
      if (res) microPool.push(res);
    }
  }
  microPool.sort((a, b) => b.fastScore - a.fastScore || Math.abs(a.dL) + Math.abs(a.dW) - (Math.abs(b.dL) + Math.abs(b.dW)));

  // Sweep 2: Coarse Sweet-Spot within +-20mm (step 2mm) + refinement +-1mm around top peaks
  const sweetPool: RawCand[] = [];
  const densityPool: RawCand[] = [];
  for (let dL = -20; dL <= 20; dL += 2) {
    for (let dW = -20; dW <= 20; dW += 2) {
      if (dL === 0 && dW === 0) continue;
      const res = probeFast(dL, dW, 0);
      if (res) {
        sweetPool.push(res);
        densityPool.push(res);
      }
    }
  }
  sweetPool.sort((a, b) => b.fastScore - a.fastScore);
  densityPool.sort((a, b) => b.fastCases - a.fastCases || b.fastScore - a.fastScore);

  const fineSet = new Map<string, RawCand>();
  for (const seed of [...sweetPool.slice(0, 6), ...densityPool.slice(0, 4)]) {
    for (let ox = -1; ox <= 1; ox++) {
      for (let oz = -1; oz <= 1; oz++) {
        const dL = clamp(seed.dL + ox, -20, 20);
        const dW = clamp(seed.dW + oz, -20, 20);
        if (dL === 0 && dW === 0) continue;
        const k = `${dL}_${dW}`;
        if (!fineSet.has(k)) {
          const r = probeFast(dL, dW, 0);
          if (r) fineSet.set(k, r);
        }
      }
    }
  }

  const evalFull = (c: RawCand, tier: PerfectionistSizeSuggestion['tier'], label: string): PerfectionistSizeSuggestion => {
    const candBct = estimateScaledBct(baseInnerDims, correctedBctKgf, c.id, T);
    const evs = evaluateAllPalletPatterns(
      probeCfg,
      c.od,
      caseGrossKg,
      candBct,
      safetyFactor,
      unitsPerCase,
      physicsCtx
    );
    const bestEv = [...evs].sort((a, b) => scorePerfectionist(b) - scorePerfectionist(a))[0];

    const diffTotal = bestEv.totalCases - baselineEval.totalCases;
    const diffLock = round1(bestEv.stability.seamLockPct - baselineEval.stability.seamLockPct);
    const diffCorner = round1(bestEv.stability.supportedCornerPct - baselineEval.stability.supportedCornerPct);
    const parts: string[] = [];
    if (diffTotal > 0) parts.push(`+${diffTotal} dus/palet`);
    if (diffLock > 1) parts.push(`Lock +${diffLock}%`);
    if (diffCorner > 1) parts.push(`Sudut menumpu +${diffCorner}%`);
    if (bestEv.stability.noPlakbanPass035g && !baselineEval.stability.noPlakbanPass035g) {
      parts.push('Lolos rem 0.35g tanpa plakban');
    } else if (bestEv.stability.noPlakbanSafeG > baselineEval.stability.noPlakbanSafeG) {
      parts.push(`Rem tanpa plakban ±${bestEv.stability.noPlakbanSafeG}g`);
    }
    if (bestEv.stability.faultLineCount === 0 && baselineEval.stability.faultLineCount > 0) {
      parts.push('0 garis belah');
    }
    if (parts.length === 0) {
      parts.push(`Area ${bestEv.areaEfficiencyPct}% · Lock ${bestEv.stability.seamLockPct}%`);
    }

    return {
      tier,
      label,
      innerDims: c.id,
      outerDims: c.od,
      deltaL: c.dL,
      deltaW: c.dW,
      deltaD: c.dD,
      patternType: bestEv.patternType,
      patternSummary: bestEv.patternSummary || bestEv.label,
      casesPerLayer: bestEv.casesPerLayer,
      totalCases: bestEv.totalCases,
      areaEfficiencyPct: bestEv.areaEfficiencyPct,
      seamLockPct: bestEv.stability.seamLockPct,
      topLayerLockPct: bestEv.stability.topLayerLockPct,
      supportedCornerPct: bestEv.stability.supportedCornerPct,
      faultLineCount: bestEv.stability.faultLineCount,
      noPlakbanSafeG: bestEv.stability.noPlakbanSafeG,
      noPlakbanPass035g: bestEv.stability.noPlakbanPass035g,
      bctStatus: bestEv.bctStatus,
      effectiveBctKgf: bestEv.effectivePalletBctKgf,
      smartScore: bestEv.stability.smartScore,
      evaluation: bestEv,
      reason: parts.join(' · '),
    };
  };

  // Pick top Micro-Nudge (+-5mm)
  const microEvaluated = microPool
    .slice(0, 16)
    .map((c) => evalFull(c, 'micro-5mm', 'Micro-Nudge (±5mm)'))
    .sort((a, b) => {
      const diff = scorePerfectionist(b.evaluation) - scorePerfectionist(a.evaluation);
      if (Math.abs(diff) > 0.4) return diff;
      return Math.abs(a.deltaL) + Math.abs(a.deltaW) - (Math.abs(b.deltaL) + Math.abs(b.deltaW));
    });
  const micro5mm = microEvaluated[0] || null;

  // Pick top Sweet-Spot (+-20mm) optimizing structural lock & zero-gap perfection
  const merged20 = Array.from(
    new Map<string, RawCand>([...sweetPool.slice(0, 12).map((c) => [`${c.dL}_${c.dW}`, c] as const), ...fineSet.entries()]).values()
  ).sort((a, b) => b.fastScore - a.fastScore);

  const sweetEvaluated = merged20
    .slice(0, 14)
    .map((c) => evalFull(c, 'sweetspot-20mm', 'Perfectionist Sweet-Spot (±20mm)'))
    .sort((a, b) => {
      const diff = scorePerfectionist(b.evaluation) - scorePerfectionist(a.evaluation);
      if (Math.abs(diff) > 0.4) return diff;
      return b.seamLockPct + b.supportedCornerPct - (a.seamLockPct + a.supportedCornerPct);
    });
  const sweetSpot20mm = sweetEvaluated[0] || null;

  // Pick Max-Capacity (+-20mm) that stays structurally clean (0 faults, safe/marginal BCT)
  const densityEvaluated = densityPool
    .slice(0, 10)
    .map((c) => evalFull(c, 'density-20mm', 'Maks Kapasitas (±20mm)'))
    .filter((s) => s.faultLineCount === 0 && s.bctStatus !== 'overload')
    .sort((a, b) => b.totalCases - a.totalCases || b.smartScore - a.smartScore);

  const densityCand = densityEvaluated[0] || null;
  const density20mm =
    densityCand &&
    (!sweetSpot20mm ||
      (densityCand.totalCases > sweetSpot20mm.totalCases &&
        (densityCand.innerDims.length !== sweetSpot20mm.innerDims.length ||
          densityCand.innerDims.width !== sweetSpot20mm.innerDims.width)))
      ? densityCand
      : null;

  const boardAdvice = physicsCtx?.engineering
    ? buildBoardSpecAdvice(
        physicsCtx.engineering,
        physicsCtx.boardGrade || 'single-wall',
        baseInnerDims,
        T,
        correctedBctKgf,
        baselineEval.bottomLayerLoadKgf,
        safetyFactor,
        baselineEval.stability.burstStatus
      )
    : null;

  return {
    baselineEval,
    baselineInner: baseInnerDims,
    baselineOuter: baseOuter,
    micro5mm,
    sweetSpot20mm,
    density20mm,
    boardAdvice,
  };
}
