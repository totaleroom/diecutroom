import {
  ALL_PAPER_GRADES,
  BOX_STYLES,
  BoxConfig,
  CasePackConfig,
  DielinePaths,
  EngineeringAnalysis,
  FLUTE_SPECS,
  FloorLoadingEvaluation,
  PALLET_PRESETS,
  PalletBoxPlacement,
  PalletConfig,
  PalletInternalGap,
  PalletPatternEvaluation,
  PalletVehicleConfig,
  VehicleLoadingEvaluation,
  VehiclePalletVsFloorComparison,
} from '../types';
import { formatSubstanceString } from './engineering';
import { computeEffectivePalletDims } from './palletizer';

export interface UvPoint {
  u: number;
  v: number;
}

export interface IsoDimAnchors {
  frontLeftBottom: UvPoint; // (-footL/2, 0, +footW/2)
  frontCornerBottom: UvPoint; // (+footL/2, 0, +footW/2)
  backRightBottom: UvPoint; // (+footL/2, 0, -footW/2)
  backRightTop: UvPoint; // (+footL/2, stackH, -footW/2)
}

export interface TopDimAnchors {
  topLeft: UvPoint; // (-footL/2, stackH, -footW/2)
  topRight: UvPoint; // (+footL/2, stackH, -footW/2)
  bottomRight: UvPoint; // (+footL/2, stackH, +footW/2)
}

export interface PalletizerPdfCaptureSet {
  normalIso: string;
  normalTop: string;
  normalFront: string;
  normalSide: string;
  heatmapIso: string;
  heatmapTop: string;
  isoAnchors?: IsoDimAnchors;
  topAnchors?: TopDimAnchors;
}

export interface PalletizerPdfReportInput {
  projectOrClientName?: string;
  config: BoxConfig;
  paths: DielinePaths;
  analysis: EngineeringAnalysis;
  pallet: PalletConfig;
  casePack: CasePackConfig;
  syncedCaseGrossKg: number;
  activeEvaluation: PalletPatternEvaluation;
  captures: PalletizerPdfCaptureSet;
  vehicle?: PalletVehicleConfig;
  vehicleEvaluation?: VehicleLoadingEvaluation | null;
  floorEvaluation?: FloorLoadingEvaluation | null;
  palletVsFloorComparison?: VehiclePalletVsFloorComparison | null;
  generatedBy?: string;
}

interface RgbTuple {
  r: number;
  g: number;
  b: number;
}

// Precision Tactile Studio palette synced to src/index.css
const C_INK_DARK: RgbTuple = { r: 23, g: 25, b: 31 }; // --root-ink-12 #17191F
const C_INK_BODY: RgbTuple = { r: 71, g: 77, b: 88 }; // --root-ink-11 #474D58
const C_INK_MUTED: RgbTuple = { r: 92, g: 98, b: 110 }; // --root-ink-10 #5C626E
const C_LINE: RgbTuple = { r: 205, g: 210, b: 219 }; // --root-ink-6 #CDD2DB
const C_SURFACE: RgbTuple = { r: 244, g: 245, b: 247 }; // --root-ink-2 #F4F5F7
const C_HEADER_TINT: RgbTuple = { r: 236, g: 238, b: 241 }; // --root-ink-3 #ECEEF1

const C_ACCENT: RgbTuple = { r: 79, g: 70, b: 229 }; // --accent-9 #4F46E5
const C_GREEN: RgbTuple = { r: 21, g: 128, b: 61 }; // --green-11 #15803D
const C_GREEN_LIGHT: RgbTuple = { r: 236, g: 253, b: 245 }; // --green-3 #ECFDF5
const C_AMBER: RgbTuple = { r: 180, g: 83, b: 9 }; // --amber-11 #B45309
const C_AMBER_LIGHT: RgbTuple = { r: 255, g: 251, b: 235 }; // --amber-3 #FFFBEB
const C_RED: RgbTuple = { r: 185, g: 28, b: 28 }; // --red-11 #B91C1C
const C_RED_LIGHT: RgbTuple = { r: 254, g: 242, b: 242 }; // --red-3 #FEF2F2
const C_ORANGE: RgbTuple = { r: 234, g: 88, b: 12 }; // #EA580C

// Normal POV Orientation Contrast Palette (0/180 deg vs 90/270 deg)
const C_ORIENT_0: RgbTuple = { r: 250, g: 204, b: 21 }; // #FACC15
const C_ORIENT_0_FILL: RgbTuple = { r: 254, g: 249, b: 195 }; // Soft warm tint for 2D L1/L2
const C_ORIENT_90: RgbTuple = { r: 56, g: 189, b: 248 }; // #38BDF8
const C_ORIENT_90_FILL: RgbTuple = { r: 224, g: 242, b: 254 }; // Soft cyan tint for 2D L1/L2

let cachedTotaleLogoPng: string | null | undefined;

async function loadTotaleRoomLogoPng(): Promise<string | null> {
  if (cachedTotaleLogoPng !== undefined) return cachedTotaleLogoPng;
  try {
    const res = await fetch('/assets/aistudio/Asset_2_5ca58983.svg');
    if (!res.ok) {
      cachedTotaleLogoPng = null;
      return null;
    }
    const svgText = await res.text();
    const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = (e) => reject(e);
        el.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 84; // matches 257.86 : 33.81 SVG aspect ratio
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        cachedTotaleLogoPng = null;
        return null;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      cachedTotaleLogoPng = canvas.toDataURL('image/png');
      return cachedTotaleLogoPng;
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    cachedTotaleLogoPng = null;
    return null;
  }
}

function setFill(doc: any, c: RgbTuple) {
  doc.setFillColor(c.r, c.g, c.b);
}

function setStroke(doc: any, c: RgbTuple) {
  doc.setDrawColor(c.r, c.g, c.b);
}

function setText(doc: any, c: RgbTuple) {
  doc.setTextColor(c.r, c.g, c.b);
}

function safeAsciiPdf(text: string): string {
  return (text || '')
    .replace(/≥/g, '>=')
    .replace(/≤/g, '<=')
    .replace(/→/g, '->')
    .replace(/←/g, '<-')
    .replace(/∞/g, '>90:1')
    .replace(/★/g, '*')
    .replace(/•/g, '-')
    .replace(/[^\x20-\xFF]/g, ' ');
}

function truncateToFit(doc: any, raw: string, maxWidthMm: number): string {
  const clean = safeAsciiPdf(raw).trim();
  if (!clean) return '-';
  if (doc.getTextWidth(clean) <= maxWidthMm) return clean;
  let s = clean;
  while (s.length > 1 && doc.getTextWidth(`${s}...`) > maxWidthMm) {
    s = s.slice(0, -1);
  }
  return `${s}...`;
}

function getBctStatusStyle(status: PalletPatternEvaluation['bctStatus']): {
  label: string;
  fg: RgbTuple;
  bg: RgbTuple;
} {
  if (status === 'safe') {
    return { label: 'STATUS: AMAN', fg: C_GREEN, bg: C_GREEN_LIGHT };
  }
  if (status === 'marginal') {
    return { label: 'STATUS: BATAS KRITIS', fg: C_AMBER, bg: C_AMBER_LIGHT };
  }
  return { label: 'STATUS: OVERLOAD', fg: C_RED, bg: C_RED_LIGHT };
}

/**
 * Deterministic top-edge-first, left-edge-second operator stacking sequence so
 * `#1` is always located at the upper-leftmost carton regardless of rotation mix.
 */
function sortPlacementsForOperator(boxes: PalletBoxPlacement[]): PalletBoxPlacement[] {
  return [...boxes].sort((a, b) => {
    const aTop = a.z - a.sizeZ / 2;
    const bTop = b.z - b.sizeZ / 2;
    if (Math.abs(aTop - bTop) > 28) return aTop - bTop;
    const aLeft = a.x - a.sizeX / 2;
    const bLeft = b.x - b.sizeX / 2;
    if (Math.abs(aLeft - bLeft) > 8) return aLeft - bLeft;
    return a.z - b.z;
  });
}

function computeLayerFootprint(boxes: PalletBoxPlacement[]): {
  footprintL: number;
  footprintW: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
} {
  if (boxes.length === 0) {
    return { footprintL: 0, footprintW: 0, minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const b of boxes) {
    minX = Math.min(minX, b.x - b.sizeX / 2);
    maxX = Math.max(maxX, b.x + b.sizeX / 2);
    minZ = Math.min(minZ, b.z - b.sizeZ / 2);
    maxZ = Math.max(maxZ, b.z + b.sizeZ / 2);
  }
  return {
    footprintL: Math.round(maxX - minX),
    footprintW: Math.round(maxZ - minZ),
    minX,
    maxX,
    minZ,
    maxZ,
  };
}

function drawTactileReportHeader(
  doc: any,
  opts: {
    x: number;
    y: number;
    w: number;
    h: number;
    eyebrow: string;
    title: string;
    subtitle: string;
    statusLabel: string;
    statusBg: RgbTuple;
    rightMeta: string;
    logoPng: string | null;
  }
) {
  const { x, y, w, h, eyebrow, title, subtitle, statusLabel, statusBg, rightMeta, logoPng } = opts;
  setFill(doc, C_INK_DARK);
  doc.roundedRect(x, y, w, h, 1.5, 1.5, 'F');

  // Left Attribution (DieCut.Room) + Project/Title
  const rightColW = 50;
  const maxLeftW = w - rightColW - 8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.1);
  setText(doc, { r: 156, g: 163, b: 175 });
  doc.text(truncateToFit(doc, eyebrow, maxLeftW), x + 3.5, y + 4.2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  setText(doc, { r: 255, g: 255, b: 255 });
  doc.text(truncateToFit(doc, title, maxLeftW), x + 3.5, y + 9.8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.7);
  setText(doc, { r: 205, g: 210, b: 219 });
  doc.text(truncateToFit(doc, subtitle, maxLeftW), x + 3.5, y + h - 3.0);

  // Far Right: Official Totale.Room Logo at top-right + Status Badge below
  const rightEdge = x + w - 3.5;
  if (logoPng) {
    const logoW = 22.8;
    const logoH = 3.0; // exact 257.86:33.81 ratio
    doc.addImage(logoPng, 'PNG', rightEdge - logoW, y + 2.4, logoW, logoH, undefined, 'FAST');
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    setText(doc, { r: 255, g: 255, b: 255 });
    doc.text('Totale.Room', rightEdge, y + 4.8, { align: 'right' });
  }

  const badgeW = 44;
  const badgeH = 5.6;
  const badgeX = rightEdge - badgeW;
  const badgeY = y + 7.2;
  setFill(doc, statusBg);
  doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 0.9, 0.9, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.0);
  setText(doc, { r: 255, g: 255, b: 255 });
  doc.text(statusLabel, badgeX + badgeW / 2, badgeY + 3.9, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.0);
  setText(doc, { r: 205, g: 210, b: 219 });
  doc.text(truncateToFit(doc, rightMeta, 48), rightEdge, y + h - 2.6, { align: 'right' });
}

function drawKvCard(
  doc: any,
  x: number,
  y: number,
  w: number,
  h: number,
  title: string,
  rows: Array<{ label: string; value: string; bold?: boolean; valueColor?: RgbTuple }>
) {
  setFill(doc, { r: 255, g: 255, b: 255 });
  setStroke(doc, C_LINE);
  doc.setLineWidth(0.25);
  doc.roundedRect(x, y, w, h, 1.2, 1.2, 'FD');

  const hdrH = 5.4;
  setFill(doc, C_HEADER_TINT);
  doc.rect(x + 0.15, y + 0.15, w - 0.3, hdrH, 'F');
  setStroke(doc, C_LINE);
  doc.line(x, y + hdrH, x + w, y + hdrH);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.1);
  setText(doc, C_INK_DARK);
  doc.text(safeAsciiPdf(title), x + 2.4, y + 3.8);

  const bodyTop = y + hdrH + 1.3;
  const availH = h - hdrH - 2.0;
  const rowStep = availH / Math.max(1, rows.length);

  rows.forEach((row, idx) => {
    const ry = bodyTop + idx * rowStep;
    const textY = ry + rowStep * 0.66;

    if (idx > 0) {
      setStroke(doc, C_SURFACE);
      doc.setLineWidth(0.16);
      doc.line(x + 2, ry, x + w - 2, ry);
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    setText(doc, C_INK_MUTED);
    doc.text(truncateToFit(doc, row.label, w * 0.41), x + 2.4, textY);

    doc.setFont('helvetica', row.bold ? 'bold' : 'normal');
    doc.setFontSize(6.6);
    setText(doc, row.valueColor || C_INK_DARK);
    const valStr = truncateToFit(doc, row.value, w * 0.55);
    doc.text(valStr, x + w - 2.4, textY, { align: 'right' });
  });
}

