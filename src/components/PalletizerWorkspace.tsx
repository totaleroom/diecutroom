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
  Eye,
  EyeOff,
  FileDown,
  Flame,
  Layers,
  Package,
  PanelLeftClose,
  RotateCcw,
  Ruler,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Target,
  X,
} from 'lucide-react';
import {
  BoxConfig,
  CasePackConfig,
  DEFAULT_CASE_PACK_CONFIG,
  DEFAULT_PALLET_CONFIG,
  DielinePaths,
  EngineeringAnalysis,
  FLUTE_SPECS,
  PALLET_MARGIN_MAX_MM,
  PALLET_MARGIN_MIN_MM,
  PALLET_MARGIN_PRESETS,
  PALLET_PRESETS,
  PalletConfig,
  PalletPatternEvaluation,
  PalletPatternType,
  PalletViewOverlayMode,
  PerfectionistSizeSuggestion,
  PerfectionistTuningReport,
  PrimaryProductShape,
} from '../types';
import { computeBoardBurstKpa, computeSurfaceFrictionCoeff } from '../utils/engineering';
import {
  computeCasePackSolutions,
  computeEffectivePalletDims,
  computePerfectionistTuningReport,
  computeSmartPalletAdvisor,
  evaluateAllPalletPatterns,
  normalizePalletEdgeMarginMm,
  PalletPhysicsContext,
  pickOptimalPatternType,
} from '../utils/palletizer';
import { getEngineProfile, createDynamicResolutionController } from '../utils/browserEngine';
import { exportPalletizerReportPdf } from '../utils/palletizerReportPdf';
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
}

type LeftRailTab = 'case-pack' | 'pallet';
type CameraPreset = 'iso' | 'front' | 'top' | 'side';

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

interface PopulatePalletGroupParams {
  group: THREE.Group;
  pallet: PalletConfig;
  activeEvaluation: PalletPatternEvaluation;
  outerDimensions: { length: number; width: number; depth: number };
  materialColor: 'kraft' | 'white';
  inspectLayer: number | null;
  xRayMode: boolean;
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
  inspectLayer,
  xRayMode,
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

