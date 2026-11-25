import { PalletBoxPlacement, PalletConfig, PalletPatternEvaluation } from '../types';

export type VectorStrokePreset = 'thin' | 'standard' | 'bold';

export interface PalletVectorExportOptions {
  includeFramesAndText: boolean;
  includeMaxStackPanel: boolean;
  strokePreset: VectorStrokePreset;
  projectOrClientName?: string;
}

export interface VectorSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  strokeWidthMm?: number;
}

export interface VectorRect {
  x: number;
  y: number;
  w: number;
  h: number;
  rx?: number;
  fill?: boolean;
  stroke?: boolean;
  strokeWidthMm?: number;
}

export interface VectorText {
  text: string;
  x: number;
  y: number;
  fontSizeMm: number;
  bold?: boolean;
  align?: 'left' | 'center' | 'right';
}

export interface VectorGroup {
  id: string;
  segments: VectorSegment[];
  rects: VectorRect[];
  texts: VectorText[];
}

export interface PalletVectorScene {
  artboardWidthMm: number;
  artboardHeightMm: number;
  baseStrokeWidthMm: number;
  groups: VectorGroup[];
  stats: {
    totalSegments: number;
    isoSegments: number;
    topSegments: number;
    layerCount: number;
  };
}

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface Pt2 {
  u: number;
  v: number;
}

interface Cuboid3D {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
  category: 'pallet' | 'box';
}

interface FrontFace2D {
  // 4 corners in screen (u, v) order
  poly: [Pt2, Pt2, Pt2, Pt2];
  // Inward edge normals for Cyrus-Beck clipping
  normals: Array<{ nx: number; ny: number; p: Pt2 }>;
  minU: number;
  maxU: number;
  minV: number;
  maxV: number;
  // Exact linear orthographic depth plane: d(u, v) = da*u + db*v + dc (larger = closer to camera)
  da: number;
  db: number;
  dc: number;
  maxDepth: number;
}

interface Seg3D {
  p0: Vec3;
  p1: Vec3;
  group: 'iso-pallet' | 'iso-boxes' | 'iso-chevrons';
  strokeScale?: number;
}

const SQRT3 = Math.sqrt(3);
const SQRT3_HALF = SQRT3 / 2;

export const VECTOR_STROKE_PRESETS: Record<
  VectorStrokePreset,
  { label: string; strokeMm: number; hint: string }
> = {
  thin: { label: 'Tipis (0.45 mm)', strokeMm: 0.45, hint: 'Detail tajam untuk karton kecil' },
  standard: { label: 'Standar (0.65 mm)', strokeMm: 0.65, hint: 'Garis seimbang standar flexo' },
  bold: { label: 'Tebal (0.90 mm)', strokeMm: 0.9, hint: 'Kontras kuat untuk kraft kasar' },
};

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * True isometric orthographic projection (30° X/Z axes, vertical Y axis).
 * Camera looks along (-1, -1, -1), so depth toward camera is strictly x + y + z.
 */
function projectIso(p: Vec3): { u: number; v: number; d: number } {
  return {
    u: (p.x - p.z) * SQRT3_HALF,
    v: (p.x + p.z) * 0.5 - p.y,
    d: p.x + p.y + p.z,
  };
}

function buildFrontFace2D(
  corners3D: [Vec3, Vec3, Vec3, Vec3],
  da: number,
  db: number,
  dc: number
): FrontFace2D {
  const proj = corners3D.map(projectIso);
  const poly: [Pt2, Pt2, Pt2, Pt2] = [
    { u: proj[0].u, v: proj[0].v },
    { u: proj[1].u, v: proj[1].v },
    { u: proj[2].u, v: proj[2].v },
    { u: proj[3].u, v: proj[3].v },
  ];

  // Determine signed area to guarantee inward normals regardless of winding
  let area2 = 0;
  for (let i = 0; i < 4; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % 4];
    area2 += a.u * b.v - b.u * a.v;
  }
  const sign = area2 >= 0 ? 1 : -1;

  const normals: Array<{ nx: number; ny: number; p: Pt2 }> = [];
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  let maxDepth = -Infinity;

  for (let i = 0; i < 4; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % 4];
    const du = b.u - a.u;
    const dv = b.v - a.v;
    // Left normal (-dv, du) points inward when area2 > 0
    normals.push({ nx: -dv * sign, ny: du * sign, p: a });

    if (a.u < minU) minU = a.u;
    if (a.u > maxU) maxU = a.u;
    if (a.v < minV) minV = a.v;
    if (a.v > maxV) maxV = a.v;
    if (proj[i].d > maxDepth) maxDepth = proj[i].d;
  }

  return { poly, normals, minU, maxU, minV, maxV, da, db, dc, maxDepth };
}

function buildCuboidFrontFaces(c: Cuboid3D): FrontFace2D[] {
  const { x0, x1, y0, y1, z0, z1 } = c;
  // 1. Top face (+Y, y = y1): depth(u,v) = 2*v + 3*y1
  const top = buildFrontFace2D(
    [
      { x: x0, y: y1, z: z0 },
      { x: x1, y: y1, z: z0 },
      { x: x1, y: y1, z: z1 },
      { x: x0, y: y1, z: z1 },
    ],
    0,
    2,
    3 * y1
  );

  // 2. Front-Right face (+X, x = x1): depth(u,v) = -SQRT3*u - v + 3*x1
  const right = buildFrontFace2D(
    [
      { x: x1, y: y0, z: z0 },
      { x: x1, y: y0, z: z1 },
      { x: x1, y: y1, z: z1 },
      { x: x1, y: y1, z: z0 },
    ],
    -SQRT3,
    -1,
    3 * x1
  );

  // 3. Front-Left face (+Z, z = z1): depth(u,v) = SQRT3*u - v + 3*z1
  const left = buildFrontFace2D(
    [
      { x: x0, y: y0, z: z1 },
      { x: x1, y: y0, z: z1 },
      { x: x1, y: y1, z: z1 },
      { x: x0, y: y1, z: z1 },
    ],
    SQRT3,
    -1,
    3 * z1
  );

  return [top, right, left];
}