function drawArrowVector(
  doc: any,
  cx: number,
  cy: number,
  angleDeg: number,
  lengthMm: number,
  color: RgbTuple
) {
  const rad = (-angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const tx = (lx: number, ly: number) => cx + lx * cos - ly * sin;
  const ty = (lx: number, ly: number) => cy + lx * sin + ly * cos;

  const half = lengthMm / 2;
  const head = Math.min(1.5, lengthMm * 0.36);

  setStroke(doc, color);
  doc.setLineWidth(0.32);
  doc.line(tx(-half, 0), ty(-half, 0), tx(half, 0), ty(half, 0));
  doc.line(tx(half - head, -head * 0.72), ty(half - head, -head * 0.72), tx(half, 0), ty(half, 0));
  doc.line(tx(half - head, head * 0.72), ty(half - head, head * 0.72), tx(half, 0), ty(half, 0));
}

function drawDimensionLineHorizontal(
  doc: any,
  x1: number,
  x2: number,
  yLine: number,
  yTarget: number,
  label: string,
  color: RgbTuple
) {
  setStroke(doc, color);
  doc.setLineWidth(0.18);
  doc.line(x1, yTarget, x1, yLine + (yLine < yTarget ? -0.9 : 0.9));
  doc.line(x2, yTarget, x2, yLine + (yLine < yTarget ? -0.9 : 0.9));
  doc.line(x1, yLine, x2, yLine);
  doc.line(x1, yLine - 0.8, x1, yLine + 0.8);
  doc.line(x2, yLine - 0.8, x2, yLine + 0.8);

  const midX = (x1 + x2) / 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.7);
  const textW = doc.getTextWidth(label) + 1.8;
  setFill(doc, { r: 255, g: 255, b: 255 });
  doc.rect(midX - textW / 2, yLine - 1.5, textW, 2.8, 'F');
  setText(doc, color);
  doc.text(label, midX, yLine + 0.65, { align: 'center' });
}

function drawDimensionLineVertical(
  doc: any,
  y1: number,
  y2: number,
  xLine: number,
  xTarget: number,
  label: string,
  color: RgbTuple
) {
  setStroke(doc, color);
  doc.setLineWidth(0.18);
  doc.line(xTarget, y1, xLine + (xLine < xTarget ? -0.9 : 0.9), y1);
  doc.line(xTarget, y2, xLine + (xLine < xTarget ? -0.9 : 0.9), y2);
  doc.line(xLine, y1, xLine, y2);
  doc.line(xLine - 0.8, y1, xLine + 0.8, y1);
  doc.line(xLine - 0.8, y2, xLine + 0.8, y2);

  const midY = (y1 + y2) / 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.7);
  const textW = doc.getTextWidth(label) + 1.6;
  setFill(doc, { r: 255, g: 255, b: 255 });
  doc.rect(xLine - 1.5, midY - textW / 2, 2.8, textW, 'F');
  setText(doc, color);
  doc.text(label, xLine + 0.7, midY, { align: 'center', angle: 90 });
}

function drawProjectedSegmentDimension(
  doc: any,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  nx: number,
  ny: number,
  offsetMm: number,
  label: string,
  color: RgbTuple
) {
  const ox = nx * offsetMm;
  const oy = ny * offsetMm;
  const lx1 = x1 + ox;
  const ly1 = y1 + oy;
  const lx2 = x2 + ox;
  const ly2 = y2 + oy;

  setStroke(doc, color);
  doc.setLineWidth(0.2);
  doc.line(x1 + nx * 0.8, y1 + ny * 0.8, lx1 + nx * 0.9, ly1 + ny * 0.9);
  doc.line(x2 + nx * 0.8, y2 + ny * 0.8, lx2 + nx * 0.9, ly2 + ny * 0.9);
  doc.line(lx1, ly1, lx2, ly2);

  // Small end ticks perpendicular to line
  const len = Math.hypot(lx2 - lx1, ly2 - ly1) || 1;
  const tx = -(ly2 - ly1) / len;
  const ty = (lx2 - lx1) / len;
  doc.line(lx1 - tx * 0.8, ly1 - ty * 0.8, lx1 + tx * 0.8, ly1 + ty * 0.8);
  doc.line(lx2 - tx * 0.8, ly2 - ty * 0.8, lx2 + tx * 0.8, ly2 + ty * 0.8);

  const mx = (lx1 + lx2) / 2;
  const my = (ly1 + ly2) / 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.7);
  const tw = doc.getTextWidth(label) + 2.2;
  setFill(doc, { r: 255, g: 255, b: 255 });
  setStroke(doc, color);
  doc.setLineWidth(0.15);
  doc.roundedRect(mx - tw / 2, my - 1.6, tw, 3.2, 0.5, 0.5, 'FD');
  setText(doc, color);
  doc.text(label, mx, my + 0.65, { align: 'center' });
}

function drawLayerGuideCard(
  doc: any,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: {
    title: string;
    subtitle: string;
    boxes: PalletBoxPlacement[];
    underlayBoxes?: PalletBoxPlacement[];
    internalGaps?: PalletInternalGap[];
    pallet: PalletConfig;
    isLayer2Empty?: boolean;
    showLockColor?: boolean;
  }
) {
  const { title, subtitle, boxes, underlayBoxes, internalGaps, pallet, isLayer2Empty, showLockColor } = opts;

  setFill(doc, { r: 255, g: 255, b: 255 });
  setStroke(doc, C_LINE);
  doc.setLineWidth(0.25);
  doc.roundedRect(x, y, w, h, 1.2, 1.2, 'FD');

  const hdrH = 6.5;
  setFill(doc, C_HEADER_TINT);
  doc.rect(x + 0.15, y + 0.15, w - 0.3, hdrH, 'F');
  doc.line(x, y + hdrH, x + w, y + hdrH);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.0);
  setText(doc, C_INK_DARK);
  doc.text(safeAsciiPdf(title), x + 2.4, y + 3.2);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.8);
  setText(doc, C_INK_MUTED);
  doc.text(truncateToFit(doc, subtitle, w - 5), x + 2.4, y + 5.7);

  if (isLayer2Empty || boxes.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    setText(doc, C_INK_MUTED);
    doc.text(
      'Hanya 1 layer aktif pada simulasi palet saat ini.',
      x + w / 2,
      y + h / 2 - 2,
      { align: 'center' }
    );
    doc.setFontSize(6.3);
    doc.text(
      'Tambah jumlah layer untuk melihat pola penguncian Layer 2.',
      x + w / 2,
      y + h / 2 + 3,
      { align: 'center' }
    );
    return;
  }

  const ordered = sortPlacementsForOperator(boxes);
  const foot = computeLayerFootprint(ordered);

  const footerH = 7.2;
  const drawX = x + 10.5;
  const drawY = y + hdrH + 7.5;
  const drawW = w - 13.5;
  const drawH = h - hdrH - footerH - 10;

  const { marginMm, effPalletL, effPalletW } = computeEffectivePalletDims(pallet);
  const spanL = Math.max(
    pallet.palletLengthMm,
    foot.footprintL,
    Math.abs(foot.minX) * 2,
    Math.abs(foot.maxX) * 2
  );
  const spanW = Math.max(
    pallet.palletWidthMm,
    foot.footprintW,
    Math.abs(foot.minZ) * 2,
    Math.abs(foot.maxZ) * 2
  );

  const scale = Math.min(drawW / Math.max(200, spanL), drawH / Math.max(200, spanW)) * 0.94;
  const cx = drawX + drawW / 2;
  const cy = drawY + drawH / 2;

  const toPdfX = (mmX: number) => cx + mmX * scale;
  const toPdfY = (mmZ: number) => cy + mmZ * scale;

  // 1. Pallet Deck Footprint
  const pLeft = toPdfX(-pallet.palletLengthMm / 2);
  const pTop = toPdfY(-pallet.palletWidthMm / 2);
  const pWidthMm = pallet.palletLengthMm * scale;
  const pHeightMm = pallet.palletWidthMm * scale;

  setFill(doc, { r: 253, g: 250, b: 243 });
  setStroke(doc, { r: 148, g: 163, b: 184 });
  doc.setLineWidth(0.26);
  doc.setLineDashPattern([1.2, 0.9], 0);
  doc.rect(pLeft, pTop, pWidthMm, pHeightMm, 'FD');
  doc.setLineDashPattern([], 0);

  setStroke(doc, { r: 226, g: 217, b: 200 });
  doc.setLineWidth(0.12);
  for (let i = 1; i < 6; i++) {
    const py = pTop + (pHeightMm * i) / 6;
    doc.line(pLeft + 0.5, py, pLeft + pWidthMm - 0.5, py);
  }

  // 2. Safe Underhang Inset Boundary (Zero-Overhang Policy)
  if (marginMm < -0.5) {
    const safeL = effPalletL * scale;
    const safeW = effPalletW * scale;
    setStroke(doc, C_ACCENT);
    doc.setLineWidth(0.2);
    doc.setLineDashPattern([0.9, 0.7], 0);
    doc.rect(cx - safeL / 2, cy - safeW / 2, safeL, safeW, 'S');
    doc.setLineDashPattern([], 0);
  }

  // 3. Faint Layer 1 underlay seams on Layer 2
  if (underlayBoxes && underlayBoxes.length > 0) {
    setStroke(doc, { r: 148, g: 163, b: 184 });
    doc.setLineWidth(0.16);
    doc.setLineDashPattern([0.8, 0.8], 0);
    for (const ub of underlayBoxes) {
      doc.rect(
        toPdfX(ub.x - ub.sizeX / 2),
        toPdfY(ub.z - ub.sizeZ / 2),
        ub.sizeX * scale,
        ub.sizeZ * scale,
        'S'
      );
    }
    doc.setLineDashPattern([], 0);
  }

  // 4. Numbered Cartons + Orientation Arrows
  const gap = 0.35;
  ordered.forEach((b, idx) => {
    const bx = toPdfX(b.x - b.sizeX / 2) + gap / 2;
    const by = toPdfY(b.z - b.sizeZ / 2) + gap / 2;
    const bw = Math.max(1.5, b.sizeX * scale - gap);
    const bh = Math.max(1.5, b.sizeZ * scale - gap);

    let fillRgb: RgbTuple = b.rotated90 ? C_ORIENT_90_FILL : C_ORIENT_0_FILL;
    let borderRgb: RgbTuple = C_INK_DARK;

    if (showLockColor) {
      if (b.lockStatus === 'locked') {
        fillRgb = C_GREEN_LIGHT;
        borderRgb = C_GREEN;
      } else if (b.lockStatus === 'at-risk') {
        fillRgb = C_RED_LIGHT;
        borderRgb = C_RED;
      } else {
        fillRgb = C_AMBER_LIGHT;
        borderRgb = C_AMBER;
      }
    }

    setFill(doc, fillRgb);
    setStroke(doc, borderRgb);
    doc.setLineWidth(0.28);
    doc.roundedRect(bx, by, bw, bh, 0.35, 0.35, 'FD');

    const bcx = bx + bw / 2;
    const bcy = by + bh / 2;
    const minDim = Math.min(bw, bh);

    const numStr = `#${idx + 1}`;
    const fontSize = Math.max(4.5, Math.min(6.8, minDim * 0.42));
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(fontSize);
    setText(doc, C_INK_DARK);

    if (bh >= 6.5) {
      doc.text(numStr, bcx, bcy - 0.5, { align: 'center' });
      const arrowLen = Math.max(2.2, Math.min(bw * 0.48, bh * 0.48, 5.2));
      drawArrowVector(doc, bcx, bcy + minDim * 0.2, b.angleDeg, arrowLen, borderRgb);
    } else {
      doc.text(numStr, bcx, bcy + fontSize * 0.14, { align: 'center' });
      const arrowLen = Math.max(1.8, Math.min(bw, bh) * 0.36);
      drawArrowVector(doc, bx + bw - arrowLen * 0.8, bcy, b.angleDeg, arrowLen, borderRgb);
    }

    if (b.unsupportedCornerCoords && b.unsupportedCornerCoords.length > 0) {
      setFill(doc, C_ORANGE);
      setStroke(doc, { r: 255, g: 255, b: 255 });
      doc.setLineWidth(0.18);
      for (const [ux, uz] of b.unsupportedCornerCoords) {
        doc.circle(toPdfX(ux), toPdfY(uz), 0.75, 'FD');
      }
    }
  });

  // 4b. Internal Center-Void / Channel Gap Callouts (Flush Perimeter Alignment)
  if (internalGaps && internalGaps.length > 0) {
    for (const g of internalGaps) {
      if (g.gapMm < 8) continue;
      const gx = toPdfX(g.x - g.sizeX / 2);
      const gy = toPdfY(g.z - g.sizeZ / 2);
      const gw = Math.max(0.8, g.sizeX * scale);
      const gh = Math.max(0.8, g.sizeZ * scale);
      const isWide = g.gapMm > 50;
      const gapFill: RgbTuple = isWide ? C_AMBER_LIGHT : { r: 238, g: 242, b: 255 };
      const gapStroke: RgbTuple = isWide ? C_AMBER : C_ACCENT;

      setFill(doc, gapFill);
      setStroke(doc, gapStroke);
      doc.setLineWidth(0.2);
      doc.setLineDashPattern([0.7, 0.6], 0);
      doc.rect(gx, gy, gw, gh, 'FD');
      doc.setLineDashPattern([], 0);

      // Diagonal subtle hatch inside gap rectangle if large enough
      const step = 1.6;
      if (gw >= 1.8 && gh >= 1.8) {
        doc.setLineWidth(0.11);
        for (let d = -gh; d < gw; d += step) {
          const x1 = Math.max(gx, gx + d);
          const y1 = Math.max(gy, gy - d);
          const x2 = Math.min(gx + gw, gx + d + gh);
          const y2 = Math.min(gy + gh, gy + gh - Math.max(0, gx + d + gh - (gx + gw)));
          if (x2 > x1 + 0.1 && y2 > y1 + 0.1) {
            doc.line(x1, y1, x2, y2);
          }
        }
      }

      // Crisp centered dimension callout pill
      const label = `${Math.round(g.gapMm)}mm`;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(4.6);
      const pillW = Math.max(5.8, doc.getTextWidth(label) + 1.8);
      const pillH = 2.6;
      const gcx = gx + gw / 2;
      const gcy = gy + gh / 2;
      setFill(doc, { r: 255, g: 255, b: 255 });
      setStroke(doc, gapStroke);
      doc.setLineWidth(0.18);
      doc.roundedRect(gcx - pillW / 2, gcy - pillH / 2, pillW, pillH, 0.4, 0.4, 'FD');
      setText(doc, gapStroke);
      doc.text(label, gcx, gcy + 0.85, { align: 'center' });
    }
  }

  // 5. Dimension lines in mm
  const fLeft = toPdfX(foot.minX);
  const fRight = toPdfX(foot.maxX);
  const fTop = toPdfY(foot.minZ);
  const fBottom = toPdfY(foot.maxZ);

  drawDimensionLineHorizontal(
    doc,
    pLeft,
    pLeft + pWidthMm,
    Math.min(pTop, fTop) - 4.5,
    pTop,
    `Palet ${pallet.palletLengthMm} mm`,
    C_INK_MUTED
  );

  if (Math.abs(foot.footprintL - pallet.palletLengthMm) >= 2 || foot.footprintL > 0) {
    drawDimensionLineHorizontal(
      doc,
      fLeft,
      fRight,
      Math.min(pTop, fTop) - 1.9,
      fTop,
      `Susunan ${foot.footprintL} mm`,
      C_ACCENT
    );
  }

  drawDimensionLineVertical(
    doc,
    pTop,
    pTop + pHeightMm,
    Math.min(pLeft, fLeft) - 5.2,
    pLeft,
    `Palet ${pallet.palletWidthMm} mm`,
    C_INK_MUTED
  );

  if (Math.abs(foot.footprintW - pallet.palletWidthMm) >= 2 || foot.footprintW > 0) {
    drawDimensionLineVertical(
      doc,
      fTop,
      fBottom,
      Math.min(pLeft, fLeft) - 2.3,
      fLeft,
      `${foot.footprintW} mm`,
      C_ACCENT
    );
  }

  // Footer summary inside card
  const footY = y + h - footerH;
  setFill(doc, C_SURFACE);
  setStroke(doc, C_LINE);
  doc.setLineWidth(0.2);
  doc.line(x, footY, x + w, footY);

  const countRot90 = ordered.filter((b) => b.rotated90).length;
  const count0 = ordered.length - countRot90;
  const maxGapInLayer =
    internalGaps && internalGaps.length > 0
      ? Math.max(...internalGaps.map((g) => g.gapMm))
      : 0;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.8);
  setText(doc, C_INK_BODY);
  doc.text(
    truncateToFit(
      doc,
      `Isi: ${ordered.length} dus (${count0}x 0/180 deg, ${countRot90}x 90/270 deg) · Area ${foot.footprintL}x${foot.footprintW} mm${
        maxGapInLayer >= 8 ? ` · Celah ${Math.round(maxGapInLayer)} mm` : ''
      }`,
      w - 4.8
    ),
    x + 2.4,
    footY + 2.9
  );
  setText(doc, C_INK_MUTED);
  doc.text(
    truncateToFit(
      doc,
      showLockColor
        ? 'Hijau=Terkunci | Amber=Column 1:1 | Merah=Rawan | Titik Oranye=Sudut Gantung'
        : 'Kuning=0/180 deg | Biru=90/270 deg | Panah = arah panjang (L) | #1 = mulai kiri-atas',
      w - 4.8
    ),
    x + 2.4,
    footY + 5.6
  );
}

