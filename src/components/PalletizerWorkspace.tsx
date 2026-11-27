import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  FileDown,
  Flame,
  Layers,
  PanelLeftClose,
  RotateCcw,
  Ruler,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Target,
  Truck,
  X,
} from 'lucide-react';
import {
  BoxConfig,
  CasePackConfig,
  DEFAULT_CASE_PACK_CONFIG,
  DEFAULT_PALLET_CONFIG,
  DEFAULT_VEHICLE_CONFIG,
  DielinePaths,
  EngineeringAnalysis,
  FLUTE_SPECS,
  INDONESIAN_VEHICLE_PRESETS,
  PALLET_MARGIN_MAX_MM,
  PALLET_MARGIN_MIN_MM,
  PALLET_MARGIN_PRESETS,
  PALLET_PRESETS,
  PalletConfig,
  PalletPatternEvaluation,
  PalletPatternType,
  PalletPerimeterAlignMode,
  PalletVehicleConfig,
  PalletViewOverlayMode,
  PerfectionistSizeSuggestion,
  PerfectionistTuningReport,
  SteppedBoardRecommendation,
  VehicleLayoutPreference,
  VehicleLoadingMode,
  VehiclePresetId,
  VehicleStackingMode,
} from '../types';
import {
  computeBoardBurstKpa,
  computeCaseGrossWeightKg,
  computeSurfaceFrictionCoeff,
  formatSubstanceString,
  getEffectiveProductNetWeightKg,
} from '../utils/engineering';
import {
  buildSmartPalletAdvisorFromEvals,
  computeEffectivePalletDims,
  computePerfectionistTuningReport,
  evaluateAllPalletPatternsCached,
  normalizePalletEdgeMarginMm,
  PalletPhysicsContext,
  pickOptimalPatternType,
} from '../utils/palletizer';
import {
  getEngineProfile,
  createDynamicResolutionController,
  scheduleIdleWork,
} from '../utils/browserEngine';
import { exportPalletizerReportPdf } from '../utils/palletizerReportPdf';
import {
  buildPalletVectorSceneCached,
  downloadPalletVectorSvg,
  exportPalletVectorPdf,
  VECTOR_STROKE_PRESETS,
  VectorStrokePreset,
} from '../utils/palletizerVectorExport';
import {
  buildVehicleConfigFromPreset,
  comparePalletVsFloor,
  computeSyncedPalletMaxHeight,
  solveFloorLoading,
  solveVehicleLoading,
} from '../utils/vehicleLoading';
import VehicleLoadingBlueprint from './VehicleLoadingBlueprint';
import MobileGenieSheet from './MobileGenieSheet';
import type {
  PalletizerWorkerRequest,
  PalletizerWorkerResponse,
  SmartPalletAdvisorResult,
} from '../workers/palletizer.worker';
import {
  TactileButton,
  TactileInputWell,
  TactileSegmented,
  TactileSelect,
  TactileSwitch,
} from './tactile/TactileUI';

function TactileSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5 pt-3 first:pt-0 border-t-[0.5px] first:border-t-0 border-[var(--line)]">
      <h3 className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--ink-10)]">
        {title}
      </h3>
      {children}
    </section>
  );
}

function TactileToggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <span className="text-[12px] leading-[17px] text-[var(--ink-11)]">{label}</span>
      <TactileSwitch checked={checked} onChange={onChange} ariaLabel={label} />
    </div>
  );
}

function TactileSlider({
  min,
  max,
  value,
  onChange,
}: {
  min: number;
  max: number;
  value: number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <input
      type="range"
      min={min}
      max={max}
      value={value}
      onChange={onChange}
      className="w-full h-1.5 rounded-full bg-[var(--ink-4)] accent-[var(--ink-12)] cursor-pointer"
    />
  );
}

interface PalletizerWorkspaceProps {
  config: BoxConfig;
  paths: DielinePaths;
  analysis: EngineeringAnalysis;
  onChange: React.Dispatch<React.SetStateAction<BoxConfig>>;
  onOpenEngineering: () => void;
  railOpen?: boolean;
  isOverlayRail?: boolean;
  onCloseRail?: () => void;
  hasMobileFloatingDock?: boolean;
  isShortLandscape?: boolean;
  focusMode?: boolean;
  requestedExportTab?: 'engineering' | 'vector' | null;
  onHandledExportRequest?: () => void;
  isActive?: boolean;
}

type LeftRailTab = 'pallet' | 'vehicle';
type CameraPreset = 'iso' | 'front' | 'top' | 'side';
type CanvasViewMode = '3d' | 'vehicle-2d';

function createWoodPalletTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#C9A87C';
  ctx.fillRect(0, 0, 256, 256);

  for (let y = 0; y < 256; y += 6) {
    const shade = (y * 13) % 18;
    ctx.fillStyle = y % 12 === 0 ? `rgba(120, 82, 42, ${0.08 + shade * 0.003})` : 'rgba(245, 224, 190, 0.08)';
    ctx.fillRect(0, y, 256, 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createCartonSideTexture(colorMode: 'kraft' | 'white', maxAniso: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = colorMode === 'kraft' ? '#CBA677' : '#F4F6F9';
  ctx.fillRect(0, 0, 128, 128);

  // Subtle vertical corrugation flute texture
  ctx.fillStyle = colorMode === 'kraft' ? 'rgba(92, 61, 30, 0.06)' : 'rgba(148, 163, 184, 0.07)';
  for (let x = 0; x < 128; x += 6) {
    ctx.fillRect(x, 0, 2, 128);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

function createCartonTopTexture(colorMode: 'kraft' | 'white', maxAniso: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = colorMode === 'kraft' ? '#CEAA7C' : '#F6F8FB';
  ctx.fillRect(0, 0, 256, 256);

  // Subtle flute grain along box length
  ctx.fillStyle = colorMode === 'kraft' ? 'rgba(92, 61, 30, 0.045)' : 'rgba(148, 163, 184, 0.05)';
  for (let y = 0; y < 256; y += 8) {
    ctx.fillRect(0, y, 256, 2);
  }

  // Center flap seam + translucent tape band running along local +X (Box Length)
  ctx.fillStyle = colorMode === 'kraft' ? 'rgba(155, 114, 66, 0.24)' : 'rgba(203, 213, 225, 0.42)';
  ctx.fillRect(0, 112, 256, 32);

  ctx.strokeStyle = colorMode === 'kraft' ? 'rgba(84, 54, 24, 0.55)' : 'rgba(100, 116, 139, 0.55)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 128);
  ctx.lineTo(256, 128);
  ctx.stroke();

  // Crisp TOPS-style directional chevron pointing +X so 0° vs 90° vs 180° orientation is unmistakable
  ctx.strokeStyle = colorMode === 'kraft' ? '#4F3216' : '#17191F';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(104, 84);
  ctx.lineTo(156, 128);
  ctx.lineTo(104, 172);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

function disposeGroupResources(root: THREE.Object3D) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((m) => {
        const std = m as THREE.MeshStandardMaterial;
        if (std.map) std.map.dispose();
        m.dispose();
      });
    }
  });
}

const _heatC0 = new THREE.Color('#16A34A'); // 0% (top / 1-layer, no load above)
const _heatC1 = new THREE.Color('#84CC16'); // ~45% safe
const _heatC2 = new THREE.Color('#EAB308'); // ~78% caution
const _heatC3 = new THREE.Color('#F97316'); // ~100% boundary
const _heatC4 = new THREE.Color('#EF4444'); // >100% overload
const _heatC5 = new THREE.Color('#B91C1C'); // >=140% severe overload
const _heatOut = new THREE.Color();

function computeHeatmapStressHex(stressRatio: number): string {
  const r = Math.max(0, Number.isFinite(stressRatio) ? stressRatio : 0);
  if (r <= 0.001) return '#16A34A';
  if (r <= 0.45) {
    _heatOut.copy(_heatC0).lerp(_heatC1, r / 0.45);
  } else if (r <= 0.78) {
    _heatOut.copy(_heatC1).lerp(_heatC2, (r - 0.45) / 0.33);
  } else if (r <= 1.0) {
    _heatOut.copy(_heatC2).lerp(_heatC3, (r - 0.78) / 0.22);
  } else {
    const t = Math.min(1, (r - 1.0) / 0.4);
    _heatOut.copy(_heatC4).lerp(_heatC5, t);
  }
  return `#${_heatOut.getHexString()}`;
}

interface PopulatePalletGroupParams {
  group: THREE.Group;
  pallet: PalletConfig;
  activeEvaluation: PalletPatternEvaluation;
  outerDimensions: { length: number; width: number; depth: number };
  materialColor: 'kraft' | 'white';
  safetyFactor: number;
  caseGrossKg: number;
  viewOverlayMode: PalletViewOverlayMode;
  maxAnisotropy: number;
  orientationContrast?: boolean;
}

function populatePalletGroup({
  group,
  pallet,
  activeEvaluation,
  outerDimensions,
  materialColor,
  safetyFactor,
  caseGrossKg,
  viewOverlayMode,
  maxAnisotropy,
  orientationContrast = false,
}: PopulatePalletGroupParams) {
  disposeGroupResources(group);
  group.clear();

  // Scale 1 mm = 0.001 Three.js world meters
  const S = 0.001;
  const pL = pallet.palletLengthMm * S;
  const pW = pallet.palletWidthMm * S;
  const pH = pallet.palletHeightMm * S;

  const woodTex = createWoodPalletTexture();
  const woodMat = new THREE.MeshStandardMaterial({
    map: woodTex,
    roughness: 0.78,
    metalness: 0.02,
  });
  const woodBlockMat = new THREE.MeshStandardMaterial({
    color: '#A57E52',
    roughness: 0.85,
    metalness: 0.02,
  });

  // 1. Composite Wooden Pallet (7 top deckboards + 3 bottom runners + 9 stringer blocks)
  const deckT = Math.min(0.024, pH * 0.16);
  const runnerT = deckT;
  const blockH = Math.max(0.04, pH - deckT - runnerT);

  const slatCount = 7;
  const slatWidth = (pW * 0.72) / slatCount;
  for (let i = 0; i < slatCount; i++) {
    const zPos = -pW / 2 + slatWidth / 2 + (i * (pW - slatWidth)) / (slatCount - 1);
    const slat = new THREE.Mesh(new THREE.BoxGeometry(pL, deckT, slatWidth), woodMat);
    slat.position.set(0, pH - deckT / 2, zPos);
    slat.castShadow = true;
    slat.receiveShadow = true;
    group.add(slat);
  }

  const runnerW = Math.min(0.1, pW * 0.1);
  [-pW / 2 + runnerW / 2, 0, pW / 2 - runnerW / 2].forEach((zPos) => {
    const runner = new THREE.Mesh(new THREE.BoxGeometry(pL, runnerT, runnerW), woodMat);
    runner.position.set(0, runnerT / 2, zPos);
    runner.receiveShadow = true;
    group.add(runner);
  });

  const blockL = Math.min(0.14, pL * 0.12);
  const xCoords = [-pL / 2 + blockL / 2, 0, pL / 2 - blockL / 2];
  const zCoords = [-pW / 2 + runnerW / 2, 0, pW / 2 - runnerW / 2];
  const blockGeo = new THREE.BoxGeometry(blockL, blockH, runnerW);
  for (const bx of xCoords) {
    for (const bz of zCoords) {
      const blk = new THREE.Mesh(blockGeo, woodBlockMat);
      blk.position.set(bx, runnerT + blockH / 2, bz);
      blk.castShadow = true;
      group.add(blk);
    }
  }

  // 2. Pallet Footprint & Safe Underhang Inset Wireframe Guides (Zero-Overhang Policy)
  const { marginMm, effPalletL, effPalletW } = computeEffectivePalletDims(pallet);
  const deckOutlineGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(pL, 0.004, pW));
  const hasOverhang = activeEvaluation.overhangL > 0.5 || activeEvaluation.overhangW > 0.5;
  const deckOutline = new THREE.LineSegments(
    deckOutlineGeo,
    new THREE.LineBasicMaterial({
      color: hasOverhang ? '#d97706' : '#16a34a',
    })
  );
  deckOutline.position.set(0, pH + 0.002, 0);
  group.add(deckOutline);

  if (marginMm < -0.5) {
    const effLM = effPalletL * S;
    const effWM = effPalletW * S;
    const safeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(effLM, 0.002, effWM));
    const safeLine = new THREE.LineSegments(
      safeGeo,
      new THREE.LineBasicMaterial({ color: '#4F46E5', transparent: true, opacity: 0.85 })
    );
    safeLine.position.set(0, pH + 0.0028, 0);
    group.add(safeLine);

    // Subtle 4-edge setback band showing protected anti-collision underhang rim on top of deck
    const bandMat = new THREE.MeshBasicMaterial({
      color: '#4F46E5',
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
    });
    const stripL = Math.max(0.001, (pL - effLM) / 2);
    const stripW = Math.max(0.001, (pW - effWM) / 2);
    const yBand = pH + 0.0022;

    const topStrip = new THREE.Mesh(new THREE.PlaneGeometry(pL, stripW), bandMat);
    topStrip.rotation.x = -Math.PI / 2;
    topStrip.position.set(0, yBand, -(effWM + stripW) / 2);
    group.add(topStrip);

    const botStrip = new THREE.Mesh(new THREE.PlaneGeometry(pL, stripW), bandMat);
    botStrip.rotation.x = -Math.PI / 2;
    botStrip.position.set(0, yBand, (effWM + stripW) / 2);
    group.add(botStrip);

    const leftStrip = new THREE.Mesh(new THREE.PlaneGeometry(stripL, effWM), bandMat);
    leftStrip.rotation.x = -Math.PI / 2;
    leftStrip.position.set(-(effLM + stripL) / 2, yBand, 0);
    group.add(leftStrip);

    const rightStrip = new THREE.Mesh(new THREE.PlaneGeometry(stripL, effWM), bandMat);
    rightStrip.rotation.x = -Math.PI / 2;
    rightStrip.position.set((effLM + stripL) / 2, yBand, 0);
    group.add(rightStrip);
  }

  // 3. Optional Bottom Slip Sheet
  if (pallet.useSlipSheet) {
    const slipGeo = new THREE.BoxGeometry(pL - 0.01, 0.002, pW - 0.01);
    const slipMat = new THREE.MeshStandardMaterial({
      color: '#8D6E48',
      roughness: 0.9,
    });
    const slip = new THREE.Mesh(slipGeo, slipMat);
    slip.position.set(0, pH + 0.001, 0);
    slip.receiveShadow = true;
    group.add(slip);
  }

  // 4. Render all active stack layers (single source of truth synced with layer slider)
  const maxVisibleLayer = activeEvaluation.layerCount;
  const visiblePlacements = activeEvaluation.placements;

  if (visiblePlacements.length > 0) {
    const isHeatmap = viewOverlayMode === 'lock-heatmap';
    const texColorMode = isHeatmap || orientationContrast ? 'white' : materialColor;
    const sideTex = createCartonSideTexture(texColorMode, maxAnisotropy);
    const topTex = createCartonTopTexture(texColorMode, maxAnisotropy);

    const sideMat = new THREE.MeshStandardMaterial({
      map: sideTex,
      color: isHeatmap || orientationContrast ? '#ffffff' : undefined,
      roughness: isHeatmap ? 0.55 : orientationContrast ? 0.58 : 0.68,
      metalness: 0.04,
    });
    const topMat = new THREE.MeshStandardMaterial({
      map: topTex,
      color: isHeatmap || orientationContrast ? '#ffffff' : undefined,
      roughness: isHeatmap ? 0.48 : orientationContrast ? 0.50 : 0.56,
      metalness: 0.04,
    });
    const cartonMaterials = [sideMat, sideMat, topMat, sideMat, sideMat, sideMat];

    const unitBoxGeo = new THREE.BoxGeometry(1, 1, 1);
    const instanced = new THREE.InstancedMesh(unitBoxGeo, cartonMaterials, visiblePlacements.length);
    instanced.castShadow = true;
    instanced.receiveShadow = true;

    const edgePositions: number[] = [];
    const pad = 0.0025;
    const baseLx = Math.max(0.01, outerDimensions.length * S - pad);
    const baseWz = Math.max(0.01, outerDimensions.width * S - pad);
    const allowablePerBoxKgf = Math.max(
      1,
      activeEvaluation.effectivePalletBctKgf / Math.max(1, safetyFactor)
    );

    visiblePlacements.forEach((b, idx) => {
      const sx = Math.max(0.01, b.sizeX * S - pad);
      const sy = Math.max(0.01, b.sizeY * S - 0.0015);
      const sz = Math.max(0.01, b.sizeZ * S - pad);
      const cx = b.x * S;
      const cy = b.y * S + sy / 2;
      const cz = b.z * S;

      _dummyObj.position.set(cx, cy, cz);
      _dummyObj.rotation.set(0, THREE.MathUtils.degToRad(b.angleDeg), 0);
      _dummyObj.scale.set(baseLx, sy, baseWz);
      _dummyObj.updateMatrix();
      instanced.setMatrixAt(idx, _dummyObj.matrix);

      if (isHeatmap) {
        // Pure compressive-load Heat-Map: top layer = 0% (Green), cumulative weight below = smooth gradient to Red (>100%)
        const layersAbove = Math.max(0, activeEvaluation.layerCount - b.layer);
        const loadAboveKgf = layersAbove * caseGrossKg;
        const stressRatio = loadAboveKgf / allowablePerBoxKgf;
        _tmpColor.set(computeHeatmapStressHex(stressRatio));
      } else if (orientationContrast) {
        const layerOdd = b.layer % 2 === 1;
        _tmpColor.set(
          b.rotated90 ? (layerOdd ? '#38BDF8' : '#0EA5E9') : layerOdd ? '#FACC15' : '#EAB308'
        );
      } else {
        const layerOdd = b.layer % 2 === 1;
        if (materialColor === 'kraft') {
          _tmpColor.set(
            b.rotated90 ? (layerOdd ? '#E2BD8B' : '#CFA876') : layerOdd ? '#D5AE7E' : '#C29A6A'
          );
        } else {
          _tmpColor.set(
            b.rotated90 ? (layerOdd ? '#E2E8F0' : '#D5DEE8') : layerOdd ? '#F8FAFC' : '#EEF2F6'
          );
        }
      }
      instanced.setColorAt(idx, _tmpColor);

      const hx = sx / 2;
      const hy = sy / 2;
      const hz = sz / 2;
      const corners = [
        [cx - hx, cy - hy, cz - hz],
        [cx + hx, cy - hy, cz - hz],
        [cx + hx, cy - hy, cz + hz],
        [cx - hx, cy - hy, cz + hz],
        [cx - hx, cy + hy, cz - hz],
        [cx + hx, cy + hy, cz - hz],
        [cx + hx, cy + hy, cz + hz],
        [cx - hx, cy + hy, cz + hz],
      ];
      const pairs = [
        [0, 1], [1, 2], [2, 3], [3, 0],
        [4, 5], [5, 6], [6, 7], [7, 4],
        [0, 4], [1, 5], [2, 6], [3, 7],
      ];
      for (const [a, c] of pairs) {
        edgePositions.push(...corners[a], ...corners[c]);
      }
    });

    instanced.instanceMatrix.needsUpdate = true;
    if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
    instanced.computeBoundingBox();
    instanced.computeBoundingSphere();
    group.add(instanced);

    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(edgePositions, 3));
    const edges = new THREE.LineSegments(
      lineGeo,
      new THREE.LineBasicMaterial({
        color: isHeatmap
          ? '#1E293B'
          : orientationContrast
          ? '#17191F'
          : materialColor === 'kraft'
          ? '#6D4C2F'
          : '#64748B',
        transparent: true,
        opacity: orientationContrast ? 0.92 : isHeatmap ? 0.55 : 0.45,
      })
    );
    group.add(edges);

    // 5. Optional Interlayer Tier Sheets
    if (pallet.useTierSheets && maxVisibleLayer > 1) {
      const tierT = Math.max(0.002, pallet.tierSheetThicknessMm * S);
      const tierGeo = new THREE.BoxGeometry(
        Math.max(pL, activeEvaluation.footprintL * S),
        tierT,
        Math.max(pW, activeEvaluation.footprintW * S)
      );
      const tierMat = new THREE.MeshStandardMaterial({
        color: '#7C5A3A',
        roughness: 0.85,
      });
      const slipH = pallet.useSlipSheet ? 0.002 : 0;
      const boxH = outerDimensions.depth * S;
      for (let lyr = 1; lyr < maxVisibleLayer; lyr++) {
        const padY = pH + slipH + lyr * boxH + (lyr - 0.5) * tierT;
        const padMesh = new THREE.Mesh(tierGeo, tierMat);
        padMesh.position.set(0, padY, 0);
        group.add(padMesh);
      }
    }

    // 6. Optional 4 Structural Corner Posts
    if (pallet.useCornerPosts && activeEvaluation.footprintL > 0 && activeEvaluation.footprintW > 0) {
      const halfFL = (activeEvaluation.footprintL * S) / 2;
      const halfFW = (activeEvaluation.footprintW * S) / 2;
      const slipH = pallet.useSlipSheet ? 0.002 : 0;
      const stackSpanH = Math.max(
        0.08,
        maxVisibleLayer * (outerDimensions.depth * S) +
          Math.max(0, maxVisibleLayer - 1) * (pallet.useTierSheets ? pallet.tierSheetThicknessMm * S : 0)
      );
      const postMat = new THREE.MeshStandardMaterial({
        color: '#334155',
        roughness: 0.55,
        metalness: 0.15,
      });
      const legLen = 0.055;
      const legThick = 0.006;

      [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ].forEach(([sx, sz]) => {
        const postGrp = new THREE.Group();
        const wingX = new THREE.Mesh(new THREE.BoxGeometry(legLen, stackSpanH, legThick), postMat);
        wingX.position.set(
          sx * (halfFL - legLen / 2 + legThick / 2),
          pH + slipH + stackSpanH / 2,
          sz * (halfFW + legThick / 2)
        );

        const wingZ = new THREE.Mesh(new THREE.BoxGeometry(legThick, stackSpanH, legLen), postMat);
        wingZ.position.set(
          sx * (halfFL + legThick / 2),
          pH + slipH + stackSpanH / 2,
          sz * (halfFW - legLen / 2 + legThick / 2)
        );

        postGrp.add(wingX, wingZ);
        group.add(postGrp);
      });
    }

    // 7. Top-Layer Plakban / Perimeter Strapping Band
    if (pallet.useTopLayerPlakban) {
      const topBoxes = visiblePlacements.filter((b) => b.layer === maxVisibleLayer);
      if (topBoxes.length > 0) {
        let minX = Infinity;
        let maxX = -Infinity;
        let minZ = Infinity;
        let maxZ = -Infinity;
        let topBaseY = topBoxes[0].y * S;
        const topH = topBoxes[0].sizeY * S;

        for (const b of topBoxes) {
          minX = Math.min(minX, (b.x - b.sizeX / 2) * S);
          maxX = Math.max(maxX, (b.x + b.sizeX / 2) * S);
          minZ = Math.min(minZ, (b.z - b.sizeZ / 2) * S);
          maxZ = Math.max(maxZ, (b.z + b.sizeZ / 2) * S);
          topBaseY = Math.max(topBaseY, b.y * S);
        }

        const tapeOffset = 0.0025;
        const spanX = maxX - minX + tapeOffset * 2;
        const spanZ = maxZ - minZ + tapeOffset * 2;
        const centerX = (minX + maxX) / 2;
        const centerZ = (minZ + maxZ) / 2;
        const bandH = Math.min(0.052, Math.max(0.028, topH * 0.22));
        const bandThick = 0.003;
        const bandCenterY = topBaseY + topH * 0.56;

        const tapeMat = new THREE.MeshStandardMaterial({
          color: '#F59E0B',
          roughness: 0.28,
          metalness: 0.08,
          transparent: true,
          opacity: 0.88,
        });

        const northBand = new THREE.Mesh(new THREE.BoxGeometry(spanX, bandH, bandThick), tapeMat);
        northBand.position.set(centerX, bandCenterY, minZ - tapeOffset);
        const southBand = new THREE.Mesh(new THREE.BoxGeometry(spanX, bandH, bandThick), tapeMat);
        southBand.position.set(centerX, bandCenterY, maxZ + tapeOffset);

        const westBand = new THREE.Mesh(new THREE.BoxGeometry(bandThick, bandH, spanZ), tapeMat);
        westBand.position.set(minX - tapeOffset, bandCenterY, centerZ);
        const eastBand = new THREE.Mesh(new THREE.BoxGeometry(bandThick, bandH, spanZ), tapeMat);
        eastBand.position.set(maxX + tapeOffset, bandCenterY, centerZ);

        group.add(northBand, southBand, westBand, eastBand);
        if (topH > 0.19) {
          const bandCenterY2 = topBaseY + topH * 0.84;
          const n2 = northBand.clone();
          n2.position.y = bandCenterY2;
          const s2 = southBand.clone();
          s2.position.y = bandCenterY2;
          const w2 = westBand.clone();
          w2.position.y = bandCenterY2;
          const e2 = eastBand.clone();
          e2.position.y = bandCenterY2;
          group.add(n2, s2, w2, e2);
        }
      }
    }

    // 8. 3D Unbridged Cleavage Fault-Line Warning Planes (normal mode only; keep Heat-Map strictly compressive-stress)
    const faultLines = activeEvaluation.stability?.faultLines || [];
    if (!isHeatmap && faultLines.some((fl) => fl.severity === 'critical')) {
      const slipH = pallet.useSlipSheet ? 0.002 : 0;
      const tierPadM = pallet.useTierSheets ? Math.max(0.001, pallet.tierSheetThicknessMm * S) : 0;
      const visH = Math.max(
        0.08,
        maxVisibleLayer * (outerDimensions.depth * S) + Math.max(0, maxVisibleLayer - 1) * tierPadM
      );
      const spanL = Math.max(pL, activeEvaluation.footprintL * S) + 0.03;
      const spanW = Math.max(pW, activeEvaluation.footprintW * S) + 0.03;

      faultLines.forEach((fl) => {
        if (fl.severity !== 'critical') return;
        const planeMat = new THREE.MeshBasicMaterial({
          color: '#DC2626',
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.11,
          depthWrite: false,
        });
        const planeGeo =
          fl.axis === 'x' ? new THREE.PlaneGeometry(spanW, visH) : new THREE.PlaneGeometry(spanL, visH);
        const planeMesh = new THREE.Mesh(planeGeo, planeMat);
        if (fl.axis === 'x') {
          planeMesh.rotation.y = Math.PI / 2;
          planeMesh.position.set(fl.posMm * S, pH + slipH + visH / 2, 0);
        } else {
          planeMesh.position.set(0, pH + slipH + visH / 2, fl.posMm * S);
        }
        group.add(planeMesh);
      });
    }
  }
}