function buildCuboidVisibleEdges(c: Cuboid3D): Seg3D[] {
  const { x0, x1, y0, y1, z0, z1, category } = c;
  const group: Seg3D['group'] = category === 'pallet' ? 'iso-pallet' : 'iso-boxes';
  // Only the 9 edges belonging to the 3 front-facing faces (+Y, +X, +Z) can ever be visible
  const pairs: Array<[Vec3, Vec3]> = [
    // Top face (+Y) perimeter (4)
    [{ x: x0, y: y1, z: z0 }, { x: x1, y: y1, z: z0 }],
    [{ x: x1, y: y1, z: z0 }, { x: x1, y: y1, z: z1 }],
    [{ x: x1, y: y1, z: z1 }, { x: x0, y: y1, z: z1 }],
    [{ x: x0, y: y1, z: z1 }, { x: x0, y: y1, z: z0 }],
    // Vertical visible edges (3)
    [{ x: x1, y: y0, z: z0 }, { x: x1, y: y1, z: z0 }],
    [{ x: x1, y: y0, z: z1 }, { x: x1, y: y1, z: z1 }],
    [{ x: x0, y: y0, z: z1 }, { x: x0, y: y1, z: z1 }],
    // Bottom front edges (2)
    [{ x: x1, y: y0, z: z0 }, { x: x1, y: y0, z: z1 }],
    [{ x: x0, y: y0, z: z1 }, { x: x1, y: y0, z: z1 }],
  ];
  return pairs.map(([p0, p1]) => ({ p0, p1, group }));
}

/**
 * Analytic Cyrus-Beck 2D quad clipping + exact linear 3D depth comparison.
 * Returns the occluded parameter interval [oc0, oc1] within [0, 1], or null if not occluded.
 */
function computeOccludedInterval(
  u0: number,
  v0: number,
  d0: number,
  du: number,
  dv: number,
  dd: number,
  face: FrontFace2D,
  depthEps: number
): [number, number] | null {
  let tEnter = 0;
  let tExit = 1;

  for (let i = 0; i < 4; i++) {
    const { nx, ny, p } = face.normals[i];
    const num = nx * (u0 - p.u) + ny * (v0 - p.v);
    const den = nx * du + ny * dv;

    if (Math.abs(den) < 1e-9) {
      if (num < -1e-6) return null;
    } else {
      const t = -num / den;
      if (den > 0) {
        if (t > tEnter) tEnter = t;
      } else {
        if (t < tExit) tExit = t;
      }
      if (tEnter >= tExit - 1e-6) return null;
    }
  }

  // Evaluate linear depth difference delta(t) = d_face(t) - d_seg(t) - depthEps
  const f0 = face.da * u0 + face.db * v0 + face.dc - d0 - depthEps;
  const df = face.da * du + face.db * dv - dd;

  const valEnter = f0 + df * tEnter;
  const valExit = f0 + df * tExit;

  if (valEnter <= 0 && valExit <= 0) return null;
  if (valEnter > 0 && valExit > 0) return [tEnter, tExit];

  // Crosses zero linearly inside [tEnter, tExit]
  const tZero = -f0 / df;
  if (valEnter > 0) {
    return [tEnter, Math.min(tExit, tZero)];
  }
  return [Math.max(tEnter, tZero), tExit];
}

function subtractInterval(
  intervals: Array<[number, number]>,
  cut0: number,
  cut1: number
): Array<[number, number]> {
  if (cut1 - cut0 < 1e-5) return intervals;
  const out: Array<[number, number]> = [];
  for (const [a, b] of intervals) {
    if (cut1 <= a + 1e-5 || cut0 >= b - 1e-5) {
      out.push([a, b]);
    } else {
      if (cut0 > a + 1e-4) out.push([a, cut0]);
      if (cut1 < b - 1e-4) out.push([cut1, b]);
    }
  }
  return out;
}

/**
 * Deduplicates overlapping/collinear 2D segments so Illustrator receives single clean paths
 * without double-stacked strokes between touching cartons.
 */
function deduplicateAndMergeSegments(segments: VectorSegment[], tolMm = 0.08): VectorSegment[] {
  if (segments.length <= 1) return segments;

  interface BucketItem {
    s0: number;
    s1: number;
    strokeWidthMm?: number;
  }

  const buckets = new Map<
    string,
    {
      nx: number;
      ny: number;
      tx: number;
      ty: number;
      dist: number;
      items: BucketItem[];
    }
  >();

  const angleStep = 0.004; // ~0.23 deg quantization
  const distStep = Math.max(0.06, tolMm);

  for (const seg of segments) {
    const dx = seg.x2 - seg.x1;
    const dy = seg.y2 - seg.y1;
    const len = Math.hypot(dx, dy);
    if (len < 0.05) continue;

    let tx = dx / len;
    let ty = dy / len;
    // Canonical tangent direction: tx > 0 or (tx ~ 0 and ty > 0)
    if (tx < -1e-6 || (Math.abs(tx) <= 1e-6 && ty < 0)) {
      tx = -tx;
      ty = -ty;
    }
    const nx = -ty;
    const ny = tx;
    const dist = nx * seg.x1 + ny * seg.y1;

    const theta = Math.atan2(ty, tx);
    const qTheta = Math.round(theta / angleStep);
    const qDist = Math.round(dist / distStep);
    const swKey = seg.strokeWidthMm ? Math.round(seg.strokeWidthMm * 100) : 0;
    const key = `${qTheta}|${qDist}|${swKey}`;

    const p0 = tx * seg.x1 + ty * seg.y1;
    const p1 = tx * seg.x2 + ty * seg.y2;
    const s0 = Math.min(p0, p1);
    const s1 = Math.max(p0, p1);

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { nx, ny, tx, ty, dist, items: [] };
      buckets.set(key, bucket);
    }
    bucket.items.push({ s0, s1, strokeWidthMm: seg.strokeWidthMm });
  }

  const result: VectorSegment[] = [];
  for (const bucket of buckets.values()) {
    bucket.items.sort((a, b) => a.s0 - b.s0);
    const merged: BucketItem[] = [];
    for (const item of bucket.items) {
      const prev = merged[merged.length - 1];
      if (prev && item.s0 <= prev.s1 + tolMm) {
        if (item.s1 > prev.s1) prev.s1 = item.s1;
      } else {
        merged.push({ ...item });
      }
    }

    for (const m of merged) {
      if (m.s1 - m.s0 < 0.05) continue;
      result.push({
        x1: round3(bucket.nx * bucket.dist + bucket.tx * m.s0),
        y1: round3(bucket.ny * bucket.dist + bucket.ty * m.s0),
        x2: round3(bucket.nx * bucket.dist + bucket.tx * m.s1),
        y2: round3(bucket.ny * bucket.dist + bucket.ty * m.s1),
        strokeWidthMm: m.strokeWidthMm,
      });
    }
  }

  return result;
}