export async function exportPalletizerReportPdf(input: PalletizerPdfReportInput): Promise<void> {
  const [{ jsPDF }, logoPng] = await Promise.all([
    import('jspdf'),
    loadTotaleRoomLogoPng(),
  ]);

  const {
    projectOrClientName,
    config,
    paths,
    analysis,
    pallet,
    casePack,
    syncedCaseGrossKg,
    activeEvaluation,
    captures,
    generatedBy,
    vehicle,
    vehicleEvaluation,
    floorEvaluation,
    palletVsFloorComparison,
  } = input;

  const hasVehiclePage = Boolean(vehicle?.enabled && vehicleEvaluation);
  const totalPages = hasVehiclePage ? 3 : 2;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const pageW = 210;
  const M = 9;
  const contentW = pageW - M * 2; // 192 mm
  const colGap = 3;
  const colW = (contentW - colGap) / 2; // 94.5 mm

  const styleMeta = BOX_STYLES.find((s) => s.id === config.boxStyle) || BOX_STYLES[0];
  const fluteSpec = FLUTE_SPECS[config.engineering.fluteId] || FLUTE_SPECS.C;
  const presetMeta = PALLET_PRESETS.find((p) => p.id === pallet.standardId);
  const palletPresetLabel = presetMeta
    ? presetMeta.label
    : `Custom (${pallet.palletLengthMm} x ${pallet.palletWidthMm} mm)`;
  const substanceStr = formatSubstanceString(config.engineering, config.boardGrade);
  const topPaper = ALL_PAPER_GRADES[config.engineering.topLayer];
  const colorLabel =
    topPaper?.category === 'white-top' || config.materialColor === 'white'
      ? 'White Top'
      : 'Kraft';
  const statusMeta = getBctStatusStyle(activeEvaluation.bctStatus);

  const projectTrimmed = (projectOrClientName || '').trim();
  const productTrimmed = (config.metadata.productName || '').trim();
  const reportDate = (config.metadata.date || '').trim() || new Date().toISOString().slice(0, 10);
  const picName = (config.metadata.userName || generatedBy || '').trim() || '-';

  const od = paths.info.outerDimensions;
  const id = paths.info.innerDimensions;
  const blank = paths.info.blankDimensions;

  doc.setProperties({
    title: projectTrimmed
      ? `DieCut.Room Palletizer Report - ${projectTrimmed}`
      : `DieCut.Room Palletizer Report - FEFCO ${config.boxStyle} (${Math.round(od.length)}x${Math.round(od.width)}x${Math.round(od.depth)}mm)`,
    subject: 'DieCut.Room by Totale.Room — Palletizer Engineering & BCT Stability Audit Report',
    creator: 'DieCut.Room by Totale.Room',
    author: picName,
  });

  // ============================================================================
  // PAGE 1: ENGINEERING AUDIT, SPEC, CONDITIONS & LAYER 1 / LAYER 2 GUIDE
  // ============================================================================

  // 1. Tactile Header Banner (y = 8..29)
  drawTactileReportHeader(doc, {
    x: M,
    y: 8,
    w: contentW,
    h: 21,
    eyebrow: 'DIBUAT OLEH APLIKASI DIECUT.ROOM  |  PALLETIZER ENGINEERING & BCT AUDIT REPORT',
    title: projectTrimmed
      ? `Proyek / Klien: ${projectTrimmed}`
      : `Simulasi Palletizer - FEFCO ${config.boxStyle} (${styleMeta.abbrev})`,
    subtitle: `SKU: ${productTrimmed || '-'}  |  PIC: ${picName}  |  Tanggal: ${reportDate}`,
    statusLabel: statusMeta.label,
    statusBg: statusMeta.fg,
    rightMeta: `Skor ${activeEvaluation.stability.smartScore}/100 · ${safeAsciiPdf(activeEvaluation.stability.forkliftSafetyLabel)}`,
    logoPng,
  });

  // 2. KPI Strip — Status Tumpukan (y = 31.5..46.5)
  const { marginMm: pdfMarginMm } = computeEffectivePalletDims(pallet);
  const kpiY = 31.5;
  const kpiH = 15;
  const kpis = [
    {
      k: 'POLA & MARGIN TEPI',
      v: activeEvaluation.label,
      s:
        activeEvaluation.edgeStatus === 'overhang'
          ? `Overhang +${activeEvaluation.overhangL}/+${activeEvaluation.overhangW} mm`
          : activeEvaluation.edgeStatus === 'flush-risk'
          ? `Inset L:${activeEvaluation.underhangL}/W:${activeEvaluation.underhangW} mm (Mepet)`
          : activeEvaluation.edgeStatus === 'excessive-underhang'
          ? `Inset L:${activeEvaluation.underhangL}/W:${activeEvaluation.underhangW} mm (Lebar)`
          : `Inset L:${activeEvaluation.underhangL}/W:${activeEvaluation.underhangW} mm (Aman)`,
    },
    {
      k: 'STATUS TUMPUKAN',
      v: `${activeEvaluation.layerCount} Layer (${activeEvaluation.casesPerLayer}/lyr)`,
      s: `Total ${activeEvaluation.totalCases} Master Dus`,
    },
    {
      k: 'KAPASITAS PRODUK',
      v: `${activeEvaluation.totalUnits.toLocaleString('id-ID')} pcs`,
      s: `Isi ${casePack.unitsPerCase || 1} pcs/dus (${casePack.shape})`,
    },
    {
      k: 'TINGGI & BERAT PALET',
      v: `${activeEvaluation.totalStackHeightMm} mm · ${activeEvaluation.grossLoadKg} kg`,
      s: `Net Muatan ${activeEvaluation.netLoadKg} kg (+Palet)`,
    },
    {
      k: 'EFISIENSI PALET',
      v: `Area ${activeEvaluation.areaEfficiencyPct}%`,
      s: `Kubik ${activeEvaluation.cubeEfficiencyPct}% · ${Math.round(activeEvaluation.footprintL)}x${Math.round(activeEvaluation.footprintW)} mm`,
    },
  ];

  const kpiW = contentW / kpis.length;
  kpis.forEach((item, idx) => {
    const kx = M + idx * kpiW;
    setFill(doc, C_SURFACE);
    setStroke(doc, C_LINE);
    doc.setLineWidth(0.22);
    doc.rect(kx, kpiY, kpiW, kpiH, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.5);
    setText(doc, C_INK_MUTED);
    doc.text(item.k, kx + 2, kpiY + 3.7);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.4);
    setText(doc, C_INK_DARK);
    doc.text(truncateToFit(doc, item.v, kpiW - 4), kx + 2, kpiY + 8.6);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.6);
    setText(doc, C_INK_BODY);
    doc.text(truncateToFit(doc, item.s, kpiW - 4), kx + 2, kpiY + 12.6);
  });

  // 3. Row 1 Cards: Material & Spec + Type Pallet & Aksesori (y = 49..94.5)
  const row1Y = 49;
  const row1H = 45.5;

  drawKvCard(doc, M, row1Y, colW, row1H, 'MATERIAL & SPESIFIKASI MASTER DUS', [
    {
      label: 'Style & Struktur',
      value: `${styleMeta.code} (${styleMeta.abbrev})`,
      bold: true,
    },
    {
      label: 'Board Grade & Flute',
      value: `${config.boardGrade === 'double-wall' ? 'Double Wall (5-Ply)' : 'Single Wall (3-Ply)'} · Flute ${config.engineering.fluteId} (${fluteSpec.thickness} mm)`,
    },
    {
      label: 'Substance & Gramatur',
      value: `${substanceStr} · ${Math.round(analysis.boardGsm)} gsm (${colorLabel})`,
    },
    {
      label: 'Inner Dimensions (ID)',
      value: `${Math.round(id.length)} x ${Math.round(id.width)} x ${Math.round(id.depth)} mm`,
      bold: true,
    },
    {
      label: 'Outer Dimensions (OD)',
      value: `${Math.round(od.length)} x ${Math.round(od.width)} x ${Math.round(od.depth)} mm`,
      bold: true,
    },
    {
      label: 'Blank & Luas Area',
      value: `${Math.round(blank.width)} x ${Math.round(blank.height)} mm (${paths.info.totalAreaSqM.toFixed(3)} m2)`,
    },
    {
      label: 'Berat & Case Pack',
      value: `${syncedCaseGrossKg} kg/dus · ${casePack.unitLengthMm}x${casePack.unitWidthMm}x${casePack.unitDepthMm}mm (${casePack.unitWeightGrams}g)`,
    },
  ]);

  drawKvCard(doc, M + colW + colGap, row1Y, colW, row1H, 'TIPE PALET & AKSESORI STABILITAS', [
    {
      label: 'Standar / Tipe Palet',
      value: palletPresetLabel,
      bold: true,
    },
    {
      label: 'Dimensi Dek & Tinggi',
      value: `${pallet.palletLengthMm} x ${pallet.palletWidthMm} x ${pallet.palletHeightMm} mm`,
    },
    {
      label: 'Batas Fisik Maksimal',
      value: `Tinggi ${pallet.maxStackHeightMm} mm · Beban ${pallet.maxPalletWeightKg} kg`,
    },
    {
      label: 'Margin Tepi / Underhang',
      value: `${pdfMarginMm} mm/sisi (Zona ${activeEvaluation.effectivePalletL}x${activeEvaluation.effectivePalletW} · Inset L:${activeEvaluation.underhangL}/W:${activeEvaluation.underhangW})`,
      valueColor:
        activeEvaluation.edgeStatus === 'optimal'
          ? C_GREEN
          : activeEvaluation.edgeStatus === 'overhang'
          ? C_RED
          : C_AMBER,
    },
    {
      label: 'Perataan Sisi Luar',
      value: (() => {
        const modeLabel =
          activeEvaluation.perimeterAlignMode === 'flush'
            ? 'Rata Sisi'
            : activeEvaluation.perimeterAlignMode === 'compact'
            ? 'Rapat'
            : activeEvaluation.perimeterAligned
            ? 'Auto (Rata Sisi)'
            : 'Auto (Rapat)';
        return `${modeLabel} · Celah Tengah ${activeEvaluation.maxInternalGapMm} mm`;
      })(),
      valueColor:
        activeEvaluation.maxInternalGapMm > 50
          ? C_AMBER
          : activeEvaluation.perimeterAligned
          ? C_GREEN
          : C_INK_BODY,
    },
    {
      label: 'Plakban & Tier Sheet',
      value: `Plakban: ${pallet.useTopLayerPlakban ? 'Aktif' : 'Tidak'} · Tier: ${
        pallet.useTierSheets ? `Aktif (${pallet.tierSheetThicknessMm}mm)` : 'Tidak'
      }`,
      valueColor: pallet.useTopLayerPlakban || pallet.useTierSheets ? C_GREEN : C_INK_BODY,
    },
    {
      label: 'Slip Sheet & Corner Posts',
      value: `Slip: ${pallet.useSlipSheet ? 'Ya' : 'Tidak'} · Corner Post: ${pallet.useCornerPosts ? 'Ya' : 'Tidak'}`,
    },
  ]);

  // 4. Row 2 Cards: Operating Conditions + Audit BCT (y = 97..143.5)
  const row2Y = 97;
  const row2H = 46.5;

  // Keep factor (x0.xx) always visible and never truncated by long color code notes
  const printFactorText = `x${analysis.factors.printing.toFixed(2)}`;
  const rawPrintSummary =
    config.metadata.printColorsCount > 0
      ? `${config.engineering.printCoverage}% (${config.metadata.printColorsCount} warna) · ${printFactorText}`
      : `${config.engineering.printCoverage}% (Polos) · ${printFactorText}`;

  drawKvCard(doc, M, row2Y, colW, row2H, 'OPERATING CONDITIONS (KONDISI OPERASI)', [
    {
      label: 'Metode Kalkulasi BCT',
      value:
        config.engineering.calculationMethod === 'bct-pro'
          ? 'BCT Pro (Formula Pabrik)'
          : 'TAPPI (McKee Standard)',
      bold: true,
    },
    {
      label: 'Target Safety Factor',
      value: `${config.engineering.safetyFactor}:1`,
      bold: true,
    },
    {
      label: 'Kelembaban Relatif (RH)',
      value: `${config.engineering.relativeHumidity}% RH · Faktor x${analysis.factors.humidity.toFixed(2)}`,
    },
    {
      label: 'Arah Flute Grain',
      value: `${
        config.prepress.fluteDirection === 'vertical' ? 'Vertical (Optimal BCT)' : 'Horizontal (Derate)'
      } · x${analysis.factors.fluteGrain.toFixed(2)}`,
    },
    {
      label: 'Print Coverage & Tinta',
      value: rawPrintSummary,
    },
    {
      label: 'Risiko Handling Gudang',
      value: `${
        config.engineering.handlingRisk ? 'Risiko Tinggi / Manual' : 'Standar Mekanis'
      } · x${analysis.factors.handling.toFixed(2)}`,
    },
    {
      label: 'Faktor Koreksi Gabungan',
      value: `Total x${analysis.factors.combined.toFixed(2)} (Stabilitas x${analysis.factors.stability.toFixed(2)})`,
    },
  ]);

  const sfActualText =
    activeEvaluation.actualSafetyFactor >= 90
      ? '>=90:1 (Beban Nol)'
      : `${activeEvaluation.actualSafetyFactor.toFixed(1)}:1`;

  drawKvCard(doc, M + colW + colGap, row2Y, colW, row2H, 'AUDIT BCT VS BEBAN TUMPUKAN AKTUAL', [
    {
      label: 'ECT Board & Sumber',
      value: `${analysis.ectKgfCm.toFixed(2)} kgf/cm (${analysis.ectLbfIn.toFixed(1)} lbf/in · ${analysis.ectSource.replace('_ECT', '')})`,
    },
    {
      label: 'BCT Teoretis -> Efektif Dus',
      value: `${analysis.bctEstimateKgf.toFixed(1)} kgf -> ${analysis.correctedBctKgf.toFixed(1)} kgf`,
    },
    {
      label: 'Koreksi Pola & Tepi',
      value: `x${(activeEvaluation.patternAlignmentFactor * activeEvaluation.overhangPenaltyFactor).toFixed(2)} (Pola x${activeEvaluation.patternAlignmentFactor.toFixed(2)} · Tepi x${activeEvaluation.overhangPenaltyFactor.toFixed(2)})`,
    },
    {
      label: 'BCT Palet Efektif',
      value: `${activeEvaluation.effectivePalletBctKgf.toFixed(1)} kgf`,
      bold: true,
    },
    {
      label: `Beban Lyr Bawah (${Math.max(0, activeEvaluation.layerCount - 1)} lyr di atas)`,
      value: `${activeEvaluation.bottomLayerLoadKgf.toFixed(1)} kgf`,
      bold: true,
    },
    {
      label: 'Safety Factor Aktual vs Target',
      value: `${sfActualText} vs ${config.engineering.safetyFactor}:1`,
      bold: true,
      valueColor: statusMeta.fg,
    },
    {
      label: 'Batas Aman Layer Maks',
      value: `BCT ${activeEvaluation.maxSafeLayersByBct} lyr · Tinggi ${activeEvaluation.layerBreakdown.maxByHeight} · Berat ${activeEvaluation.layerBreakdown.maxByWeight}`,
    },
  ]);

  // 5. Full-Width Card: Audit Stabilitas & Rekomendasi (y = 146..183)
  const stabY = 146;
  const stabH = 37;
  const stab = activeEvaluation.stability;

  setFill(doc, { r: 255, g: 255, b: 255 });
  setStroke(doc, C_LINE);
  doc.setLineWidth(0.25);
  doc.roundedRect(M, stabY, contentW, stabH, 1.2, 1.2, 'FD');

  setFill(doc, C_HEADER_TINT);
  doc.rect(M + 0.15, stabY + 0.15, contentW - 0.3, 5.4, 'F');
  doc.line(M, stabY + 5.4, M + contentW, stabY + 5.4);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.1);
  setText(doc, C_INK_DARK);
  doc.text('AUDIT STABILITAS INTERLOCK, FORKLIFT & REKOMENDASI OPERASIONAL', M + 2.4, stabY + 3.8);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  setText(doc, stab.stabilityScore >= 75 ? C_GREEN : stab.stabilityScore >= 55 ? C_AMBER : C_RED);
  doc.text(
    `Skor Stabilitas: ${stab.stabilityScore}/100  |  Status Forklift: ${safeAsciiPdf(stab.forkliftSafetyLabel)}`,
    M + contentW - 2.4,
    stabY + 3.8,
    { align: 'right' }
  );

  const stabMetrics = [
    { l: 'Seam Lock / Top Layer Lock', v: `${stab.seamLockPct}% / Top ${stab.topLayerLockPct}%` },
    {
      l: 'Sudut Menumpu vs Gantung',
      v: `${stab.supportedCornerPct}% menumpu · ${stab.unsupportedCornerCount} sudut gantung (x${stab.cornerCrushDerateFactor.toFixed(2)})`,
    },
    {
      l: 'Garis Belah (Cleavage Fault)',
      v:
        stab.faultLineCount === 0
          ? '0 garis belah (aman menyilang)'
          : `${stab.faultLineCount} garis belah vertikal`,
    },
    {
      l: 'Rem Tanpa Plakban / Lateral G',
      v: `±${stab.noPlakbanSafeG}g (0.35g: ${stab.noPlakbanPass035g ? 'LULUS' : 'TIDAK'}) · Lateral ±${stab.lateralGCapacity}g`,
    },
    {
      l: 'Burst Strength Board (Mullen)',
      v: `${stab.burstStrengthKpa} kPa (${stab.burstStatus.toUpperCase()} · Margin ${stab.burstMarginRatio}x)`,
    },
    {
      l: 'CoG Eccentricity & Slenderness',
      v: `±${stab.cogOffsetMm} mm (X:${stab.cogOffsetXMm} / Z:${stab.cogOffsetZMm}) · Rasio ${stab.slendernessRatio}`,
    },
  ];

  const smW = (contentW - 4.8) / 3;
  stabMetrics.forEach((m, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const mx = M + 2.4 + col * smW;
    const my = stabY + 7.2 + row * 7.8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.8);
    setText(doc, C_INK_MUTED);
    doc.text(m.l, mx, my + 2.4);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    setText(doc, C_INK_DARK);
    doc.text(truncateToFit(doc, m.v, smW - 3), mx, my + 5.7);
  });

  const recTopY = stabY + 23.8;
  setStroke(doc, C_LINE);
  doc.setLineWidth(0.2);
  doc.line(M + 2.4, recTopY, M + contentW - 2.4, recTopY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.1);
  setText(doc, C_INK_DARK);
  doc.text('Catatan & Rekomendasi:', M + 2.4, recTopY + 3.6);

  const recs =
    stab.recommendations.length > 0
      ? stab.recommendations.slice(0, 2)
      : ['Konfigurasi tumpukan dan penguncian antar layer berada pada kondisi stabilitas baik.'];
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.0);
  setText(doc, C_INK_BODY);
  recs.forEach((rec, idx) => {
    doc.text(
      truncateToFit(doc, `- ${rec}`, contentW - 6),
      M + 2.4,
      recTopY + 7.1 + idx * 3.6
    );
  });

  // 6. Bottom Band: Panduan Susunan Layer 1 & Layer 2 Vector Schematics (y = 185.5..283.5)
  const layerGuideY = 185.5;
  const layerGuideH = 98;
  const layer1Boxes = activeEvaluation.placements.filter((b) => b.layer === 1);
  const layer2Boxes = activeEvaluation.placements.filter((b) => b.layer === 2);

  const l1PatternName =
    activeEvaluation.layerPatterns?.[0]?.toUpperCase() || activeEvaluation.patternType.toUpperCase();
  const l2PatternName = activeEvaluation.layerPatterns?.[1]?.toUpperCase() || l1PatternName;

  drawLayerGuideCard(doc, M, layerGuideY, colW, layerGuideH, {
    title: 'PANDUAN LAYER 1 (LAPISAN GANJIL / DASAR: 1, 3, 5...)',
    subtitle: `Pola ${l1PatternName} · ${layer1Boxes.length} dus/layer · Mulai dari sudut kiri-atas (#1 -> #${layer1Boxes.length})`,
    boxes: layer1Boxes,
    internalGaps: activeEvaluation.oddInternalGaps,
    pallet,
    showLockColor: false,
  });

  drawLayerGuideCard(doc, M + colW + colGap, layerGuideY, colW, layerGuideH, {
    title: 'PANDUAN LAYER 2 (LAPISAN GENAP / PENGUNCI: 2, 4, 6...)',
    subtitle:
      layer2Boxes.length > 0
        ? `Pola ${l2PatternName} · ${layer2Boxes.length} dus/layer · Garis putus = jahitan Layer 1 di bawah`
        : 'Simulasi saat ini hanya memiliki 1 layer',
    boxes: layer2Boxes,
    underlayBoxes: layer1Boxes,
    internalGaps: activeEvaluation.evenInternalGaps,
    pallet,
    isLayer2Empty: layer2Boxes.length === 0,
    showLockColor: true,
  });

  // Page 1 Footer
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.1);
  setText(doc, C_INK_MUTED);
  doc.text('Dibuat oleh aplikasi DieCut.Room · Totale.Room Engineering Suite', M, 290);
  doc.text(`Halaman 1 / ${totalPages}`, pageW - M, 290, { align: 'right' });

  // ============================================================================
  // PAGE 2: 4 POV ORTHOGRAPHIC NORMAL RENDERS + PANEL KHUSUS HEAT-MAP ISO & TOP
  // ============================================================================
  doc.addPage('a4', 'portrait');

  // Page 2 Header (y = 8..25)
  drawTactileReportHeader(doc, {
    x: M,
    y: 8,
    w: contentW,
    h: 17,
    eyebrow: 'DIBUAT OLEH APLIKASI DIECUT.ROOM  |  DOKUMENTASI 3D ORTHOGRAPHIC & HEAT-MAP',
    title: '4 Sudut Pandang (Iso, Top, Front, Side) & Audit Heat-Map',
    subtitle: `${projectTrimmed ? `Proyek: ${projectTrimmed}  |  ` : ''}Pola: ${activeEvaluation.label}  |  ${activeEvaluation.totalCases} dus (${activeEvaluation.layerCount} layer)  |  OD ${Math.round(od.length)}x${Math.round(od.width)}x${Math.round(od.depth)} mm`,
    statusLabel: statusMeta.label,
    statusBg: statusMeta.fg,
    rightMeta: `Unit Load ${Math.round(activeEvaluation.footprintL)}x${Math.round(activeEvaluation.footprintW)}x${Math.round(activeEvaluation.totalStackHeightMm)} mm`,
    logoPng,
  });

  // 2x2 Normal Orthographic 3D POV Grid (y = 27.5..170.5)
  const povCards: Array<{
    key: 'iso' | 'top' | 'front' | 'side';
    title: string;
    caption: string;
    img: string;
    footer: string;
  }> = [
    {
      key: 'iso',
      title: 'POV 1 — ISOMETRIK (ORTHOGRAPHIC)',
      caption: 'Sudut curam 3/4 memperlihatkan layer puncak (terakhir) & dimensi Unit Load',
      img: captures.normalIso,
      footer: `Unit Load: ${Math.round(activeEvaluation.footprintL)} x ${Math.round(activeEvaluation.footprintW)} x ${Math.round(activeEvaluation.totalStackHeightMm)} mm`,
    },
    {
      key: 'top',
      title: 'POV 2 — TOP VIEW (ORTHOGRAPHIC)',
      caption: 'Tampak atas datar penuh (100% bebas distorsi) · Sesuai arah susun Layer 1/2',
      img: captures.normalTop,
      footer: `Palet ${pallet.palletLengthMm}x${pallet.palletWidthMm} mm · Footprint ${Math.round(activeEvaluation.footprintL)}x${Math.round(activeEvaluation.footprintW)} mm (${activeEvaluation.areaEfficiencyPct}%)`,
    },
    {
      key: 'front',
      title: 'POV 3 — FRONT VIEW (ORTHOGRAPHIC)',
      caption: `Tampak Depan Sejajar (Sisi Panjang ${pallet.palletLengthMm} mm)`,
      img: captures.normalFront,
      footer: `${activeEvaluation.layerCount} Layer · Beban Layer Bawah ${activeEvaluation.bottomLayerLoadKgf.toFixed(1)} kgf`,
    },
    {
      key: 'side',
      title: 'POV 4 — SIDE VIEW (ORTHOGRAPHIC)',
      caption: `Tampak Samping Sejajar (Sisi Lebar ${pallet.palletWidthMm} mm)`,
      img: captures.normalSide,
      footer: `Berat Kotor ${activeEvaluation.grossLoadKg} kg · Safety Factor Aktual ${sfActualText}`,
    },
  ];

  const povCardW = colW; // 94.5 mm
  const povCardH = 69.5;
  const povImgW = 90.5;
  const povImgH = 58.6; // ~3:2 matching 960x640 cleanly with slight breathing space

  povCards.forEach((card, idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const cx = M + col * (povCardW + colGap);
    const cy = 27.5 + row * (povCardH + 2.8);

    setFill(doc, { r: 255, g: 255, b: 255 });
    setStroke(doc, C_LINE);
    doc.setLineWidth(0.25);
    doc.roundedRect(cx, cy, povCardW, povCardH, 1.2, 1.2, 'FD');

    setFill(doc, C_HEADER_TINT);
    doc.rect(cx + 0.15, cy + 0.15, povCardW - 0.3, 6.0, 'F');
    doc.line(cx, cy + 6.0, cx + povCardW, cy + 6.0);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    setText(doc, C_INK_DARK);
    doc.text(card.title, cx + 2.2, cy + 3.1);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.4);
    setText(doc, C_INK_MUTED);
    doc.text(truncateToFit(doc, card.caption, povCardW - 4.4), cx + 2.2, cy + 5.3);

    const imgX = cx + (povCardW - povImgW) / 2;
    const imgY = cy + 6.4;
    if (card.img) {
      doc.addImage(card.img, 'PNG', imgX, imgY, povImgW, povImgH, undefined, 'FAST');
    }

    // Vector L x W x H (mm) annotations overlaid cleanly on Orthographic Iso & Top POVs
    if (card.key === 'iso' && captures.isoAnchors) {
      const a = captures.isoAnchors;
      const toX = (u: number) => imgX + u * povImgW;
      const toY = (v: number) => imgY + v * povImgH;

      const xFL = toX(a.frontLeftBottom.u);
      const yFL = toY(a.frontLeftBottom.v);
      const xFC = toX(a.frontCornerBottom.u);
      const yFC = toY(a.frontCornerBottom.v);
      const xBR = toX(a.backRightBottom.u);
      const yBR = toY(a.backRightBottom.v);
      const xBRT = toX(a.backRightTop.u);
      const yBRT = toY(a.backRightTop.v);

      // L (front-left base edge)
      drawProjectedSegmentDimension(
        doc,
        xFL,
        yFL,
        xFC,
        yFC,
        -0.55,
        0.84,
        4.6,
        `L ${Math.round(activeEvaluation.footprintL)} mm`,
        C_INK_DARK
      );
      // W (front-right base edge)
      drawProjectedSegmentDimension(
        doc,
        xFC,
        yFC,
        xBR,
        yBR,
        0.55,
        0.84,
        4.6,
        `W ${Math.round(activeEvaluation.footprintW)} mm`,
        C_INK_DARK
      );
      // H (right vertical edge)
      drawProjectedSegmentDimension(
        doc,
        xBR,
        yBR,
        xBRT,
        yBRT,
        1,
        0,
        4.5,
        `T ${Math.round(activeEvaluation.totalStackHeightMm)} mm`,
        C_ACCENT
      );
    }

    if (card.key === 'top' && captures.topAnchors) {
      const t = captures.topAnchors;
      const toX = (u: number) => imgX + u * povImgW;
      const toY = (v: number) => imgY + v * povImgH;

      const xTL = toX(t.topLeft.u);
      const yTL = toY(t.topLeft.v);
      const xTR = toX(t.topRight.u);
      const yTR = toY(t.topRight.v);
      const xBR = toX(t.bottomRight.u);
      const yBR = toY(t.bottomRight.v);

      drawDimensionLineHorizontal(
        doc,
        xTL,
        xTR,
        Math.max(imgY + 2.6, yTL - 2.6),
        yTL,
        `L ${Math.round(activeEvaluation.footprintL)} mm`,
        C_ACCENT
      );
      drawDimensionLineVertical(
        doc,
        yTR,
        yBR,
        Math.min(imgX + povImgW - 2.6, xTR + 3.0),
        xTR,
        `W ${Math.round(activeEvaluation.footprintW)} mm`,
        C_ACCENT
      );
    }

    setFill(doc, C_SURFACE);
    doc.rect(cx + 0.15, cy + povCardH - 4.2, povCardW - 0.3, 4.0, 'F');
    doc.line(cx, cy + povCardH - 4.2, cx + povCardW, cy + povCardH - 4.2);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.7);
    setText(doc, C_INK_BODY);
    doc.text(truncateToFit(doc, card.footer, povCardW - 4.4), cx + 2.2, cy + povCardH - 1.3);
  });

  // Orientation Color Key Ribbon right below 4-POV Grid (y = 171..176.5)
  const keyRibY = 171;
  setFill(doc, C_SURFACE);
  setStroke(doc, C_LINE);
  doc.setLineWidth(0.22);
  doc.roundedRect(M, keyRibY, contentW, 5.5, 0.9, 0.9, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.8);
  setText(doc, C_INK_DARK);
  doc.text('KODE WARNA ORIENTASI POV NORMAL:', M + 2.5, keyRibY + 3.7);

  setFill(doc, C_ORIENT_0);
  setStroke(doc, C_INK_DARK);
  doc.setLineWidth(0.2);
  doc.rect(M + 47, keyRibY + 1.5, 2.8, 2.5, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.8);
  setText(doc, C_INK_BODY);
  doc.text('0 / 180 deg (Horizontal)', M + 51, keyRibY + 3.7);

  setFill(doc, C_ORIENT_90);
  doc.rect(M + 82, keyRibY + 1.5, 2.8, 2.5, 'FD');
  doc.text('90 / 270 deg (Vertikal)', M + 86, keyRibY + 3.7);

  setText(doc, C_INK_MUTED);
  doc.text('Panah (>) di tutup atas = Arah panjang L dus · Proyeksi Orthographic 100% tanpa distorsi', M + 118, keyRibY + 3.7);

  // Dedicated Heat-Map Panel (y = 178.5..284.5)
  const hmY = 178.5;
  const hmH = 106;
  setFill(doc, { r: 255, g: 255, b: 255 });
  setStroke(doc, C_INK_DARK);
  doc.setLineWidth(0.32);
  doc.roundedRect(M, hmY, contentW, hmH, 1.4, 1.4, 'FD');

  setFill(doc, C_INK_DARK);
  doc.rect(M + 0.15, hmY + 0.15, contentW - 0.3, 6.4, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.3);
  setText(doc, { r: 255, g: 255, b: 255 });
  doc.text('PANEL KHUSUS HEAT-MAP PENGUNCIAN ANTAR LAYER & TITIK RISIKO STABILITAS', M + 2.8, hmY + 4.4);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.3);
  setText(doc, C_LINE);
  doc.text(
    `Seam Lock ${stab.seamLockPct}% · Sudut Menumpu ${stab.supportedCornerPct}% · Garis Belah ${stab.faultLineCount}`,
    M + contentW - 2.8,
    hmY + 4.4,
    { align: 'right' }
  );

  // Side-by-side Heat-Map Iso & Top Orthographic images
  const hmBoxW = 91.5;
  const hmImgW = 89.5;
  const hmImgH = 59.66;
  const hmViews = [
    { x: M + 3, title: 'HEAT-MAP ISOMETRIK (ORTHOGRAPHIC)', img: captures.heatmapIso },
    { x: M + 97.5, title: 'HEAT-MAP TOP VIEW (ORTHOGRAPHIC PENUH)', img: captures.heatmapTop },
  ];

  hmViews.forEach((hv) => {
    setFill(doc, C_SURFACE);
    setStroke(doc, C_LINE);
    doc.setLineWidth(0.2);
    doc.roundedRect(hv.x, hmY + 8.2, hmBoxW, 66.5, 1.0, 1.0, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    setText(doc, C_INK_DARK);
    doc.text(hv.title, hv.x + 2.2, hmY + 12.2);

    if (hv.img) {
      doc.addImage(hv.img, 'PNG', hv.x + 1, hmY + 13.7, hmImgW, hmImgH, undefined, 'FAST');
    }
  });

  // Heat-Map Legend + Diagnostic Strip
  const legY = hmY + 76.6;
  setFill(doc, C_SURFACE);
  setStroke(doc, C_LINE);
  doc.setLineWidth(0.2);
  doc.roundedRect(M + 3, legY, contentW - 6, 26.6, 1.0, 1.0, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.3);
  setText(doc, C_INK_DARK);
  doc.text('LEGENDA HEAT-MAP & DIAGNOSTIK STABILITAS:', M + 5.5, legY + 4.2);

  const legendItems: Array<{ color: RgbTuple; shape: 'rect' | 'circle' | 'line'; label: string; desc: string }> = [
    {
      color: { r: 34, g: 197, b: 94 },
      shape: 'rect',
      label: 'Terkunci (Cross-Tie)',
      desc: 'Menumpu >=2 dus di bawahnya',
    },
    {
      color: { r: 245, g: 158, b: 11 },
      shape: 'rect',
      label: 'Column 1:1',
      desc: 'Sejajar vertikal (perlu strap/tier)',
    },
    {
      color: { r: 239, g: 68, b: 68 },
      shape: 'rect',
      label: 'Rawan / Edge Bebas',
      desc: 'Tepi luar tidak terkunci / rentan geser',
    },
    {
      color: C_ORANGE,
      shape: 'circle',
      label: `Sudut Gantung (${stab.unsupportedCornerCount})`,
      desc: `Derate BCT x${stab.cornerCrushDerateFactor.toFixed(2)}`,
    },
    {
      color: C_RED,
      shape: 'line',
      label: `Garis Belah (${stab.faultLineCount})`,
      desc: stab.faultLineCount > 0 ? 'Jalur belah blok menerus' : 'Bebas garis belah menerus',
    },
  ];

  const legColW = (contentW - 11) / 5;
  legendItems.forEach((li, i) => {
    const lx = M + 5.5 + i * legColW;
    const ly = legY + 8.5;
    if (li.shape === 'rect') {
      setFill(doc, li.color);
      doc.roundedRect(lx, ly - 2.3, 3.0, 3.0, 0.5, 0.5, 'F');
    } else if (li.shape === 'circle') {
      setFill(doc, li.color);
      doc.circle(lx + 1.5, ly - 0.8, 1.5, 'F');
    } else {
      setStroke(doc, li.color);
      doc.setLineWidth(0.75);
      doc.line(lx, ly - 0.8, lx + 3.2, ly - 0.8);
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.9);
    setText(doc, C_INK_DARK);
    doc.text(truncateToFit(doc, li.label, legColW - 5), lx + 4.2, ly);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.4);
    setText(doc, C_INK_MUTED);
    doc.text(truncateToFit(doc, li.desc, legColW - 1.5), lx, ly + 3.8);
  });

  const faultText =
    stab.faultLines.length > 0
      ? `Deteksi Garis Belah: ${stab.faultLines.map((f) => f.label).join(' | ')}`
      : 'Deteksi Garis Belah: Tidak ditemukan jalur belah menerus antar layer (interlock bersih).';
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.0);
  setText(doc, C_INK_BODY);
  doc.text(truncateToFit(doc, faultText, contentW - 12), M + 5.5, legY + 18.4);
  doc.text(
    truncateToFit(
      doc,
      `Uji Pengereman Forklift: Batas aman tanpa plakban ±${stab.noPlakbanSafeG}g (${
        stab.noPlakbanPass035g ? 'LULUS' : 'BUTUH PLAKBAN/WRAP'
      } uji standar 0.35g) · Kapasitas lateral total ±${stab.lateralGCapacity}g.`,
      contentW - 12
    ),
    M + 5.5,
    legY + 22.6
  );

  // Page 2 Footer
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.1);
  setText(doc, C_INK_MUTED);
  doc.text('Dibuat oleh aplikasi DieCut.Room · Totale.Room Engineering Suite', M, 290);
  doc.text(`Halaman 2 / ${totalPages}`, pageW - M, 290, { align: 'right' });

  // ============================================================================
  // PAGE 3 (OPTIONAL): RENCANA MUAT ARMADA / KONTAINER (PALET / FLOOR LOADING)
  // ============================================================================
  if (hasVehiclePage && vehicle && vehicleEvaluation) {
    doc.addPage('a4', 'portrait');
    const isFloorPdf = (vehicle.loadingMode ?? 'palletized') === 'floor-loading' && Boolean(floorEvaluation);
    const activeOverall = isFloorPdf && floorEvaluation ? floorEvaluation.overallStatus : vehicleEvaluation.overallStatus;

    const vStatusLabel =
      activeOverall === 'optimal'
        ? 'MUAT OPTIMAL'
        : activeOverall === 'warning'
        ? 'PERLU PERHATIAN'
        : 'RISIKO / OVERLOAD';
    const vStatusBg =
      activeOverall === 'optimal' ? C_GREEN : activeOverall === 'warning' ? C_AMBER : C_RED;

    drawTactileReportHeader(doc, {
      x: M,
      y: 8,
      w: contentW,
      h: 17,
      eyebrow: isFloorPdf
        ? 'DIBUAT OLEH APLIKASI DIECUT.ROOM  |  RENCANA MUAT FLOOR LOADING (TANPA PALET)'
        : 'DIBUAT OLEH APLIKASI DIECUT.ROOM  |  RENCANA MUAT ARMADA & KONTAINER',
      title: `Simulasi ${isFloorPdf ? 'Floor Loading' : 'Muat Palet'} ${vehicle.name}`,
      subtitle:
        isFloorPdf && floorEvaluation
          ? `${projectTrimmed ? `Proyek: ${projectTrimmed}  |  ` : ''}Pola ${floorEvaluation.layoutLabel}  |  ${floorEvaluation.casesPerLayer}x${floorEvaluation.layersLoaded} lyr  |  ${floorEvaluation.totalCases.toLocaleString('id-ID')} dus`
          : `${projectTrimmed ? `Proyek: ${projectTrimmed}  |  ` : ''}Pola ${vehicleEvaluation.layoutLabel}  |  ${vehicleEvaluation.totalPallets} palet (${vehicleEvaluation.activeTiers} tier)  |  ${vehicleEvaluation.totalCases.toLocaleString('id-ID')} dus`,
      statusLabel: vStatusLabel,
      statusBg: vStatusBg,
      rightMeta: `Dalam ${vehicle.internalLengthMm}x${vehicle.internalWidthMm}x${vehicle.internalHeightMm} mm`,
      logoPng,
    });

    // 4 KPI Summary Cards (y = 27.5..46.5)
    const vKpiY = 27.5;
    const vKpiH = 19;
    const vKpiGap = 2.8;
    const vKpiW = (contentW - vKpiGap * 3) / 4;
    const vKpis =
      isFloorPdf && floorEvaluation
        ? [
            {
              title: 'TOTAL KARTON FLOOR LOAD',
              main: `${floorEvaluation.totalCases.toLocaleString('id-ID')} dus`,
              sub: `${floorEvaluation.totalUnits.toLocaleString('id-ID')} pcs · Est ~${floorEvaluation.estimatedHandLoadMinutes} mnt`,
              accent: C_INK_DARK,
            },
            {
              title: 'SUSUNAN LANTAI & LAYER',
              main: `${floorEvaluation.casesPerLayer} x ${floorEvaluation.layersLoaded} lyr`,
              sub: `Tinggi ${floorEvaluation.stackHeightMm} mm · BCT aman <=${floorEvaluation.maxSafeLayersByBct} lyr`,
              accent: C_ACCENT,
            },
            {
              title: 'UTILISASI KUBIK (CBM)',
              main: `${floorEvaluation.volumeUtilizationPct}% vol`,
              sub: `${floorEvaluation.cargoVolumeCbm}/${floorEvaluation.vehicleVolumeCbm} CBM · Lantai ${floorEvaluation.floorUtilizationPct}%`,
              accent: floorEvaluation.volumeUtilizationPct >= 75 ? C_GREEN : C_AMBER,
            },
            {
              title: 'BCT DASAR & PAYLOAD',
              main: `SF ${floorEvaluation.bottomLayerSafetyFactor}:1`,
              sub: `${(floorEvaluation.totalGrossWeightKg / 1000).toFixed(2)}/${(vehicle.maxPayloadKg / 1000).toFixed(1)}t (${floorEvaluation.weightUtilizationPct}%)`,
              accent:
                floorEvaluation.bctStatus === 'overload'
                  ? C_RED
                  : floorEvaluation.bctStatus === 'marginal'
                  ? C_AMBER
                  : C_GREEN,
            },
          ]
        : [
            {
              title: 'TOTAL MUATAN PALET',
              main: `${vehicleEvaluation.totalPallets} palet`,
              sub: `${vehicleEvaluation.floorPalletCount} lantai x ${vehicleEvaluation.activeTiers} tier${
                vehicleEvaluation.limitedByWeight ? ' (limit berat)' : ''
              }`,
              accent: C_INK_DARK,
            },
            {
              title: 'TOTAL MASTER DUS & UNIT',
              main: `${vehicleEvaluation.totalCases.toLocaleString('id-ID')} dus`,
              sub: `${vehicleEvaluation.totalUnits.toLocaleString('id-ID')} pcs (${activeEvaluation.totalCases}/palet)`,
              accent: C_ACCENT,
            },
            {
              title: 'UTILISASI VOLUME & LANTAI',
              main: `${vehicleEvaluation.volumeUtilizationPct}% vol`,
              sub: `Lantai ${vehicleEvaluation.floorUtilizationPct}% · ${(
                (vehicle.internalLengthMm * vehicle.internalWidthMm * vehicle.internalHeightMm) /
                1e9
              ).toFixed(1)} CBM`,
              accent: vehicleEvaluation.volumeUtilizationPct >= 65 ? C_GREEN : C_AMBER,
            },
            {
              title: 'BOBOT VS PAYLOAD',
              main: `${(vehicleEvaluation.totalGrossWeightKg / 1000).toFixed(2)} / ${(
                vehicle.maxPayloadKg / 1000
              ).toFixed(1)} t`,
              sub: `${vehicleEvaluation.weightUtilizationPct}% · Netto ${vehicleEvaluation.totalNetCargoKg.toLocaleString('id-ID')} kg`,
              accent:
                vehicleEvaluation.weightUtilizationPct > 100
                  ? C_RED
                  : vehicleEvaluation.weightUtilizationPct > 90
                  ? C_AMBER
                  : C_GREEN,
            },
          ];

    vKpis.forEach((k, i) => {
      const kx = M + i * (vKpiW + vKpiGap);
      setFill(doc, { r: 255, g: 255, b: 255 });
      setStroke(doc, C_LINE);
      doc.setLineWidth(0.25);
      doc.roundedRect(kx, vKpiY, vKpiW, vKpiH, 1.2, 1.2, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(5.6);
      setText(doc, C_INK_MUTED);
      doc.text(k.title, kx + 2.4, vKpiY + 4.3);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.2);
      setText(doc, k.accent);
      doc.text(truncateToFit(doc, k.main, vKpiW - 4.8), kx + 2.4, vKpiY + 11.4);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.7);
      setText(doc, C_INK_BODY);
      doc.text(truncateToFit(doc, k.sub, vKpiW - 4.8), kx + 2.4, vKpiY + 16.3);
    });

    // Two Spec KV Cards (y = 49..93)
    const vSpecY = 49;
    const vSpecH = 44;
    drawKvCard(doc, M, vSpecY, colW, vSpecH, 'SPESIFIKASI ARMADA & TOLERANSI KAROSERI', [
      {
        label: 'Armada & Akses Muat',
        value: `${vehicle.name} (${vehicle.loadingAccess === 'side-wingbox' ? 'Buka Samping' : 'Pintu Belakang'})`,
        bold: true,
      },
      {
        label: 'Dimensi Dalam (P x L x T)',
        value: `${vehicle.internalLengthMm} x ${vehicle.internalWidthMm} x ${vehicle.internalHeightMm} mm`,
        bold: true,
      },
      {
        label: 'Bukaan Pintu (L x T)',
        value: `${vehicle.doorWidthMm} x ${vehicle.doorHeightMm} mm`,
      },
      {
        label: 'Batas Ketinggian Efektif',
        value: vehicle.reeferLoadLineMm
          ? `Red Load Line ${vehicle.reeferLoadLineMm} mm (Reefer)`
          : isFloorPdf && floorEvaluation
          ? `${floorEvaluation.effectiveClearHeightMm} mm (Floor-Stack Tanpa Palet)`
          : `${vehicleEvaluation.effectiveClearHeightMm} mm (Pintu - Garpu ${vehicle.forkliftLiftClearanceMm} mm)`,
        valueColor: isFloorPdf ? C_GREEN : vehicleEvaluation.fitsHeight ? C_GREEN : C_RED,
      },
      {
        label: 'Toleransi Ketidakstandaran',
        value: `+/- ${vehicle.nonStandardToleranceMm} mm/sisi (Karoseri/Dinding)`,
      },
      {
        label: 'Banding Palet vs Floor',
        value: palletVsFloorComparison
          ? `Palet ${palletVsFloorComparison.palletCases} vs Floor ${palletVsFloorComparison.floorCases} dus (${palletVsFloorComparison.deltaCasesPct >= 0 ? '+' : ''}${palletVsFloorComparison.deltaCasesPct}%)`
          : `${vehicle.maxPayloadKg.toLocaleString('id-ID')} kg maks payload`,
        valueColor:
          palletVsFloorComparison && palletVsFloorComparison.deltaCases > 0 ? C_GREEN : C_INK_DARK,
      },
    ]);

    if (isFloorPdf && floorEvaluation) {
      drawKvCard(doc, M + colW + colGap, vSpecY, colW, vSpecH, 'PARAMETER FLOOR LOADING & AUDIT BCT', [
        {
          label: 'Metode & Pola Lantai',
          value: `Floor Loading (Loose) · ${floorEvaluation.layoutLabel}`,
          bold: true,
        },
        {
          label: 'Susunan & Tinggi Total',
          value: `${floorEvaluation.casesPerLayer} dus/lyr x ${floorEvaluation.layersLoaded} lyr (${floorEvaluation.stackHeightMm} mm)`,
        },
        {
          label: 'Sisa Sisi Dinding & Belakang',
          value: `Sisi +/-${floorEvaluation.actualSideVoidPerSideMm} mm | Belakang ${floorEvaluation.actualRearVoidMm} mm`,
          valueColor: floorEvaluation.needsDunnageAirbag ? C_AMBER : C_GREEN,
        },
        {
          label: 'Beban & BCT Lapisan Dasar',
          value: `${floorEvaluation.bottomLayerLoadKgf} kgf · SF ${floorEvaluation.bottomLayerSafetyFactor}:1 (Aman <=${floorEvaluation.maxSafeLayersByBct} lyr)`,
          valueColor:
            floorEvaluation.bctStatus === 'overload'
              ? C_RED
              : floorEvaluation.bctStatus === 'marginal'
              ? C_AMBER
              : C_GREEN,
        },
        {
          label: 'Kebutuhan Dunnage / Airbag',
          value: floorEvaluation.needsDunnageAirbag
            ? 'Disarankan Airbag / Lashing Net'
            : 'Susunan rapat (tanpa rongga besar)',
        },
        {
          label: 'Estimasi Waktu Muat Manual',
          value: `~${floorEvaluation.estimatedHandLoadMinutes} menit (kru 2 orang)`,
        },
      ]);
    } else {
      drawKvCard(doc, M + colW + colGap, vSpecY, colW, vSpecH, 'CLEARANCE FORKLIFT & SINKRONISASI PALET', [
        {
          label: 'Pola Susunan & Tingkat',
          value: `${vehicleEvaluation.layoutLabel} · ${vehicleEvaluation.activeTiers} Tier`,
          bold: true,
        },
        {
          label: 'Tinggi 1 Palet / Total',
          value: `${activeEvaluation.totalStackHeightMm} mm (${activeEvaluation.layerCount} lyr) / Total ${vehicleEvaluation.totalStackHeightInVehicleMm} mm`,
        },
        {
          label: 'Clearance Dinding Samping',
          value: `Aktual +/-${vehicleEvaluation.actualSideClearancePerSideMm} mm/sisi (Min ${vehicle.sideWallClearanceMm} mm)`,
          valueColor: vehicleEvaluation.actualSideClearancePerSideMm < 25 ? C_AMBER : C_GREEN,
        },
        {
          label: 'Celah Antar-Palet',
          value: `${vehicle.palletGapMm} mm (manuver garpu)`,
        },
        {
          label: 'Margin Pintu Belakang',
          value: `Aktual ${vehicleEvaluation.actualRearDoorClearanceMm} mm (Min ${vehicle.rearDoorClearanceMm} mm)`,
        },
        {
          label: 'Celah Vertikal Pintu / BCT 2T',
          value:
            vehicleEvaluation.activeTiers === 2
              ? `Pintu ${vehicleEvaluation.actualVerticalDoorClearanceMm} mm · BCT 2T SF ${vehicleEvaluation.doubleStackSafetyFactor ?? '-'}:1`
              : `Pintu ${vehicleEvaluation.actualVerticalDoorClearanceMm} mm · Plafon ${vehicleEvaluation.actualVerticalRoofClearanceMm} mm`,
          valueColor:
            vehicleEvaluation.doubleStackBctStatus === 'overload' || !vehicleEvaluation.fitsHeight
              ? C_RED
              : vehicleEvaluation.doubleStackBctStatus === 'marginal'
              ? C_AMBER
              : C_GREEN,
        },
      ]);
    }

    // CARD 1: 2D TOP VIEW VECTOR PLAN (y = 95.5..164.5)
    const tvY = 95.5;
    const tvH = 69;
    setFill(doc, { r: 255, g: 255, b: 255 });
    setStroke(doc, C_LINE);
    doc.setLineWidth(0.25);
    doc.roundedRect(M, tvY, contentW, tvH, 1.2, 1.2, 'FD');

    setFill(doc, C_HEADER_TINT);
    doc.rect(M + 0.15, tvY + 0.15, contentW - 0.3, 5.4, 'F');
    doc.line(M, tvY + 5.4, M + contentW, tvY + 5.4);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.9);
    setText(doc, C_INK_DARK);
    doc.text(
      isFloorPdf
        ? 'DENAH 2D TOP VIEW (SUSUNAN KARTON FLOOR LOADING & ZONA DUNNAGE)'
        : 'DENAH 2D TOP VIEW (TAMPAK ATAS RUANG MUAT & CLEARANCE SAMPING)',
      M + 2.4,
      tvY + 3.8
    );
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.9);
    setText(doc, C_INK_MUTED);
    doc.text(
      isFloorPdf && floorEvaluation
        ? `Sisi +/-${floorEvaluation.actualSideVoidPerSideMm} mm | Blkg ${floorEvaluation.actualRearVoidMm} mm | ${floorEvaluation.casesPerLayer} dus/lyr`
        : `Sisi +/-${vehicleEvaluation.actualSideClearancePerSideMm} mm | Celah Palet ${vehicle.palletGapMm} mm | Pintu Blkg ${vehicleEvaluation.actualRearDoorClearanceMm} mm`,
      M + contentW - 2.4,
      tvY + 3.8,
      { align: 'right' }
    );

    const vL = Math.max(1000, vehicle.internalLengthMm);
    const vW = Math.max(1000, vehicle.internalWidthMm);
    const vH = Math.max(1000, vehicle.internalHeightMm);
    const doorH = Math.min(vH, Math.max(800, vehicle.doorHeightMm));

    const tvDrawX = M + 15;
    const tvDrawY = tvY + 12.5;
    const tvDrawW = contentW - 30;
    const tvDrawH = tvH - 22.5;
    const tvScale = Math.min(tvDrawW / vL, tvDrawH / vW);
    const tvBoxW = vL * tvScale;
    const tvBoxH = vW * tvScale;
    const tvOx = tvDrawX + (tvDrawW - tvBoxW) / 2;
    const tvOy = tvDrawY + (tvDrawH - tvBoxH) / 2;
    const toTvX = (mmX: number) => tvOx + mmX * tvScale;
    const toTvY = (mmZ: number) => tvOy + (mmZ + vW / 2) * tvScale;

    setFill(doc, C_SURFACE);
    setStroke(doc, C_INK_DARK);
    doc.setLineWidth(0.45);
    doc.rect(tvOx, tvOy, tvBoxW, tvBoxH, 'FD');

    const pdfEffW = isFloorPdf && floorEvaluation ? floorEvaluation.effectiveWidthMm : vehicleEvaluation.effectiveWidthMm;
    const pdfEffL = isFloorPdf && floorEvaluation ? floorEvaluation.effectiveLengthMm : vehicleEvaluation.effectiveLengthMm;
    setStroke(doc, C_ACCENT);
    doc.setLineWidth(0.2);
    doc.setLineDashPattern([1.0, 0.8], 0);
    doc.rect(
      toTvX(vehicle.nonStandardToleranceMm),
      toTvY(-pdfEffW / 2),
      pdfEffL * tvScale,
      pdfEffW * tvScale,
      'S'
    );
    doc.setLineDashPattern([], 0);

    if (vehicle.loadingAccess === 'rear') {
      setStroke(doc, C_ORANGE);
      doc.setLineWidth(0.9);
      doc.line(
        tvOx + tvBoxW,
        toTvY(-vehicle.doorWidthMm / 2),
        tvOx + tvBoxW,
        toTvY(vehicle.doorWidthMm / 2)
      );
    } else {
      setStroke(doc, C_ACCENT);
      doc.setLineWidth(0.7);
      doc.setLineDashPattern([1.4, 1.0], 0);
      doc.line(tvOx + 1, tvOy, tvOx + tvBoxW - 1, tvOy);
      doc.line(tvOx + 1, tvOy + tvBoxH, tvOx + tvBoxW - 1, tvOy + tvBoxH);
      doc.setLineDashPattern([], 0);
    }

    if (isFloorPdf && floorEvaluation) {
      floorEvaluation.floorSlots.forEach((slot) => {
        const sx = toTvX(slot.x - slot.sizeX / 2);
        const sy = toTvY(slot.z - slot.sizeZ / 2);
        const sw = Math.max(0.4, slot.sizeX * tvScale);
        const sh = Math.max(0.4, slot.sizeZ * tvScale);
        setFill(doc, slot.rotated90 ? C_ORIENT_90_FILL : C_ORIENT_0_FILL);
        setStroke(doc, C_INK_DARK);
        doc.setLineWidth(floorEvaluation.floorSlots.length > 180 ? 0.1 : 0.16);
        doc.rect(sx, sy, sw, sh, 'FD');
      });
    } else {
      const pdfFloorPallets = vehicleEvaluation.placements.filter((p) => p.tier === 1);
      pdfFloorPallets.forEach((p) => {
        const px = toTvX(p.x - p.sizeX / 2);
        const py = toTvY(p.z - p.sizeZ / 2);
        const pw = p.sizeX * tvScale;
        const ph = p.sizeZ * tvScale;
        const hasT2 = vehicleEvaluation.placements.some(
          (o) => o.tier === 2 && Math.abs(o.x - p.x) < 5 && Math.abs(o.z - p.z) < 5
        );
        setFill(doc, p.rotated90 ? C_ORIENT_90_FILL : C_ORIENT_0_FILL);
        setStroke(doc, C_INK_DARK);
        doc.setLineWidth(0.26);
        doc.roundedRect(px, py, pw, ph, 0.35, 0.35, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(Math.max(4.4, Math.min(6.2, Math.min(pw, ph) * 0.42)));
        setText(doc, C_INK_DARK);
        doc.text(`#${p.index}${hasT2 ? 'x2' : ''}`, px + pw / 2, py + ph / 2 + 0.7, {
          align: 'center',
        });
      });
    }

    drawDimensionLineHorizontal(
      doc,
      tvOx,
      tvOx + tvBoxW,
      tvOy - 3.6,
      tvOy,
      `Panjang Dalam ${vL} mm (Terpakai ${Math.round(isFloorPdf && floorEvaluation ? floorEvaluation.usedLengthMm : vehicleEvaluation.usedLengthMm)} mm)`,
      C_INK_DARK
    );
    drawDimensionLineVertical(
      doc,
      tvOy,
      tvOy + tvBoxH,
      tvOx - 4.2,
      tvOx,
      `L ${vW} mm`,
      C_INK_DARK
    );

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.6);
    setText(doc, C_INK_MUTED);
    doc.text('DEPAN', tvOx - 1.5, tvOy + tvBoxH + 4.2, { align: 'right' });
    doc.text(
      vehicle.loadingAccess === 'rear' ? 'PINTU BELAKANG' : 'BELAKANG (WINGBOX)',
      tvOx + tvBoxW + 1.5,
      tvOy + tvBoxH + 4.2,
      { align: 'left' }
    );
    doc.text(
      `Kuning = 0 deg | Biru = 90 deg | Garis putus ungu = Zona Efektif (${Math.round(pdfEffL)}x${Math.round(pdfEffW)} mm)`,
      M + contentW / 2,
      tvY + tvH - 2.3,
      { align: 'center' }
    );

    // CARD 2: 2D SIDE VIEW VECTOR PLAN (y = 167..234)
    const svY = 167;
    const svH = 67;
    setFill(doc, { r: 255, g: 255, b: 255 });
    setStroke(doc, C_LINE);
    doc.setLineWidth(0.25);
    doc.roundedRect(M, svY, contentW, svH, 1.2, 1.2, 'FD');

    setFill(doc, C_HEADER_TINT);
    doc.rect(M + 0.15, svY + 0.15, contentW - 0.3, 5.4, 'F');
    doc.line(M, svY + 5.4, M + contentW, svY + 5.4);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.9);
    setText(doc, C_INK_DARK);
    doc.text(
      isFloorPdf
        ? 'DENAH 2D SIDE VIEW (TUMPUKAN KARTON FLOOR LOADING & BATAS PLAFON)'
        : 'DENAH 2D SIDE VIEW (TAMPAK SAMPING, AMBANG PINTU & RUANG ANGKAT GARPU)',
      M + 2.4,
      svY + 3.8
    );
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.9);
    setText(doc, C_INK_MUTED);
    doc.text(
      isFloorPdf && floorEvaluation
        ? `Tinggi ${floorEvaluation.stackHeightMm} mm (${floorEvaluation.layersLoaded} lyr) | Plafon ${floorEvaluation.actualVerticalRoofClearanceMm} mm`
        : `Tinggi Palet ${vehicleEvaluation.totalStackHeightInVehicleMm} mm | Celah Pintu ${vehicleEvaluation.actualVerticalDoorClearanceMm} mm | Plafon ${vehicleEvaluation.actualVerticalRoofClearanceMm} mm`,
      M + contentW - 2.4,
      svY + 3.8,
      { align: 'right' }
    );

    const svDrawX = M + 15;
    const svDrawY = svY + 10.5;
    const svDrawW = contentW - 34;
    const svDrawH = svH - 18.5;
    const svScale = Math.min(svDrawW / vL, svDrawH / vH);
    const svBoxW = vL * svScale;
    const svBoxH = vH * svScale;
    const svOx = svDrawX + (svDrawW - svBoxW) / 2;
    const svFloorY = svDrawY + svBoxH + (svDrawH - svBoxH) / 2;
    const toSvX = (mmX: number) => svOx + mmX * svScale;
    const toSvY = (mmY: number) => svFloorY - mmY * svScale;

    setFill(doc, C_SURFACE);
    setStroke(doc, C_INK_DARK);
    doc.setLineWidth(0.45);
    doc.rect(svOx, toSvY(vH), svBoxW, svBoxH, 'FD');

    if (doorH < vH) {
      setFill(doc, C_ORANGE);
      doc.rect(svOx + svBoxW - 2.2, toSvY(vH), 2.2, (vH - doorH) * svScale, 'F');
      setStroke(doc, C_ORANGE);
      doc.setLineWidth(0.24);
      doc.setLineDashPattern([1.2, 0.9], 0);
      doc.line(svOx, toSvY(doorH), svOx + svBoxW, toSvY(doorH));
      doc.setLineDashPattern([], 0);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(5.4);
      setText(doc, C_ORANGE);
      doc.text(`Pintu ${doorH}mm`, svOx + svBoxW + 1.8, toSvY(doorH) + 1.0);
    }

    if (vehicle.reeferLoadLineMm && vehicle.reeferLoadLineMm > 0) {
      setStroke(doc, C_RED);
      doc.setLineWidth(0.32);
      doc.setLineDashPattern([1.0, 0.8], 0);
      doc.line(svOx, toSvY(vehicle.reeferLoadLineMm), svOx + svBoxW, toSvY(vehicle.reeferLoadLineMm));
      doc.setLineDashPattern([], 0);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(5.2);
      setText(doc, C_RED);
      doc.text(`RED LOAD LINE ${vehicle.reeferLoadLineMm}mm`, svOx + 2, toSvY(vehicle.reeferLoadLineMm) - 1.0);
    }

    if (isFloorPdf && floorEvaluation) {
      const pdfFloorCols = new Map<string, { x: number; sizeX: number; rotated90: boolean }>();
      for (const s of floorEvaluation.floorSlots) {
        const key = `${Math.round(s.x / 10)}-${Math.round(s.sizeX / 10)}`;
        if (!pdfFloorCols.has(key)) pdfFloorCols.set(key, { x: s.x, sizeX: s.sizeX, rotated90: s.rotated90 });
      }
      const totalH = Math.max(1.2, floorEvaluation.stackHeightMm * svScale);
      const topY = toSvY(floorEvaluation.stackHeightMm);
      const lyrCount = Math.max(1, floorEvaluation.layersLoaded);
      for (const col of pdfFloorCols.values()) {
        const cx = toSvX(col.x - col.sizeX / 2);
        const cw = Math.max(0.5, col.sizeX * svScale);
        setFill(doc, col.rotated90 ? C_ORIENT_90_FILL : C_ORIENT_0_FILL);
        setStroke(doc, C_INK_DARK);
        doc.setLineWidth(0.14);
        doc.rect(cx, topY, cw, totalH, 'FD');
        setStroke(doc, C_INK_MUTED);
        doc.setLineWidth(0.08);
        for (let li = 1; li < lyrCount; li++) {
          const ly = topY + (totalH * li) / lyrCount;
          doc.line(cx, ly, cx + cw, ly);
        }
      }
    } else {
      const pdfSideCols = new Map<string, { x: number; sizeX: number; hasT2: boolean }>();
      for (const p of vehicleEvaluation.placements) {
        const key = `${Math.round(p.x / 20)}-${Math.round(p.sizeX / 20)}`;
        const ex = pdfSideCols.get(key);
        if (!ex) pdfSideCols.set(key, { x: p.x, sizeX: p.sizeX, hasT2: p.tier === 2 });
        else if (p.tier === 2) ex.hasT2 = true;
      }

      const drawPdfSideTier = (cx: number, cw: number, baseMm: number, tierNum: 1 | 2) => {
        const deckH = pallet.palletHeightMm * svScale;
        const cargoH = Math.max(
          1.2,
          (activeEvaluation.totalStackHeightMm - pallet.palletHeightMm) * svScale
        );
        setFill(doc, { r: 214, g: 181, b: 136 });
        setStroke(doc, C_INK_DARK);
        doc.setLineWidth(0.2);
        doc.rect(cx, toSvY(baseMm + pallet.palletHeightMm), cw, deckH, 'FD');

        setFill(doc, tierNum === 1 ? { r: 226, g: 232, b: 240 } : C_ORIENT_90_FILL);
        doc.rect(cx + 0.3, toSvY(baseMm + activeEvaluation.totalStackHeightMm), Math.max(0.8, cw - 0.6), cargoH, 'FD');

        const lyrCount = Math.max(1, activeEvaluation.layerCount);
        setStroke(doc, C_INK_MUTED);
        doc.setLineWidth(0.12);
        for (let li = 1; li < lyrCount; li++) {
          const ly = toSvY(baseMm + activeEvaluation.totalStackHeightMm) + (cargoH * li) / lyrCount;
          doc.line(cx + 0.3, ly, cx + cw - 0.3, ly);
        }
      };

      for (const col of pdfSideCols.values()) {
        const cx = toSvX(col.x - col.sizeX / 2);
        const cw = col.sizeX * svScale;
        drawPdfSideTier(cx, cw, 0, 1);
        if (col.hasT2) {
          drawPdfSideTier(cx, cw, activeEvaluation.totalStackHeightMm, 2);
        }
      }
    }

    drawDimensionLineVertical(
      doc,
      toSvY(vH),
      svFloorY,
      svOx - 4.2,
      svOx,
      `T ${vH} mm`,
      C_INK_DARK
    );

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.6);
    setText(doc, C_INK_MUTED);
    doc.text(
      isFloorPdf && floorEvaluation
        ? `Floor Loading: ${floorEvaluation.stackHeightMm} mm (${floorEvaluation.layersLoaded} lyr tanpa palet) | Batas Aman Efektif = ${floorEvaluation.effectiveClearHeightMm} mm | BCT Dasar SF ${floorEvaluation.bottomLayerSafetyFactor}:1`
        : `1 Palet = ${activeEvaluation.totalStackHeightMm} mm (${activeEvaluation.layerCount} lyr) | Batas Aman Efektif = ${vehicleEvaluation.effectiveClearHeightMm} mm | Ruang Angkat Garpu Min = ${vehicle.forkliftLiftClearanceMm} mm`,
      M + contentW / 2,
      svY + svH - 2.3,
      { align: 'center' }
    );

    // BOTTOM AUDIT BOX (y = 236.5..283.5)
    const waY = 236.5;
    const waH = 47;
    setFill(doc, { r: 255, g: 255, b: 255 });
    setStroke(doc, C_LINE);
    doc.setLineWidth(0.25);
    doc.roundedRect(M, waY, contentW, waH, 1.2, 1.2, 'FD');

    setFill(doc, C_HEADER_TINT);
    doc.rect(M + 0.15, waY + 0.15, contentW - 0.3, 5.4, 'F');
    doc.line(M, waY + 5.4, M + contentW, waY + 5.4);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.9);
    setText(doc, C_INK_DARK);
    doc.text(
      isFloorPdf
        ? 'AUDIT LAPANGAN FLOOR LOADING, BCT TUMPUKAN & PERBANDINGAN KAPASITAS'
        : 'AUDIT LAPANGAN FORKLIFT, KETIDAKSTANDARAN KAROSERI & REKOMENDASI MUAT',
      M + 2.4,
      waY + 3.8
    );

    const rawAuditWarnings = isFloorPdf && floorEvaluation ? floorEvaluation.warnings : vehicleEvaluation.warnings;
    const pdfWarnings =
      rawAuditWarnings.length > 0
        ? rawAuditWarnings.slice(0, 5)
        : [
            {
              severity: 'info' as const,
              title: 'Konfigurasi Armada Aman & Optimal',
              detail: 'Dimensi ruang muat, clearance, BCT lapisan bawah, dan kapasitas berat memenuhi batas standar.',
            },
          ];

    pdfWarnings.forEach((w, idx) => {
      const wy = waY + 9.2 + idx * 7.4;
      const dotCol = w.severity === 'critical' ? C_RED : w.severity === 'warning' ? C_AMBER : C_ACCENT;
      setFill(doc, dotCol);
      doc.circle(M + 4.0, wy - 0.8, 1.0, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.2);
      setText(doc, C_INK_DARK);
      doc.text(truncateToFit(doc, w.title, contentW - 10), M + 6.5, wy);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.7);
      setText(doc, C_INK_BODY);
      doc.text(truncateToFit(doc, w.detail, contentW - 10), M + 6.5, wy + 3.2);
    });

    // Page 3 Footer
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.1);
    setText(doc, C_INK_MUTED);
    doc.text('Dibuat oleh aplikasi DieCut.Room · Totale.Room Engineering Suite', M, 290);
    doc.text(`Halaman 3 / ${totalPages}`, pageW - M, 290, { align: 'right' });
  }

  const slug = projectTrimmed
    ? projectTrimmed
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 32)
    : `fefco-${config.boxStyle}-${Math.round(od.length)}x${Math.round(od.width)}x${Math.round(od.depth)}mm`;
  doc.save(`diecut-room-palletizer-report-${slug}.pdf`);
}