const _dummyObj = new THREE.Object3D();
const _tmpColor = new THREE.Color();

function PatternFootprintSvg({
  evaluation,
  palletL,
  palletW,
}: {
  evaluation: PalletPatternEvaluation;
  palletL: number;
  palletW: number;
}) {
  const layer1 = evaluation.placements.filter((b) => b.layer === 1);
  const layer2 = evaluation.placements.filter((b) => b.layer === 2);
  const activeUpper = layer2.length > 0 ? layer2 : layer1;

  const halfL = Math.max(200, palletL / 2);
  const halfW = Math.max(200, palletW / 2);
  const pad = 42;
  const vbX = -halfL - pad;
  const vbY = -halfW - pad;
  const vbW = palletL + pad * 2;
  const vbH = palletW + pad * 2;

  return (
    <svg
      viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
      className="w-full h-[126px] rounded-[var(--radius-sm)] bg-[#F8FAFC] border-[0.5px] border-[var(--line)]"
      aria-label="Blueprint tumpang tindih Layer 1 vs Layer 2"
    >
      {/* Pallet deck outline */}
      <rect
        x={-halfL}
        y={-halfW}
        width={palletL}
        height={palletW}
        fill="#FFFDF9"
        stroke="#94A3B8"
        strokeWidth={5}
        strokeDasharray="16 10"
      />

      {/* Layer 1 (Ganjil) base seams in dashed ink */}
      {layer2.length > 0 &&
        layer1.map((b, i) => (
          <rect
            key={`l1-${i}`}
            x={b.x - b.sizeX / 2 + 3}
            y={b.z - b.sizeZ / 2 + 3}
            width={Math.max(4, b.sizeX - 6)}
            height={Math.max(4, b.sizeZ - 6)}
            fill="none"
            stroke="#64748B"
            strokeOpacity={0.48}
            strokeWidth={4}
            strokeDasharray="10 8"
            rx={4}
          />
        ))}

      {/* Layer 2 (Genap) boxes colored by lock status + chevron */}
      {activeUpper.map((b, i) => {
        const fill =
          b.lockStatus === 'locked'
            ? 'rgba(34, 197, 94, 0.28)'
            : b.lockStatus === 'at-risk'
            ? 'rgba(239, 68, 68, 0.28)'
            : 'rgba(245, 158, 11, 0.25)';
        const stroke =
          b.lockStatus === 'locked'
            ? '#15803D'
            : b.lockStatus === 'at-risk'
            ? '#B91C1C'
            : '#B45309';

        const cx = b.x;
        const cz = b.z;
        const rad = (b.angleDeg * Math.PI) / 180;
        const arm = Math.min(b.sizeX, b.sizeZ) * 0.2;
        const cos = Math.cos(-rad);
        const sin = Math.sin(-rad);
        const rotPt = (lx: number, lz: number) => `${cx + lx * cos - lz * sin},${cz + lx * sin + lz * cos}`;

        return (
          <g key={`u-${i}`}>
            <rect
              x={b.x - b.sizeX / 2 + 4}
              y={b.z - b.sizeZ / 2 + 4}
              width={Math.max(4, b.sizeX - 8)}
              height={Math.max(4, b.sizeZ - 8)}
              fill={fill}
              stroke={stroke}
              strokeWidth={4.5}
              rx={5}
            />
            <polyline
              points={`${rotPt(-arm * 0.55, -arm * 0.7)} ${rotPt(arm * 0.7, 0)} ${rotPt(-arm * 0.55, arm * 0.7)}`}
              fill="none"
              stroke={stroke}
              strokeWidth={4}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.75}
            />
            {(b.unsupportedCornerCoords || []).map(([ux, uz], ci) => (
              <circle
                key={`uc-${i}-${ci}`}
                cx={ux}
                cy={uz}
                r={12}
                fill="#EA580C"
                stroke="#FFFFFF"
                strokeWidth={3.5}
              />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

export default function PalletizerWorkspace({
  config,
  paths,
  analysis,
  onChange,
  onOpenEngineering,
  railOpen = true,
  isOverlayRail = false,
  onCloseRail,
  hasMobileFloatingDock = false,
  isShortLandscape = false,
  focusMode = false,
  requestedExportTab = null,
  onHandledExportRequest,
  isActive = true,
}: PalletizerWorkspaceProps) {
  const casePack: CasePackConfig = config.casePack || DEFAULT_CASE_PACK_CONFIG;
  const rawPallet: PalletConfig = config.pallet || DEFAULT_PALLET_CONFIG;
  const normalizedMarginMm = normalizePalletEdgeMarginMm(rawPallet.allowedOverhangMm);
  const pallet: PalletConfig = useMemo(
    () =>
      rawPallet.allowedOverhangMm === normalizedMarginMm
        ? rawPallet
        : { ...rawPallet, allowedOverhangMm: normalizedMarginMm },
    [rawPallet, normalizedMarginMm]
  );

  const [railTab, setRailTab] = useState<LeftRailTab>('pallet');
  const [canvasViewMode, setCanvasViewMode] = useState<CanvasViewMode>('3d');
  const [appliedBanner, setAppliedBanner] = useState<string | null>(null);
  const [viewOverlayMode, setViewOverlayMode] = useState<PalletViewOverlayMode>('normal');
  const [activeCamPreset, setActiveCamPreset] = useState<CameraPreset>('iso');
  const [showAllCandidates, setShowAllCandidates] = useState(false);
  const [previewSuggestionTier, setPreviewSuggestionTier] = useState<
    'baseline' | 'micro-5mm' | 'sweetspot-20mm' | 'density-20mm'
  >('sweetspot-20mm');
  const [dockCollapsed, setDockCollapsed] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 640
  );
  const [contextLost, setContextLost] = useState(false);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [exportModalTab, setExportModalTab] = useState<'engineering' | 'vector'>('engineering');
  const [reportProjectName, setReportProjectName] = useState(() => config.metadata.productName || '');
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingVectorPdf, setExportingVectorPdf] = useState(false);
  const [exportPdfError, setExportPdfError] = useState<string | null>(null);
  const [vecIncludeFrames, setVecIncludeFrames] = useState(true);
  const [vecIncludeMaxStack, setVecIncludeMaxStack] = useState(true);
  const [vecStrokePreset, setVecStrokePreset] = useState<VectorStrokePreset>('standard');
  const [vecPreviewBg, setVecPreviewBg] = useState<'kraft' | 'white'>('kraft');

  // Berat nett produk per dus (default 1.0 kg bila kosong) + tare karton → menggerakkan BCT, Heat-Map & Rekomendasi Material
  const effectiveNetWeightKg = getEffectiveProductNetWeightKg(config);
  const syncedCaseGrossKg = useMemo(
    () =>
      computeCaseGrossWeightKg(
        effectiveNetWeightKg,
        analysis.netBoxAreaSqm,
        analysis.boardGsm
      ),
    [effectiveNetWeightKg, analysis.netBoxAreaSqm, analysis.boardGsm]
  );

  const physicsCtx: PalletPhysicsContext = useMemo(
    () => ({
      surfaceFrictionCoeff: computeSurfaceFrictionCoeff(config.engineering),
      burstStrengthKpa: computeBoardBurstKpa(config.engineering, config.boardGrade),
      fluteThicknessMm: config.fluteThickness,
      boardGrade: config.boardGrade,
      boxStyle: config.boxStyle,
      engineering: config.engineering,
    }),
    [config.engineering, config.boardGrade, config.fluteThickness, config.boxStyle]
  );

  // Fast initial pattern evaluation (<15ms / cache hit <0.1ms); heavy Perfectionist sweep runs 100% off-thread in Web Worker
  const [solverResult, setSolverResult] = useState<{
    patternEvaluations: PalletPatternEvaluation[];
    smartAdvisor: SmartPalletAdvisorResult;
    tuningReport: PerfectionistTuningReport;
  }>(() => {
    const initialPatterns = evaluateAllPalletPatternsCached(
      pallet,
      paths.info.outerDimensions,
      syncedCaseGrossKg,
      analysis.correctedBctKgf,
      config.engineering.safetyFactor,
      casePack.unitsPerCase || 1,
      physicsCtx
    );
    const initialAdvisor = buildSmartPalletAdvisorFromEvals(initialPatterns);
    const baselinePattern = pickOptimalPatternType(
      initialPatterns,
      pallet.recommendationMode || 'smart'
    );
    const baselineEval =
      initialPatterns.find((e) => e.patternType === baselinePattern) || initialPatterns[0];
    return {
      patternEvaluations: initialPatterns,
      smartAdvisor: initialAdvisor,
      tuningReport: {
        baselineEval,
        baselineInner: paths.info.innerDimensions,
        baselineOuter: paths.info.outerDimensions,
        micro5mm: null,
        sweetSpot20mm: null,
        density20mm: null,
        boardAdvice: null,
      },
    };
  });

  const solverWorkerRef = useRef<Worker | null>(null);
  const workerReqIdRef = useRef(0);
  const solverDirtyRef = useRef(true);
  const lastSolverDepsRef = useRef<{
    pallet: PalletConfig;
    outerDimensions: BoxConfig['dimensions'];
    innerDimensions: BoxConfig['dimensions'];
    syncedCaseGrossKg: number;
    correctedBctKgf: number;
    safetyFactor: number;
    unitsPerCase: number;
    physicsCtx: PalletPhysicsContext;
  } | null>(null);

  useEffect(() => {
    if (typeof Worker === 'undefined') return;
    try {
      const worker = new Worker(new URL('../workers/palletizer.worker.ts', import.meta.url), {
        type: 'module',
      });
      worker.onmessage = (event: MessageEvent<PalletizerWorkerResponse>) => {
        if (event.data.requestId !== workerReqIdRef.current) return;
        setSolverResult({
          patternEvaluations: event.data.patternEvaluations,
          smartAdvisor: event.data.smartAdvisor,
          tuningReport: event.data.tuningReport,
        });
      };
      worker.onerror = () => {
        solverWorkerRef.current = null;
      };
      solverWorkerRef.current = worker;
      return () => {
        worker.terminate();
        solverWorkerRef.current = null;
      };
    } catch {
      solverWorkerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const unitsPerCase = casePack.unitsPerCase || 1;
    const prev = lastSolverDepsRef.current;
    const changed =
      !prev ||
      prev.pallet !== pallet ||
      prev.outerDimensions !== paths.info.outerDimensions ||
      prev.innerDimensions !== paths.info.innerDimensions ||
      prev.syncedCaseGrossKg !== syncedCaseGrossKg ||
      prev.correctedBctKgf !== analysis.correctedBctKgf ||
      prev.safetyFactor !== config.engineering.safetyFactor ||
      prev.unitsPerCase !== unitsPerCase ||
      prev.physicsCtx !== physicsCtx;

    if (!isActive) {
      if (changed) solverDirtyRef.current = true;
      return;
    }
    if (!changed && !solverDirtyRef.current) return;

    solverDirtyRef.current = false;
    lastSolverDepsRef.current = {
      pallet,
      outerDimensions: paths.info.outerDimensions,
      innerDimensions: paths.info.innerDimensions,
      syncedCaseGrossKg,
      correctedBctKgf: analysis.correctedBctKgf,
      safetyFactor: config.engineering.safetyFactor,
      unitsPerCase,
      physicsCtx,
    };

    const immediatePatterns = evaluateAllPalletPatternsCached(
      pallet,
      paths.info.outerDimensions,
      syncedCaseGrossKg,
      analysis.correctedBctKgf,
      config.engineering.safetyFactor,
      unitsPerCase,
      physicsCtx
    );
    const immediateAdvisor = buildSmartPalletAdvisorFromEvals(immediatePatterns);

    setSolverResult((prevResult) =>
      prevResult.patternEvaluations === immediatePatterns
        ? prevResult
        : {
            ...prevResult,
            patternEvaluations: immediatePatterns,
            smartAdvisor: immediateAdvisor,
          }
    );

    const worker = solverWorkerRef.current;
    if (!worker) {
      let cancelled = false;
      const cancelIdle = scheduleIdleWork(() => {
        if (cancelled) return;
        const tuningReport = computePerfectionistTuningReport(
          paths.info.innerDimensions,
          pallet,
          syncedCaseGrossKg,
          analysis.correctedBctKgf,
          config.engineering.safetyFactor,
          unitsPerCase,
          physicsCtx
        );
        if (!cancelled) {
          setSolverResult({
            patternEvaluations: immediatePatterns,
            smartAdvisor: immediateAdvisor,
            tuningReport,
          });
        }
      }, 600);
      return () => {
        cancelled = true;
        cancelIdle();
      };
    }

    const requestId = ++workerReqIdRef.current;
    const payload: PalletizerWorkerRequest = {
      requestId,
      pallet,
      outerDims: paths.info.outerDimensions,
      innerDims: paths.info.innerDimensions,
      grossBoxWeightKg: syncedCaseGrossKg,
      correctedBctKgf: analysis.correctedBctKgf,
      safetyFactor: config.engineering.safetyFactor,
      unitsPerCase,
      physicsCtx,
    };
    worker.postMessage(payload);
  }, [
    isActive,
    pallet,
    paths.info.outerDimensions,
    paths.info.innerDimensions,
    syncedCaseGrossKg,
    analysis.correctedBctKgf,
    config.engineering.safetyFactor,
    casePack.unitsPerCase,
    physicsCtx,
  ]);

  const { patternEvaluations, smartAdvisor, tuningReport } = solverResult;

  const recommendationMode = pallet.recommendationMode || 'smart';
  const optimalPatternType = useMemo(
    () => pickOptimalPatternType(patternEvaluations, recommendationMode),
    [patternEvaluations, recommendationMode]
  );

  const isAutoPattern = pallet.patternAutoMode !== false;
  const effectivePatternType = isAutoPattern ? optimalPatternType : pallet.patternType;

  const activeEvaluation: PalletPatternEvaluation = useMemo(
    () =>
      patternEvaluations.find((e) => e.patternType === effectivePatternType) ||
      patternEvaluations[0],
    [patternEvaluations, effectivePatternType]
  );

  // Unified real-time layer count state (shared 1:1 between Left Rail & Bottom HUD)
  const autoMaxLayers = Math.max(
    1,
    Math.min(
      activeEvaluation.layerBreakdown.maxByHeight,
      activeEvaluation.layerBreakdown.maxByWeight
    )
  );
  const maxLayerSlider = Math.min(20, Math.max(autoMaxLayers, 16));
  const isManualLayers = pallet.manualLayerCount !== null;
  const currentLayerCount = isManualLayers
    ? Math.max(1, Math.min(20, Math.round(pallet.manualLayerCount as number)))
    : activeEvaluation.layerCount;

  // Per-layer compressive stress percentage profile (drives Heat-Map HUD legend & matches 3D mesh colors 1:1)
  const allowablePerBoxKgf = Math.max(
    0.5,
    activeEvaluation.effectivePalletBctKgf / Math.max(1, config.engineering.safetyFactor)
  );
  const layerStressProfile = useMemo(() => {
    const n = Math.max(1, activeEvaluation.layerCount);
    const rows: Array<{
      layer: number;
      loadAboveKg: number;
      stressPct: number;
      hexColor: string;
    }> = [];
    for (let k = 1; k <= n; k++) {
      const layersAbove = Math.max(0, n - k);
      const loadAboveKg = Math.round(layersAbove * syncedCaseGrossKg * 10) / 10;
      const ratio = loadAboveKg / allowablePerBoxKgf;
      rows.push({
        layer: k,
        loadAboveKg,
        stressPct: Math.round(ratio * 100),
        hexColor: computeHeatmapStressHex(ratio),
      });
    }
    return rows;
  }, [activeEvaluation.layerCount, syncedCaseGrossKg, allowablePerBoxKgf]);

  const displayedStressTicks = useMemo(() => {
    const total = layerStressProfile.length;
    if (total <= 10) return layerStressProfile;
    const pickedIndices = new Set<number>([
      0,
      1,
      Math.round((total - 1) * 0.25),
      Math.round((total - 1) * 0.5),
      Math.round((total - 1) * 0.75),
      total - 2,
      total - 1,
    ]);
    return layerStressProfile.filter((_, idx) => pickedIndices.has(idx));
  }, [layerStressProfile]);

  // Helper for updating Pallet config inside BoxConfig
  const updatePallet = (patch: Partial<PalletConfig>) => {
    onChange((prev) => ({
      ...prev,
      pallet: { ...(prev.pallet || DEFAULT_PALLET_CONFIG), ...patch },
    }));
  };

  const handleLayerCountChange = (nextLayers: number) => {
    const clamped = Math.max(1, Math.min(20, Math.round(nextLayers)));
    updatePallet({ manualLayerCount: clamped });
  };

  // Indonesian Vehicle & Container Config + Auto Pallet Height Synchronization
  const vehicle: PalletVehicleConfig = useMemo(
    () => ({ ...DEFAULT_VEHICLE_CONFIG, ...(pallet.vehicle || {}) }),
    [pallet.vehicle]
  );

  const vehicleHeightSync = useMemo(
    () =>
      computeSyncedPalletMaxHeight(
        vehicle,
        pallet,
        paths.info.outerDimensions.depth,
        syncedCaseGrossKg,
        analysis.correctedBctKgf,
        config.engineering.safetyFactor
      ),
    [
      vehicle,
      pallet,
      paths.info.outerDimensions.depth,
      syncedCaseGrossKg,
      analysis.correctedBctKgf,
      config.engineering.safetyFactor,
    ]
  );

  const vehicleEvaluation = useMemo(() => {
    if (!vehicle.enabled) return null;
    return solveVehicleLoading(
      vehicle,
      pallet,
      activeEvaluation,
      analysis.correctedBctKgf,
      config.engineering.safetyFactor
    );
  }, [
    vehicle,
    pallet,
    activeEvaluation,
    analysis.correctedBctKgf,
    config.engineering.safetyFactor,
  ]);

  const floorEvaluation = useMemo(() => {
    if (!vehicle.enabled) return null;
    return solveFloorLoading(
      vehicle,
      paths.info.outerDimensions,
      syncedCaseGrossKg,
      casePack.unitsPerCase || 1,
      analysis.correctedBctKgf,
      config.engineering.safetyFactor
    );
  }, [
    vehicle,
    paths.info.outerDimensions,
    syncedCaseGrossKg,
    casePack.unitsPerCase,
    analysis.correctedBctKgf,
    config.engineering.safetyFactor,
  ]);

  const palletVsFloorComparison = useMemo(() => {
    if (!vehicleEvaluation || !floorEvaluation) return null;
    return comparePalletVsFloor(
      vehicleEvaluation,
      floorEvaluation,
      activeEvaluation.bctStatus !== 'overload'
    );
  }, [vehicleEvaluation, floorEvaluation, activeEvaluation.bctStatus]);

  const vehicleLoadingMode: VehicleLoadingMode = vehicle.loadingMode ?? 'palletized';

  // Handle external Export PDF popover trigger from App Header
  useEffect(() => {
    if (!requestedExportTab) return;
    setReportProjectName((prev) => prev || config.metadata.productName || '');
    setExportPdfError(null);
    setExportModalTab(requestedExportTab);
    setPdfModalOpen(true);
    onHandledExportRequest?.();
  }, [requestedExportTab, config.metadata.productName, onHandledExportRequest]);

  // Keep pallet.maxStackHeightMm synced whenever vehicle auto-sync is enabled (Palletized mode only)
  useEffect(() => {
    if (!vehicle.enabled || !vehicle.autoSyncPalletHeight || vehicleLoadingMode === 'floor-loading') return;
    const targetH = Math.max(500, vehicleHeightSync.targetMaxStackHeightMm);
    if (Math.abs(pallet.maxStackHeightMm - targetH) >= 1) {
      updatePallet({ maxStackHeightMm: targetH });
    }
  }, [
    vehicle.enabled,
    vehicle.autoSyncPalletHeight,
    vehicleLoadingMode,
    vehicleHeightSync.targetMaxStackHeightMm,
    pallet.maxStackHeightMm,
  ]);

  // Return to 3D view if user turns off vehicle simulation while viewing 2D blueprint
  useEffect(() => {
    if (!vehicle.enabled && canvasViewMode === 'vehicle-2d') {
      setCanvasViewMode('3d');
    }
  }, [vehicle.enabled, canvasViewMode]);

  const updateVehicle = (patch: Partial<PalletVehicleConfig>) => {
    onChange((prev) => {
      const prevPallet = prev.pallet || DEFAULT_PALLET_CONFIG;
      const nextVehicle: PalletVehicleConfig = {
        ...DEFAULT_VEHICLE_CONFIG,
        ...(prevPallet.vehicle || {}),
        ...patch,
      };
      let nextMaxH = prevPallet.maxStackHeightMm;
      if (
        nextVehicle.enabled &&
        nextVehicle.autoSyncPalletHeight &&
        (nextVehicle.loadingMode ?? 'palletized') !== 'floor-loading'
      ) {
        const synced = computeSyncedPalletMaxHeight(
          nextVehicle,
          prevPallet,
          paths.info.outerDimensions.depth,
          syncedCaseGrossKg,
          analysis.correctedBctKgf,
          config.engineering.safetyFactor
        );
        nextMaxH = Math.max(500, synced.targetMaxStackHeightMm);
      }
      return {
        ...prev,
        pallet: {
          ...prevPallet,
          maxStackHeightMm: nextMaxH,
          vehicle: nextVehicle,
        },
      };
    });
  };

  const handleSelectVehiclePreset = (presetId: VehiclePresetId) => {
    const built = buildVehicleConfigFromPreset(presetId, {
      enabled: vehicle.enabled,
      loadingMode: vehicle.loadingMode ?? 'palletized',
      floorWallClearanceMm: vehicle.floorWallClearanceMm ?? 15,
      stackingMode: vehicle.stackingMode,
      layoutPreference: vehicle.layoutPreference,
      autoSyncPalletHeight: vehicle.autoSyncPalletHeight,
      doubleStackGapMm: vehicle.doubleStackGapMm,
    });
    updateVehicle(built);
  };

  const handleApplyPerfectionistToCad = (sug: PerfectionistSizeSuggestion) => {
    onChange((prev) => ({
      ...prev,
      inputMode: 'id',
      dimensions: {
        length: sug.innerDims.length,
        width: sug.innerDims.width,
        depth: sug.innerDims.depth,
      },
      pallet: {
        ...(prev.pallet || DEFAULT_PALLET_CONFIG),
        patternAutoMode: false,
        patternType: sug.patternType,
      },
    }));
    setAppliedBanner(
      `Perfectionist Diterapkan: ID ${sug.innerDims.length}×${sug.innerDims.width}×${sug.innerDims.depth} mm (${sug.patternType.toUpperCase()})`
    );
    window.setTimeout(() => setAppliedBanner(null), 4500);
  };

  const handleApplyBoardCandidate = (cand: SteppedBoardRecommendation) => {
    const fSpec = FLUTE_SPECS[cand.fluteId] || FLUTE_SPECS.C;
    const isDw = cand.boardGrade === 'double-wall';
    onChange((prev) => {
      const nextEng = {
        ...prev.engineering,
        fluteId: cand.fluteId,
        topLayer: cand.topLayer,
        mediumLayer: cand.mediumLayer,
        centerLayer: isDw && cand.centerLayer ? cand.centerLayer : prev.engineering.centerLayer,
        mediumLayer2: isDw && cand.mediumLayer2 ? cand.mediumLayer2 : prev.engineering.mediumLayer2,
        bottomLayer: cand.bottomLayer,
      };
      return {
        ...prev,
        boardGrade: cand.boardGrade,
        fluteThickness: fSpec.thickness,
        engineering: nextEng,
        metadata: {
          ...prev.metadata,
          materialSubstance: formatSubstanceString(nextEng, cand.boardGrade),
        },
      };
    });
    setAppliedBanner(
      `Spec Diterapkan (${cand.tierLabel}): ${cand.recipe} · Max ${cand.maxSafeStackLoadKgf} kgf`
    );
    window.setTimeout(() => setAppliedBanner(null), 4500);
  };

  // Three.js Viewport Refs & Lifecycle
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const palletGroupRef = useRef<THREE.Group | null>(null);
  const gridRef = useRef<THREE.GridHelper | null>(null);
  const groundPlaneRef = useRef<THREE.Mesh | null>(null);
  const requestRenderRef = useRef<() => void>(() => {});
  const cameraAnimRef = useRef<{
    active: boolean;
    pos: THREE.Vector3;
    target: THREE.Vector3;
  }>({
    active: false,
    pos: new THREE.Vector3(1.8, 1.6, 1.9),
    target: new THREE.Vector3(0, 0.55, 0),
  });

  const isActiveRef = useRef(isActive);
  const resizeRendererRef = useRef<() => void>(() => {});
  const sceneDirtyRef = useRef(false);
  const lastSceneDepsRef = useRef<{
    pallet: PalletConfig;
    activeEvaluation: PalletPatternEvaluation;
    safetyFactor: number;
    syncedCaseGrossKg: number;
    viewOverlayMode: PalletViewOverlayMode;
    materialColor: string;
    outerDimensions: BoxConfig['dimensions'];
  } | null>(null);

  useEffect(() => {
    isActiveRef.current = isActive;
    if (isActive) {
      resizeRendererRef.current();
      requestRenderRef.current();
    }
  }, [isActive]);

  // Keyboard shortcut 'H' for bottom dock
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isActiveRef.current) return;
      if (e.key.toLowerCase() === 'h' && document.activeElement?.tagName !== 'INPUT') {
        setDockCollapsed((c) => !c);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Initialize Three.js WebGL scene once
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const profile = getEngineProfile();
    const isSoftwareGl = profile.isSoftwareGl;
    const basePixelRatio = profile.maxPixelRatio;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#f1f3f6');
    scene.fog = new THREE.Fog('#f1f3f6', 8, 22);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(38, width / height, 0.05, 50);
    camera.position.set(3.45, 2.65, 3.65);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: profile.antialias,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(basePixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = profile.shadowsEnabled;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    const drs = createDynamicResolutionController(renderer, basePixelRatio, isSoftwareGl);

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    // Balanced 3-point warm/cool studio lighting
    const hemi = new THREE.HemisphereLight('#ffffff', '#cbd5e1', 0.85);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight('#fff8eb', 1.35);
    keyLight.position.set(3.2, 5.2, 2.8);
    if (profile.shadowsEnabled) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(profile.shadowMapSize, profile.shadowMapSize);
      keyLight.shadow.camera.near = 1;
      keyLight.shadow.camera.far = 14;
      keyLight.shadow.camera.left = -2.2;
      keyLight.shadow.camera.right = 2.2;
      keyLight.shadow.camera.top = 2.4;
      keyLight.shadow.camera.bottom = -2.0;
      keyLight.shadow.bias = -0.0005;
    }
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight('#dbeafe', 0.55);
    rimLight.position.set(-3.0, 2.5, -2.6);
    scene.add(rimLight);

    // Subtle warehouse floor grid
    const grid = new THREE.GridHelper(6, 24, '#cbd5e1', '#e2e8f0');
    grid.position.y = 0;
    scene.add(grid);
    gridRef.current = grid;

    const groundMat = new THREE.ShadowMaterial({ opacity: 0.14 });
    const groundPlane = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), groundMat);
    groundPlane.rotation.x = -Math.PI / 2;
    groundPlane.position.y = -0.001;
    groundPlane.receiveShadow = profile.shadowsEnabled;
    scene.add(groundPlane);
    groundPlaneRef.current = groundPlane;

    const palletGroup = new THREE.Group();
    scene.add(palletGroup);
    palletGroupRef.current = palletGroup;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.72, 0);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.minDistance = 0.8;
    controls.maxDistance = 12;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;
    controls.update();
    controlsRef.current = controls;

    // On-demand coalesced rendering loop + software WebGL throttling
    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let lastTime = performance.now();

    function afterDraw(cb: () => void) {
      try {
        const gl = renderer.getContext() as WebGL2RenderingContext;
        if (!gl || !gl.fenceSync) {
          frameId = window.setTimeout(cb, 80);
          return;
        }
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if (state === gl.UNSIGNALED) {
            frameId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            frameId = window.setTimeout(cb, 80);
          }
        };
        frameId = window.setTimeout(poll, 5);
      } catch {
        frameId = window.setTimeout(cb, 80);
      }
    }

    const requestRender = () => {
      if (!isActiveRef.current) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        if (!isActiveRef.current) {
          renderBusy = false;
          return;
        }
        renderDirty = false;
        const now = performance.now();
        const dt = Math.min(0.05, (now - lastTime) / 1000);
        lastTime = now;

        const anim = cameraAnimRef.current;
        let stillMoving = false;
        if (anim.active) {
          camera.position.x = THREE.MathUtils.damp(camera.position.x, anim.pos.x, 7, dt);
          camera.position.y = THREE.MathUtils.damp(camera.position.y, anim.pos.y, 7, dt);
          camera.position.z = THREE.MathUtils.damp(camera.position.z, anim.pos.z, 7, dt);
          controls.target.x = THREE.MathUtils.damp(controls.target.x, anim.target.x, 7, dt);
          controls.target.y = THREE.MathUtils.damp(controls.target.y, anim.target.y, 7, dt);
          controls.target.z = THREE.MathUtils.damp(controls.target.z, anim.target.z, 7, dt);
          if (
            camera.position.distanceTo(anim.pos) < 0.008 &&
            controls.target.distanceTo(anim.target) < 0.005
          ) {
            anim.active = false;
          } else {
            stillMoving = true;
          }
        }

        controls.update();
        const renderStart = performance.now();
        renderer.render(scene, camera);
        const renderCost = performance.now() - renderStart;
        drs.recordFrameCost(renderCost, Boolean(stillMoving));

        if (!stillMoving && !renderDirty && drs.restoreFullResolution()) {
          renderer.render(scene, camera);
        }

        const done = () => {
          renderBusy = false;
          if ((renderDirty || stillMoving) && isActiveRef.current) {
            requestRender();
          }
        };
        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    };

    requestRenderRef.current = requestRender;

    const resizeRenderer = () => {
      if (!isActiveRef.current) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w < 50 || h < 50) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    };
    resizeRendererRef.current = resizeRenderer;

    const handleControlStart = () => {
      cameraAnimRef.current.active = false;
    };
    controls.addEventListener('start', handleControlStart);
    controls.addEventListener('change', requestRender);

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry || !isActiveRef.current) return;
      if (entry.contentRect.width < 50 || entry.contentRect.height < 50) return;
      const w = Math.max(100, entry.contentRect.width);
      const h = Math.max(100, entry.contentRect.height);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    });
    resizeObserver.observe(container);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
    };
    const onContextRestored = () => {
      setContextLost(false);
      requestRender();
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

    requestRender();

    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      controls.removeEventListener('start', handleControlStart);
      controls.removeEventListener('change', requestRender);
      controls.dispose();
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);
      disposeGroupResources(scene);
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Rebuild 3D pallet, boxes (InstancedMesh), tier sheets, corner posts & overhang guides
  useEffect(() => {
    const group = palletGroupRef.current;
    if (!group) return;

    const prev = lastSceneDepsRef.current;
    const changed =
      !prev ||
      prev.pallet !== pallet ||
      prev.activeEvaluation !== activeEvaluation ||
      prev.safetyFactor !== config.engineering.safetyFactor ||
      prev.syncedCaseGrossKg !== syncedCaseGrossKg ||
      prev.viewOverlayMode !== viewOverlayMode ||
      prev.materialColor !== config.materialColor ||
      prev.outerDimensions !== paths.info.outerDimensions;

    if (!isActive) {
      if (changed) sceneDirtyRef.current = true;
      return;
    }
    if (!changed && !sceneDirtyRef.current) return;

    sceneDirtyRef.current = false;
    lastSceneDepsRef.current = {
      pallet,
      activeEvaluation,
      safetyFactor: config.engineering.safetyFactor,
      syncedCaseGrossKg,
      viewOverlayMode,
      materialColor: config.materialColor,
      outerDimensions: paths.info.outerDimensions,
    };

    const maxAniso = Math.min(
      getEngineProfile().maxAnisotropyCap,
      rendererRef.current?.capabilities.getMaxAnisotropy() || 4
    );

    populatePalletGroup({
      group,
      pallet,
      activeEvaluation,
      outerDimensions: paths.info.outerDimensions,
      materialColor: config.materialColor,
      safetyFactor: config.engineering.safetyFactor,
      caseGrossKg: syncedCaseGrossKg,
      viewOverlayMode,
      maxAnisotropy: maxAniso,
    });

    requestRenderRef.current();
  }, [
    isActive,
    pallet,
    activeEvaluation,
    config.engineering.safetyFactor,
    syncedCaseGrossKg,
    viewOverlayMode,
    config.materialColor,
    paths.info.outerDimensions,
  ]);

  const setCameraPreset = (preset: CameraPreset) => {
    setActiveCamPreset(preset);
    const stackH = Math.max(0.6, activeEvaluation.totalStackHeightMm * 0.001);
    const midY = stackH * 0.46;
    const dist = Math.max(3.05, stackH * 2.05);
    const anim = cameraAnimRef.current;
    anim.target.set(0, midY, 0);
    if (preset === 'iso') {
      anim.pos.set(dist * 0.88, midY + dist * 0.52, dist * 0.92);
    } else if (preset === 'front') {
      anim.pos.set(0, midY + 0.12, dist * 1.12);
    } else if (preset === 'top') {
      anim.pos.set(0.01, midY + dist * 1.1, 0.01);
    } else if (preset === 'side') {
      anim.pos.set(dist * 1.12, midY + 0.12, 0);
    }
    anim.active = true;
    requestRenderRef.current();
  };

  const vectorPreviewScene = useMemo(() => {
    if (!pdfModalOpen || exportModalTab !== 'vector') return null;
    return buildPalletVectorSceneCached(pallet, activeEvaluation, {
      includeFramesAndText: vecIncludeFrames,
      includeMaxStackPanel: vecIncludeMaxStack,
      strokePreset: vecStrokePreset,
      projectOrClientName: reportProjectName,
    });
  }, [
    pdfModalOpen,
    exportModalTab,
    pallet,
    activeEvaluation,
    vecIncludeFrames,
    vecIncludeMaxStack,
    vecStrokePreset,
    reportProjectName,
  ]);

  const handleExportVectorSvg = () => {
    try {
      setExportPdfError(null);
      downloadPalletVectorSvg(pallet, activeEvaluation, {
        includeFramesAndText: vecIncludeFrames,
        includeMaxStackPanel: vecIncludeMaxStack,
        strokePreset: vecStrokePreset,
        projectOrClientName: reportProjectName,
      });
    } catch (err) {
      console.error('Export Pallet Vector SVG failed:', err);
      setExportPdfError('Gagal mengekspor Vector SVG. Silakan coba lagi.');
    }
  };

  const handleExportVectorPdf = async () => {
    if (exportingVectorPdf) return;
    setExportingVectorPdf(true);
    setExportPdfError(null);
    try {
      await exportPalletVectorPdf(pallet, activeEvaluation, {
        includeFramesAndText: vecIncludeFrames,
        includeMaxStackPanel: vecIncludeMaxStack,
        strokePreset: vecStrokePreset,
        projectOrClientName: reportProjectName,
      });
    } catch (err) {
      console.error('Export Pallet Vector PDF failed:', err);
      setExportPdfError('Gagal mengekspor Vector PDF. Silakan coba lagi.');
    } finally {
      setExportingVectorPdf(false);
    }
  };

  const handleExportPdfReport = async () => {
    if (exportingPdf) return;
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const group = palletGroupRef.current;
    const controls = controlsRef.current;

    if (contextLost || !renderer || !scene || !camera || !group) {
      setExportPdfError('Konteks 3D WebGL sedang tidak aktif. Muat ulang tampilan 3D terlebih dahulu.');
      return;
    }

    setExportingPdf(true);
    setExportPdfError(null);

    const prevPos = camera.position.clone();
    const prevQuat = camera.quaternion.clone();
    const prevUp = camera.up.clone();
    const prevAspect = camera.aspect;
    const prevTarget = controls?.target.clone() || new THREE.Vector3(0, 0.55, 0);
    const prevSize = renderer.getSize(new THREE.Vector2());
    const prevPixelRatio = renderer.getPixelRatio();
    const prevBg = scene.background;
    const prevFog = scene.fog;
    const prevGridVisible = gridRef.current ? gridRef.current.visible : true;
    const prevGroundVisible = groundPlaneRef.current ? groundPlaneRef.current.visible : true;

    const maxAniso = Math.min(
      getEngineProfile().maxAnisotropyCap,
      renderer.capabilities.getMaxAnisotropy() || 4
    );

    try {
      const capW = 960;
      const capH = 640; // ~3:2 matching PDF cards
      const aspect = capW / capH;
      renderer.setPixelRatio(1);
      renderer.setSize(capW, capH, false);
      scene.background = new THREE.Color('#FFFFFF');
      scene.fog = null;
      if (gridRef.current) gridRef.current.visible = false;
      if (groundPlaneRef.current) groundPlaneRef.current.visible = false;

      const S = 0.001;
      const pL = pallet.palletLengthMm * S;
      const pW = pallet.palletWidthMm * S;
      const footL = Math.max(pL, activeEvaluation.footprintL * S);
      const footW = Math.max(pW, activeEvaluation.footprintW * S);
      const stackH = Math.max(0.28, activeEvaluation.totalStackHeightMm * S);

      // Exact carton stack extents in world meters for crisp L x W x H PDF annotations
      let cMinX = -(activeEvaluation.footprintL * S) / 2;
      let cMaxX = (activeEvaluation.footprintL * S) / 2;
      let cMinZ = -(activeEvaluation.footprintW * S) / 2;
      let cMaxZ = (activeEvaluation.footprintW * S) / 2;
      let cMaxY = stackH;
      if (activeEvaluation.placements.length > 0) {
        cMinX = Math.min(...activeEvaluation.placements.map((b) => (b.x - b.sizeX / 2) * S));
        cMaxX = Math.max(...activeEvaluation.placements.map((b) => (b.x + b.sizeX / 2) * S));
        cMinZ = Math.min(...activeEvaluation.placements.map((b) => (b.z - b.sizeZ / 2) * S));
        cMaxZ = Math.max(...activeEvaluation.placements.map((b) => (b.z + b.sizeZ / 2) * S));
        cMaxY = Math.max(...activeEvaluation.placements.map((b) => (b.y + b.sizeY) * S));
      }

      const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 30);

      const computeGroupBounds = () => {
        group.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(group);
        box.expandByPoint(new THREE.Vector3(-footL / 2, 0, -footW / 2));
        box.expandByPoint(new THREE.Vector3(footL / 2, 0, footW / 2));
        activeEvaluation.placements.forEach((b) => {
          box.expandByPoint(
            new THREE.Vector3((b.x - b.sizeX / 2) * S, b.y * S, (b.z - b.sizeZ / 2) * S)
          );
          box.expandByPoint(
            new THREE.Vector3((b.x + b.sizeX / 2) * S, (b.y + b.sizeY) * S, (b.z + b.sizeZ / 2) * S)
          );
        });
        const center = box.getCenter(new THREE.Vector3());
        const boxCorners = [
          new THREE.Vector3(box.min.x, box.min.y, box.min.z),
          new THREE.Vector3(box.min.x, box.min.y, box.max.z),
          new THREE.Vector3(box.min.x, box.max.y, box.min.z),
          new THREE.Vector3(box.min.x, box.max.y, box.max.z),
          new THREE.Vector3(box.max.x, box.min.y, box.min.z),
          new THREE.Vector3(box.max.x, box.min.y, box.max.z),
          new THREE.Vector3(box.max.x, box.max.y, box.min.z),
          new THREE.Vector3(box.max.x, box.max.y, box.max.z),
        ];
        return { center, boxCorners };
      };

      const projectWorldToUv = (wx: number, wy: number, wz: number) => {
        const ndc = new THREE.Vector3(wx, wy, wz).project(orthoCam);
        return {
          u: (ndc.x + 1) * 0.5,
          v: (1 - ndc.y) * 0.5,
        };
      };

      const renderOrthoAngle = (preset: CameraPreset, padFactor: number): string => {
        const { center, boxCorners } = computeGroupBounds();
        if (preset === 'iso') {
          orthoCam.up.set(0, 1, 0);
          // Steeper ~40 deg pitch so operator clearly sees entire top (last) layer + 2 side walls
          const dir = new THREE.Vector3(0.76, 0.92, 0.82).normalize();
          orthoCam.position.copy(center).addScaledVector(dir, 10);
        } else if (preset === 'top') {
          // Dead-flat orthographic top view: +X right, +Z down (aligned with 2D Layer 1/2 guides)
          orthoCam.up.set(0, 0, -1);
          orthoCam.position.set(center.x, center.y + 10, center.z);
        } else if (preset === 'front') {
          orthoCam.up.set(0, 1, 0);
          orthoCam.position.set(center.x, center.y, center.z + 10);
        } else {
          orthoCam.up.set(0, 1, 0);
          orthoCam.position.set(center.x + 10, center.y, center.z);
        }

        orthoCam.lookAt(center);
        orthoCam.updateMatrixWorld(true);

        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        for (const corner of boxCorners) {
          const camPt = corner.clone().applyMatrix4(orthoCam.matrixWorldInverse);
          if (camPt.x < minX) minX = camPt.x;
          if (camPt.x > maxX) maxX = camPt.x;
          if (camPt.y < minY) minY = camPt.y;
          if (camPt.y > maxY) maxY = camPt.y;
        }

        const spanX = Math.max(0.2, maxX - minX) * padFactor;
        const spanY = Math.max(0.2, maxY - minY) * padFactor;
        const midCamX = (minX + maxX) / 2;
        const midCamY = (minY + maxY) / 2;

        let halfW = spanX / 2;
        let halfH = spanY / 2;
        if (halfW / halfH > aspect) {
          halfH = halfW / aspect;
        } else {
          halfW = halfH * aspect;
        }

        orthoCam.left = midCamX - halfW;
        orthoCam.right = midCamX + halfW;
        orthoCam.top = midCamY + halfH;
        orthoCam.bottom = midCamY - halfH;
        orthoCam.updateProjectionMatrix();

        renderer.render(scene, orthoCam);
        return renderer.domElement.toDataURL('image/png');
      };

      // 1. Capture 4 Orthographic POVs in high-contrast 0 vs 90 deg Orientation mode
      populatePalletGroup({
        group,
        pallet,
        activeEvaluation,
        outerDimensions: paths.info.outerDimensions,
        materialColor: config.materialColor,
        safetyFactor: config.engineering.safetyFactor,
        caseGrossKg: syncedCaseGrossKg,
        viewOverlayMode: 'normal',
        maxAnisotropy: maxAniso,
        orientationContrast: true,
      });

      const normalIso = renderOrthoAngle('iso', 1.32);
      const isoAnchors = {
        frontLeftBottom: projectWorldToUv(cMinX, 0, cMaxZ),
        frontCornerBottom: projectWorldToUv(cMaxX, 0, cMaxZ),
        backRightBottom: projectWorldToUv(cMaxX, 0, cMinZ),
        backRightTop: projectWorldToUv(cMaxX, cMaxY, cMinZ),
      };

      const normalTop = renderOrthoAngle('top', 1.28);
      const topAnchors = {
        topLeft: projectWorldToUv(cMinX, cMaxY, cMinZ),
        topRight: projectWorldToUv(cMaxX, cMaxY, cMinZ),
        bottomRight: projectWorldToUv(cMaxX, cMaxY, cMaxZ),
      };

      const normalFront = renderOrthoAngle('front', 1.16);
      const normalSide = renderOrthoAngle('side', 1.16);

      // 2. Capture dedicated Orthographic Heat-Map Iso & Top
      populatePalletGroup({
        group,
        pallet,
        activeEvaluation,
        outerDimensions: paths.info.outerDimensions,
        materialColor: config.materialColor,
        safetyFactor: config.engineering.safetyFactor,
        caseGrossKg: syncedCaseGrossKg,
        viewOverlayMode: 'lock-heatmap',
        maxAnisotropy: maxAniso,
        orientationContrast: false,
      });

      const heatmapIso = renderOrthoAngle('iso', 1.22);
      const heatmapTop = renderOrthoAngle('top', 1.16);

      await exportPalletizerReportPdf({
        projectOrClientName: reportProjectName.trim() || undefined,
        config,
        paths,
        analysis,
        pallet,
        casePack,
        syncedCaseGrossKg,
        activeEvaluation,
        captures: {
          normalIso,
          normalTop,
          normalFront,
          normalSide,
          heatmapIso,
          heatmapTop,
          isoAnchors,
          topAnchors,
        },
        vehicle: vehicle.enabled ? vehicle : undefined,
        vehicleEvaluation: vehicle.enabled ? vehicleEvaluation : undefined,
        floorEvaluation: vehicle.enabled ? floorEvaluation : undefined,
        palletVsFloorComparison: vehicle.enabled ? palletVsFloorComparison : undefined,
      });

      setPdfModalOpen(false);
    } catch (err) {
      setExportPdfError(
        err instanceof Error ? err.message : 'Gagal membuat file PDF laporan Palletizer.'
      );
    } finally {
      // Always restore user's exact 3D scene, camera & viewport size
      scene.background = prevBg;
      scene.fog = prevFog;
      if (gridRef.current) gridRef.current.visible = prevGridVisible;
      if (groundPlaneRef.current) groundPlaneRef.current.visible = prevGroundVisible;
      renderer.setPixelRatio(prevPixelRatio);
      renderer.setSize(Math.max(100, prevSize.x), Math.max(100, prevSize.y), false);
      camera.up.copy(prevUp);
      camera.aspect = prevAspect;
      camera.position.copy(prevPos);
      camera.quaternion.copy(prevQuat);
      camera.updateProjectionMatrix();
      if (controls) {
        controls.target.copy(prevTarget);
        controls.update();
      }
      populatePalletGroup({
        group,
        pallet,
        activeEvaluation,
        outerDimensions: paths.info.outerDimensions,
        materialColor: config.materialColor,
        safetyFactor: config.engineering.safetyFactor,
        caseGrossKg: syncedCaseGrossKg,
        viewOverlayMode,
        maxAnisotropy: maxAniso,
        orientationContrast: false,
      });
      renderer.render(scene, camera);
      requestRenderRef.current();
      setExportingPdf(false);
    }
  };

  const bctStatusMeta =
    activeEvaluation.bctStatus === 'safe'
      ? {
          label: 'AMAN',
          badgeClass: 'text-[var(--green-11)] bg-[var(--green-3)] border-[var(--green-6)]',
          icon: ShieldCheck,
        }
      : activeEvaluation.bctStatus === 'marginal'
      ? {
          label: 'BATAS KRITIS',
          badgeClass: 'text-[var(--amber-11)] bg-[var(--amber-3)] border-[var(--amber-6)]',
          icon: ShieldAlert,
        }
      : {
          label: 'OVERLOAD',
          badgeClass: 'text-[var(--red-11)] bg-[var(--red-3)] border-[var(--red-6)]',
          icon: ShieldAlert,
        };

  const BctStatusIcon = bctStatusMeta.icon;

  const renderLeftRail = (isCenteredMobile = false) => (
    <aside
      className={`surface-rail ${
        isCenteredMobile
          ? 'w-full h-full border-r-0'
          : isOverlayRail
          ? 'relative z-10 w-[min(336px,92vw)] h-full shadow-[var(--shadow-modal)] border-r-[0.5px] border-[var(--line)]'
          : 'w-[316px] xl:w-[336px] h-full border-r-[0.5px] border-[var(--line)]'
      } bg-[var(--surface-top)] flex flex-col shrink-0 min-h-0`}
    >
      <div className="p-3 border-b-[0.5px] border-[var(--line)] shrink-0 flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <TactileSegmented
            value={railTab}
            onChange={setRailTab}
            fullWidth
            size="compact"
            ariaLabel="Palletizer configuration section"
            options={[
              { value: 'pallet', label: 'Palet' },
              { value: 'vehicle', label: vehicle.enabled ? 'Armada ●' : 'Armada' },
            ]}
          />
        </div>
        {onCloseRail && (
          <button
            type="button"
            onClick={onCloseRail}
            aria-label="Minimize konfigurasi palletizer"
            title="Minimize panel Palletizer"
            className="size-[34px] md:size-[28px] rounded-[var(--radius-control)] flex items-center justify-center text-[var(--ink-10)] hover:text-[var(--ink-12)] hover:bg-[var(--ink-3)] active:scale-[0.95] transition-colors cursor-pointer shrink-0 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus-ring)]"
          >
            <PanelLeftClose size={15} />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-3.5 py-3 space-y-4">
          {railTab === 'vehicle' ? (
            <>
              <TactileSection title="Armada & Kontainer Indonesia">
                <div className="space-y-3">
                  <TactileToggle
                    checked={vehicle.enabled}
                    onChange={(enabled) => updateVehicle({ enabled })}
                    label="Aktifkan Simulasi Kontainer / Truk"
                  />

                  <div>
                    <label className="block text-[11px] text-[var(--ink-10)] mb-1">
                      Metode Muat Armada
                    </label>
                    <TactileSegmented<VehicleLoadingMode>
                      value={vehicleLoadingMode}
                      onChange={(loadingMode) => updateVehicle({ loadingMode })}
                      size="compact"
                      fullWidth
                      ariaLabel="Metode muat armada palet atau floor loading"
                      options={[
                        { value: 'palletized', label: 'Pakai Palet' },
                        { value: 'floor-loading', label: 'Floor Loading' },
                      ]}
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-[var(--ink-10)] mb-1">
                      Pilih Kontainer / Truk
                    </label>
                    <TactileSelect
                      value={vehicle.presetId}
                      onChange={(id) => handleSelectVehiclePreset(id as VehiclePresetId)}
                      ariaLabel="Pilih preset kontainer atau truk Indonesia"
                      options={[
                        ...INDONESIAN_VEHICLE_PRESETS.map((p) => ({
                          value: p.id,
                          label: p.shortLabel,
                          hint: `${p.internalLengthMm}×${p.internalWidthMm}×${p.internalHeightMm} mm · ${(p.maxPayloadKg / 1000).toFixed(1)}t`,
                        })),
                        {
                          value: 'custom' as VehiclePresetId,
                          label: 'Armada Kustom (Edit Bebas)',
                          hint: 'Masukkan ukuran aktual karoseri/kontainer',
                        },
                      ]}
                    />
                  </div>

                  {vehicle.presetId !== 'custom' && (
                    <div className="rounded-[var(--radius-control)] border-[0.5px] border-[var(--line)] bg-[var(--ink-2)] px-2.5 py-2 text-[10.5px] leading-[15px] text-[var(--ink-11)]">
                      {
                        INDONESIAN_VEHICLE_PRESETS.find((p) => p.id === vehicle.presetId)
                          ?.varianceNote
                      }
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="text-[11px] font-medium text-[var(--ink-12)]">
                      Dimensi Dalam Aktual (Editable · mm)
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[10.5px] text-[var(--ink-10)] mb-1">
                          Panjang
                        </label>
                        <TactileInputWell
                          type="number"
                          min={1500}
                          max={16000}
                          step={50}
                          value={vehicle.internalLengthMm}
                          onChange={(e) =>
                            updateVehicle({
                              presetId: 'custom',
                              internalLengthMm: Math.max(1500, Number(e.target.value) || 3000),
                            })
                          }
                        />
                      </div>
                      <div>
                        <label className="block text-[10.5px] text-[var(--ink-10)] mb-1">
                          Lebar
                        </label>
                        <TactileInputWell
                          type="number"
                          min={1200}
                          max={3200}
                          step={10}
                          value={vehicle.internalWidthMm}
                          onChange={(e) =>
                            updateVehicle({
                              presetId: 'custom',
                              internalWidthMm: Math.max(1200, Number(e.target.value) || 2000),
                            })
                          }
                        />
                      </div>
                      <div>
                        <label className="block text-[10.5px] text-[var(--ink-10)] mb-1">
                          Tinggi
                        </label>
                        <TactileInputWell
                          type="number"
                          min={1200}
                          max={3500}
                          step={10}
                          value={vehicle.internalHeightMm}
                          onChange={(e) =>
                            updateVehicle({
                              presetId: 'custom',
                              internalHeightMm: Math.max(1200, Number(e.target.value) || 2000),
                            })
                          }
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[10.5px] text-[var(--ink-10)] mb-1">
                          Lebar Pintu
                        </label>
                        <TactileInputWell
                          type="number"
                          min={1000}
                          max={3200}
                          step={10}
                          value={vehicle.doorWidthMm}
                          onChange={(e) =>
                            updateVehicle({
                              presetId: 'custom',
                              doorWidthMm: Math.max(1000, Number(e.target.value) || 2000),
                            })
                          }
                        />
                      </div>
                      <div>
                        <label className="block text-[10.5px] text-[var(--ink-10)] mb-1">
                          Tinggi Pintu
                        </label>
                        <TactileInputWell
                          type="number"
                          min={1000}
                          max={3500}
                          step={10}
                          value={vehicle.doorHeightMm}
                          onChange={(e) =>
                            updateVehicle({
                              presetId: 'custom',
                              doorHeightMm: Math.max(1000, Number(e.target.value) || 2000),
                            })
                          }
                        />
                      </div>
                      <div>
                        <label className="block text-[10.5px] text-[var(--ink-10)] mb-1">
                          Payload (kg)
                        </label>
                        <TactileInputWell
                          type="number"
                          min={500}
                          max={40000}
                          step={100}
                          value={vehicle.maxPayloadKg}
                          onChange={(e) =>
                            updateVehicle({
                              maxPayloadKg: Math.max(500, Number(e.target.value) || 5000),
                            })
                          }
                        />
                      </div>
                    </div>

                    {vehicle.category === 'container-reefer' && (
                      <div>
                        <label className="block text-[10.5px] text-[var(--ink-10)] mb-1">
                          Batas Red Load Line Reefer (mm)
                        </label>
                        <TactileInputWell
                          type="number"
                          min={1200}
                          max={2800}
                          step={10}
                          value={vehicle.reeferLoadLineMm ?? 2160}
                          onChange={(e) =>
                            updateVehicle({
                              reeferLoadLineMm: Math.max(1200, Number(e.target.value) || 2160),
                            })
                          }
                        />
                      </div>
                    )}
                  </div>
                </div>
              </TactileSection>

              <TactileSection
                title={
                  vehicleLoadingMode === 'floor-loading'
                    ? 'Clearance Floor Loading & Karoseri'
                    : 'Clearance Forklift & Karoseri'
                }
              >
                <div className="space-y-2.5">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10.5px] text-[var(--ink-10)] mb-1">
                        {vehicleLoadingMode === 'floor-loading'
                          ? 'Celah Dinding (mm/sisi)'
                          : 'Clearance Sisi (mm/sisi)'}
                      </label>
                      {vehicleLoadingMode === 'floor-loading' ? (
                        <TactileInputWell
                          type="number"
                          min={5}
                          max={80}
                          step={5}
                          value={vehicle.floorWallClearanceMm ?? 15}
                          onChange={(e) =>
                            updateVehicle({
                              floorWallClearanceMm: Math.max(5, Number(e.target.value) || 15),
                            })
                          }
                        />
                      ) : (
                        <TactileInputWell
                          type="number"
                          min={0}
                          max={120}
                          step={5}
                          value={vehicle.sideWallClearanceMm}
                          onChange={(e) =>
                            updateVehicle({
                              sideWallClearanceMm: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                        />
                      )}
                    </div>
                    <div>
                      <label className="block text-[10.5px] text-[var(--ink-10)] mb-1">
                        Toleransi Karoseri (mm)
                      </label>
                      <TactileInputWell
                        type="number"
                        min={0}
                        max={100}
                        step={5}
                        value={vehicle.nonStandardToleranceMm}
                        onChange={(e) =>
                          updateVehicle({
                            nonStandardToleranceMm: Math.max(0, Number(e.target.value) || 0),
                          })
                        }
                      />
                    </div>
                  </div>

                  {vehicleLoadingMode === 'floor-loading' ? (
                    <div>
                      <label className="block text-[10.5px] text-[var(--ink-10)] mb-1">
                        Margin Pintu Belakang (mm)
                      </label>
                      <TactileInputWell
                        type="number"
                        min={40}
                        max={200}
                        step={10}
                        value={vehicle.rearDoorClearanceMm}
                        onChange={(e) =>
                          updateVehicle({
                            rearDoorClearanceMm: Math.max(40, Number(e.target.value) || 80),
                          })
                        }
                      />
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[10.5px] text-[var(--ink-10)] mb-1">
                          Celah Palet
                        </label>
                        <TactileInputWell
                          type="number"
                          min={0}
                          max={80}
                          step={5}
                          value={vehicle.palletGapMm}
                          onChange={(e) =>
                            updateVehicle({
                              palletGapMm: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                        />
                      </div>
                      <div>
                        <label className="block text-[10.5px] text-[var(--ink-10)] mb-1">
                          Margin Pintu
                        </label>
                        <TactileInputWell
                          type="number"
                          min={0}
                          max={200}
                          step={10}
                          value={vehicle.rearDoorClearanceMm}
                          onChange={(e) =>
                            updateVehicle({
                              rearDoorClearanceMm: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                        />
                      </div>
                      <div>
                        <label className="block text-[10.5px] text-[var(--ink-10)] mb-1">
                          Angkat Garpu
                        </label>
                        <TactileInputWell
                          type="number"
                          min={40}
                          max={250}
                          step={10}
                          value={vehicle.forkliftLiftClearanceMm}
                          onChange={(e) =>
                            updateVehicle({
                              forkliftLiftClearanceMm: Math.max(40, Number(e.target.value) || 100),
                            })
                          }
                        />
                      </div>
                    </div>
                  )}
                </div>
              </TactileSection>

              <TactileSection title="Tata Letak & Perbandingan Kapasitas">
                <div className="space-y-2.5">
                  {vehicleLoadingMode === 'palletized' && (
                    <>
                      <TactileToggle
                        checked={vehicle.autoSyncPalletHeight}
                        onChange={(autoSyncPalletHeight) => updateVehicle({ autoSyncPalletHeight })}
                        label="Auto-Sinkron Tinggi Tumpukan Palet"
                      />

                      <div>
                        <label className="block text-[10.5px] text-[var(--ink-10)] mb-1">
                          Mode Tumpukan Palet (Tier)
                        </label>
                        <TactileSegmented<VehicleStackingMode>
                          value={vehicle.stackingMode}
                          onChange={(stackingMode) => updateVehicle({ stackingMode })}
                          size="compact"
                          fullWidth
                          ariaLabel="Mode tumpukan palet dalam armada"
                          options={[
                            { value: 'auto', label: 'Auto' },
                            { value: 'single', label: '1 Tier' },
                            { value: 'double', label: '2 Tier' },
                          ]}
                        />
                      </div>
                    </>
                  )}

                  <div>
                    <label className="block text-[10.5px] text-[var(--ink-10)] mb-1">
                      {vehicleLoadingMode === 'floor-loading'
                        ? 'Pola Susunan Karton di Lantai'
                        : 'Pola Susunan Palet di Lantai'}
                    </label>
                    <TactileSegmented<VehicleLayoutPreference>
                      value={vehicle.layoutPreference}
                      onChange={(layoutPreference) => updateVehicle({ layoutPreference })}
                      size="compact"
                      fullWidth
                      ariaLabel="Pola susunan di lantai kendaraan"
                      options={[
                        { value: 'auto', label: 'Auto' },
                        { value: 'lengthwise', label: '0°' },
                        { value: 'crosswise', label: '90°' },
                        { value: 'mixed', label: 'Campur' },
                      ]}
                    />
                  </div>

                  {/* Perbandingan Kapasitas Palet vs Floor Loading */}
                  {vehicle.enabled && vehicleEvaluation && floorEvaluation && palletVsFloorComparison ? (
                    <div className="rounded-[var(--radius-control)] border-[0.5px] border-[var(--line)] bg-[var(--surface-top)] p-2.5 space-y-2 text-[11px]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-[var(--ink-12)]">
                          Palet vs Floor Loading
                        </span>
                        <span
                          className={`font-mono tabular-nums font-semibold ${
                            palletVsFloorComparison.deltaCases > 0
                              ? 'text-[var(--green-11)]'
                              : 'text-[var(--ink-11)]'
                          }`}
                        >
                          {palletVsFloorComparison.deltaCases >= 0 ? '+' : ''}
                          {palletVsFloorComparison.deltaCasesPct}% dus
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-1.5 font-mono tabular-nums text-[10.5px]">
                        <button
                          type="button"
                          onClick={() => updateVehicle({ loadingMode: 'palletized' })}
                          className={`text-left rounded-[var(--radius-sm)] border-[0.5px] p-2 cursor-pointer transition-colors ${
                            vehicleLoadingMode === 'palletized'
                              ? 'bg-[var(--ink-12)] text-white border-[var(--ink-12)]'
                              : 'bg-[var(--ink-2)] text-[var(--ink-12)] border-[var(--line)] hover:bg-[var(--ink-3)]'
                          }`}
                        >
                          <div
                            className={`text-[10px] font-sans font-medium ${
                              vehicleLoadingMode === 'palletized' ? 'text-white/75' : 'text-[var(--ink-10)]'
                            }`}
                          >
                            Pakai Palet ({vehicleEvaluation.totalPallets} plt)
                          </div>
                          <div className="text-[13px] font-bold mt-0.5">
                            {palletVsFloorComparison.palletCases.toLocaleString('id-ID')} dus
                          </div>
                          <div
                            className={`text-[10px] mt-0.5 ${
                              vehicleLoadingMode === 'palletized' ? 'text-white/80' : 'text-[var(--ink-10)]'
                            }`}
                          >
                            Vol {palletVsFloorComparison.palletVolumePct}% · ~{palletVsFloorComparison.palletLoadMinutesEst}m
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => updateVehicle({ loadingMode: 'floor-loading' })}
                          className={`text-left rounded-[var(--radius-sm)] border-[0.5px] p-2 cursor-pointer transition-colors ${
                            vehicleLoadingMode === 'floor-loading'
                              ? 'bg-[var(--ink-12)] text-white border-[var(--ink-12)]'
                              : 'bg-[var(--ink-2)] text-[var(--ink-12)] border-[var(--line)] hover:bg-[var(--ink-3)]'
                          }`}
                        >
                          <div
                            className={`text-[10px] font-sans font-medium ${
                              vehicleLoadingMode === 'floor-loading' ? 'text-white/75' : 'text-[var(--ink-10)]'
                            }`}
                          >
                            Floor ({floorEvaluation.layersLoaded} lyr)
                          </div>
                          <div className="text-[13px] font-bold mt-0.5">
                            {palletVsFloorComparison.floorCases.toLocaleString('id-ID')} dus
                          </div>
                          <div
                            className={`text-[10px] mt-0.5 ${
                              vehicleLoadingMode === 'floor-loading' ? 'text-white/80' : 'text-[var(--ink-10)]'
                            }`}
                          >
                            Vol {palletVsFloorComparison.floorVolumePct}% · SF {floorEvaluation.bottomLayerSafetyFactor}:1
                          </div>
                        </button>
                      </div>

                      <div className="text-[10.5px] leading-[15px] text-[var(--ink-10)] pt-1 border-t-[0.5px] border-[var(--line)]">
                        {palletVsFloorComparison.recommendationNote}
                      </div>

                      <div className="pt-0.5">
                        <TactileButton
                          type="button"
                          variant={canvasViewMode === 'vehicle-2d' ? 'primary' : 'secondary'}
                          size="compact"
                          className="w-full justify-center"
                          onClick={() =>
                            setCanvasViewMode((m) => (m === 'vehicle-2d' ? '3d' : 'vehicle-2d'))
                          }
                        >
                          <Truck size={13} />
                          <span>
                            {canvasViewMode === 'vehicle-2d'
                              ? 'Kembali ke 3D Palet'
                              : 'Buka Denah 2D Top & Side View'}
                          </span>
                        </TactileButton>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-[var(--radius-control)] border-[0.5px] border-[var(--line)] bg-[var(--surface-top)] p-2.5 space-y-1 text-[11px]">
                      <div className="font-medium text-[var(--ink-12)]">
                        {vehicleHeightSync.summaryText}
                      </div>
                      <div className="text-[10.5px] text-[var(--ink-10)]">
                        Aktifkan sakelar di atas untuk membandingkan Palet vs Floor Loading dan membuka denah 2D.
                      </div>
                    </div>
                  )}
                </div>
              </TactileSection>
            </>
          ) : (
            <>
              <TactileSection title="Master Case & Berat Produk">
                <div className="rounded-[var(--radius-control)] bg-[var(--ink-2)] px-3 py-2 text-[12px] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--ink-10)]">Box OD (L×W×D)</span>
                    <span className="font-mono tabular-nums text-[var(--ink-12)] font-medium">
                      {Math.round(paths.info.outerDimensions.length)}×
                      {Math.round(paths.info.outerDimensions.width)}×
                      {Math.round(paths.info.outerDimensions.depth)} mm
                    </span>
                  </div>

                  <div className="pt-1.5 border-t-[0.5px] border-[var(--line)] space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[11px] font-medium text-[var(--ink-11)]">
                        Berat Nett Produk / Dus
                      </label>
                      <span className="text-[11px] font-mono tabular-nums text-[var(--ink-10)]">
                        Kotor ~{syncedCaseGrossKg} kg
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
                          onChange((prev) => ({
                            ...prev,
                            product: { ...prev.product, netWeightKg: undefined },
                          }));
                          return;
                        }
                        const parsed = Number(raw);
                        if (Number.isFinite(parsed) && parsed >= 0) {
                          onChange((prev) => ({
                            ...prev,
                            product: {
                              ...prev.product,
                              netWeightKg: Math.min(200, Math.round(parsed * 100) / 100),
                            },
                          }));
                        }
                      }}
                      suffix="kg"
                    />
                    <p className="text-[10.5px] leading-[14px] text-[var(--ink-10)]">
                      Default 1.0 kg bila kosong · Menggerakkan heat-map &amp; rekomendasi material.
                    </p>
                  </div>
                </div>
              </TactileSection>

              <TactileSection title="Standar Palet & Batasan">
                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] text-[var(--ink-10)] mb-1">
                      Standar Palet
                    </label>
                    <TactileSelect<PalletConfig['standardId']>
                      value={pallet.standardId}
                      ariaLabel="Standar Palet"
                      options={[
                        ...PALLET_PRESETS.map((p) => ({
                          value: p.id as PalletConfig['standardId'],
                          label: p.label,
                          hint: p.region,
                        })),
                        { value: 'custom', label: 'Custom Pallet Dimensions' },
                      ]}
                      onChange={(val) => {
                        const preset = PALLET_PRESETS.find((p) => p.id === val);
                        if (preset) {
                          updatePallet({
                            standardId: val,
                            palletLengthMm: preset.lengthMm,
                            palletWidthMm: preset.widthMm,
                            palletHeightMm: preset.heightMm,
                          });
                        } else {
                          updatePallet({ standardId: 'custom' });
                        }
                      }}
                    />
                  </div>

                  {pallet.standardId === 'custom' && (
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[11px] text-[var(--ink-10)] mb-1">
                          P (mm)
                        </label>
                        <TactileInputWell
                          type="number"
                          min={400}
                          max={2400}
                          value={pallet.palletLengthMm}
                          onChange={(e) =>
                            updatePallet({
                              palletLengthMm: Math.max(400, Number(e.target.value) || 1200),
                            })
                          }
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[var(--ink-10)] mb-1">
                          L (mm)
                        </label>
                        <TactileInputWell
                          type="number"
                          min={400}
                          max={2400}
                          value={pallet.palletWidthMm}
                          onChange={(e) =>
                            updatePallet({
                              palletWidthMm: Math.max(400, Number(e.target.value) || 1000),
                            })
                          }
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[var(--ink-10)] mb-1">
                          T Deck
                        </label>
                        <TactileInputWell
                          type="number"
                          min={60}
                          max={300}
                          value={pallet.palletHeightMm}
                          onChange={(e) =>
                            updatePallet({
                              palletHeightMm: Math.max(60, Number(e.target.value) || 150),
                            })
                          }
                        />
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="flex items-center justify-between gap-1 text-[11px] text-[var(--ink-10)] mb-1">
                        <span>Max Tinggi (mm)</span>
                        {vehicle.enabled && vehicle.autoSyncPalletHeight && (
                          <button
                            type="button"
                            onClick={() => setRailTab('vehicle')}
                            className="text-[9.5px] font-medium text-[var(--accent-10)] hover:underline cursor-pointer"
                            title="Disinkronkan otomatis dari tinggi pintu/armada aktif"
                          >
                            Auto Armada
                          </button>
                        )}
                      </label>
                      <TactileInputWell
                        type="number"
                        min={500}
                        max={2800}
                        step={50}
                        value={pallet.maxStackHeightMm}
                        onChange={(e) => {
                          const val = Math.max(500, Number(e.target.value) || 1800);
                          if (vehicle.enabled && vehicle.autoSyncPalletHeight) {
                            onChange((prev) => ({
                              ...prev,
                              pallet: {
                                ...(prev.pallet || DEFAULT_PALLET_CONFIG),
                                maxStackHeightMm: val,
                                vehicle: {
                                  ...vehicle,
                                  autoSyncPalletHeight: false,
                                },
                              },
                            }));
                          } else {
                            updatePallet({ maxStackHeightMm: val });
                          }
                        }}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[var(--ink-10)] mb-1">
                        Max Berat (kg)
                      </label>
                      <TactileInputWell
                        type="number"
                        min={100}
                        max={3000}
                        step={50}
                        value={pallet.maxPalletWeightKg}
                        onChange={(e) =>
                          updatePallet({
                            maxPalletWeightKg: Math.max(100, Number(e.target.value) || 1000),
                          })
                        }
                      />
                    </div>
                  </div>

                  <div className="rounded-[var(--radius-control)] border-[0.5px] border-[var(--line)] bg-[var(--surface-top)] p-2.5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label
                        htmlFor="pallet-underhang-input"
                        className="text-[11px] font-medium text-[var(--ink-12)]"
                      >
                        Margin Tepi / Underhang (mm/sisi)
                      </label>
                      <span className="font-mono tabular-nums text-[10px] text-[var(--ink-10)]">
                        Maks 0 mm
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="w-[84px] shrink-0">
                        <TactileInputWell
                          id="pallet-underhang-input"
                          type="number"
                          min={PALLET_MARGIN_MIN_MM}
                          max={PALLET_MARGIN_MAX_MM}
                          step={5}
                          value={pallet.allowedOverhangMm}
                          onChange={(e) => {
                            const raw = Number(e.target.value);
                            updatePallet({
                              allowedOverhangMm: Number.isFinite(raw)
                                ? normalizePalletEdgeMarginMm(raw)
                                : 0,
                            });
                          }}
                        />
                      </div>
                      <div className="flex-1 grid grid-cols-5 gap-1">
                        {PALLET_MARGIN_PRESETS.map((preset) => {
                          const active = Math.abs(pallet.allowedOverhangMm - preset.value) < 0.1;
                          return (
                            <button
                              key={preset.value}
                              type="button"
                              title={preset.hint}
                              onClick={() => updatePallet({ allowedOverhangMm: preset.value })}
                              className={`h-[28px] rounded-[var(--radius-sm)] border-[0.5px] font-mono tabular-nums text-[10.5px] font-medium transition-colors cursor-pointer ${
                                active
                                  ? 'bg-[var(--ink-12)] text-white border-[var(--ink-12)]'
                                  : 'bg-[var(--ink-2)] text-[var(--ink-11)] border-[var(--line)] hover:bg-[var(--ink-3)] hover:text-[var(--ink-12)]'
                              }`}
                            >
                              {preset.value === 0 ? '0' : `${preset.value}`}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 text-[10.5px] pt-1 border-t-[0.5px] border-[var(--line)]">
                      <span className="text-[var(--ink-10)] font-mono tabular-nums">
                        Zona Efektif: {activeEvaluation.effectivePalletL}×{activeEvaluation.effectivePalletW} mm
                      </span>
                      <span
                        className={`font-mono tabular-nums font-medium ${
                          activeEvaluation.edgeStatus === 'optimal'
                            ? 'text-[var(--green-11)]'
                            : activeEvaluation.edgeStatus === 'overhang'
                            ? 'text-[var(--red-11)]'
                            : 'text-[var(--amber-11)]'
                        }`}
                      >
                        {activeEvaluation.edgeStatus === 'overhang'
                          ? `OH +${Math.max(activeEvaluation.overhangL, activeEvaluation.overhangW)}mm`
                          : `Inset L:${activeEvaluation.underhangL} / W:${activeEvaluation.underhangW} mm`}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-[var(--radius-control)] border-[0.5px] border-[var(--line)] bg-[var(--surface-top)] p-2.5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium text-[var(--ink-12)]">
                        Perataan Sisi Luar
                      </span>
                      <span
                        className={`font-mono tabular-nums text-[10px] font-medium ${
                          activeEvaluation.maxInternalGapMm > 50
                            ? 'text-[var(--amber-11)]'
                            : activeEvaluation.perimeterAligned
                            ? 'text-[var(--green-11)]'
                            : 'text-[var(--ink-10)]'
                        }`}
                      >
                        {activeEvaluation.perimeterAligned ? 'Aktif: Rata Sisi' : 'Aktif: Rapat'}
                      </span>
                    </div>

                    <TactileSegmented<PalletPerimeterAlignMode>
                      value={pallet.perimeterAlignMode ?? 'auto'}
                      onChange={(mode) => updatePallet({ perimeterAlignMode: mode })}
                      size="compact"
                      fullWidth
                      ariaLabel="Mode perataan sisi luar palet"
                      options={[
                        {
                          value: 'auto',
                          label: 'Auto',
                          title: 'Otomatis ratakan sisi luar jika celah tengah <= 60 mm dan mengurangi sudut gantung',
                        },
                        {
                          value: 'flush',
                          label: 'Rata Sisi',
                          title: 'Dorong dus rata ke 4 sisi luar palet (eliminasi sudut gantung tepi)',
                        },
                        {
                          value: 'compact',
                          label: 'Rapat',
                          title: 'Susunan rapat tanpa celah tengah (perilaku kompak standar)',
                        },
                      ]}
                    />

                    <div className="flex items-center justify-between gap-2 text-[10.5px] pt-1 border-t-[0.5px] border-[var(--line)]">
                      <span className="text-[var(--ink-10)]">
                        {activeEvaluation.maxInternalGapMm > 50
                          ? 'Celah lebar: sarankan Tier Sheet'
                          : activeEvaluation.perimeterAligned
                          ? '4 sisi luar rata (anti-sudut gantung)'
                          : 'Susunan rapat tanpa rongga tengah'}
                      </span>
                      <span
                        className={`font-mono tabular-nums font-medium shrink-0 ${
                          activeEvaluation.maxInternalGapMm > 50
                            ? 'text-[var(--amber-11)]'
                            : activeEvaluation.maxInternalGapMm >= 5
                            ? 'text-[var(--green-11)]'
                            : 'text-[var(--ink-10)]'
                        }`}
                      >
                        Celah {activeEvaluation.maxInternalGapMm} mm
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="text-[var(--ink-10)]">Jumlah Layer</span>
                      <span className="font-mono tabular-nums font-semibold text-[var(--ink-12)]">
                        {currentLayerCount} Layer · {activeEvaluation.totalStackHeightMm} mm
                      </span>
                    </div>
                    <TactileSlider
                      min={1}
                      max={maxLayerSlider}
                      value={currentLayerCount}
                      onChange={(e) => handleLayerCountChange(Number(e.target.value))}
                    />
                    <div className="flex items-center justify-between gap-2 text-[10.5px] text-[var(--ink-10)]">
                      <span className="font-mono tabular-nums">
                        Batas Auto: {autoMaxLayers} Layer (Maks {pallet.maxStackHeightMm} mm)
                      </span>
                      {isManualLayers ? (
                        <button
                          type="button"
                          onClick={() => updatePallet({ manualLayerCount: null })}
                          className="inline-flex items-center gap-1 text-[var(--accent-10)] hover:underline font-medium cursor-pointer shrink-0"
                        >
                          <RotateCcw size={10} />
                          <span>Auto</span>
                        </button>
                      ) : (
                        <span className="text-[var(--green-11)] font-medium shrink-0">Auto aktif</span>
                      )}
                    </div>
                  </div>
                </div>
              </TactileSection>

              <TactileSection title="Ringkasan Stabilitas & Material">
                <div className="rounded-[var(--radius-control)] border-[0.5px] border-[var(--line)] bg-[var(--surface-top)] p-2.5 space-y-2 text-[11px]">
                  {/* Header Ringkas */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Sparkles size={12} className="text-[var(--accent-10)] shrink-0" />
                      <span className="text-[12px] font-semibold text-[var(--ink-12)] truncate">
                        {activeEvaluation.stability.forkliftSafetyLabel}
                      </span>
                    </div>
                    <span className="font-mono tabular-nums text-[12px] font-bold text-[var(--ink-12)] shrink-0">
                      {activeEvaluation.stability.smartScore}
                      <span className="text-[10px] font-normal text-[var(--ink-10)]">/100</span>
                    </span>
                  </div>

                  {/* 3 Metrik Inti */}
                  <div className="grid grid-cols-3 gap-1.5 pt-1.5 border-t-[0.5px] border-[var(--line)]">
                    <div>
                      <span className="text-[10px] text-[var(--ink-10)] block">Beban Bawah</span>
                      <span
                        className={`font-mono tabular-nums font-semibold ${
                          activeEvaluation.bctStatus === 'overload'
                            ? 'text-[var(--red-11)]'
                            : activeEvaluation.bctStatus === 'marginal'
                            ? 'text-[var(--amber-11)]'
                            : 'text-[var(--green-11)]'
                        }`}
                      >
                        {activeEvaluation.bottomLayerLoadKgf}/
                        {Math.round(
                          activeEvaluation.effectivePalletBctKgf /
                            Math.max(1, config.engineering.safetyFactor)
                        )}
                        kg
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-[var(--ink-10)] block">Sudut Tumpu</span>
                      <span
                        className={`font-mono tabular-nums font-semibold ${
                          activeEvaluation.stability.supportedCornerPct < 88
                            ? 'text-[var(--amber-11)]'
                            : 'text-[var(--green-11)]'
                        }`}
                      >
                        {activeEvaluation.stability.supportedCornerPct}%
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-[var(--ink-10)] block">Rem / Wrap</span>
                      <span
                        className={`font-mono tabular-nums font-semibold ${
                          activeEvaluation.stability.noPlakbanPass035g
                            ? 'text-[var(--green-11)]'
                            : 'text-[var(--amber-11)]'
                        }`}
                      >
                        ±{activeEvaluation.stability.noPlakbanSafeG}g
                      </span>
                    </div>
                  </div>

                  {/* 1 Catatan Inti bila perlu perhatian */}
                  {(!activeEvaluation.stability.noPlakbanPass035g ||
                    activeEvaluation.stability.unsupportedCornerCount > 0 ||
                    activeEvaluation.bctStatus !== 'safe') && (
                    <div className="flex items-start gap-1.5 pt-1.5 border-t-[0.5px] border-[var(--line)] text-[10.5px] text-[var(--ink-11)] leading-[14.5px]">
                      <AlertTriangle size={11} className="mt-0.5 shrink-0 text-[var(--amber-11)]" />
                      <span>
                        {activeEvaluation.bctStatus === 'overload'
                          ? `Beban lapisan bawah (${activeEvaluation.bottomLayerLoadKgf} kg) melewati batas aman SF ${config.engineering.safetyFactor}:1 — pilih kandidat material di bawah.`
                          : !activeEvaluation.stability.noPlakbanPass035g
                          ? `Rem forklift ±${activeEvaluation.stability.noPlakbanSafeG}g (<0.35g) — gunakan stretch wrap atau plakban atas.`
                          : `${activeEvaluation.stability.unsupportedCornerCount} sudut gantung — aktifkan Heat-Map untuk cek titik tekan.`}
                      </span>
                    </div>
                  )}

                  {/* Rekomendasi Material Bertahap Anti-Overspec (2-3 Kandidat) */}
                  {tuningReport.boardAdvice && tuningReport.boardAdvice.candidates.length > 0 && (
                    <div className="pt-2 border-t-[0.5px] border-[var(--line)] space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10.5px] font-semibold text-[var(--ink-12)]">
                          Saran Material (Anti-Overspec)
                        </span>
                        <span className="text-[10px] font-mono tabular-nums text-[var(--ink-10)]">
                          {effectiveNetWeightKg.toFixed(1)} kg nett · RH {config.engineering.relativeHumidity}%
                        </span>
                      </div>
                      <p className="text-[10.5px] leading-[14px] text-[var(--ink-10)]">
                        {tuningReport.boardAdvice.reason}
                      </p>
                      <div className="space-y-1.5">
                        {tuningReport.boardAdvice.candidates.map((cand) => (
                          <div
                            key={cand.recipe}
                            className={`rounded-[var(--radius-sm)] border-[0.5px] px-2 py-1.5 flex items-center justify-between gap-2 ${
                              cand.isCurrentSpec
                                ? 'bg-[var(--green-3)]/55 border-[var(--green-6)]'
                                : cand.tier === 'closest'
                                ? 'bg-[var(--accent-3)]/45 border-[var(--accent-6)]'
                                : 'bg-[var(--ink-2)] border-[var(--line)]'
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span
                                  className={`text-[9.5px] font-semibold uppercase tracking-[0.04em] px-1.5 py-0.2 rounded-[3px] ${
                                    cand.tier === 'closest'
                                      ? 'bg-[var(--accent-9)] text-white'
                                      : cand.tier === 'balanced'
                                      ? 'bg-[var(--ink-4)] text-[var(--ink-12)]'
                                      : 'bg-[var(--ink-3)] text-[var(--ink-11)]'
                                  }`}
                                >
                                  {cand.tierLabel}
                                </span>
                                <span className="text-[11px] font-mono font-semibold text-[var(--ink-12)] truncate">
                                  {cand.recipe}
                                </span>
                              </div>
                              <div className="mt-0.5 text-[10px] font-mono tabular-nums text-[var(--ink-10)]">
                                Max {cand.maxSafeStackLoadKgf} kgf · SF {cand.achievedSafetyFactor}× · {cand.boardGsm} gsm
                                {cand.gsmDeltaPct <= -5 && (
                                  <span className="text-[var(--green-11)]">
                                    {' '}
                                    ({cand.gsmDeltaPct}% hemat)
                                  </span>
                                )}
                              </div>
                            </div>
                            {cand.isCurrentSpec ? (
                              <span className="text-[10px] font-medium text-[var(--green-11)] px-1.5 py-0.5 rounded-[var(--radius-sm)] bg-[var(--green-3)] shrink-0">
                                Aktif
                              </span>
                            ) : (
                              <TactileButton
                                type="button"
                                variant={cand.tier === 'closest' ? 'primary' : 'secondary'}
                                size="inline"
                                className="h-[24px] px-2 text-[10.5px] shrink-0"
                                onClick={() => handleApplyBoardCandidate(cand)}
                              >
                                Pakai
                              </TactileButton>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {(smartAdvisor.bestPatternType !== effectivePatternType ||
                    (smartAdvisor.suggestTopPlakban && !pallet.useTopLayerPlakban)) && (
                    <TactileButton
                      type="button"
                      variant="secondary"
                      size="compact"
                      className="w-full justify-center"
                      onClick={() =>
                        updatePallet({
                          patternType: smartAdvisor.bestPatternType,
                          patternAutoMode: false,
                          useTopLayerPlakban:
                            smartAdvisor.suggestTopPlakban || Boolean(pallet.useTopLayerPlakban),
                        })
                      }
                    >
                      <Sparkles size={12} />
                      <span>
                        Pola Terbaik ({smartAdvisor.bestEvaluation.stability.smartScore}
                        {smartAdvisor.suggestTopPlakban ? ' + Plakban' : ''})
                      </span>
                    </TactileButton>
                  )}

                  {appliedBanner && (
                    <div className="rounded-[var(--radius-control)] bg-[var(--green-3)] text-[var(--green-11)] px-2.5 py-1.5 text-[11px] flex items-center gap-1.5">
                      <Check size={13} className="shrink-0" />
                      <span>{appliedBanner}</span>
                    </div>
                  )}
                </div>
              </TactileSection>

              <TactileSection title="Perfectionist Tuner (±5mm & ±20mm)">
                {(() => {
                  const previewTabs: Array<{
                    key: 'baseline' | 'micro-5mm' | 'sweetspot-20mm' | 'density-20mm';
                    label: string;
                    sug: PerfectionistSizeSuggestion | null;
                  }> = [
                    { key: 'baseline', label: 'Aktual', sug: null },
                    { key: 'micro-5mm', label: '±5 mm', sug: tuningReport.micro5mm },
                    { key: 'sweetspot-20mm', label: '±20 mm Lock', sug: tuningReport.sweetSpot20mm },
                    ...(tuningReport.density20mm
                      ? [{ key: 'density-20mm' as const, label: '+Muatan', sug: tuningReport.density20mm }]
                      : []),
                  ];
                  const activePreviewTab =
                    previewTabs.find((t) => t.key === previewSuggestionTier) || previewTabs[0];
                  const activeSug = activePreviewTab.sug;
                  const shownEval = activeSug ? activeSug.evaluation : tuningReport.baselineEval;
                  const shownId = activeSug ? activeSug.innerDims : tuningReport.baselineInner;

                  return (
                    <div className="rounded-[var(--radius-control)] border-[0.5px] border-[var(--line)] bg-[var(--surface-top)] p-2.5 space-y-2 text-[11px]">
                      <div className="flex items-center gap-1 bg-[var(--ink-2)] p-0.5 rounded-[var(--radius-control)]">
                        {previewTabs.map((t) => {
                          const selected = activePreviewTab.key === t.key;
                          return (
                            <button
                              key={t.key}
                              type="button"
                              onClick={() => setPreviewSuggestionTier(t.key)}
                              className={`flex-1 px-1.5 py-1 rounded-[var(--radius-sm)] text-[10.5px] cursor-pointer transition-colors whitespace-nowrap ${
                                selected
                                  ? 'bg-[var(--surface-top)] text-[var(--ink-12)] shadow-[var(--shadow-button)] font-semibold'
                                  : 'text-[var(--ink-10)] hover:text-[var(--ink-12)]'
                              }`}
                            >
                              {t.label}
                            </button>
                          );
                        })}
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-0.5">
                        <div className="flex items-center gap-1.5 font-mono tabular-nums font-semibold text-[12px] text-[var(--ink-12)]">
                          <Ruler size={12} className="text-[var(--ink-10)] shrink-0" />
                          <span>
                            ID {shownId.length}×{shownId.width}×{shownId.depth} mm
                          </span>
                        </div>
                        {activeSug ? (
                          <span className="font-mono tabular-nums text-[10.5px] px-1.5 py-0.5 rounded-[var(--radius-sm)] bg-[var(--ink-2)] text-[var(--ink-11)]">
                            {activeSug.deltaL >= 0 ? `+${activeSug.deltaL}` : activeSug.deltaL} /{' '}
                            {activeSug.deltaW >= 0 ? `+${activeSug.deltaW}` : activeSug.deltaW} mm
                          </span>
                        ) : (
                          <span className="text-[10.5px] text-[var(--ink-10)]">Baseline CAD</span>
                        )}
                      </div>

                      <PatternFootprintSvg
                        evaluation={shownEval}
                        palletL={pallet.palletLengthMm}
                        palletW={pallet.palletWidthMm}
                      />

                      <div className="grid grid-cols-3 gap-1.5 text-[10.5px] pt-0.5">
                        <div>
                          <span className="text-[var(--ink-10)] block">Muatan</span>
                          <span className="font-mono tabular-nums font-semibold text-[var(--ink-12)]">
                            {shownEval.casesPerLayer}/lyr ({shownEval.totalCases})
                          </span>
                        </div>
                        <div>
                          <span className="text-[var(--ink-10)] block">Lock / Sudut</span>
                          <span className="font-mono tabular-nums font-semibold text-[var(--ink-12)]">
                            {shownEval.stability.seamLockPct}% / {shownEval.stability.supportedCornerPct}%
                          </span>
                        </div>
                        <div>
                          <span className="text-[var(--ink-10)] block">Skor / Rem</span>
                          <span className="font-mono tabular-nums font-semibold text-[var(--green-11)]">
                            {shownEval.stability.smartScore} · ±{shownEval.stability.noPlakbanSafeG}g
                          </span>
                        </div>
                      </div>

                      {activeSug && (
                        <>
                          <div className="text-[11px] text-[var(--ink-11)] leading-[15px] pt-1 border-t-[0.5px] border-[var(--line)]">
                            <span className="font-medium text-[var(--ink-12)]">{activeSug.patternSummary}:</span>{' '}
                            {activeSug.reason}
                          </div>
                          <TactileButton
                            type="button"
                            variant="primary"
                            size="compact"
                            className="w-full justify-center"
                            onClick={() => handleApplyPerfectionistToCad(activeSug)}
                          >
                            <Target size={12} />
                            <span>
                              Terapkan {shownId.length}×{shownId.width}×{shownId.depth} ke CAD
                            </span>
                            <ArrowRight size={12} />
                          </TactileButton>
                        </>
                      )}
                    </div>
                  );
                })()}
              </TactileSection>

              <TactileSection title="Pola Susunan">
                <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--ink-10)] -mt-1 mb-1.5">
                  <span className="truncate">
                    {isAutoPattern
                      ? `Auto (${recommendationMode === 'smart' ? 'Skor Cerdas' : 'Muatan Maks'})`
                      : 'Pilihan Manual'}
                  </span>
                  {!isAutoPattern && (
                    <button
                      type="button"
                      onClick={() =>
                        updatePallet({
                          patternAutoMode: true,
                          patternType: optimalPatternType,
                        })
                      }
                      className="text-[var(--accent-10)] hover:underline cursor-pointer shrink-0 font-medium"
                    >
                      Kembali Auto
                    </button>
                  )}
                </div>

                {/* Compact 2x2 Pattern Grid */}
                <div className="grid grid-cols-2 gap-1.5">
                  {patternEvaluations.map((ev) => {
                    const active = ev.patternType === effectivePatternType;
                    const shortLabel =
                      ev.patternType === 'column'
                        ? 'Column'
                        : ev.patternType === 'interlock'
                        ? 'Interlock'
                        : ev.patternType === 'pinwheel'
                        ? 'Pinwheel'
                        : 'Split-Block';
                    return (
                      <button
                        key={ev.patternType}
                        type="button"
                        onClick={() =>
                          updatePallet({
                            patternType: ev.patternType,
                            patternAutoMode: false,
                          })
                        }
                        title={`${ev.label} · ${ev.casesPerLayer}/lyr · Lock ${ev.stability.seamLockPct}% · Sudut ${ev.stability.supportedCornerPct}%`}
                        className={`text-left px-2.5 py-2 rounded-[var(--radius-control)] border-[0.5px] transition-colors cursor-pointer ${
                          active
                            ? 'bg-[var(--ink-12)] text-white border-[var(--ink-12)]'
                            : 'bg-[var(--surface-top)] text-[var(--ink-12)] border-[var(--line)] hover:bg-[var(--ink-2)]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 text-[11.5px] font-semibold">
                          <span className="truncate">{shortLabel}</span>
                          {ev.isSmartRecommended && (
                            <span
                              className={`text-[10px] shrink-0 ${
                                active ? 'text-amber-300' : 'text-[var(--accent-10)]'
                              }`}
                              title="Rekomendasi Optimal"
                            >
                              ★
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex items-baseline justify-between gap-1 font-mono tabular-nums">
                          <span className="text-[13px] font-bold leading-none">
                            {ev.totalCases}
                            <span
                              className={`text-[10px] font-normal ml-0.5 ${
                                active ? 'text-white/75' : 'text-[var(--ink-10)]'
                              }`}
                            >
                              dus
                            </span>
                          </span>
                          <span
                            className={`text-[10px] ${
                              active ? 'text-white/80' : 'text-[var(--ink-10)]'
                            }`}
                          >
                            {ev.casesPerLayer}/lyr
                          </span>
                        </div>
                        <div
                          className={`mt-1 text-[10px] font-mono tabular-nums truncate ${
                            active ? 'text-white/75' : 'text-[var(--ink-10)]'
                          }`}
                        >
                          Skor {ev.stability.smartScore} · {ev.areaEfficiencyPct}%
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Collapsible Optimization Mode & TOPS Detailed Comparison */}
                <div className="pt-1.5">
                  <button
                    type="button"
                    onClick={() => setShowAllCandidates((v) => !v)}
                    className="text-[11px] text-[var(--ink-10)] hover:text-[var(--ink-12)] flex items-center gap-1 cursor-pointer"
                  >
                    {showAllCandidates ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    <span>
                      {showAllCandidates
                        ? 'Tutup Opsi Lanjutan'
                        : `Mode Optimasi & Detail TOPS (${smartAdvisor.variants.length})`}
                    </span>
                  </button>
                  {showAllCandidates && (
                    <div className="mt-2 space-y-2 pt-2 border-t-[0.5px] border-[var(--line)]">
                      <div className="flex items-center gap-1 bg-[var(--ink-2)] p-0.5 rounded-[var(--radius-control)]">
                        {(
                          [
                            { id: 'smart', label: 'Skor Cerdas' },
                            { id: 'max-density', label: 'Muatan Maks' },
                          ] as const
                        ).map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() =>
                              updatePallet({ recommendationMode: m.id, patternAutoMode: true })
                            }
                            className={`flex-1 px-2 py-1 rounded-[var(--radius-sm)] text-[10.5px] cursor-pointer transition-colors ${
                              recommendationMode === m.id
                                ? 'bg-[var(--surface-top)] text-[var(--ink-12)] shadow-[var(--shadow-button)] font-medium'
                                : 'text-[var(--ink-10)] hover:text-[var(--ink-12)]'
                            }`}
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>
                      {smartAdvisor.variants.length > 0 && (
                        <div className="space-y-1">
                          {smartAdvisor.variants.map((v) => {
                            const isCurrent = v.basePattern === effectivePatternType;
                            return (
                              <button
                                key={v.key}
                                type="button"
                                onClick={() =>
                                  updatePallet({
                                    patternType: v.basePattern,
                                    patternAutoMode: false,
                                  })
                                }
                                className={`w-full text-left px-2 py-1.5 rounded-[var(--radius-sm)] border-[0.5px] text-[11px] cursor-pointer ${
                                  isCurrent
                                    ? 'bg-[var(--ink-3)] border-[var(--ink-8)] text-[var(--ink-12)]'
                                    : 'bg-[var(--surface-top)] border-[var(--line)] text-[var(--ink-11)] hover:bg-[var(--ink-2)]'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2 font-medium">
                                  <span className="truncate">{v.title}</span>
                                  <span className="font-mono tabular-nums shrink-0">
                                    Skor {v.smartScore} · ±{v.noPlakbanSafeG}g
                                  </span>
                                </div>
                                <div className="text-[10.5px] text-[var(--ink-10)] font-mono tabular-nums truncate">
                                  Lock {v.seamLockPct}% · Sudut {v.supportedCornerPct}% · Belah {v.faultLineCount}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </TactileSection>

              <TactileSection title="Aksesori Stabilitas Palet">
                <div className="space-y-2">
                  <TactileToggle
                    checked={Boolean(pallet.useTopLayerPlakban)}
                    onChange={(v) => updatePallet({ useTopLayerPlakban: v })}
                    label="Plakban / Strap Layer Atas (Opsional)"
                  />
                  <TactileToggle
                    checked={pallet.useTierSheets}
                    onChange={(v) => updatePallet({ useTierSheets: v })}
                    label="Tier Sheet Pad antar layer (+Align BCT)"
                  />
                  <TactileToggle
                    checked={pallet.useSlipSheet}
                    onChange={(v) => updatePallet({ useSlipSheet: v })}
                    label="Bottom Slip Sheet di atas dek kayu"
                  />
                  <TactileToggle
                    checked={pallet.useCornerPosts}
                    onChange={(v) => updatePallet({ useCornerPosts: v })}
                    label="Corner Posts pelindung 4 sudut"
                  />
                </div>
              </TactileSection>

              <TactileSection title="Audit BCT vs Beban Palet Aktual">
                <div className="rounded-[var(--radius-control)] border-[0.5px] border-[var(--line)] bg-[var(--surface-top)] p-3 space-y-2 text-[12px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-[var(--ink-12)]">Status Tumpukan Bawah</span>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-[var(--radius-sm)] border-[0.5px] text-[11px] font-medium ${bctStatusMeta.badgeClass}`}
                    >
                      <BctStatusIcon size={12} />
                      <span>{bctStatusMeta.label}</span>
                    </span>
                  </div>

                  <div className="space-y-1 text-[11px] pt-1 border-t-[0.5px] border-[var(--line)]">
                    <div className="flex justify-between">
                      <span className="text-[var(--ink-10)]">BCT Efektif Dus (CAD)</span>
                      <span className="font-mono tabular-nums text-[var(--ink-12)]">
                        {analysis.correctedBctKgf.toFixed(1)} kgf
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--ink-10)]">Koreksi Pola &amp; Tepi</span>
                      <span className="font-mono tabular-nums text-[var(--ink-11)]">
                        ×{(activeEvaluation.patternAlignmentFactor * activeEvaluation.overhangPenaltyFactor).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--ink-10)]">Inset Tepi Aktual (L/W)</span>
                      <span
                        className={`font-mono tabular-nums font-medium ${
                          activeEvaluation.edgeStatus === 'optimal'
                            ? 'text-[var(--green-11)]'
                            : activeEvaluation.edgeStatus === 'overhang'
                            ? 'text-[var(--red-11)]'
                            : 'text-[var(--amber-11)]'
                        }`}
                      >
                        {activeEvaluation.edgeStatus === 'overhang'
                          ? `Overhang +${activeEvaluation.overhangL}/+${activeEvaluation.overhangW} mm`
                          : `-${activeEvaluation.underhangL} / -${activeEvaluation.underhangW} mm`}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--ink-10)]">Perataan Sisi &amp; Celah</span>
                      <span
                        className={`font-mono tabular-nums font-medium ${
                          activeEvaluation.maxInternalGapMm > 50
                            ? 'text-[var(--amber-11)]'
                            : activeEvaluation.perimeterAligned
                            ? 'text-[var(--green-11)]'
                            : 'text-[var(--ink-11)]'
                        }`}
                      >
                        {activeEvaluation.perimeterAligned
                          ? `Rata Sisi · ${activeEvaluation.maxInternalGapMm} mm`
                          : `Rapat · ${activeEvaluation.maxInternalGapMm} mm`}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--ink-10)]">BCT Palet Efektif</span>
                      <span className="font-mono tabular-nums font-semibold text-[var(--ink-12)]">
                        {activeEvaluation.effectivePalletBctKgf.toFixed(1)} kgf
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--ink-10)]">
                        Beban Layer Terbawah ({Math.max(0, activeEvaluation.layerCount - 1)} lyr di atas)
                      </span>
                      <span className="font-mono tabular-nums text-[var(--ink-12)]">
                        {activeEvaluation.bottomLayerLoadKgf.toFixed(1)} kgf
                      </span>
                    </div>
                    <div className="flex justify-between pt-1 border-t-[0.5px] border-[var(--line)]">
                      <span className="text-[var(--ink-10)]">Safety Factor Aktual vs Target</span>
                      <span className="font-mono tabular-nums font-semibold text-[var(--ink-12)]">
                        {activeEvaluation.actualSafetyFactor >= 90
                          ? '∞'
                          : `${activeEvaluation.actualSafetyFactor.toFixed(1)}:1`}{' '}
                        / {config.engineering.safetyFactor}:1
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--ink-10)]">Batas Aman Maks BCT</span>
                      <span className="font-mono tabular-nums text-[var(--ink-11)]">
                        {activeEvaluation.maxSafeLayersByBct} Layer
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--ink-10)]">Batas Fisik (Tinggi / Berat)</span>
                      <span className="font-mono tabular-nums text-[var(--ink-11)]">
                        {activeEvaluation.layerBreakdown.maxByHeight} / {activeEvaluation.layerBreakdown.maxByWeight} Layer
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--ink-10)]">CoG Eccentricity (X/Z)</span>
                      <span className="font-mono tabular-nums text-[var(--ink-11)]">
                        ±{activeEvaluation.stability.cogOffsetMm} mm ({activeEvaluation.stability.cogOffsetXMm}/{activeEvaluation.stability.cogOffsetZMm})
                      </span>
                    </div>
                  </div>

                  {activeEvaluation.bctStatus !== 'safe' && (
                    <div className="pt-1 flex gap-2">
                      {activeEvaluation.maxSafeLayersByBct < activeEvaluation.layerCount && (
                        <TactileButton
                          type="button"
                          variant="secondary"
                          size="compact"
                          className="flex-1 justify-center"
                          onClick={() =>
                            updatePallet({
                              manualLayerCount: Math.max(1, activeEvaluation.maxSafeLayersByBct),
                            })
                          }
                        >
                          <span>Set {Math.max(1, activeEvaluation.maxSafeLayersByBct)} Layer</span>
                        </TactileButton>
                      )}
                      <TactileButton
                        type="button"
                        variant="secondary"
                        size="compact"
                        className="flex-1 justify-center"
                        onClick={onOpenEngineering}
                      >
                        <span>Audit BCT Pro</span>
                      </TactileButton>
                    </div>
                  )}
                </div>
              </TactileSection>
            </>
          )}
        </div>
      </aside>
  );

  return (
    <div className="flex-1 flex min-h-0 overflow-hidden bg-[var(--ground)] relative">
      {/* Left Configuration Rail: Docked on >= 1024px, Genie Centered on Mobile, Side Overlay on Tablet */}
      {isOverlayRail ? (
        <MobileGenieSheet
          open={railOpen}
          isMobileGenie={hasMobileFloatingDock}
          side="left"
          dockOrigin="left"
          ariaLabel="Panel Konfigurasi Palletizer"
          onClose={onCloseRail ?? (() => {})}
        >
          {({ isCenteredMobile }) => renderLeftRail(isCenteredMobile)}
        </MobileGenieSheet>
      ) : (
        railOpen && renderLeftRail(false)
      )}

      {/* Main 3D Palletizer Viewport */}
      <div className="@container relative flex-1 min-w-0 min-h-0 overflow-hidden bg-[#f1f3f6]">
        {/* Isolated Three.js WebGL Mount */}
        <div ref={mountRef} className="w-full h-full" />

        {contextLost && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-[var(--ground)] p-6">
            <div className="surface-raised bg-[var(--surface-top)] rounded-[var(--radius-container)] shadow-[var(--shadow-card)] p-4 max-w-[320px] text-center space-y-2">
              <div className="text-[13px] font-medium text-[var(--ink-12)]">
                Konteks 3D Palletizer dijeda sementara
              </div>
              <p className="text-[12px] leading-[18px] text-[var(--ink-11)]">
                Beralih kembali ke 2D Dieline CAD atau muat ulang tampilan untuk memulihkan rendering WebGL.
              </p>
            </div>
          </div>
        )}

        {/* 2D Vehicle & Container Loading Blueprint Overlay (keeps WebGL mounted underneath) */}
        {vehicle.enabled &&
          vehicleEvaluation &&
          floorEvaluation &&
          palletVsFloorComparison &&
          canvasViewMode === 'vehicle-2d' && (
            <div className="absolute inset-0 z-20 bg-[var(--ground)]">
              <VehicleLoadingBlueprint
                vehicle={vehicle}
                pallet={pallet}
                evaluation={activeEvaluation}
                vehicleEval={vehicleEvaluation}
                floorEval={floorEvaluation}
                comparison={palletVsFloorComparison}
                onChangeLoadingMode={(loadingMode) => updateVehicle({ loadingMode })}
                onSwitchTo3D={() => setCanvasViewMode('3d')}
              />
            </div>
          )}

        {/* Top-Right Floating Camera POV Presets Capsule */}
        {canvasViewMode === '3d' && (
          <div
            role="group"
            aria-label="Preset sudut kamera Palletizer"
            className="pointer-events-auto absolute top-2.5 right-2.5 sm:top-3 sm:right-3 z-10 flex items-center gap-1 p-1 rounded-[var(--radius-container)] bg-[var(--surface-top)]/92 backdrop-blur-md border-[0.5px] border-[var(--line)] shadow-[var(--shadow-card)] max-w-[calc(100vw-20px)] overflow-x-auto"
          >
            {vehicle.enabled && vehicleEvaluation && floorEvaluation && (
              <>
                <TactileButton
                  type="button"
                  variant="secondary"
                  size="inline"
                  className="h-[26px] px-2 text-[11px] shrink-0"
                  onClick={() => setCanvasViewMode('vehicle-2d')}
                  title={`Buka Denah 2D ${vehicle.name}`}
                >
                  <Truck size={12} />
                  <span>
                    {vehicleLoadingMode === 'floor-loading'
                      ? `Floor (${floorEvaluation.totalCases} dus)`
                      : `Denah Armada (${vehicleEvaluation.totalPallets})`}
                  </span>
                </TactileButton>
                <div className="h-3.5 w-[0.5px] bg-[var(--line)] mx-0.5 shrink-0" />
              </>
            )}
            {(['iso', 'front', 'top', 'side'] as CameraPreset[]).map((p) => (
              <TactileButton
                key={p}
                type="button"
                variant={activeCamPreset === p ? 'primary' : 'secondary'}
                size="inline"
                className="h-[26px] px-2 capitalize text-[11px]"
                onClick={() => setCameraPreset(p)}
              >
                {p}
              </TactileButton>
            ))}
            <div className="h-3.5 w-[0.5px] bg-[var(--line)] mx-0.5 shrink-0" />
            <TactileButton
              type="button"
              variant="ghost"
              size="inline"
              className="h-[26px] w-[26px] px-0 justify-center shrink-0"
              onClick={() => setCameraPreset('iso')}
              title="Reset sudut kamera"
              aria-label="Reset sudut kamera"
            >
              <RotateCcw size={12} />
            </TactileButton>
          </div>
        )}

        {/* Unified Bottom HUD Bar: Ultra-Thin Bar in Short Landscape, Standard Collapsible Bar Elsewhere */}
        {!((hasMobileFloatingDock || isShortLandscape) && focusMode) && (
          isShortLandscape ? (
            <div className="pointer-events-none absolute bottom-2 inset-x-2.5 z-10 flex justify-center">
              {dockCollapsed ? (
                <button
                  type="button"
                  onClick={() => setDockCollapsed(false)}
                  className="pointer-events-auto ml-auto h-[30px] px-3 rounded-full bg-[var(--surface-top)]/95 backdrop-blur-md border-[0.5px] border-[var(--line)] shadow-[var(--shadow-modal)] text-[11px] font-medium text-[var(--ink-12)] flex items-center gap-1.5 cursor-pointer"
                  title="Tampilkan kontrol palet (H)"
                >
                  <ChevronUp size={13} />
                  <span className="font-mono tabular-nums">{activeEvaluation.totalCases} dus</span>
                </button>
              ) : (
                <div className="pointer-events-auto w-full rounded-[var(--radius-container)] bg-[var(--surface-top)]/95 backdrop-blur-md border-[0.5px] border-[var(--line)] shadow-[var(--shadow-modal)] px-2.5 py-1.5 flex items-center justify-between gap-2 overflow-hidden">
                  <div className="flex items-center gap-2 min-w-0">
                    <Layers size={13} className="text-[var(--ink-10)] shrink-0" />
                    <div className="w-[72px] shrink-0">
                      <TactileSlider
                        min={1}
                        max={maxLayerSlider}
                        value={currentLayerCount}
                        onChange={(e) => handleLayerCountChange(Number(e.target.value))}
                      />
                    </div>
                    <span className="font-mono tabular-nums text-[11px] text-[var(--ink-12)] font-medium whitespace-nowrap shrink-0">
                      {isManualLayers
                        ? `${currentLayerCount}/${autoMaxLayers} Lyr`
                        : `Auto (${currentLayerCount})`}
                    </span>
                    {isManualLayers && (
                      <button
                        type="button"
                        onClick={() => updatePallet({ manualLayerCount: null })}
                        title="Kembali ke Auto Max Layer"
                        aria-label="Kembali ke Auto Max Layer"
                        className="text-[10.5px] text-[var(--accent-10)] hover:underline cursor-pointer shrink-0"
                      >
                        Auto
                      </button>
                    )}
                    <span aria-hidden="true" className="text-[var(--ink-7)] hidden sm:inline">·</span>
                    <span className="font-mono tabular-nums text-[11px] font-semibold text-[var(--ink-12)] whitespace-nowrap hidden sm:inline">
                      {activeEvaluation.totalCases} dus
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[var(--radius-sm)] border-[0.5px] text-[10.5px] font-medium shrink-0 ${bctStatusMeta.badgeClass}`}
                    >
                      <BctStatusIcon size={11} />
                      <span>{bctStatusMeta.label}</span>
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <TactileButton
                      type="button"
                      variant={viewOverlayMode === 'lock-heatmap' ? 'primary' : 'secondary'}
                      size="inline"
                      className="h-[26px] px-2"
                      onClick={() =>
                        setViewOverlayMode((m) => (m === 'normal' ? 'lock-heatmap' : 'normal'))
                      }
                      title="Mode Heat-Map Beban Berat & Penguncian Antar Layer"
                    >
                      <Flame size={12} />
                      <span className="hidden sm:inline">Heat-Map</span>
                    </TactileButton>

                    <button
                      type="button"
                      onClick={() => setDockCollapsed(true)}
                      className="h-[26px] w-[26px] rounded-[var(--radius-control)] text-[var(--ink-10)] hover:text-[var(--ink-12)] hover:bg-[var(--ink-3)] flex items-center justify-center cursor-pointer shrink-0"
                      title="Lipat bar kontrol (H)"
                      aria-label="Lipat bar kontrol"
                    >
                      <ChevronDown size={13} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div
              className={`pointer-events-none absolute ${
                hasMobileFloatingDock ? 'bottom-[68px] md:bottom-3' : 'bottom-3'
              } inset-x-3 z-10 flex flex-col gap-1.5`}
            >
              {/* Unclipped Status Tag Strip OUTSIDE directly above the HUD Card */}
              <div className="flex flex-wrap items-center justify-between gap-1.5 w-full">
                <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 min-w-0">
                  {activeEvaluation.edgeStatus === 'overhang' ? (
                    <span className="rounded-[var(--radius-sm)] bg-[var(--red-3)]/95 border-[0.5px] border-[var(--red-6)] shadow-[var(--shadow-button)] px-2 py-0.5 text-[11px] text-[var(--red-11)] font-mono tabular-nums whitespace-nowrap">
                      Overhang +{Math.max(activeEvaluation.overhangL, activeEvaluation.overhangW)} mm
                    </span>
                  ) : activeEvaluation.edgeStatus === 'flush-risk' ? (
                    <span className="rounded-[var(--radius-sm)] bg-[var(--amber-3)]/95 border-[0.5px] border-[var(--amber-6)] shadow-[var(--shadow-button)] px-2 py-0.5 text-[11px] text-[var(--amber-11)] font-mono tabular-nums whitespace-nowrap">
                      Tepi Mepet -{Math.min(activeEvaluation.underhangL, activeEvaluation.underhangW)} mm
                    </span>
                  ) : activeEvaluation.edgeStatus === 'excessive-underhang' ? (
                    <span className="rounded-[var(--radius-sm)] bg-[var(--amber-3)]/95 border-[0.5px] border-[var(--amber-6)] shadow-[var(--shadow-button)] px-2 py-0.5 text-[11px] text-[var(--amber-11)] font-mono tabular-nums whitespace-nowrap">
                      Underhang -{Math.max(activeEvaluation.underhangL, activeEvaluation.underhangW)} mm
                    </span>
                  ) : (
                    <span className="rounded-[var(--radius-sm)] bg-[var(--green-3)]/95 border-[0.5px] border-[var(--green-6)] shadow-[var(--shadow-button)] px-2 py-0.5 text-[11px] text-[var(--green-11)] font-mono tabular-nums whitespace-nowrap">
                      Inset -{activeEvaluation.underhangL}/-{activeEvaluation.underhangW} mm
                    </span>
                  )}

                  {activeEvaluation.maxInternalGapMm >= 5 && (
                    <span
                      title={
                        activeEvaluation.maxInternalGapMm > 50
                          ? `Celah tengah ${activeEvaluation.maxInternalGapMm} mm (>50 mm): aktifkan Tier Sheet atau ganti mode Rapat`
                          : `Perataan Sisi Luar aktif dengan celah tengah aman ${activeEvaluation.maxInternalGapMm} mm`
                      }
                      className={`rounded-[var(--radius-sm)] border-[0.5px] shadow-[var(--shadow-button)] px-2 py-0.5 text-[11px] font-mono tabular-nums whitespace-nowrap ${
                        activeEvaluation.maxInternalGapMm > 50
                          ? 'bg-[var(--amber-3)]/95 border-[var(--amber-6)] text-[var(--amber-11)]'
                          : 'bg-[var(--green-3)]/95 border-[var(--green-6)] text-[var(--green-11)]'
                      }`}
                    >
                      Celah {activeEvaluation.maxInternalGapMm} mm
                    </span>
                  )}

                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-[var(--radius-sm)] border-[0.5px] shadow-[var(--shadow-button)] text-[11px] font-medium whitespace-nowrap ${bctStatusMeta.badgeClass}`}
                  >
                    <BctStatusIcon size={12} />
                    <span>{bctStatusMeta.label}</span>
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setDockCollapsed((c) => !c)}
                  className="pointer-events-auto ml-auto inline-flex items-center gap-1.5 h-[26px] px-2.5 rounded-[var(--radius-control)] bg-[#ffffff]/96 border-[0.5px] border-[var(--line)] shadow-[var(--shadow-button)] text-[11px] text-[var(--ink-11)] hover:text-[var(--ink-12)] transition-colors cursor-pointer shrink-0"
                  title="Toggle kontrol palet (Tombol H)"
                >
                  {dockCollapsed ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  <span>{dockCollapsed ? 'Tampilkan (H)' : 'Lipat (H)'}</span>
                </button>
              </div>

              <div className="pointer-events-auto w-full rounded-[var(--radius-container)] bg-[#ffffff]/96 border-[0.5px] border-[var(--line)] shadow-[var(--shadow-modal)] px-3 sm:px-3.5 py-2 overflow-hidden">
                {/* Row 1: Compact Pallet Header & Heat-Map Legend */}
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 min-w-0">
                    <span className="text-[12.5px] font-semibold text-[var(--ink-12)] whitespace-nowrap">
                      {activeEvaluation.label}
                    </span>
                    <span aria-hidden="true" className="text-[var(--ink-8)]">·</span>
                    <span className="text-[11px] text-[var(--ink-10)] truncate">
                      {pallet.palletLengthMm} × {pallet.palletWidthMm} mm
                      {activeEvaluation.patternSummary ? ` · ${activeEvaluation.patternSummary}` : ''}
                    </span>
                  </div>

                  {viewOverlayMode === 'lock-heatmap' && layerStressProfile[0] && (
                    <span className="font-mono tabular-nums text-[11px] text-[var(--ink-11)] whitespace-nowrap">
                      L1 Bawah:{' '}
                      <strong
                        className={
                          layerStressProfile[0].stressPct > 100
                            ? 'text-[var(--red-11)]'
                            : layerStressProfile[0].stressPct >= 78
                            ? 'text-[var(--amber-11)]'
                            : 'text-[var(--green-11)]'
                        }
                      >
                        {layerStressProfile[0].stressPct}%
                      </strong>{' '}
                      ({layerStressProfile[0].loadAboveKg} / {allowablePerBoxKgf.toFixed(1)} kg)
                    </span>
                  )}
                </div>

                {/* Compressive Stress Heat-Map Gradient & Per-Layer % Strip */}
                {viewOverlayMode === 'lock-heatmap' && (
                  <div className="mt-1.5 pt-1.5 border-t-[0.5px] border-[var(--line)] space-y-1.5">
                    <div className="flex items-center gap-2 text-[10px] text-[var(--ink-10)]">
                      <span className="font-mono tabular-nums shrink-0">0% Aman</span>
                      <div
                        className="flex-1 h-1.5 rounded-full"
                        style={{
                          background:
                            'linear-gradient(90deg, #16A34A 0%, #84CC16 42%, #EAB308 74%, #F97316 92%, #EF4444 100%)',
                        }}
                      />
                      <span className="font-mono tabular-nums shrink-0">100%+ Overload</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10.5px] font-mono tabular-nums text-[var(--ink-11)]">
                      {displayedStressTicks.map((item) => (
                        <span key={item.layer} className="inline-flex items-center gap-1 whitespace-nowrap">
                          <span
                            className="size-2 rounded-[2px] shrink-0"
                            style={{ backgroundColor: item.hexColor }}
                          />
                          <span>
                            L{item.layer}
                            {item.layer === 1 && layerStressProfile.length > 1 ? ' (Bawah)' : ''}
                            {item.layer === layerStressProfile.length && layerStressProfile.length > 1
                              ? ' (Atas)'
                              : ''}
                            : {item.stressPct}%
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 @[620px]:grid-cols-4 gap-x-4 gap-y-1 mt-1.5 pt-1.5 border-t-[0.5px] border-[var(--line)] text-[11px]">
                  <div className="min-w-0">
                    <span className="text-[var(--ink-10)] block">Muatan &amp; Nett</span>
                    <span className="font-mono tabular-nums font-semibold text-[var(--ink-12)] whitespace-nowrap">
                      {activeEvaluation.totalCases} dus · {effectiveNetWeightKg.toFixed(1)} kg
                    </span>
                  </div>
                  <div className="min-w-0">
                    <span className="text-[var(--ink-10)] block">Lock &amp; Sudut Tumpu</span>
                    <span className="font-mono tabular-nums font-semibold text-[var(--ink-12)] whitespace-nowrap">
                      {activeEvaluation.stability.seamLockPct}% · {activeEvaluation.stability.supportedCornerPct}%
                    </span>
                  </div>
                  <div className="min-w-0">
                    <span className="text-[var(--ink-10)] block">Rem / Burst</span>
                    <span className="font-mono tabular-nums text-[var(--ink-12)] whitespace-nowrap">
                      ±{activeEvaluation.stability.noPlakbanSafeG}g · {activeEvaluation.stability.burstStrengthKpa} kPa
                    </span>
                  </div>
                  <div className="min-w-0">
                    <span className="text-[var(--ink-10)] block">Tinggi &amp; Total Berat</span>
                    <span className="font-mono tabular-nums text-[var(--ink-12)] whitespace-nowrap">
                      {activeEvaluation.totalStackHeightMm} mm · {activeEvaluation.grossLoadKg} kg
                    </span>
                  </div>
                </div>

                {/* Row 2: Responsive Collapsible Controls Band */}
                {!dockCollapsed && (
                  <div className="mt-2 pt-2 border-t-[0.5px] border-[var(--line)] flex flex-wrap items-center justify-between gap-2">
                    {/* Unified Real-Time Stack Layer Slider (synced 1:1 with Left Rail) */}
                    <div className="flex items-center gap-2 min-w-0">
                      <Layers size={14} className="text-[var(--ink-10)] shrink-0" />
                      <div className="w-[88px] sm:w-[104px] shrink-0">
                        <TactileSlider
                          min={1}
                          max={maxLayerSlider}
                          value={currentLayerCount}
                          onChange={(e) => handleLayerCountChange(Number(e.target.value))}
                        />
                      </div>
                      <span className="font-mono tabular-nums text-[11px] font-medium text-[var(--ink-12)] whitespace-nowrap">
                        {isManualLayers
                          ? `${currentLayerCount}/${autoMaxLayers} Layer`
                          : `Auto (${currentLayerCount} Lyr)`}
                      </span>
                      {isManualLayers && (
                        <button
                          type="button"
                          onClick={() => updatePallet({ manualLayerCount: null })}
                          title="Kembali ke jumlah layer Auto Max"
                          className="inline-flex items-center gap-0.5 text-[11px] text-[var(--accent-10)] hover:underline cursor-pointer shrink-0"
                        >
                          <RotateCcw size={11} />
                          <span>Auto</span>
                        </button>
                      )}
                    </div>

                    {/* Right Action: Compressive Load Heat-Map */}
                    <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                      <TactileButton
                        type="button"
                        variant={viewOverlayMode === 'lock-heatmap' ? 'primary' : 'secondary'}
                        size="compact"
                        onClick={() =>
                          setViewOverlayMode((m) => (m === 'normal' ? 'lock-heatmap' : 'normal'))
                        }
                        title="Mode Heat-Map Beban Tekan (% Batas Aman BCT per Layer)"
                      >
                        <Flame size={13} />
                        <span>Heat-Map</span>
                      </TactileButton>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        )}
      </div>

      {/* Export Palletizer Dialog: Engineering Report PDF (2 Hal) + Illustrator Vector Pack (PDF/SVG) */}
      {pdfModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pallet-pdf-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--backdrop)] backdrop-blur-[2px]"
          onClick={(e) => {
            if (e.target === e.currentTarget && !exportingPdf && !exportingVectorPdf) {
              setPdfModalOpen(false);
            }
          }}
        >
          <div
            className={`surface-raised w-full ${
              exportModalTab === 'vector' ? 'max-w-[560px]' : 'max-w-[420px]'
            } max-h-[90vh] flex flex-col bg-[var(--surface-top)] rounded-[var(--radius-container)] shadow-[var(--shadow-modal)] border-[0.5px] border-[var(--line)] overflow-hidden transition-[max-width] duration-200`}
          >
            <div className="px-4 py-3 border-b-[0.5px] border-[var(--line)] flex items-center justify-between gap-2 shrink-0">
              <div className="min-w-0">
                <h2
                  id="pallet-pdf-modal-title"
                  className="text-[13px] font-semibold text-[var(--ink-12)] truncate"
                >
                  {exportModalTab === 'vector'
                    ? 'Export Vektor Kemasan (Adobe Illustrator)'
                    : 'Export Laporan Palletizer PDF'}
                </h2>
                <p className="text-[11px] text-[var(--ink-10)]">
                  {exportModalTab === 'vector'
                    ? 'Line-art hitam murni transparan (HLR) siap edit di Illustrator & cetak flexo'
                    : vehicle.enabled
                    ? 'Format A4 · 3 Halaman (termasuk Rencana Muat Armada & Clearance Forklift)'
                    : 'Format A4 · 2 Halaman siap cetak & serah terima gudang'}
                </p>
              </div>
              <button
                type="button"
                disabled={exportingPdf || exportingVectorPdf}
                onClick={() => setPdfModalOpen(false)}
                aria-label="Tutup dialog Export Palletizer"
                className="size-7 rounded-[var(--radius-control)] flex items-center justify-center text-[var(--ink-10)] hover:text-[var(--ink-12)] hover:bg-[var(--ink-3)] cursor-pointer disabled:opacity-50"
              >
                <X size={14} />
              </button>
            </div>

            <div className="p-4 space-y-3.5 text-[12px] overflow-y-auto">
              <TactileSegmented<'engineering' | 'vector'>
                value={exportModalTab}
                onChange={(tab) => {
                  setExportPdfError(null);
                  setExportModalTab(tab);
                }}
                size="compact"
                fullWidth
                ariaLabel="Jenis file ekspor Palletizer"
                options={[
                  {
                    value: 'engineering',
                    label: 'Laporan Engineering (2 Hal)',
                    title: 'Laporan PDF A4 2 halaman lengkap dengan 4 POV Orthographic & Heat-Map',
                  },
                  {
                    value: 'vector',
                    label: 'Vektor Kemasan (AI-Ready)',
                    title: 'Vektor line-art transparan (PDF & SVG) siap ekstrak di Adobe Illustrator',
                  },
                ]}
              />

              <div>
                <label
                  htmlFor="pallet-pdf-project-name"
                  className="block text-[11px] font-medium text-[var(--ink-11)] mb-1"
                >
                  Nama Proyek / Klien (Opsional)
                </label>
                <TactileInputWell
                  id="pallet-pdf-project-name"
                  type="text"
                  maxLength={80}
                  value={reportProjectName}
                  onChange={(e) => setReportProjectName(e.target.value)}
                  placeholder="Contoh: PT Karya Kemas · SKU Minyak 1L"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !exportingPdf && !exportingVectorPdf) {
                      if (exportModalTab === 'vector') {
                        void handleExportVectorPdf();
                      } else {
                        void handleExportPdfReport();
                      }
                    } else if (e.key === 'Escape' && !exportingPdf && !exportingVectorPdf) {
                      setPdfModalOpen(false);
                    }
                  }}
                />
                <p className="mt-1 text-[10.5px] text-[var(--ink-10)]">
                  {exportModalTab === 'vector'
                    ? 'Digunakan sebagai nama file unduhan PDF & SVG.'
                    : 'Ditampilkan di header Halaman 1 & 2 dan menjadi nama file PDF.'}
                </p>
              </div>

              {exportModalTab === 'engineering' ? (
                <div className="rounded-[var(--radius-control)] bg-[var(--ink-2)] border-[0.5px] border-[var(--line)] p-2.5 space-y-1 text-[11px] text-[var(--ink-11)]">
                  <div className="font-medium text-[var(--ink-12)]">
                    Isi Laporan PDF ({vehicle.enabled ? '3 Halaman A4' : '2 Halaman A4'}):
                  </div>
                  <ul className="space-y-0.5 pl-3.5 list-disc">
                    <li>
                      <span className="font-medium text-[var(--ink-12)]">Hal 1:</span> Status Tumpukan, Spec &amp; Material, Tipe Palet &amp; Aksesori, Operating Conditions, Audit BCT, Audit Stabilitas, serta Diagram 2D Layer 1 &amp; Layer 2 (bernomor dus, panah orientasi, celah tengah, dimensi mm).
                    </li>
                    <li>
                      <span className="font-medium text-[var(--ink-12)]">Hal 2:</span> 4 POV Normal (Iso, Top, Front, Side) + Panel Khusus Heat-Map (Iso &amp; Top) beserta legenda penguncian &amp; sudut gantung.
                    </li>
                    {vehicle.enabled && vehicleEvaluation && (
                      <li>
                        <span className="font-medium text-[var(--ink-12)]">Hal 3:</span> Rencana Muat Armada ({vehicle.name} · {vehicleEvaluation.totalPallets} palet, {vehicleEvaluation.activeTiers} tier), Denah 2D Top View &amp; Side View, ambang pintu forklift, serta audit clearance.
                      </li>
                    )}
                  </ul>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Live Vector Shipping-Mark Preview */}
                  <div className="rounded-[var(--radius-control)] border-[0.5px] border-[var(--line)] overflow-hidden">
                    <div className="px-2.5 py-1.5 bg-[var(--ink-2)] border-b-[0.5px] border-[var(--line)] flex items-center justify-between gap-2 text-[10.5px]">
                      <span className="text-[var(--ink-11)] font-mono tabular-nums truncate">
                        {vectorPreviewScene
                          ? `${vectorPreviewScene.artboardWidthMm}×${vectorPreviewScene.artboardHeightMm} mm · ${vectorPreviewScene.stats.totalSegments} segmen vektor`
                          : 'Memuat pratinjau vektor...'}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => setVecPreviewBg('kraft')}
                          className={`px-2 py-0.5 rounded-[var(--radius-sm)] text-[10px] font-medium cursor-pointer transition-colors ${
                            vecPreviewBg === 'kraft'
                              ? 'bg-[var(--ink-12)] text-white'
                              : 'text-[var(--ink-11)] hover:bg-[var(--ink-3)]'
                          }`}
                        >
                          Simulasi Kraft
                        </button>
                        <button
                          type="button"
                          onClick={() => setVecPreviewBg('white')}
                          className={`px-2 py-0.5 rounded-[var(--radius-sm)] text-[10px] font-medium cursor-pointer transition-colors ${
                            vecPreviewBg === 'white'
                              ? 'bg-[var(--ink-12)] text-white'
                              : 'text-[var(--ink-11)] hover:bg-[var(--ink-3)]'
                          }`}
                        >
                          Putih
                        </button>
                      </div>
                    </div>

                    <div
                      className="p-3 flex items-center justify-center transition-colors"
                      style={{
                        backgroundColor: vecPreviewBg === 'kraft' ? '#D9C8AA' : '#FFFFFF',
                      }}
                    >
                      {vectorPreviewScene && (
                        <svg
                          viewBox={`0 0 ${vectorPreviewScene.artboardWidthMm} ${vectorPreviewScene.artboardHeightMm}`}
                          className="w-full h-auto max-h-[190px] block"
                          role="img"
                          aria-label="Pratinjau vektor kemasan Top View dan Isometrik"
                        >
                          {vectorPreviewScene.groups.map((g) => (
                            <g key={g.id} id={`preview-${g.id}`}>
                              {g.rects.map((r, i) => (
                                <rect
                                  key={i}
                                  x={r.x}
                                  y={r.y}
                                  width={r.w}
                                  height={r.h}
                                  rx={r.rx}
                                  ry={r.rx}
                                  fill={r.fill ? '#000000' : 'none'}
                                  stroke={r.stroke ? '#000000' : 'none'}
                                  strokeWidth={
                                    r.stroke
                                      ? r.strokeWidthMm ?? vectorPreviewScene.baseStrokeWidthMm
                                      : undefined
                                  }
                                  strokeLinejoin="round"
                                />
                              ))}
                              {g.segments.map((s, i) => (
                                <line
                                  key={i}
                                  x1={s.x1}
                                  y1={s.y1}
                                  x2={s.x2}
                                  y2={s.y2}
                                  fill="none"
                                  stroke="#000000"
                                  strokeWidth={
                                    s.strokeWidthMm ?? vectorPreviewScene.baseStrokeWidthMm
                                  }
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              ))}
                              {g.texts.map((t, i) => (
                                <text
                                  key={i}
                                  x={t.x}
                                  y={t.y}
                                  fill="#000000"
                                  fontFamily="Helvetica, Arial, sans-serif"
                                  fontSize={t.fontSizeMm}
                                  fontWeight={t.bold ? 'bold' : 'normal'}
                                  textAnchor={
                                    t.align === 'left'
                                      ? 'start'
                                      : t.align === 'right'
                                      ? 'end'
                                      : 'middle'
                                  }
                                >
                                  {t.text}
                                </text>
                              ))}
                            </g>
                          ))}
                        </svg>
                      )}
                    </div>

                    <div className="px-2.5 py-1.5 bg-[var(--ink-2)] border-t-[0.5px] border-[var(--line)] text-[10px] text-[var(--ink-10)]">
                      Latar kraft hanya simulasi pratinjau. File PDF &amp; SVG yang diunduh 100% transparan tanpa fill (garis belakang terpotong bersih).
                    </div>
                  </div>

                  {/* Vector Customization Controls */}
                  <div className="rounded-[var(--radius-control)] border-[0.5px] border-[var(--line)] bg-[var(--ink-2)]/60 p-2.5 space-y-2">
                    <TactileToggle
                      checked={vecIncludeFrames}
                      onChange={setVecIncludeFrames}
                      label="Bingkai & Teks Shipping Mark (Dwibahasa)"
                    />
                    <TactileToggle
                      checked={vecIncludeMaxStack}
                      onChange={setVecIncludeMaxStack}
                      label={`Sertakan Panel Maximum Stacking (${activeEvaluation.layerCount} Layer)`}
                    />
                    <div className="pt-1 border-t-[0.5px] border-[var(--line)] space-y-1.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-[var(--ink-11)]">Ketebalan Garis (Stroke)</span>
                        <span className="font-mono tabular-nums text-[10.5px] text-[var(--ink-10)]">
                          {VECTOR_STROKE_PRESETS[vecStrokePreset].strokeMm} mm
                        </span>
                      </div>
                      <TactileSegmented<VectorStrokePreset>
                        value={vecStrokePreset}
                        onChange={setVecStrokePreset}
                        size="compact"
                        fullWidth
                        ariaLabel="Ketebalan garis stroke vektor"
                        options={[
                          { value: 'thin', label: 'Tipis', title: VECTOR_STROKE_PRESETS.thin.hint },
                          { value: 'standard', label: 'Standar', title: VECTOR_STROKE_PRESETS.standard.hint },
                          { value: 'bold', label: 'Tebal', title: VECTOR_STROKE_PRESETS.bold.hint },
                        ]}
                      />
                    </div>
                  </div>
                </div>
              )}

              {exportPdfError && (
                <div className="rounded-[var(--radius-control)] bg-[var(--red-3)] border-[0.5px] border-[var(--red-6)] px-2.5 py-2 text-[11px] text-[var(--red-11)] flex items-start gap-1.5">
                  <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                  <span>{exportPdfError}</span>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                <TactileButton
                  type="button"
                  variant="secondary"
                  size="default"
                  disabled={exportingPdf || exportingVectorPdf}
                  onClick={() => setPdfModalOpen(false)}
                >
                  Batal
                </TactileButton>

                {exportModalTab === 'engineering' ? (
                  <TactileButton
                    type="button"
                    variant="primary"
                    size="default"
                    disabled={exportingPdf}
                    onClick={() => void handleExportPdfReport()}
                  >
                    <FileDown size={14} />
                    <span>
                      {exportingPdf
                        ? 'Menyiapkan PDF...'
                        : vehicle.enabled
                        ? 'Unduh PDF (3 Hal)'
                        : 'Unduh PDF (2 Hal)'}
                    </span>
                  </TactileButton>
                ) : (
                  <>
                    <TactileButton
                      type="button"
                      variant="secondary"
                      size="default"
                      disabled={exportingVectorPdf}
                      onClick={handleExportVectorSvg}
                      title="Unduh SVG terstruktur dengan grup layer siap Adobe Illustrator"
                    >
                      <FileDown size={14} />
                      <span>Unduh SVG (AI)</span>
                    </TactileButton>
                    <TactileButton
                      type="button"
                      variant="primary"
                      size="default"
                      disabled={exportingVectorPdf}
                      onClick={() => void handleExportVectorPdf()}
                      title="Unduh PDF vektor murni tanpa warna & tanpa gambar raster"
                    >
                      <FileDown size={14} />
                      <span>{exportingVectorPdf ? 'Menyiapkan...' : 'Unduh Vector PDF (AI)'}</span>
                    </TactileButton>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