/**
 * Generates clean 3-point open chevron segments on top of a carton at (cx, cz),
 * matching classic corrugated pallet pattern orientation marks (v, >, <, ^).
 */
function buildChevron2DPoints(
  cx: number,
  cz: number,
  sizeX: number,
  sizeZ: number,
  angleDeg: 0 | 90 | 180 | 270
): [Pt2, Pt2, Pt2] {
  const isHoriz = sizeX >= sizeZ;
  const longSpan = isHoriz ? sizeX : sizeZ;
  const shortSpan = isHoriz ? sizeZ : sizeX;

  // Wide, clean industrial chevron proportions matching reference images
  const halfBase = Math.min(longSpan * 0.27, shortSpan * 0.62);
  const apexDepth = Math.min(shortSpan * 0.14, halfBase * 0.45);

  if (isHoriz) {
    // Horizontal box: chevron runs along X, apex points +Z (0°) or -Z (180°)
    const dir = angleDeg === 180 || angleDeg === 270 ? -1 : 1;
    return [
      { u: cx - halfBase, v: cz - dir * apexDepth * 0.45 },
      { u: cx, v: cz + dir * apexDepth * 0.65 },
      { u: cx + halfBase, v: cz - dir * apexDepth * 0.45 },
    ];
  } else {
    // Vertical box: chevron runs along Z, apex points +X (90°) or -X (270°)
    const dir = angleDeg === 270 || angleDeg === 180 ? -1 : 1;
    return [
      { u: cx - dir * apexDepth * 0.45, v: cz - halfBase },
      { u: cx + dir * apexDepth * 0.65, v: cz },
      { u: cx - dir * apexDepth * 0.45, v: cz + halfBase },
    ];
  }
}

/**
 * Clips a 2D line segment (horizontal or vertical pallet slat edge) against a set of
 * axis-aligned box rectangles so slats are visible ONLY in gaps and margins (zero fill!).
 */
function clip2DSegmentAgainstRects(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rects: Array<{ minX: number; maxX: number; minY: number; maxY: number }>
): VectorSegment[] {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let intervals: Array<[number, number]> = [[0, 1]];

  for (const r of rects) {
    if (intervals.length === 0) break;
    // Liang-Barsky clip against box interior
    let t0 = 0;
    let t1 = 1;
    const p = [-dx, dx, -dy, dy];
    const q = [x1 - r.minX, r.maxX - x1, y1 - r.minY, r.maxY - y1];
    let inside = true;
    for (let i = 0; i < 4; i++) {
      if (Math.abs(p[i]) < 1e-9) {
        if (q[i] < 0) {
          inside = false;
          break;
        }
      } else {
        const t = q[i] / p[i];
        if (p[i] < 0) {
          if (t > t0) t0 = t;
        } else {
          if (t < t1) t1 = t;
        }
      }
    }
    if (inside && t1 > t0 + 1e-5) {
      intervals = subtractInterval(intervals, t0, t1);
    }
  }

  return intervals.map(([a, b]) => ({
    x1: round3(x1 + dx * a),
    y1: round3(y1 + dy * a),
    x2: round3(x1 + dx * b),
    y2: round3(y1 + dy * b),
  }));
}

/**
 * Builds pure transparent line-art for a single Top-View layer (pallet outer frame,
 * clipped wooden deck slats, box outlines, and directional open-V chevrons).
 */