  // 4. Filter visible placements by inspectLayer
  const maxVisibleLayer = inspectLayer ?? activeEvaluation.layerCount;
  const visiblePlacements = activeEvaluation.placements.filter((b) => b.layer <= maxVisibleLayer);

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
      transparent: xRayMode,
      opacity: xRayMode ? 0.36 : 1,
      depthWrite: !xRayMode,
    });
    const topMat = new THREE.MeshStandardMaterial({
      map: topTex,
      color: isHeatmap || orientationContrast ? '#ffffff' : undefined,
      roughness: isHeatmap ? 0.48 : orientationContrast ? 0.50 : 0.56,
      metalness: 0.04,
      transparent: xRayMode,
      opacity: xRayMode ? 0.42 : 1,
      depthWrite: !xRayMode,
    });
    const cartonMaterials = [sideMat, sideMat, topMat, sideMat, sideMat, sideMat];

    const unitBoxGeo = new THREE.BoxGeometry(1, 1, 1);
    const instanced = new THREE.InstancedMesh(unitBoxGeo, cartonMaterials, visiblePlacements.length);
    instanced.castShadow = !xRayMode;
    instanced.receiveShadow = !xRayMode;

    const edgePositions: number[] = [];
    const pad = 0.0025;
    const baseLx = Math.max(0.01, outerDimensions.length * S - pad);
    const baseWz = Math.max(0.01, outerDimensions.width * S - pad);

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
        if (b.lockStatus === 'locked') {
          _tmpColor.set('#22C55E');
        } else if (b.lockStatus === 'at-risk') {
          _tmpColor.set('#EF4444');
        } else {
          _tmpColor.set('#F59E0B');
        }
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
        opacity: xRayMode ? 0.85 : orientationContrast ? 0.92 : isHeatmap ? 0.55 : 0.45,
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

    // 8. 3D Unbridged Cleavage Fault-Line Warning Planes
    const faultLines = activeEvaluation.stability?.faultLines || [];
    if (faultLines.length > 0 && (isHeatmap || faultLines.some((fl) => fl.severity === 'critical'))) {
      const slipH = pallet.useSlipSheet ? 0.002 : 0;
      const tierPadM = pallet.useTierSheets ? Math.max(0.001, pallet.tierSheetThicknessMm * S) : 0;
      const visH = Math.max(
        0.08,
        maxVisibleLayer * (outerDimensions.depth * S) + Math.max(0, maxVisibleLayer - 1) * tierPadM
      );
      const spanL = Math.max(pL, activeEvaluation.footprintL * S) + 0.03;
      const spanW = Math.max(pW, activeEvaluation.footprintW * S) + 0.03;

      faultLines.forEach((fl) => {
        const isCrit = fl.severity === 'critical';
        if (!isHeatmap && !isCrit) return;
        const planeMat = new THREE.MeshBasicMaterial({
          color: isCrit ? '#DC2626' : '#F59E0B',
          side: THREE.DoubleSide,
          transparent: true,
          opacity: isHeatmap ? (isCrit ? 0.24 : 0.16) : 0.11,
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

    // 9. 3D Unsupported Corner Markers in Heat-Map Mode
    if (isHeatmap) {
      const markerPts: Array<{ x: number; y: number; z: number }> = [];
      for (const b of visiblePlacements) {
        if (b.layer <= 1 || !b.unsupportedCornerCoords?.length) continue;
        const yTopM = (b.y + b.sizeY) * S;
        for (const [ux, uz] of b.unsupportedCornerCoords) {
          markerPts.push({ x: ux * S, y: yTopM, z: uz * S });
        }
      }

      if (markerPts.length > 0) {
        const haloGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.004, 14);
        const haloMat = new THREE.MeshStandardMaterial({
          color: '#EA580C',
          emissive: '#C2410C',
          emissiveIntensity: 0.45,
          roughness: 0.35,
        });
        const haloInst = new THREE.InstancedMesh(haloGeo, haloMat, markerPts.length);

        const pinGeo = new THREE.CylinderGeometry(0.004, 0.008, 0.026, 8);
        const pinMat = new THREE.MeshStandardMaterial({
          color: '#DC2626',
          emissive: '#991B1B',
          emissiveIntensity: 0.4,
          roughness: 0.3,
        });
        const pinInst = new THREE.InstancedMesh(pinGeo, pinMat, markerPts.length);

        markerPts.forEach((pt, i) => {
          _dummyObj.position.set(pt.x, pt.y + 0.002, pt.z);
          _dummyObj.rotation.set(0, 0, 0);
          _dummyObj.scale.set(1, 1, 1);
          _dummyObj.updateMatrix();
          haloInst.setMatrixAt(i, _dummyObj.matrix);

          _dummyObj.position.set(pt.x, pt.y + 0.015, pt.z);
          _dummyObj.updateMatrix();
          pinInst.setMatrixAt(i, _dummyObj.matrix);
        });

        haloInst.instanceMatrix.needsUpdate = true;
        pinInst.instanceMatrix.needsUpdate = true;
        group.add(haloInst, pinInst);
      }
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
  const [appliedBanner, setAppliedBanner] = useState<string | null>(null);
  const [inspectLayer, setInspectLayer] = useState<number | null>(null); // null = all layers
  const [xRayMode, setXRayMode] = useState(false);
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
  const [reportProjectName, setReportProjectName] = useState(() => config.metadata.productName || '');
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportPdfError, setExportPdfError] = useState<string | null>(null);

  // Solve right-sizing solutions for primary products synced with effective pallet underhang zone
  const casePackSolutions = useMemo(
    () =>
      computeCasePackSolutions(
        casePack,
        config.fluteThickness,
        analysis.netBoxAreaSqm,
        analysis.boardGsm,
        {
          palletLengthMm: pallet.palletLengthMm,
          palletWidthMm: pallet.palletWidthMm,
          allowedOverhangMm: pallet.allowedOverhangMm,
        }
      ),
    [
      casePack,
      config.fluteThickness,
      analysis.netBoxAreaSqm,
      analysis.boardGsm,
      pallet.palletLengthMm,
      pallet.palletWidthMm,
      pallet.allowedOverhangMm,
    ]
  );

  const safePlanIdx = Math.min(
    Math.max(0, casePack.selectedPlanIndex || 0),
    Math.max(0, casePackSolutions.length - 1)
  );
  const activeCasePlan = casePackSolutions[safePlanIdx] || null;

  // Gross weight per master case synced with product count & paper gsm
  const syncedCaseGrossKg = useMemo(() => {
    if (activeCasePlan) return activeCasePlan.caseGrossKg;
    const tareKg = Math.max(0.08, (analysis.netBoxAreaSqm * analysis.boardGsm) / 1000);
    const netKg = ((casePack.unitsPerCase || 1) * (casePack.unitWeightGrams || 400)) / 1000;
    return Math.round((tareKg + netKg) * 10) / 10;
  }, [activeCasePlan, analysis.netBoxAreaSqm, analysis.boardGsm, casePack.unitsPerCase, casePack.unitWeightGrams]);

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

  // Run initial evaluation once, then offload heavy multi-candidate TOPS & Perfectionist solving to Web Worker
  const [solverResult, setSolverResult] = useState<{
    patternEvaluations: PalletPatternEvaluation[];
    smartAdvisor: SmartPalletAdvisorResult;
    tuningReport: PerfectionistTuningReport;
  }>(() => ({
    patternEvaluations: evaluateAllPalletPatterns(
      pallet,
      paths.info.outerDimensions,
      syncedCaseGrossKg,
      analysis.correctedBctKgf,
      config.engineering.safetyFactor,
      casePack.unitsPerCase || 1,
      physicsCtx
    ),
    smartAdvisor: computeSmartPalletAdvisor(
      pallet,
      paths.info.outerDimensions,
      syncedCaseGrossKg,
      analysis.correctedBctKgf,
      config.engineering.safetyFactor,
      casePack.unitsPerCase || 1,
      physicsCtx
    ),
    tuningReport: computePerfectionistTuningReport(
      paths.info.innerDimensions,
      pallet,
      syncedCaseGrossKg,
      analysis.correctedBctKgf,
      config.engineering.safetyFactor,
      casePack.unitsPerCase || 1,
      physicsCtx
    ),
  }));

  const solverWorkerRef = useRef<Worker | null>(null);
  const workerReqIdRef = useRef(0);
  const solverMountedRef = useRef(false);

  const runSyncSolve = (
    p: PalletConfig,
    outerD: typeof paths.info.outerDimensions,
    innerD: typeof paths.info.innerDimensions,
    grossKg: number,
    bctKgf: number,
    sf: number,
    upc: number,
    phys: PalletPhysicsContext
  ) => ({
    patternEvaluations: evaluateAllPalletPatterns(p, outerD, grossKg, bctKgf, sf, upc, phys),
    smartAdvisor: computeSmartPalletAdvisor(p, outerD, grossKg, bctKgf, sf, upc, phys),
    tuningReport: computePerfectionistTuningReport(innerD, p, grossKg, bctKgf, sf, upc, phys),
  });

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
    if (!solverMountedRef.current) {
      solverMountedRef.current = true;
      return;
    }
    const unitsPerCase = casePack.unitsPerCase || 1;
    const worker = solverWorkerRef.current;
    if (!worker) {
      setSolverResult(
        runSyncSolve(
          pallet,
          paths.info.outerDimensions,
          paths.info.innerDimensions,
          syncedCaseGrossKg,
          analysis.correctedBctKgf,
          config.engineering.safetyFactor,
          unitsPerCase,
          physicsCtx
        )
      );
      return;
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

  // Reset inspect layer if active layers shrink
  useEffect(() => {
    if (inspectLayer !== null && inspectLayer > activeEvaluation.layerCount) {
      setInspectLayer(null);
    }
  }, [inspectLayer, activeEvaluation.layerCount]);

  // Helpers for updating CasePack and Pallet config inside BoxConfig
  const updateCasePack = (patch: Partial<CasePackConfig>) => {
    onChange((prev) => ({
      ...prev,
      casePack: { ...(prev.casePack || DEFAULT_CASE_PACK_CONFIG), ...patch },
    }));
  };

  const updatePallet = (patch: Partial<PalletConfig>) => {
    onChange((prev) => ({
      ...prev,
      pallet: { ...(prev.pallet || DEFAULT_PALLET_CONFIG), ...patch },
    }));
  };

  const handleApplyCasePackToCad = () => {
    if (!activeCasePlan) return;
    const targetL = activeCasePlan.innerL;
    const targetW = activeCasePlan.innerW;
    const targetD = activeCasePlan.innerD;
    onChange((prev) => ({
      ...prev,
      inputMode: 'product',
      product: {
        ...prev.product,
        length: Math.max(20, targetL - 2),
        width: Math.max(20, targetW - 2),
        depth: Math.max(20, targetD - 2),
        tolerancePreset: 'snug',
        clearanceL: 2,
        clearanceW: 2,
        clearanceD: 2,
      },
      dimensions: {
        length: targetL,
        width: targetW,
        depth: targetD,
      },
      casePack: { ...(prev.casePack || DEFAULT_CASE_PACK_CONFIG) },
    }));
    setAppliedBanner(
      `Diterapkan ke CAD: ${activeCasePlan.description} → ID ${targetL} × ${targetW} × ${targetD} mm`
    );
    window.setTimeout(() => setAppliedBanner(null), 4000);
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

  const handleApplyBoardAdvice = () => {
    const adv = tuningReport.boardAdvice;
    if (!adv) return;
    const fSpec = FLUTE_SPECS[adv.fluteId] || FLUTE_SPECS.C;
    const isDw = fSpec.wall === 'double-wall';
    onChange((prev) => ({
      ...prev,
      boardGrade: isDw ? 'double-wall' : 'single-wall',
      fluteThickness: fSpec.thickness,
      engineering: {
        ...prev.engineering,
        fluteId: adv.fluteId,
        topLayer: adv.topLayer,
        mediumLayer: adv.mediumLayer,
        bottomLayer: adv.bottomLayer,
      },
      metadata: {
        ...prev.metadata,
        materialSubstance: `${adv.topLayer}/${adv.mediumLayer}/${adv.bottomLayer}`,
      },
    }));
    setAppliedBanner(
      `Resep Kertas Diperkuat: ${adv.recommendedRecipe} · Burst ${adv.burstKpa} kPa`
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

  // Keyboard shortcut 'H' for bottom dock
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
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
    scene.fog = new THREE.Fog('#f1f3f6', 6, 16);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(38, width / height, 0.05, 50);
    camera.position.set(2.45, 1.95, 2.55);
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
    controls.maxDistance = 8.5;
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
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
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
          if (renderDirty || stillMoving) {
            requestRender();
          }
        };
        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    };

    requestRenderRef.current = requestRender;

    const handleControlStart = () => {
      cameraAnimRef.current.active = false;
    };
    controls.addEventListener('start', handleControlStart);
    controls.addEventListener('change', requestRender);

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
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
      inspectLayer,
      xRayMode,
      viewOverlayMode,
      maxAnisotropy: maxAniso,
    });

    requestRenderRef.current();
  }, [pallet, activeEvaluation, inspectLayer, xRayMode, viewOverlayMode, config.materialColor, paths.info.outerDimensions]);

  const setCameraPreset = (preset: CameraPreset) => {
    setActiveCamPreset(preset);
    const stackH = Math.max(0.6, activeEvaluation.totalStackHeightMm * 0.001);
    const midY = stackH * 0.46;
    const dist = Math.max(2.15, stackH * 1.48);
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

  const handleOpenPdfModal = () => {
    setExportPdfError(null);
    setReportProjectName((prev) => prev || config.metadata.productName || '');
    setPdfModalOpen(true);
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
        inspectLayer: null,
        xRayMode: false,
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
        inspectLayer: null,
        xRayMode: false,
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
        inspectLayer,
        xRayMode,
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

  const renderLeftRail = () => (
    <aside
      className={`surface-rail ${
        isOverlayRail
          ? 'relative z-10 w-[min(336px,92vw)] h-full shadow-[var(--shadow-modal)]'
          : 'w-[316px] xl:w-[336px] h-full'
      } bg-[var(--surface-top)] border-r-[0.5px] border-[var(--line)] flex flex-col shrink-0 min-h-0`}
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
              { value: 'pallet', label: 'Pallet & BCT' },
              { value: 'case-pack', label: 'Case Pack' },
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
          {railTab === 'case-pack' ? (
            <>
              <TactileSection title="Produk Primer & Bulge">
                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] text-[var(--ink-10)] mb-1">
                      Bentuk Produk Primer
                    </label>
                    <TactileSegmented
                      value={casePack.shape}
                      onChange={(s: PrimaryProductShape) => updateCasePack({ shape: s })}
                      fullWidth
                      size="compact"
                      ariaLabel="Primary product shape"
                      options={[
                        { value: 'carton', label: 'Karton' },
                        { value: 'cylinder', label: 'Silinder' },
                        { value: 'pouch', label: 'Pouch' },
                      ]}
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[11px] text-[var(--ink-10)] mb-1">
                        {casePack.shape === 'cylinder' ? 'Ø (mm)' : 'P (mm)'}
                      </label>
                      <TactileInputWell
                        type="number"
                        min={10}
                        max={800}
                        value={casePack.unitLengthMm}
                        onChange={(e) =>
                          updateCasePack({
                            unitLengthMm: Math.max(10, Number(e.target.value) || 10),
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
                        min={10}
                        max={800}
                        disabled={casePack.shape === 'cylinder'}
                        value={
                          casePack.shape === 'cylinder'
                            ? casePack.unitLengthMm
                            : casePack.unitWidthMm
                        }
                        onChange={(e) =>
                          updateCasePack({
                            unitWidthMm: Math.max(10, Number(e.target.value) || 10),
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[var(--ink-10)] mb-1">
                        T (mm)
                      </label>
                      <TactileInputWell
                        type="number"
                        min={10}
                        max={800}
                        value={casePack.unitDepthMm}
                        onChange={(e) =>
                          updateCasePack({
                            unitDepthMm: Math.max(10, Number(e.target.value) || 10),
                          })
                        }
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] text-[var(--ink-10)] mb-1">
                        Berat Unit (gram)
                      </label>
                      <TactileInputWell
                        type="number"
                        min={1}
                        max={50000}
                        value={casePack.unitWeightGrams}
                        onChange={(e) =>
                          updateCasePack({
                            unitWeightGrams: Math.max(1, Number(e.target.value) || 1),
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[var(--ink-10)] mb-1">
                        Isi / Master Dus
                      </label>
                      <TactileInputWell
                        type="number"
                        min={1}
                        max={200}
                        value={casePack.unitsPerCase}
                        onChange={(e) =>
                          updateCasePack({
                            unitsPerCase: Math.max(1, Math.min(200, Number(e.target.value) || 1)),
                            selectedPlanIndex: 0,
                          })
                        }
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-[11px] text-[var(--ink-10)] mb-1">
                      <span>Bulge / Compression (+/- mm)</span>
                      <span className="font-mono tabular-nums text-[var(--ink-11)]">
                        {casePack.bulgeL >= 0 ? `+${casePack.bulgeL}` : casePack.bulgeL} /{' '}
                        {casePack.bulgeW >= 0 ? `+${casePack.bulgeW}` : casePack.bulgeW} /{' '}
                        {casePack.bulgeD >= 0 ? `+${casePack.bulgeD}` : casePack.bulgeD} mm
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <TactileInputWell
                        type="number"
                        min={-25}
                        max={40}
                        step={0.5}
                        value={casePack.bulgeL}
                        onChange={(e) => updateCasePack({ bulgeL: Number(e.target.value) || 0 })}
                        title="Bulge Panjang (positif mengembang, negatif kompresi)"
                      />
                      <TactileInputWell
                        type="number"
                        min={-25}
                        max={40}
                        step={0.5}
                        disabled={casePack.shape === 'cylinder'}
                        value={casePack.shape === 'cylinder' ? casePack.bulgeL : casePack.bulgeW}
                        onChange={(e) => updateCasePack({ bulgeW: Number(e.target.value) || 0 })}
                        title="Bulge Lebar"
                      />
                      <TactileInputWell
                        type="number"
                        min={-25}
                        max={40}
                        step={0.5}
                        value={casePack.bulgeD}
                        onChange={(e) => updateCasePack({ bulgeD: Number(e.target.value) || 0 })}
                        title="Bulge Tinggi"
                      />
                    </div>
                  </div>
                </div>
              </TactileSection>

              <TactileSection title="Sekat Partisi & Orientasi">
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] text-[var(--ink-10)] mb-1">
                        Tebal Sekat Sel (mm)
                      </label>
                      <TactileInputWell
                        type="number"
                        min={0}
                        max={20}
                        step={0.5}
                        value={casePack.dividerThicknessMm}
                        onChange={(e) =>
                          updateCasePack({
                            dividerThicknessMm: Math.max(0, Number(e.target.value) || 0),
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[var(--ink-10)] mb-1">
                        Pad Antar Tier (mm)
                      </label>
                      <TactileInputWell
                        type="number"
                        min={0}
                        max={20}
                        step={0.5}
                        value={casePack.layerPadThicknessMm}
                        onChange={(e) =>
                          updateCasePack({
                            layerPadThicknessMm: Math.max(0, Number(e.target.value) || 0),
                          })
                        }
                      />
                    </div>
                  </div>

                  <TactileToggle
                    checked={casePack.uprightOnly}
                    onChange={(v) => updateCasePack({ uprightOnly: v })}
                    label="Wajib posisi produk berdiri (Upright)"
                  />

                  {casePack.shape === 'cylinder' && (
                    <TactileToggle
                      checked={casePack.cylinderStagger}
                      onChange={(v) => updateCasePack({ cylinderStagger: v })}
                      label="Susunan nested sarang madu (Hemat ~13%)"
                    />
                  )}
                </div>
              </TactileSection>

              <TactileSection title={`Solusi Right-Sizing (${casePackSolutions.length})`}>
                <div className="space-y-2">
                  {casePackSolutions.length === 0 ? (
                    <div className="text-[12px] text-[var(--ink-10)] py-2">
                      Tidak ada kombinasi valid untuk ukuran & jumlah ini. Coba ubah jumlah isi/dus atau izinkan rotasi produk.
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-[240px] overflow-y-auto pr-0.5">
                      {casePackSolutions.map((sol, idx) => {
                        const selected = idx === safePlanIdx;
                        return (
                          <button
                            key={sol.id}
                            type="button"
                            onClick={() => updateCasePack({ selectedPlanIndex: idx })}
                            className={`w-full text-left px-2.5 py-2 rounded-[var(--radius-control)] border-[0.5px] transition-colors ${
                              selected
                                ? 'bg-[var(--ink-12)] text-white border-[var(--ink-12)]'
                                : 'bg-[var(--surface-top)] text-[var(--ink-12)] border-[var(--line)] hover:bg-[var(--ink-2)]'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2 text-[12px] font-medium">
                              <span className="truncate">{sol.description}</span>
                              <span
                                className={`font-mono tabular-nums text-[11px] shrink-0 ${
                                  selected ? 'text-white/90' : 'text-[var(--ink-10)]'
                                }`}
                              >
                                {sol.palletAreaEstPct}% Pallet
                              </span>
                            </div>
                            <div
                              className={`mt-0.5 flex items-center justify-between text-[11px] font-mono tabular-nums ${
                                selected ? 'text-white/75' : 'text-[var(--ink-10)]'
                              }`}
                            >
                              <span>
                                ID {sol.innerL}×{sol.innerW}×{sol.innerD} mm
                              </span>
                              <span>{sol.caseGrossKg} kg/dus</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {activeCasePlan && (
                    <div className="pt-1 space-y-2">
                      <TactileButton
                        type="button"
                        variant="primary"
                        size="default"
                        onClick={handleApplyCasePackToCad}
                        className="w-full justify-center"
                      >
                        <Package size={14} />
                        <span>Terapkan ke Dieline CAD</span>
                        <ArrowRight size={14} />
                      </TactileButton>

                      {appliedBanner && (
                        <div className="rounded-[var(--radius-control)] bg-[var(--green-3)] text-[var(--green-11)] px-2.5 py-1.5 text-[11px] flex items-center gap-1.5">
                          <Check size={13} className="shrink-0" />
                          <span>{appliedBanner}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </TactileSection>
            </>
          ) : (
            <>
              <TactileSection title="Master Case Aktif (Sync CAD)">
                <div className="rounded-[var(--radius-control)] bg-[var(--ink-2)] px-3 py-2 text-[12px] space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--ink-10)]">Box OD (L×W×D)</span>
                    <span className="font-mono tabular-nums text-[var(--ink-12)] font-medium">
                      {Math.round(paths.info.outerDimensions.length)}×
                      {Math.round(paths.info.outerDimensions.width)}×
                      {Math.round(paths.info.outerDimensions.depth)} mm
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--ink-10)]">Berat Kotor Dus</span>
                    <span className="font-mono tabular-nums text-[var(--ink-12)]">
                      {syncedCaseGrossKg} kg ({casePack.unitsPerCase} pcs)
                    </span>
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
                      <label className="block text-[11px] text-[var(--ink-10)] mb-1">
                        Max Tinggi (mm)
                      </label>
                      <TactileInputWell
                        type="number"
                        min={500}
                        max={2800}
                        step={50}
                        value={pallet.maxStackHeightMm}
                        onChange={(e) =>
                          updatePallet({
                            maxStackHeightMm: Math.max(500, Number(e.target.value) || 1800),
                          })
                        }
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

                  <div>
                    <div className="flex items-center justify-between text-[11px] text-[var(--ink-10)] mb-1">
                      <span>Jumlah Layer Tumpukan</span>
                      <button
                        type="button"
                        onClick={() =>
                          updatePallet({
                            manualLayerCount:
                              pallet.manualLayerCount === null ? activeEvaluation.layerCount : null,
                          })
                        }
                        className="text-[var(--accent-10)] hover:underline"
                      >
                        {pallet.manualLayerCount === null ? 'Auto Max (Set Manual)' : 'Kembali ke Auto'}
                      </button>
                    </div>
                    {pallet.manualLayerCount !== null ? (
                      <TactileSlider
                        min={1}
                        max={16}
                        value={pallet.manualLayerCount}
                        onChange={(e) =>
                          updatePallet({ manualLayerCount: Number(e.target.value) || 1 })
                        }
                      />
                    ) : (
                      <div className="text-[12px] font-mono tabular-nums text-[var(--ink-11)] bg-[var(--ink-2)] rounded-[var(--radius-control)] px-2.5 py-1.5">
                        Auto: {activeEvaluation.layerCount} Layer ({activeEvaluation.totalStackHeightMm} mm)
                      </div>
                    )}
                  </div>
                </div>
              </TactileSection>

              <TactileSection title="Audit Stabilitas, Rem & Anti-Pecah">
                <div className="rounded-[var(--radius-control)] border-[0.5px] border-[var(--line)] bg-[var(--surface-top)] p-3 space-y-2.5 text-[11px]">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--ink-12)]">
                        <Sparkles size={13} className="text-[var(--accent-10)] shrink-0" />
                        <span className="truncate">{activeEvaluation.stability.forkliftSafetyLabel}</span>
                      </div>
                      <div className="text-[var(--ink-10)] mt-0.5 truncate">
                        {activeEvaluation.patternSummary || activeEvaluation.label} · μ={activeEvaluation.stability.surfaceFrictionCoeff}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono tabular-nums text-[14px] font-bold text-[var(--ink-12)]">
                        {activeEvaluation.stability.smartScore}
                        <span className="text-[10px] font-normal text-[var(--ink-10)]">/100</span>
                      </div>
                      <div className="text-[10px] text-[var(--ink-10)]">Skor Cerdas</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-x-3 gap-y-2 pt-2 border-t-[0.5px] border-[var(--line)]">
                    <div>
                      <span className="text-[var(--ink-10)] block">Seam Lock &amp; Belah</span>
                      <span className="font-mono tabular-nums font-semibold text-[var(--ink-12)]">
                        {activeEvaluation.stability.seamLockPct}% ·{' '}
                        <span
                          className={
                            activeEvaluation.stability.faultLineCount > 0
                              ? 'text-[var(--red-11)]'
                              : 'text-[var(--green-11)]'
                          }
                        >
                          {activeEvaluation.stability.faultLineCount} Belah
                        </span>
                      </span>
                    </div>
                    <div>
                      <span className="text-[var(--ink-10)] block">Sudut Menumpu</span>
                      <span
                        className={`font-mono tabular-nums font-semibold ${
                          activeEvaluation.stability.supportedCornerPct < 88
                            ? 'text-[var(--amber-11)]'
                            : 'text-[var(--green-11)]'
                        }`}
                      >
                        {activeEvaluation.stability.supportedCornerPct}%{' '}
                        {activeEvaluation.stability.unsupportedCornerCount > 0
                          ? `(${activeEvaluation.stability.unsupportedCornerCount} gantung)`
                          : '(Utuh)'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[var(--ink-10)] block">Rem Tanpa Plakban</span>
                      <span
                        className={`font-mono tabular-nums font-semibold ${
                          activeEvaluation.stability.noPlakbanPass035g
                            ? 'text-[var(--green-11)]'
                            : 'text-[var(--red-11)]'
                        }`}
                      >
                        ±{activeEvaluation.stability.noPlakbanSafeG}g{' '}
                        {activeEvaluation.stability.noPlakbanPass045g
                          ? '(0.45g Kuat)'
                          : activeEvaluation.stability.noPlakbanPass035g
                          ? '(0.35g Lolos)'
                          : '(<0.35g)'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[var(--ink-10)] block">Anti-Pecah (Burst)</span>
                      <span
                        className={`font-mono tabular-nums font-semibold ${
                          activeEvaluation.stability.burstStatus === 'strong'
                            ? 'text-[var(--green-11)]'
                            : activeEvaluation.stability.burstStatus === 'marginal'
                            ? 'text-[var(--amber-11)]'
                            : 'text-[var(--red-11)]'
                        }`}
                      >
                        {activeEvaluation.stability.burstStrengthKpa} kPa (×{activeEvaluation.stability.burstMarginRatio})
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1 pt-1.5 border-t-[0.5px] border-[var(--line)] text-[var(--ink-11)] leading-[15px]">
                    {activeEvaluation.stability.recommendations.slice(0, 2).map((rec, i) => (
                      <div key={i} className="flex items-start gap-1.5">
                        <AlertTriangle
                          size={12}
                          className={`mt-0.5 shrink-0 ${
                            activeEvaluation.stability.faultLineCount > 0 ||
                            !activeEvaluation.stability.noPlakbanPass035g ||
                            activeEvaluation.stability.burstStatus !== 'strong'
                              ? 'text-[var(--amber-11)]'
                              : 'text-[var(--green-11)]'
                          }`}
                        />
                        <span>{rec}</span>
                      </div>
                    ))}
                  </div>

                  {tuningReport.boardAdvice && (
                    <div className="rounded-[var(--radius-sm)] bg-[var(--amber-3)] border-[0.5px] border-[var(--amber-6)] p-2 space-y-1.5 text-[11px]">
                      <div className="font-medium text-[var(--amber-11)]">
                        Saran Material Anti-Pecah: {tuningReport.boardAdvice.recommendedRecipe}
                      </div>
                      <div className="text-[var(--ink-11)] leading-[14px]">
                        {tuningReport.boardAdvice.reason}
                      </div>
                      <TactileButton
                        type="button"
                        variant="secondary"
                        size="compact"
                        className="w-full justify-center h-auto min-h-[28px] py-1.5"
                        onClick={handleApplyBoardAdvice}
                      >
                        <span className="whitespace-normal text-center leading-[14px]">
                          Pakai {tuningReport.boardAdvice.recommendedRecipe} · {tuningReport.boardAdvice.burstKpa} kPa (+{tuningReport.boardAdvice.bctGainPct}%)
                        </span>
                      </TactileButton>
                    </div>
                  )}

                  {(smartAdvisor.bestPatternType !== effectivePatternType ||
                    (smartAdvisor.suggestTopPlakban && !pallet.useTopLayerPlakban)) && (
                    <TactileButton
                      type="button"
                      variant="primary"
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
                        Terapkan Pola Terbaik ({smartAdvisor.bestEvaluation.stability.smartScore}
                        {smartAdvisor.suggestTopPlakban ? ' + Plakban Atas' : ''})
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

              <TactileSection title="Pola Susunan (Alternating Otomatis)">
                <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--ink-10)] -mt-1 mb-1">
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
                        onClick={() => updatePallet({ recommendationMode: m.id, patternAutoMode: true })}
                        className={`px-2 py-0.5 rounded-[var(--radius-sm)] text-[10.5px] cursor-pointer transition-colors ${
                          recommendationMode === m.id
                            ? 'bg-[var(--surface-top)] text-[var(--ink-12)] shadow-[var(--shadow-button)] font-medium'
                            : 'text-[var(--ink-10)] hover:text-[var(--ink-12)]'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                  {!isAutoPattern && (
                    <button
                      type="button"
                      onClick={() =>
                        updatePallet({
                          patternAutoMode: true,
                          patternType: optimalPatternType,
                        })
                      }
                      className="text-[var(--accent-10)] hover:underline cursor-pointer shrink-0"
                    >
                      Auto
                    </button>
                  )}
                </div>
                <div className="space-y-1.5">
                  {patternEvaluations.map((ev) => {
                    const active = ev.patternType === effectivePatternType;
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
                        className={`w-full text-left px-2.5 py-2 rounded-[var(--radius-control)] border-[0.5px] transition-colors cursor-pointer ${
                          active
                            ? 'bg-[var(--ink-12)] text-white border-[var(--ink-12)]'
                            : 'bg-[var(--surface-top)] text-[var(--ink-12)] border-[var(--line)] hover:bg-[var(--ink-2)]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 text-[12px] font-medium">
                          <span className="truncate">
                            {ev.label}
                            {ev.isSmartRecommended ? ' ★' : ''}
                          </span>
                          <span
                            className={`font-mono tabular-nums text-[11px] shrink-0 ${
                              active ? 'text-white/90' : 'text-[var(--ink-10)]'
                            }`}
                          >
                            Skor {ev.stability.smartScore} · {ev.areaEfficiencyPct}%
                          </span>
                        </div>
                        <div
                          className={`mt-0.5 flex items-center justify-between text-[11px] font-mono tabular-nums ${
                            active ? 'text-white/75' : 'text-[var(--ink-10)]'
                          }`}
                        >
                          <span className="truncate">
                            {ev.casesPerLayer}/lyr · {ev.totalCases} dus
                          </span>
                          <span className="shrink-0">
                            Lock {ev.stability.seamLockPct}% · Sudut {ev.stability.supportedCornerPct}%
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {smartAdvisor.variants.length > 0 && (
                  <div className="pt-1.5">
                    <button
                      type="button"
                      onClick={() => setShowAllCandidates((v) => !v)}
                      className="text-[11px] text-[var(--accent-10)] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      {showAllCandidates ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      <span>
                        {showAllCandidates
                          ? 'Tutup Perbandingan TOPS'
                          : `Bandingkan Detail ${smartAdvisor.variants.length} Pola TOPS`}
                      </span>
                    </button>
                    {showAllCandidates && (
                      <div className="mt-1.5 space-y-1">
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
                  <div className="pt-1">
                    <TactileButton
                      type="button"
                      variant="primary"
                      size="default"
                      className="w-full justify-center"
                      onClick={handleOpenPdfModal}
                      disabled={contextLost || exportingPdf}
                    >
                      <FileDown size={14} />
                      <span>Export Laporan PDF Palletizer</span>
                    </TactileButton>
                  </div>
                </div>
              </TactileSection>
            </>
          )}
        </div>
      </aside>
  );

  return (
    <div className="flex-1 flex min-h-0 overflow-hidden bg-[var(--ground)] relative">
      {/* Left Configuration Rail: Docked on >= 1024px, Slide-Over Drawer on < 1024px */}
      {railOpen &&
        (isOverlayRail ? (
          <div className="fixed inset-0 z-40 flex">
            <div
              onClick={onCloseRail}
              className="fixed inset-0 bg-[var(--backdrop)] backdrop-blur-[2px]"
              aria-hidden="true"
            />
            {renderLeftRail()}
          </div>
        ) : (
          renderLeftRail()
        ))}

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

        {/* Top-Right Floating Camera POV Presets Capsule */}
        <div
          role="group"
          aria-label="Preset sudut kamera Palletizer"
          className="pointer-events-auto absolute top-2.5 right-2.5 sm:top-3 sm:right-3 z-10 flex items-center gap-1 p-1 rounded-[var(--radius-container)] bg-[var(--surface-top)]/92 backdrop-blur-md border-[0.5px] border-[var(--line)] shadow-[var(--shadow-card)] max-w-[calc(100vw-20px)] overflow-x-auto"
        >
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
            onClick={() => {
              setInspectLayer(null);
              setCameraPreset('iso');
            }}
            title="Reset view"
            aria-label="Reset view"
          >
            <RotateCcw size={12} />
          </TactileButton>
          <div className="h-3.5 w-[0.5px] bg-[var(--line)] mx-0.5 shrink-0" />
          <TactileButton
            type="button"
            variant="primary"
            size="inline"
            className="h-[26px] px-2 text-[11px] shrink-0"
            onClick={handleOpenPdfModal}
            disabled={contextLost || exportingPdf}
            title="Export Laporan Engineering Palletizer PDF (A4 2 Halaman)"
          >
            <FileDown size={12} />
            <span>Export PDF</span>
          </TactileButton>
        </div>

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
                    <div className="w-[64px] shrink-0">
                      <TactileSlider
                        min={1}
                        max={Math.max(1, activeEvaluation.layerCount)}
                        value={inspectLayer ?? activeEvaluation.layerCount}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setInspectLayer(val >= activeEvaluation.layerCount ? null : val);
                        }}
                      />
                    </div>
                    <span className="font-mono tabular-nums text-[11px] text-[var(--ink-11)] whitespace-nowrap shrink-0">
                      {inspectLayer === null
                        ? `All (${activeEvaluation.layerCount})`
                        : `Lyr ${inspectLayer}/${activeEvaluation.layerCount}`}
                    </span>
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
                      title="Mode Heat-Map Penguncian Antar Layer"
                    >
                      <Flame size={12} />
                      <span className="hidden sm:inline">Heat-Map</span>
                    </TactileButton>

                    <TactileButton
                      type="button"
                      variant={xRayMode ? 'primary' : 'secondary'}
                      size="inline"
                      className="h-[26px] px-2"
                      onClick={() => setXRayMode((x) => !x)}
                    >
                      {xRayMode ? <EyeOff size={12} /> : <Eye size={12} />}
                      <span>X-Ray</span>
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
              } inset-x-3 z-10 flex flex-col items-end gap-1`}
            >
              <button
                type="button"
                onClick={() => setDockCollapsed((c) => !c)}
                className="pointer-events-auto inline-flex items-center gap-1.5 h-[26px] px-2.5 rounded-[var(--radius-control)] bg-[#ffffff]/96 border-[0.5px] border-[var(--line)] shadow-[var(--shadow-button)] text-[11px] text-[var(--ink-11)] hover:text-[var(--ink-12)] transition-colors cursor-pointer"
                title="Toggle kontrol palet (Tombol H)"
              >
                {dockCollapsed ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                <span>{dockCollapsed ? 'Tampilkan Kontrol (H)' : 'Sembunyikan (H)'}</span>
              </button>

              <div className="pointer-events-auto w-full rounded-[var(--radius-container)] bg-[#ffffff]/96 border-[0.5px] border-[var(--line)] shadow-[var(--shadow-modal)] px-3 sm:px-3.5 py-2 overflow-hidden">
                {/* Row 1: Pallet & BCT Summary Band (Always visible even when controls collapse) */}
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 min-w-0">
                    <span className="text-[12.5px] font-semibold text-[var(--ink-12)] whitespace-nowrap">
                      {activeEvaluation.label}
                    </span>
                    <span aria-hidden="true" className="text-[var(--ink-8)]">·</span>
                    <span className="text-[11px] text-[var(--ink-10)] whitespace-nowrap">
                      {pallet.palletLengthMm} × {pallet.palletWidthMm} mm Pallet
                      {activeEvaluation.patternSummary ? ` · ${activeEvaluation.patternSummary}` : ''}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0 ml-auto">
                    {viewOverlayMode === 'lock-heatmap' && (
                      <div className="hidden @[640px]:flex items-center gap-2.5 text-[10.5px] text-[var(--ink-11)] pr-1">
                        <span className="inline-flex items-center gap-1 whitespace-nowrap">
                          <span className="size-2 rounded-[2px] bg-[#22C55E]" />
                          Terkunci
                        </span>
                        <span className="inline-flex items-center gap-1 whitespace-nowrap">
                          <span className="size-2 rounded-[2px] bg-[#F59E0B]" />
                          Column 1:1
                        </span>
                        <span className="inline-flex items-center gap-1 whitespace-nowrap">
                          <span className="size-2 rounded-[2px] bg-[#EF4444]" />
                          Rawan
                        </span>
                        <span className="inline-flex items-center gap-1 whitespace-nowrap">
                          <span className="size-2 rounded-full bg-[#EA580C]" />
                          Sudut Gantung ({activeEvaluation.stability.unsupportedCornerCount})
                        </span>
                      </div>
                    )}

                    {activeEvaluation.edgeStatus === 'overhang' ? (
                      <span className="rounded-[var(--radius-sm)] bg-[var(--red-3)] border-[0.5px] border-[var(--red-6)] px-2 py-0.5 text-[11px] text-[var(--red-11)] font-mono tabular-nums whitespace-nowrap">
                        Overhang +{Math.max(activeEvaluation.overhangL, activeEvaluation.overhangW)} mm
                      </span>
                    ) : activeEvaluation.edgeStatus === 'flush-risk' ? (
                      <span className="rounded-[var(--radius-sm)] bg-[var(--amber-3)] border-[0.5px] border-[var(--amber-6)] px-2 py-0.5 text-[11px] text-[var(--amber-11)] font-mono tabular-nums whitespace-nowrap">
                        Tepi Mepet -{Math.min(activeEvaluation.underhangL, activeEvaluation.underhangW)} mm
                      </span>
                    ) : activeEvaluation.edgeStatus === 'excessive-underhang' ? (
                      <span className="rounded-[var(--radius-sm)] bg-[var(--amber-3)] border-[0.5px] border-[var(--amber-6)] px-2 py-0.5 text-[11px] text-[var(--amber-11)] font-mono tabular-nums whitespace-nowrap">
                        Underhang -{Math.max(activeEvaluation.underhangL, activeEvaluation.underhangW)} mm
                      </span>
                    ) : (
                      <span className="rounded-[var(--radius-sm)] bg-[var(--green-3)] border-[0.5px] border-[var(--green-6)] px-2 py-0.5 text-[11px] text-[var(--green-11)] font-mono tabular-nums whitespace-nowrap">
                        Inset -{activeEvaluation.underhangL}/-{activeEvaluation.underhangW} mm
                      </span>
                    )}

                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-[var(--radius-sm)] border-[0.5px] text-[11px] font-medium shrink-0 ${bctStatusMeta.badgeClass}`}
                    >
                      <BctStatusIcon size={12} />
                      <span>{bctStatusMeta.label}</span>
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 @[620px]:grid-cols-4 gap-x-4 gap-y-1.5 mt-1.5 pt-1.5 border-t-[0.5px] border-[var(--line)] text-[11px]">
                  <div className="min-w-0">
                    <span className="text-[var(--ink-10)] block">Muatan &amp; Produk</span>
                    <span className="font-mono tabular-nums font-semibold text-[var(--ink-12)] whitespace-nowrap">
                      {activeEvaluation.totalCases} dus ({activeEvaluation.totalUnits.toLocaleString('id-ID')} pcs)
                    </span>
                  </div>
                  <div className="min-w-0">
                    <span className="text-[var(--ink-10)] block">Lock &amp; Sudut Menumpu</span>
                    <span className="font-mono tabular-nums font-semibold text-[var(--ink-12)] whitespace-nowrap">
                      {activeEvaluation.stability.seamLockPct}% · {activeEvaluation.stability.supportedCornerPct}%
                    </span>
                  </div>
                  <div className="min-w-0">
                    <span className="text-[var(--ink-10)] block">Rem Tanpa Plakban / Burst</span>
                    <span className="font-mono tabular-nums text-[var(--ink-12)] whitespace-nowrap">
                      ±{activeEvaluation.stability.noPlakbanSafeG}g · {activeEvaluation.stability.burstStrengthKpa} kPa
                    </span>
                  </div>
                  <div className="min-w-0">
                    <span className="text-[var(--ink-10)] block">Tinggi &amp; Berat</span>
                    <span className="font-mono tabular-nums text-[var(--ink-12)] whitespace-nowrap">
                      {activeEvaluation.totalStackHeightMm} mm · {activeEvaluation.grossLoadKg} kg
                    </span>
                  </div>
                </div>

                {/* Row 2: Responsive Collapsible Controls Band */}
                {!dockCollapsed && (
                  <div className="mt-2 pt-2 border-t-[0.5px] border-[var(--line)] flex flex-wrap items-center justify-between gap-2">
                    {/* Layer Step Inspector */}
                    <div className="flex items-center gap-2 min-w-0">
                      <Layers size={14} className="text-[var(--ink-10)] shrink-0" />
                      <div className="w-[64px] shrink-0">
                        <TactileSlider
                          min={1}
                          max={Math.max(1, activeEvaluation.layerCount)}
                          value={inspectLayer ?? activeEvaluation.layerCount}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setInspectLayer(val >= activeEvaluation.layerCount ? null : val);
                          }}
                        />
                      </div>
                      <span className="font-mono tabular-nums text-[11px] text-[var(--ink-11)] whitespace-nowrap">
                        {inspectLayer === null
                          ? `All (${activeEvaluation.layerCount})`
                          : `Lyr ${inspectLayer}/${activeEvaluation.layerCount}`}
                      </span>
                    </div>

                    {/* Right Actions: Heat-Map + X-Ray */}
                    <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                      <TactileButton
                        type="button"
                        variant={viewOverlayMode === 'lock-heatmap' ? 'primary' : 'secondary'}
                        size="compact"
                        onClick={() =>
                          setViewOverlayMode((m) => (m === 'normal' ? 'lock-heatmap' : 'normal'))
                        }
                        title="Mode Heat-Map Penguncian Antar Layer"
                      >
                        <Flame size={13} />
                        <span>Heat-Map</span>
                      </TactileButton>

                      <TactileButton
                        type="button"
                        variant={xRayMode ? 'primary' : 'secondary'}
                        size="compact"
                        onClick={() => setXRayMode((x) => !x)}
                      >
                        {xRayMode ? <EyeOff size={13} /> : <Eye size={13} />}
                        <span>X-Ray</span>
                      </TactileButton>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        )}
      </div>

      {/* Export Laporan Engineering Palletizer PDF Dialog */}
      {pdfModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pallet-pdf-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--backdrop)] backdrop-blur-[2px]"
          onClick={(e) => {
            if (e.target === e.currentTarget && !exportingPdf) {
              setPdfModalOpen(false);
            }
          }}
        >
          <div className="surface-raised w-full max-w-[400px] bg-[var(--surface-top)] rounded-[var(--radius-container)] shadow-[var(--shadow-modal)] border-[0.5px] border-[var(--line)] overflow-hidden">
            <div className="px-4 py-3 border-b-[0.5px] border-[var(--line)] flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h2
                  id="pallet-pdf-modal-title"
                  className="text-[13px] font-semibold text-[var(--ink-12)] truncate"
                >
                  Export Laporan Palletizer PDF
                </h2>
                <p className="text-[11px] text-[var(--ink-10)]">
                  Format A4 · 2 Halaman siap cetak &amp; serah terima gudang
                </p>
              </div>
              <button
                type="button"
                disabled={exportingPdf}
                onClick={() => setPdfModalOpen(false)}
                aria-label="Tutup dialog Export PDF"
                className="size-7 rounded-[var(--radius-control)] flex items-center justify-center text-[var(--ink-10)] hover:text-[var(--ink-12)] hover:bg-[var(--ink-3)] cursor-pointer disabled:opacity-50"
              >
                <X size={14} />
              </button>
            </div>

            <div className="p-4 space-y-3.5 text-[12px]">
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
                    if (e.key === 'Enter' && !exportingPdf) {
                      void handleExportPdfReport();
                    } else if (e.key === 'Escape' && !exportingPdf) {
                      setPdfModalOpen(false);
                    }
                  }}
                />
                <p className="mt-1 text-[10.5px] text-[var(--ink-10)]">
                  Ditampilkan di header Halaman 1 &amp; 2 dan menjadi nama file PDF.
                </p>
              </div>

              <div className="rounded-[var(--radius-control)] bg-[var(--ink-2)] border-[0.5px] border-[var(--line)] p-2.5 space-y-1 text-[11px] text-[var(--ink-11)]">
                <div className="font-medium text-[var(--ink-12)]">Isi Laporan PDF (2 Halaman A4):</div>
                <ul className="space-y-0.5 pl-3.5 list-disc">
                  <li>
                    <span className="font-medium text-[var(--ink-12)]">Hal 1:</span> Status Tumpukan, Spec &amp; Material, Tipe Palet &amp; Aksesori, Operating Conditions, Audit BCT, Audit Stabilitas, serta Diagram 2D Layer 1 &amp; Layer 2 (bernomor dus, panah orientasi, dimensi mm).
                  </li>
                  <li>
                    <span className="font-medium text-[var(--ink-12)]">Hal 2:</span> 4 POV Normal (Iso, Top, Front, Side) + Panel Khusus Heat-Map (Iso &amp; Top) beserta legenda penguncian &amp; sudut gantung.
                  </li>
                </ul>
              </div>

              {exportPdfError && (
                <div className="rounded-[var(--radius-control)] bg-[var(--red-3)] border-[0.5px] border-[var(--red-6)] px-2.5 py-2 text-[11px] text-[var(--red-11)] flex items-start gap-1.5">
                  <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                  <span>{exportPdfError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <TactileButton
                  type="button"
                  variant="secondary"
                  size="default"
                  disabled={exportingPdf}
                  onClick={() => setPdfModalOpen(false)}
                >
                  Batal
                </TactileButton>
                <TactileButton
                  type="button"
                  variant="primary"
                  size="default"
                  disabled={exportingPdf}
                  onClick={() => void handleExportPdfReport()}
                >
                  <FileDown size={14} />
                  <span>{exportingPdf ? 'Menyiapkan PDF...' : 'Unduh PDF (2 Hal)'}</span>
                </TactileButton>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