function buildTopViewLayerVectors(
  boxes: PalletBoxPlacement[],
  pallet: PalletConfig,
  targetX: number,
  targetY: number,
  targetW: number,
  targetH: number,
  strokeMm: number
): {
  palletSegments: VectorSegment[];
  boxSegments: VectorSegment[];
  chevronSegments: VectorSegment[];
} {
  const pL = Math.max(200, pallet.palletLengthMm);
  const pW = Math.max(200, pallet.palletWidthMm);

  let minX = -pL / 2;
  let maxX = pL / 2;
  let minZ = -pW / 2;
  let maxZ = pW / 2;
  for (const b of boxes) {
    minX = Math.min(minX, b.x - b.sizeX / 2);
    maxX = Math.max(maxX, b.x + b.sizeX / 2);
    minZ = Math.min(minZ, b.z - b.sizeZ / 2);
    maxZ = Math.max(maxZ, b.z + b.sizeZ / 2);
  }

  const spanX = Math.max(200, maxX - minX);
  const spanZ = Math.max(200, maxZ - minZ);
  const scale = Math.min(targetW / spanX, targetH / spanZ);
  const cx = targetX + targetW / 2;
  const cy = targetY + targetH / 2;
  const midX = (minX + maxX) / 2;
  const midZ = (minZ + maxZ) / 2;

  const toX = (mmX: number) => cx + (mmX - midX) * scale;
  const toY = (mmZ: number) => cy + (mmZ - midZ) * scale;

  // Box occlusion rects in world mm (slightly inset 0.2mm so box borders stay crisp)
  const boxRectsWorld = boxes.map((b) => ({
    minX: b.x - b.sizeX / 2,
    maxX: b.x + b.sizeX / 2,
    minY: b.z - b.sizeZ / 2,
    maxY: b.z + b.sizeZ / 2,
  }));

  // 1. Pallet outer rectangle + 6 vertical slats (matching reference Image 2)
  const rawPalletSegsWorld: VectorSegment[] = [
    // Outer perimeter
    { x1: -pL / 2, y1: -pW / 2, x2: pL / 2, y2: -pW / 2 },
    { x1: pL / 2, y1: -pW / 2, x2: pL / 2, y2: pW / 2 },
    { x1: pL / 2, y1: pW / 2, x2: -pL / 2, y2: pW / 2 },
    { x1: -pL / 2, y1: pW / 2, x2: -pL / 2, y2: -pW / 2 },
  ];

  const slatCount = 6;
  const slatWidth = Math.max(32, pL * 0.036);
  const slatMarginX = pL * 0.12;
  const usableSpan = pL - slatMarginX * 2;
  for (let i = 0; i < slatCount; i++) {
    const sx = -pL / 2 + slatMarginX + (slatCount > 1 ? (usableSpan * i) / (slatCount - 1) : 0);
    const sx0 = sx - slatWidth / 2;
    const sx1 = sx + slatWidth / 2;
    rawPalletSegsWorld.push(
      { x1: sx0, y1: -pW / 2, x2: sx0, y2: pW / 2 },
      { x1: sx1, y1: -pW / 2, x2: sx1, y2: pW / 2 }
    );
  }

  const clippedPalletSegs: VectorSegment[] = [];
  for (const s of rawPalletSegsWorld) {
    const pieces = clip2DSegmentAgainstRects(s.x1, s.y1, s.x2, s.y2, boxRectsWorld);
    for (const p of pieces) {
      clippedPalletSegs.push({
        x1: toX(p.x1),
        y1: toY(p.y1),
        x2: toX(p.x2),
        y2: toY(p.y2),
        strokeWidthMm: round3(strokeMm * 0.78),
      });
    }
  }

  // 2. Box outline edges + directional chevrons
  const rawBoxSegs: VectorSegment[] = [];
  const rawChevronSegs: VectorSegment[] = [];

  for (const b of boxes) {
    const x0 = toX(b.x - b.sizeX / 2);
    const x1 = toX(b.x + b.sizeX / 2);
    const y0 = toY(b.z - b.sizeZ / 2);
    const y1 = toY(b.z + b.sizeZ / 2);

    rawBoxSegs.push(
      { x1: x0, y1: y0, x2: x1, y2: y0, strokeWidthMm: strokeMm },
      { x1: x1, y1: y0, x2: x1, y2: y1, strokeWidthMm: strokeMm },
      { x1: x1, y1: y1, x2: x0, y2: y1, strokeWidthMm: strokeMm },
      { x1: x0, y1: y1, x2: x0, y2: y0, strokeWidthMm: strokeMm }
    );

    const [pA, pB, pC] = buildChevron2DPoints(b.x, b.z, b.sizeX, b.sizeZ, b.angleDeg);
    rawChevronSegs.push(
      {
        x1: toX(pA.u),
        y1: toY(pA.v),
        x2: toX(pB.u),
        y2: toY(pB.v),
        strokeWidthMm: round3(strokeMm * 0.92),
      },
      {
        x1: toX(pB.u),
        y1: toY(pB.v),
        x2: toX(pC.u),
        y2: toY(pC.v),
        strokeWidthMm: round3(strokeMm * 0.92),
      }
    );
  }

  return {
    palletSegments: deduplicateAndMergeSegments(clippedPalletSegs, 0.05),
    boxSegments: deduplicateAndMergeSegments(rawBoxSegs, 0.06),
    chevronSegments: rawChevronSegs,
  };
}

/**
 * Builds pure transparent Isometric 30° 3D Pallet Stack vectors with exact analytic
 * Hidden-Line Removal (HLR), wooden 3-stringer pallet base, alternating carton layers,
 * and top-layer directional chevrons.
 */
function buildIsometricStackVectors(
  evaluation: PalletPatternEvaluation,
  pallet: PalletConfig,
  targetX: number,
  targetY: number,
  targetW: number,
  targetH: number,
  strokeMm: number
): {
  palletSegments: VectorSegment[];
  boxSegments: VectorSegment[];
  chevronSegments: VectorSegment[];
} {
  const pL = Math.max(200, pallet.palletLengthMm);
  const pW = Math.max(200, pallet.palletWidthMm);
  const pH = Math.max(80, pallet.palletHeightMm);

  const deckH = Math.min(26, Math.max(18, pH * 0.17));
  const runnerH = pH - deckH;
  const stringerThick = Math.min(70, Math.max(42, pL * 0.052));

  const cuboids: Cuboid3D[] = [];

  // 1. Pallet 3 longitudinal stringer legs running along Z (at left, center, right X)
  // This produces the exact 3-leg front-left profile seen in industrial pallet icons (Image 3).
  const stringerXs = [-pL / 2 + stringerThick / 2, 0, pL / 2 - stringerThick / 2];
  for (const sx of stringerXs) {
    cuboids.push({
      x0: sx - stringerThick / 2,
      x1: sx + stringerThick / 2,
      y0: 0,
      y1: runnerH,
      z0: -pW / 2,
      z1: pW / 2,
      category: 'pallet',
    });
  }

  // 2. Pallet top deck planks spanning across X (7 spaced boards along Z)
  const plankCount = 7;
  const plankGap = Math.max(12, pW * 0.022);
  const plankDepth = (pW - plankGap * (plankCount - 1)) / plankCount;
  for (let i = 0; i < plankCount; i++) {
    const z0 = -pW / 2 + i * (plankDepth + plankGap);
    const z1 = z0 + plankDepth;
    cuboids.push({
      x0: -pL / 2,
      x1: pL / 2,
      y0: runnerH,
      y1: pH,
      z0,
      z1,
      category: 'pallet',
    });
  }

  // 3. Stacked carton cuboids from actual Palletizer placements
  const maxLayer = evaluation.layerCount;
  const chevronSegs3D: Seg3D[] = [];

  for (const b of evaluation.placements) {
    const x0 = b.x - b.sizeX / 2;
    const x1 = b.x + b.sizeX / 2;
    const y0 = b.y;
    const y1 = b.y + b.sizeY;
    const z0 = b.z - b.sizeZ / 2;
    const z1 = b.z + b.sizeZ / 2;

    cuboids.push({ x0, x1, y0, y1, z0, z1, category: 'box' });

    // Top-layer directional chevrons drawn cleanly on the top face (+Y)
    if (b.layer === maxLayer) {
      const [pA, pB, pC] = buildChevron2DPoints(b.x, b.z, b.sizeX, b.sizeZ, b.angleDeg);
      const topY = y1 + 0.1;
      chevronSegs3D.push(
        {
          p0: { x: pA.u, y: topY, z: pA.v },
          p1: { x: pB.u, y: topY, z: pB.v },
          group: 'iso-chevrons',
          strokeScale: 0.94,
        },
        {
          p0: { x: pB.u, y: topY, z: pB.v },
          p1: { x: pC.u, y: topY, z: pC.v },
          group: 'iso-chevrons',
          strokeScale: 0.94,
        }
      );
    }
  }

  // Build all front-facing occluder faces + candidate edges
  const occluders: FrontFace2D[] = [];
  const edges: Seg3D[] = [...chevronSegs3D];

  for (const c of cuboids) {
    const faces = buildCuboidFrontFaces(c);
    for (const f of faces) occluders.push(f);
    const cEdges = buildCuboidVisibleEdges(c);
    for (const e of cEdges) edges.push(e);
  }

  // Analytic Hidden-Line Removal (HLR) in world isometric units
  const DEPTH_EPS = 0.65; // mm tolerance so coplanar touching edges & top chevrons never self-occlude
  const visibleIsoRaw: Array<{
    u1: number;
    v1: number;
    u2: number;
    v2: number;
    group: Seg3D['group'];
    strokeScale?: number;
  }> = [];

  for (const edge of edges) {
    const a = projectIso(edge.p0);
    const b = projectIso(edge.p1);
    const du = b.u - a.u;
    const dv = b.v - a.v;
    const dd = b.d - a.d;
    if (Math.hypot(du, dv) < 1e-4) continue;

    const sMinU = Math.min(a.u, b.u);
    const sMaxU = Math.max(a.u, b.u);
    const sMinV = Math.min(a.v, b.v);
    const sMaxV = Math.max(a.v, b.v);
    const sMinD = Math.min(a.d, b.d);

    let intervals: Array<[number, number]> = [[0, 1]];

    for (let i = 0; i < occluders.length; i++) {
      if (intervals.length === 0) break;
      const f = occluders[i];
      // Fast AABB & depth rejection
      if (
        f.maxDepth <= sMinD + DEPTH_EPS ||
        f.maxU < sMinU - 1e-3 ||
        f.minU > sMaxU + 1e-3 ||
        f.maxV < sMinV - 1e-3 ||
        f.minV > sMaxV + 1e-3
      ) {
        continue;
      }

      const occ = computeOccludedInterval(a.u, a.v, a.d, du, dv, dd, f, DEPTH_EPS);
      if (occ) {
        intervals = subtractInterval(intervals, occ[0], occ[1]);
      }
    }

    for (const [t0, t1] of intervals) {
      if (t1 - t0 < 1e-4) continue;
      visibleIsoRaw.push({
        u1: a.u + du * t0,
        v1: a.v + dv * t0,
        u2: a.u + du * t1,
        v2: a.v + dv * t1,
        group: edge.group,
        strokeScale: edge.strokeScale,
      });
    }
  }

  // Fit projected isometric artwork cleanly into target box (mm)
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (const s of visibleIsoRaw) {
    if (s.u1 < minU) minU = s.u1;
    if (s.u1 > maxU) maxU = s.u1;
    if (s.u2 < minU) minU = s.u2;
    if (s.u2 > maxU) maxU = s.u2;
    if (s.v1 < minV) minV = s.v1;
    if (s.v1 > maxV) maxV = s.v1;
    if (s.v2 < minV) minV = s.v2;
    if (s.v2 > maxV) maxV = s.v2;
  }

  if (!Number.isFinite(minU)) {
    return { palletSegments: [], boxSegments: [], chevronSegments: [] };
  }

  const spanU = Math.max(10, maxU - minU);
  const spanV = Math.max(10, maxV - minV);
  const scale = Math.min(targetW / spanU, targetH / spanV);
  const midU = (minU + maxU) / 2;
  const midV = (minV + maxV) / 2;
  const cx = targetX + targetW / 2;
  const cy = targetY + targetH / 2;

  const mapU = (u: number) => cx + (u - midU) * scale;
  const mapV = (v: number) => cy + (v - midV) * scale;

  const palletSegs: VectorSegment[] = [];
  const boxSegs: VectorSegment[] = [];
  const chevronSegs: VectorSegment[] = [];

  for (const s of visibleIsoRaw) {
    const seg: VectorSegment = {
      x1: mapU(s.u1),
      y1: mapV(s.v1),
      x2: mapU(s.u2),
      y2: mapV(s.v2),
      strokeWidthMm: round3(strokeMm * (s.strokeScale ?? (s.group === 'iso-pallet' ? 0.88 : 1.0))),
    };
    if (s.group === 'iso-pallet') palletSegs.push(seg);
    else if (s.group === 'iso-chevrons') chevronSegs.push(seg);
    else boxSegs.push(seg);
  }

  return {
    palletSegments: deduplicateAndMergeSegments(palletSegs, 0.06),
    boxSegments: deduplicateAndMergeSegments(boxSegs, 0.06),
    chevronSegments: chevronSegs,
  };
}

function formatLayerList(layerCount: number, parity: 'odd' | 'even'): string {
  const nums: number[] = [];
  for (let i = 1; i <= layerCount; i++) {
    if (parity === 'odd' && i % 2 === 1) nums.push(i);
    if (parity === 'even' && i % 2 === 0) nums.push(i);
  }
  if (nums.length === 0) return '-';
  if (nums.length <= 5) return nums.join(',');
  return `${nums.slice(0, 3).join(',')}..${nums[nums.length - 1]}`;
}

/**
 * Builds the complete Illustrator-ready Pallet Vector Scene (Top View + Isometric 3D + Max Stacking),
 * strictly transparent (fill: none on all line-art) with optional shipping-mark frames & bilingual text.
 */
export function buildPalletVectorScene(
  pallet: PalletConfig,
  evaluation: PalletPatternEvaluation,
  options: PalletVectorExportOptions
): PalletVectorScene {
  const { includeFramesAndText, includeMaxStackPanel, strokePreset } = options;
  const baseStroke = VECTOR_STROKE_PRESETS[strokePreset].strokeMm;

  const panelSize = 80; // 80 mm x 80 mm standard industrial carton shipping mark panel
  const panelGap = 8;
  const outerPad = 5;
  const panelCount = includeMaxStackPanel ? 3 : 2;

  const artboardWidthMm = outerPad * 2 + panelCount * panelSize + (panelCount - 1) * panelGap;
  const artboardHeightMm = includeFramesAndText ? outerPad * 2 + panelSize : outerPad * 2 + 56;

  const groups: VectorGroup[] = [];
  const layer1Boxes = evaluation.placements.filter((b) => b.layer === 1);
  const layer2Boxes = evaluation.placements.filter((b) => b.layer === 2);
  const hasLayer2 = layer2Boxes.length > 0;

  // Panel X positions
  const p1X = outerPad;
  const p2X = outerPad + panelSize + panelGap;
  const p3X = outerPad + (panelSize + panelGap) * 2;
  const pY = outerPad;

  // -------------------------------------------------------------------------
  // 1. PANEL FRAMES & BILINGUAL SHIPPING MARK TEXT (Optional Toggle)
  // -------------------------------------------------------------------------
  if (includeFramesAndText) {
    const frameRects: VectorRect[] = [];
    const labelTexts: VectorText[] = [];
    const frameStroke = 2.0;

    // Panel 1 Frame: Pallet Pattern
    frameRects.push({
      x: p1X,
      y: pY,
      w: panelSize,
      h: panelSize,
      rx: 1.6,
      stroke: true,
      fill: false,
      strokeWidthMm: frameStroke,
    });

    if (hasLayer2) {
      labelTexts.push(
        { text: 'LAYER', x: p1X + panelSize * 0.27, y: pY + 51.5, fontSizeMm: 4.5, bold: true, align: 'center' },
        { text: formatLayerList(evaluation.layerCount, 'odd'), x: p1X + panelSize * 0.27, y: pY + 57.2, fontSizeMm: 4.5, bold: true, align: 'center' },
        { text: 'LAYER', x: p1X + panelSize * 0.73, y: pY + 51.5, fontSizeMm: 4.5, bold: true, align: 'center' },
        { text: formatLayerList(evaluation.layerCount, 'even'), x: p1X + panelSize * 0.73, y: pY + 57.2, fontSizeMm: 4.5, bold: true, align: 'center' }
      );
    } else {
      labelTexts.push(
        { text: 'LAYER 1', x: p1X + panelSize / 2, y: pY + 55.0, fontSizeMm: 4.8, bold: true, align: 'center' }
      );
    }
    labelTexts.push(
      { text: 'SUSUNAN', x: p1X + panelSize / 2, y: pY + 62.6, fontSizeMm: 3.3, bold: true, align: 'center' },
      { text: 'PER LAYER', x: p1X + panelSize / 2, y: pY + 66.8, fontSizeMm: 3.3, bold: true, align: 'center' },
      { text: 'PALLET PATTERN', x: p1X + panelSize / 2, y: pY + 73.2, fontSizeMm: 4.4, bold: true, align: 'center' }
    );

    // Panel 2 Frame: Isometric Stack / Do Not Place on Floor
    frameRects.push({
      x: p2X,
      y: pY,
      w: panelSize,
      h: panelSize,
      rx: 1.6,
      stroke: true,
      fill: false,
      strokeWidthMm: frameStroke,
    });
    labelTexts.push(
      { text: 'HINDARKAN KONTAK', x: p2X + panelSize / 2, y: pY + 56.8, fontSizeMm: 3.35, bold: true, align: 'center' },
      { text: 'LANGSUNG DENGAN LANTAI', x: p2X + panelSize / 2, y: pY + 61.2, fontSizeMm: 3.35, bold: true, align: 'center' },
      { text: 'DO NOT PLACE DIRECTLY', x: p2X + panelSize / 2, y: pY + 68.2, fontSizeMm: 4.15, bold: true, align: 'center' },
      { text: 'ON THE FLOOR', x: p2X + panelSize / 2, y: pY + 73.4, fontSizeMm: 4.15, bold: true, align: 'center' }
    );

    // Panel 3 Frame: Max Stacking
    if (includeMaxStackPanel) {
      frameRects.push({
        x: p3X,
        y: pY,
        w: panelSize,
        h: panelSize,
        rx: 1.6,
        stroke: true,
        fill: false,
        strokeWidthMm: frameStroke,
      });
      labelTexts.push(
        { text: 'TUMPUKAN MAKSIMUM', x: p3X + panelSize / 2, y: pY + 57.5, fontSizeMm: 3.45, bold: true, align: 'center' },
        {
          text: `${evaluation.layerCount} LAYER PER PALLET`,
          x: p3X + panelSize / 2,
          y: pY + 62.0,
          fontSizeMm: 3.45,
          bold: true,
          align: 'center',
        },
        { text: 'MAXIMUM STACKING', x: p3X + panelSize / 2, y: pY + 70.6, fontSizeMm: 4.35, bold: true, align: 'center' }
      );
    }

    groups.push({ id: 'panel-frames', segments: [], rects: frameRects, texts: [] });
    groups.push({ id: 'panel-labels', segments: [], rects: [], texts: labelTexts });
  }

  // -------------------------------------------------------------------------
  // 2. PANEL 1 CONTENT: TOP VIEW (ODD LAYER 1,3,5 & EVEN LAYER 2,4,6)
  // -------------------------------------------------------------------------
  const topAreaY = includeFramesAndText ? pY + 7.5 : outerPad + 2;
  const topAreaH = includeFramesAndText ? 36.5 : 52;
  const topStroke = round3(baseStroke * 0.72);

  let topSegmentsCount = 0;

  if (hasLayer2) {
    const subGap = 5.5;
    const subPadX = includeFramesAndText ? 5.5 : 2;
    const subW = (panelSize - subPadX * 2 - subGap) / 2;

    const oddTop = buildTopViewLayerVectors(
      layer1Boxes,
      pallet,
      p1X + subPadX,
      topAreaY,
      subW,
      topAreaH,
      topStroke
    );
    const evenTop = buildTopViewLayerVectors(
      layer2Boxes,
      pallet,
      p1X + subPadX + subW + subGap,
      topAreaY,
      subW,
      topAreaH,
      topStroke
    );

    groups.push(
      { id: 'topview-odd-pallet', segments: oddTop.palletSegments, rects: [], texts: [] },
      { id: 'topview-odd-boxes', segments: oddTop.boxSegments, rects: [], texts: [] },
      { id: 'topview-odd-chevrons', segments: oddTop.chevronSegments, rects: [], texts: [] },
      { id: 'topview-even-pallet', segments: evenTop.palletSegments, rects: [], texts: [] },
      { id: 'topview-even-boxes', segments: evenTop.boxSegments, rects: [], texts: [] },
      { id: 'topview-even-chevrons', segments: evenTop.chevronSegments, rects: [], texts: [] }
    );
    topSegmentsCount =
      oddTop.palletSegments.length +
      oddTop.boxSegments.length +
      oddTop.chevronSegments.length +
      evenTop.palletSegments.length +
      evenTop.boxSegments.length +
      evenTop.chevronSegments.length;
  } else {
    const singlePadX = includeFramesAndText ? 14 : 6;
    const oddTop = buildTopViewLayerVectors(
      layer1Boxes,
      pallet,
      p1X + singlePadX,
      topAreaY,
      panelSize - singlePadX * 2,
      topAreaH,
      topStroke
    );
    groups.push(
      { id: 'topview-odd-pallet', segments: oddTop.palletSegments, rects: [], texts: [] },
      { id: 'topview-odd-boxes', segments: oddTop.boxSegments, rects: [], texts: [] },
      { id: 'topview-odd-chevrons', segments: oddTop.chevronSegments, rects: [], texts: [] }
    );
    topSegmentsCount =
      oddTop.palletSegments.length +
      oddTop.boxSegments.length +
      oddTop.chevronSegments.length;
  }

  // -------------------------------------------------------------------------
  // 3. PANEL 2 CONTENT: ISOMETRIC 30° 3D PALLET STACK (TRUE HLR)
  // -------------------------------------------------------------------------
  const isoPadX = includeFramesAndText ? 11 : 4;
  const isoTopY = includeFramesAndText ? pY + 5.5 : outerPad + 1;
  const isoH = includeFramesAndText ? 45.5 : 54;

  const iso = buildIsometricStackVectors(
    evaluation,
    pallet,
    p2X + isoPadX,
    isoTopY,
    panelSize - isoPadX * 2,
    isoH,
    round3(baseStroke * 0.78)
  );

  groups.push(
    { id: 'iso-pallet', segments: iso.palletSegments, rects: [], texts: [] },
    { id: 'iso-boxes', segments: iso.boxSegments, rects: [], texts: [] },
    { id: 'iso-chevrons', segments: iso.chevronSegments, rects: [], texts: [] }
  );

  const isoSegmentsCount =
    iso.palletSegments.length + iso.boxSegments.length + iso.chevronSegments.length;

  // -------------------------------------------------------------------------
  // 4. PANEL 3 CONTENT: MAXIMUM STACKING SYMBOL (Optional Panel)
  // -------------------------------------------------------------------------
  if (includeMaxStackPanel) {
    const symCx = p3X + panelSize / 2;
    const numY = includeFramesAndText ? pY + 29.5 : outerPad + 29.5;
    const barW = 46;
    const barH = 4.6;
    const bar1Y = includeFramesAndText ? pY + 35.5 : outerPad + 35.5;
    const bar2Y = bar1Y + barH + 3.0;

    groups.push({
      id: 'max-stacking-symbol',
      segments: [],
      rects: [
        { x: symCx - barW / 2, y: bar1Y, w: barW, h: barH, rx: 0.4, fill: true, stroke: false },
        { x: symCx - barW / 2, y: bar2Y, w: barW, h: barH, rx: 0.4, fill: true, stroke: false },
      ],
      texts: [
        {
          text: String(evaluation.layerCount),
          x: symCx,
          y: numY,
          fontSizeMm: 27,
          bold: true,
          align: 'center',
        },
      ],
    });
  }

  return {
    artboardWidthMm: round3(artboardWidthMm),
    artboardHeightMm: round3(artboardHeightMm),
    baseStrokeWidthMm: baseStroke,
    groups,
    stats: {
      totalSegments: topSegmentsCount + isoSegmentsCount,
      isoSegments: isoSegmentsCount,
      topSegments: topSegmentsCount,
      layerCount: evaluation.layerCount,
    },
  };
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Serializes PalletVectorScene into an Adobe Illustrator-ready transparent SVG string
 * with mm artboard units, named <g id="..."> layer groups, and pure #000000 vector strokes.
 */
export function serializePalletVectorToSvg(scene: PalletVectorScene): string {
  const { artboardWidthMm: w, artboardHeightMm: h, baseStrokeWidthMm } = scene;
  const lines: string[] = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">`,
    `  <!-- Generated by DieCut.Room Palletizer Pro · Illustrator-Ready Transparent Vector Line-Art -->`,
  ];

  for (const g of scene.groups) {
    if (g.segments.length === 0 && g.rects.length === 0 && g.texts.length === 0) continue;
    lines.push(`  <g id="${escapeXml(g.id)}">`);

    for (const r of g.rects) {
      const fillAttr = r.fill ? '#000000' : 'none';
      const strokeAttr = r.stroke ? '#000000' : 'none';
      const swAttr = r.stroke ? ` stroke-width="${round3(r.strokeWidthMm ?? baseStrokeWidthMm)}"` : '';
      const rxAttr = r.rx ? ` rx="${round3(r.rx)}" ry="${round3(r.rx)}"` : '';
      lines.push(
        `    <rect x="${round3(r.x)}" y="${round3(r.y)}" width="${round3(r.w)}" height="${round3(r.h)}"${rxAttr} fill="${fillAttr}" stroke="${strokeAttr}"${swAttr} stroke-linejoin="round" />`
      );
    }

    for (const s of g.segments) {
      const sw = round3(s.strokeWidthMm ?? baseStrokeWidthMm);
      lines.push(
        `    <line x1="${round3(s.x1)}" y1="${round3(s.y1)}" x2="${round3(s.x2)}" y2="${round3(s.y2)}" fill="none" stroke="#000000" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" />`
      );
    }

    for (const t of g.texts) {
      const anchor = t.align === 'left' ? 'start' : t.align === 'right' ? 'end' : 'middle';
      const weight = t.bold ? 'bold' : 'normal';
      lines.push(
        `    <text x="${round3(t.x)}" y="${round3(t.y)}" fill="#000000" font-family="Helvetica, Arial, sans-serif" font-size="${round3(t.fontSizeMm)}" font-weight="${weight}" text-anchor="${anchor}">${escapeXml(t.text)}</text>`
      );
    }

    lines.push(`  </g>`);
  }

  lines.push(`</svg>`);
  return lines.join('\n');
}

function buildExportBaseFilename(projectOrClientName?: string): string {
  const clean = (projectOrClientName || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42);
  return clean ? `DieCutRoom-PalletVector-${clean}` : `DieCutRoom-PalletVector`;
}

/**
 * Triggers browser download of the Adobe Illustrator-ready transparent SVG file.
 */
export function downloadPalletVectorSvg(
  pallet: PalletConfig,
  evaluation: PalletPatternEvaluation,
  options: PalletVectorExportOptions
): void {
  const scene = buildPalletVectorScene(pallet, evaluation, options);
  const svgStr = serializePalletVectorToSvg(scene);
  const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${buildExportBaseFilename(options.projectOrClientName)}.svg`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/**
 * Exports a 100% Native Vector PDF (zero raster images, zero background fills, exact mm artboard)
 * that opens directly in Adobe Illustrator with editable stroke paths & crisp typography.
 */
export async function exportPalletVectorPdf(
  pallet: PalletConfig,
  evaluation: PalletPatternEvaluation,
  options: PalletVectorExportOptions
): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const scene = buildPalletVectorScene(pallet, evaluation, options);

  const orientation = scene.artboardWidthMm >= scene.artboardHeightMm ? 'landscape' : 'portrait';
  const doc = new jsPDF({
    orientation,
    unit: 'mm',
    format: [scene.artboardWidthMm, scene.artboardHeightMm],
    compress: true,
  });

  doc.setProperties({
    title: 'DieCut.Room — Pallet Shipping Mark Vector (Illustrator-Ready)',
    subject: `Transparent Monochrome Line-Art · ${evaluation.label} (${evaluation.layerCount} layers)`,
    creator: 'DieCut.Room Palletizer Pro',
  });

  // Pure #000000 vector strokes & fills, NO background rectangle (100% transparent page in AI!)
  doc.setDrawColor(0, 0, 0);
  doc.setFillColor(0, 0, 0);
  doc.setTextColor(0, 0, 0);
  doc.setLineCap('round');
  doc.setLineJoin('round');

  const MM_TO_PT = 72 / 25.4;

  for (const g of scene.groups) {
    for (const r of g.rects) {
      const style = r.fill && r.stroke ? 'FD' : r.fill ? 'F' : 'S';
      if (r.stroke) {
        doc.setLineWidth(r.strokeWidthMm ?? scene.baseStrokeWidthMm);
      }
      if (r.rx && r.rx > 0) {
        doc.roundedRect(r.x, r.y, r.w, r.h, r.rx, r.rx, style);
      } else {
        doc.rect(r.x, r.y, r.w, r.h, style);
      }
    }

    for (const s of g.segments) {
      doc.setLineWidth(s.strokeWidthMm ?? scene.baseStrokeWidthMm);
      doc.line(s.x1, s.y1, s.x2, s.y2);
    }

    for (const t of g.texts) {
      doc.setFont('helvetica', t.bold ? 'bold' : 'normal');
      // Convert visual mm cap/em size to PDF pt
      doc.setFontSize(round3(t.fontSizeMm * MM_TO_PT));
      const align = t.align === 'left' ? 'left' : t.align === 'right' ? 'right' : 'center';
      doc.text(t.text, t.x, t.y, { align });
    }
  }

  doc.save(`${buildExportBaseFilename(options.projectOrClientName)}.pdf`);
}
