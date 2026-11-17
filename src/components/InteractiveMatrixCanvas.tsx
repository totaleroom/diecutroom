import React, { useEffect, useRef } from 'react';
import { getEngineProfile } from '../utils/browserEngine';

interface CellState {
  ox: number;
  oy: number;
  vx: number;
  vy: number;
  seed: number;
}

interface RippleWave {
  x: number;
  y: number;
  startTime: number;
  strength: number;
}

interface ProjectedEdge {
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

interface FormSample {
  val: number;
  shape: number;
  pink: number;
}

const SHAPE_DOT = 0;
const SHAPE_SOLID = 1;
const SHAPE_HOLLOW = 2;
const SHAPE_PLUS = 3;
const SHAPE_DIAMOND = 4;
const SHAPE_DASH = 5;

const MONO_LEVELS = 36;
const PINK_LEVELS = 20;

const MONO_LUT: string[] = Array.from({ length: MONO_LEVELS }, (_, i) => {
  const norm = i / (MONO_LEVELS - 1);
  const shade = Math.round(30 + Math.pow(norm, 1.08) * 214);
  const alpha = Math.min(1, 0.2 + norm * 0.78);
  return `rgba(${shade}, ${shade + 2}, ${Math.min(255, shade + 6)}, ${alpha.toFixed(3)})`;
});

// Poster-inspired magenta-pink accent palette (#FF1468 -> #FF5E96 highlights)
const PINK_LUT: string[] = Array.from({ length: PINK_LEVELS }, (_, i) => {
  const norm = i / (PINK_LEVELS - 1);
  const r = Math.round(218 + norm * 37);
  const g = Math.round(18 + norm * 78);
  const b = Math.round(92 + norm * 58);
  const alpha = Math.min(1, 0.36 + norm * 0.62);
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
});

const BAYER_4X4 = [
  [0.0625, 0.5625, 0.1875, 0.6875],
  [0.8125, 0.3125, 0.9375, 0.4375],
  [0.25, 0.75, 0.125, 0.625],
  [0.98, 0.49, 0.875, 0.375],
];

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function hash2D(ix: number, iy: number): number {
  const n = Math.sin(ix * 127.1 + iy * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function distToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-4) return Math.hypot(px - ax, py - ay);
  const t = clamp01(((px - ax) * dx + (py - ay) * dy) / lenSq);
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function buildProjectedBoxEdges(
  cx: number,
  cy: number,
  scale: number,
  t: number
): ProjectedEdge[] {
  const yaw = t * 0.32 + 0.58;
  const pitch = 0.46 + Math.sin(t * 0.38) * 0.1;
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const cosP = Math.cos(pitch);
  const sinP = Math.sin(pitch);

  const proj = (x: number, y: number, z: number): [number, number] => {
    const rx = x * cosY - z * sinY;
    const rz = x * sinY + z * cosY;
    const ry = y * cosP - rz * sinP;
    const pz = y * sinP + rz * cosP;
    const persp = 4.2 / (4.2 - pz * 0.45);
    return [cx + rx * scale * persp, cy - ry * scale * persp];
  };

  const hx = 1.05;
  const hy = 0.72;
  const hz = 0.74;

  const corners: Array<[number, number, number]> = [
    [-hx, -hy, -hz],
    [hx, -hy, -hz],
    [hx, -hy, hz],
    [-hx, -hy, hz],
    [-hx, hy, -hz],
    [hx, hy, -hz],
    [hx, hy, hz],
    [-hx, hy, hz],
  ];

  const pCorners = corners.map(([x, y, z]) => proj(x, y, z));
  const rawEdges: Array<[number, number]> = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];

  const edges: ProjectedEdge[] = rawEdges.map(([i, j]) => ({
    ax: pCorners[i][0],
    ay: pCorners[i][1],
    bx: pCorners[j][0],
    by: pCorners[j][1],
  }));

  const flapAngle = 0.55 + Math.sin(t * 0.85) * 0.38;
  const flapLen = 0.62;
  const fCos = Math.cos(flapAngle);
  const fSin = Math.sin(flapAngle);

  const f1a = proj(-hx, hy + flapLen * fSin, hz + flapLen * fCos * 0.45);
  const f1b = proj(hx, hy + flapLen * fSin, hz + flapLen * fCos * 0.45);
  edges.push(
    { ax: pCorners[7][0], ay: pCorners[7][1], bx: f1a[0], by: f1a[1] },
    { ax: pCorners[6][0], ay: pCorners[6][1], bx: f1b[0], by: f1b[1] },
    { ax: f1a[0], ay: f1a[1], bx: f1b[0], by: f1b[1] }
  );

  const f2a = proj(-hx, hy + flapLen * fSin, -hz - flapLen * fCos * 0.45);
  const f2b = proj(hx, hy + flapLen * fSin, -hz - flapLen * fCos * 0.45);
  edges.push(
    { ax: pCorners[4][0], ay: pCorners[4][1], bx: f2a[0], by: f2a[1] },
    { ax: pCorners[5][0], ay: pCorners[5][1], bx: f2b[0], by: f2b[1] },
    { ax: f2a[0], ay: f2a[1], bx: f2b[0], by: f2b[1] }
  );

  const cTop = proj(0, hy, 0);
  const cBot = proj(0, -hy, 0);
  edges.push({ ax: cTop[0], ay: cTop[1], bx: cBot[0], by: cBot[1] });

  return edges;
}

/** Subtle dispersed pink selector across sparse clusters & spark cells (~6-11% total). */
function computeSubtlePinkAccent(
  nx: number,
  ny: number,
  col: number,
  row: number,
  t: number,
  seed: number,
  density: number
): number {
  const bx = Math.floor(col / 3);
  const by = Math.floor(row / 3);
  const driftPhase = Math.floor(t * 0.16);
  const clusterGate = hash2D(bx + driftPhase * 0.37, by - driftPhase * 0.23);

  const waveField =
    0.5 +
    0.5 *
      Math.sin(nx * 6.5 - t * 0.45 + Math.cos(ny * 5.2 + t * 0.3)) *
      Math.cos(ny * 4.8 + nx * 3.1);

  const bayer = BAYER_4X4[row & 3][col & 3];

  // Scattered organic pixel islands (~7%) + crisp isolated sparks (~3%)
  const inSmallCluster =
    clusterGate > 0.84 && waveField > 0.42 && density > 0.24 && (bayer > 0.42 || seed > 0.68);
  const isLoneSpark =
    seed > 0.91 && density > 0.48 && Math.sin(t * 1.1 + seed * 19.0) > 0.25;

  if (inSmallCluster) return clamp01(0.45 + density * 0.55);
  if (isLoneSpark) return clamp01(0.35 + density * 0.45);
  return 0;
}

function sampleFormHalftone(
  nx: number,
  ny: number,
  col: number,
  row: number,
  t: number,
  seed: number
): FormSample {
  const drift = t * 0.24;
  const band1 =
    nx > 0.28 &&
    nx < 0.94 &&
    ny > 0.12 &&
    ny < 0.34 &&
    (nx < 0.62 ? 1.0 - (0.62 - nx) * 2.0 : 1.0 - (nx - 0.68) * 1.35);
  const band2 =
    nx > 0.34 &&
    nx < 0.91 &&
    ny > 0.36 &&
    ny < 0.65 &&
    1.0 - Math.abs(nx - (0.64 + Math.sin(drift) * 0.06)) * 2.5;
  const band3 =
    nx > 0.4 &&
    nx < 0.95 &&
    ny > 0.66 &&
    ny < 0.89 &&
    1.0 - Math.abs(ny - 0.77) * 5.4;

  const stripIdx = Math.floor(nx * 16);
  const stripPhase = hash2D(stripIdx, 19);
  const inStrip =
    nx > 0.34 &&
    ny > 0.16 &&
    ny < 0.88 &&
    col % 8 < 5 &&
    Math.sin(t * 0.7 + stripPhase * 6.28) > 0.02;

  const base = Math.max(
    band1 ? Number(band1) : 0,
    band2 ? Number(band2) : 0,
    band3 ? Number(band3) : 0,
    inStrip ? 0.58 : 0
  );

  const wave = 0.24 * Math.sin(nx * 9.5 - t * 1.1) + 0.18 * Math.cos(ny * 11.5 + t * 0.8);
  const density = clamp01(base * 0.92 + wave * 0.34);
  const threshold = 0.2 + seed * 0.48;
  const val = smoothstep(threshold - 0.16, threshold + 0.16, density);

  let shape = SHAPE_DOT;
  if ((col + row * 2) % 7 === 0 && val > 0.28) {
    shape = SHAPE_PLUS;
  } else if ((col * 3 + row) % 9 === 0 && val > 0.32) {
    shape = SHAPE_HOLLOW;
  } else if ((col + row) % 6 === 0 && val > 0.55) {
    shape = SHAPE_DIAMOND;
  } else if (val > 0.74 && seed > 0.58) {
    shape = SHAPE_SOLID;
  }

  const pink = computeSubtlePinkAccent(nx, ny, col, row, t, seed, val);
  return { val, shape, pink };
}

function sampleFormTopoDash(
  nx: number,
  ny: number,
  col: number,
  row: number,
  t: number,
  seed: number
): FormSample {
  const x = (nx - 0.62) * 3.8;
  const y = (ny - 0.5) * 3.4;
  const f1 = Math.sin(x * 2.4 + t * 0.65) * Math.cos(y * 2.1 - t * 0.45);
  const f2 = Math.sin(Math.hypot(x * 1.1, y * 1.3) * 3.6 - t * 0.9);
  const f3 = Math.cos((x - y) * 3.1 + t * 0.5);
  const ridge = (f1 + f2 * 0.75 + f3 * 0.45) / 2.2;

  const isCluster = ridge > 0.05;
  const isDash = !isCluster && ridge > -0.38 && ((row + col) % 2 === 0 || row % 2 === 1);

  if (isCluster) {
    const val = smoothstep(0.04, 0.52, ridge) * 0.96;
    let shape = SHAPE_DIAMOND;
    if (ridge < 0.22) {
      shape = (col + row) % 3 === 0 ? SHAPE_HOLLOW : SHAPE_DOT;
    } else if ((col + row) % 5 === 0) {
      shape = SHAPE_PLUS;
    } else if (ridge > 0.36 && seed > 0.5) {
      shape = SHAPE_SOLID;
    }
    const pink = computeSubtlePinkAccent(nx, ny, col, row, t, seed, val);
    return { val, shape, pink };
  }

  if (isDash) {
    const val = 0.42 + smoothstep(-0.38, 0.05, ridge) * 0.3;
    const shape = (col + row * 2) % 7 === 0 ? SHAPE_PLUS : SHAPE_DASH;
    const pink = computeSubtlePinkAccent(nx, ny, col, row, t, seed, val * 0.65);
    return { val, shape, pink };
  }

  return {
    val: 0.14,
    shape: (col + row) % 5 === 0 ? SHAPE_PLUS : SHAPE_DOT,
    pink: 0,
  };
}

function sampleFormDitherGrid(
  nx: number,
  ny: number,
  col: number,
  row: number,
  t: number,
  seed: number
): FormSample {
  const waveGrad =
    clamp01(1.12 - ny * 1.02 + Math.sin(nx * 5.2 + t * 0.85) * 0.22) * 0.8;
  const blockX = Math.floor(col / 4);
  const blockY = Math.floor(row / 4);
  const blockRand = hash2D(blockX, blockY + Math.floor(t * 0.24));
  const blockZone =
    ny > 0.46 && blockRand > 0.5
      ? (col + row) % 2 === 0 || blockRand > 0.74
        ? 0.96
        : 0.2
      : 0;

  const bayer = BAYER_4X4[row & 3][col & 3];
  const combined = Math.max(waveGrad, blockZone * 0.9);
  const lit = combined > bayer ? clamp01((combined - bayer) * 2.2 + 0.45) : 0.16;

  // Rich geometric bitmap poster mix: solid pixels, hollow squares, plus, diamonds, dots
  const mixHash = (col * 5 + row * 3) % 12;
  let shape = SHAPE_SOLID;
  if (lit < 0.28) {
    shape = mixHash % 3 === 0 ? SHAPE_PLUS : SHAPE_DOT;
  } else if (mixHash === 2 || mixHash === 7) {
    shape = SHAPE_HOLLOW;
  } else if (mixHash === 4) {
    shape = SHAPE_DIAMOND;
  } else if (mixHash === 9) {
    shape = SHAPE_PLUS;
  } else if (lit < 0.5 && seed < 0.35) {
    shape = SHAPE_DOT;
  }

  // Dispersed poster-style pink pixel clusters
  const pinkClusterHash = hash2D(Math.floor(col / 3), Math.floor(row / 3) + Math.floor(t * 0.18));
  const pinkBit =
    pinkClusterHash > 0.87 && lit > 0.42 && bayer > 0.24
      ? clamp01(0.55 + lit * 0.45)
      : computeSubtlePinkAccent(nx, ny, col, row, t, seed, lit);

  if (pinkBit > 0.45 && shape === SHAPE_DOT) {
    shape = SHAPE_SOLID;
  }

  return { val: lit, shape, pink: pinkBit };
}

function sampleFormIsoBox(
  px: number,
  py: number,
  nx: number,
  ny: number,
  edges: ProjectedEdge[],
  col: number,
  row: number,
  t: number,
  seed: number
): FormSample {
  let minDist = 1e6;
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    const d = distToSegment(px, py, e.ax, e.ay, e.bx, e.by);
    if (d < minDist) minDist = d;
  }

  const edgeGlow = Math.exp(-(minDist * minDist) / (2 * 21 * 21));
  const coreField =
    0.28 * (0.5 + 0.5 * Math.sin(nx * 14 - t * 1.1) * Math.cos(ny * 12 + t * 0.8));
  const checker = (col + row) % 2 === 0 ? 1 : 0.68;
  const val = clamp01(edgeGlow * 1.18 + coreField * checker);

  let shape = SHAPE_DOT;
  if (edgeGlow > 0.58) {
    shape = (col + row) % 4 === 0 ? SHAPE_DIAMOND : SHAPE_SOLID;
  } else if (edgeGlow > 0.28) {
    shape = (col + row) % 3 === 0 ? SHAPE_HOLLOW : SHAPE_PLUS;
  } else if ((col + row) % 6 === 0) {
    shape = SHAPE_PLUS;
  }

  const pinkOnCrease =
    edgeGlow > 0.66 && hash2D(col, row) > 0.72
      ? clamp01(edgeGlow * 0.9)
      : computeSubtlePinkAccent(nx, ny, col, row, t, seed, val * 0.7);

  return { val, shape, pink: pinkOnCrease };
}

export default function InteractiveMatrixCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const profile = getEngineProfile();
    const prefersReduced = profile.prefersReducedMotion;

    const SPACING = profile.matrixSpacing;
    const sizeScale = SPACING / 15.5;
    const CYCLE_PER_FORM_SEC = 5.4;
    let width = window.innerWidth;
    let height = window.innerHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, profile.matrixMaxDpr);
    let cols = 0;
    let rows = 0;
    let cells: CellState[] = [];

    const pointer = {
      x: -9999,
      y: -9999,
      prevX: -9999,
      prevY: -9999,
      vx: 0,
      vy: 0,
      active: false,
    };

    const ripples: RippleWave[] = [];

    const rebuildGrid = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, profile.matrixMaxDpr);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      cols = Math.ceil(width / SPACING) + 2;
      rows = Math.ceil(height / SPACING) + 2;
      cells = new Array(cols * rows);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          cells[r * cols + c] = {
            ox: 0,
            oy: 0,
            vx: 0,
            vy: 0,
            seed: hash2D(c, r),
          };
        }
      }
    };

    rebuildGrid();

    const updatePointerCoords = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      if (!pointer.active || pointer.prevX < -5000) {
        pointer.prevX = x;
        pointer.prevY = y;
      }
      pointer.x = x;
      pointer.y = y;
      pointer.active = true;
    };

    const onResize = () => rebuildGrid();
    const onPointerMove = (e: PointerEvent) => updatePointerCoords(e.clientX, e.clientY);
    const onMouseMove = (e: MouseEvent) => updatePointerCoords(e.clientX, e.clientY);
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        updatePointerCoords(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    const onPointerLeave = () => {
      pointer.active = false;
      pointer.vx = 0;
      pointer.vy = 0;
      pointer.prevX = -9999;
      pointer.prevY = -9999;
    };

    const onDocumentMouseLeave = (e: MouseEvent) => {
      if (!e.relatedTarget) onPointerLeave();
    };

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && target.closest('form, button, a, input')) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      updatePointerCoords(e.clientX, e.clientY);
      ripples.push({
        x,
        y,
        startTime: performance.now(),
        strength: 1,
      });
      if (ripples.length > 5) ripples.shift();
    };

    window.addEventListener('resize', onResize);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('mousemove', onMouseMove, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('blur', onPointerLeave);
    document.addEventListener('mouseleave', onDocumentMouseLeave);

    let rafId = 0;
    const motionScale = prefersReduced ? 0.5 : 1.0;

    const renderFrame = (now: number) => {
      const t = now * 0.001 * motionScale;

      if (pointer.active && pointer.prevX > -5000) {
        const instantVx = pointer.x - pointer.prevX;
        const instantVy = pointer.y - pointer.prevY;
        pointer.vx = pointer.vx * 0.45 + instantVx * 0.55;
        pointer.vy = pointer.vy * 0.45 + instantVy * 0.55;
        pointer.prevX = pointer.x;
        pointer.prevY = pointer.y;
      } else {
        pointer.vx *= 0.7;
        pointer.vy *= 0.7;
      }

      const rawPhase = ((now * 0.001 * motionScale) / CYCLE_PER_FORM_SEC) % 4;
      const fromForm = Math.floor(rawPhase);
      const toForm = (fromForm + 1) % 4;
      const localFrac = rawPhase - fromForm;
      const morphMix = smoothstep(0.52, 1.0, localFrac);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#090A0D';
      ctx.fillRect(0, 0, width, height);

      const isDesktop = width >= 1024;
      const focalX = isDesktop ? width * 0.65 : width * 0.5;
      const focalY = height * 0.48;
      const bgGrad = ctx.createRadialGradient(
        focalX,
        focalY,
        40,
        focalX,
        focalY,
        Math.max(width, height) * 0.75
      );
      bgGrad.addColorStop(0, 'rgba(62, 66, 78, 0.28)');
      bgGrad.addColorStop(0.5, 'rgba(28, 30, 38, 0.15)');
      bgGrad.addColorStop(1, 'rgba(9, 10, 13, 0)');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      if (pointer.active) {
        const cursorGrad = ctx.createRadialGradient(
          pointer.x,
          pointer.y,
          4,
          pointer.x,
          pointer.y,
          210
        );
        cursorGrad.addColorStop(0, 'rgba(255, 48, 128, 0.055)');
        cursorGrad.addColorStop(0.35, 'rgba(218, 224, 236, 0.09)');
        cursorGrad.addColorStop(0.65, 'rgba(130, 138, 154, 0.04)');
        cursorGrad.addColorStop(1, 'rgba(9, 10, 13, 0)');
        ctx.fillStyle = cursorGrad;
        ctx.fillRect(0, 0, width, height);
      }

      const needsBox = fromForm === 3 || (morphMix > 0 && toForm === 3);
      const boxEdges = needsBox
        ? buildProjectedBoxEdges(
            focalX,
            focalY,
            Math.min(width * 0.24, height * 0.34, 260),
            t
          )
        : [];

      for (let i = ripples.length - 1; i >= 0; i--) {
        if (now - ripples[i].startTime > 1800) ripples.splice(i, 1);
      }

      const pushRadius = 190;
      const pushRadiusSq = pushRadius * pushRadius;
      const stiffness = 0.082;
      const damping = 0.81;
      const maxOffset = 48;

      const sampleForm = (
        formId: number,
        px: number,
        py: number,
        nx: number,
        ny: number,
        c: number,
        r: number,
        seed: number
      ): FormSample => {
        if (formId === 0) return sampleFormHalftone(nx, ny, c, r, t, seed);
        if (formId === 1) return sampleFormTopoDash(nx, ny, c, r, t, seed);
        if (formId === 2) return sampleFormDitherGrid(nx, ny, c, r, t, seed);
        return sampleFormIsoBox(px, py, nx, ny, boxEdges, c, r, t, seed);
      };

      const startX = -SPACING * 0.5;
      const startY = -SPACING * 0.5;
      let lastFillStyle = '';

      for (let r = 0; r < rows; r++) {
        const baseY = startY + r * SPACING;
        const ny = baseY / Math.max(1, height);

        const vEdge = Math.min(ny / 0.12, (1 - ny) / 0.12, 1);
        const vMask = smoothstep(0, 1, vEdge);

        for (let c = 0; c < cols; c++) {
          const idx = r * cols + c;
          const cell = cells[idx];
          const baseX = startX + c * SPACING;
          const nx = baseX / Math.max(1, width);

          const hEdge = Math.min(nx / 0.08, (1 - nx) / 0.08, 1);
          const hMask = smoothstep(0, 1, hEdge);

          const showcaseDist = Math.hypot(
            (baseX - focalX) / (width * 0.74),
            (baseY - focalY) / (height * 0.74)
          );
          const vignette = clamp01(1.16 - showcaseDist * 0.58) * (0.32 + 0.68 * vMask * hMask);

          // Keep zone behind the left login sheet calm so form contrast stays crystal-clear
          let cardCalmMask = 1.0;
          if (isDesktop && nx < 0.37 && ny > 0.12 && ny < 0.88) {
            const dxCard = smoothstep(0.24, 0.37, nx);
            cardCalmMask = 0.42 + 0.58 * dxCard;
          }

          let cursorBoost = 0;
          let ripplePinkBoost = 0;

          if (pointer.active) {
            const curX = baseX + cell.ox;
            const curY = baseY + cell.oy;
            const dx = curX - pointer.x;
            const dy = curY - pointer.y;
            const distSq = dx * dx + dy * dy;
            if (distSq < pushRadiusSq) {
              const dist = Math.max(6, Math.sqrt(distSq));
              const falloff = 1 - dist / pushRadius;
              const smoothPush = falloff * falloff;
              const invD = 1 / dist;
              const speedMag = Math.min(22, Math.hypot(pointer.vx, pointer.vy));
              const force = smoothPush * (4.6 + speedMag * 0.28);
              cell.vx += dx * invD * force + pointer.vx * smoothPush * 0.18;
              cell.vy += dy * invD * force + pointer.vy * smoothPush * 0.18;
              cursorBoost = smoothPush;
              if (cell.seed > 0.76) {
                ripplePinkBoost = Math.max(ripplePinkBoost, smoothPush * 0.75);
              }
            }
          }

          if (ripples.length > 0) {
            for (let ri = 0; ri < ripples.length; ri++) {
              const rip = ripples[ri];
              const ageSec = (now - rip.startTime) * 0.001;
              const radiusNow = ageSec * 460;
              const dx = baseX - rip.x;
              const dy = baseY - rip.y;
              const dist = Math.hypot(dx, dy);
              const ringDist = Math.abs(dist - radiusNow);
              if (ringDist < 60 && dist > 1) {
                const ringFactor = (1 - ringDist / 60) * Math.max(0, 1 - ageSec / 1.8);
                cell.vx += (dx / dist) * ringFactor * 2.7;
                cell.vy += (dy / dist) * ringFactor * 2.7;
                cursorBoost = Math.max(cursorBoost, ringFactor * 0.9);
                if (cell.seed > 0.55) {
                  ripplePinkBoost = Math.max(ripplePinkBoost, ringFactor * 0.95);
                }
              }
            }
          }

          cell.vx = (cell.vx - cell.ox * stiffness) * damping;
          cell.vy = (cell.vy - cell.oy * stiffness) * damping;
          cell.ox += cell.vx;
          cell.oy += cell.vy;
          const mag = Math.hypot(cell.ox, cell.oy);
          if (mag > maxOffset) {
            const s = maxOffset / mag;
            cell.ox *= s;
            cell.oy *= s;
          }

          const drawX = baseX + cell.ox;
          const drawY = baseY + cell.oy;

          const sA = sampleForm(fromForm, drawX, drawY, nx, ny, c, r, cell.seed);
          let val = sA.val;
          let shape = sA.shape;
          let pink = sA.pink;

          if (morphMix > 0) {
            const sB = sampleForm(toForm, drawX, drawY, nx, ny, c, r, cell.seed);
            val = sA.val * (1 - morphMix) + sB.val * morphMix;
            pink = sA.pink * (1 - morphMix) + sB.pink * morphMix;
            if (morphMix > cell.seed) shape = sB.shape;
          }

          const micro =
            0.045 * Math.sin(t * 1.35 + c * 0.45 + r * 0.35 + cell.seed * 6.28);
          const ambientFloor = 0.13;
          const lumNorm = clamp01(
            Math.max(val + micro, ambientFloor) * vignette * cardCalmMask + cursorBoost * 0.65
          );
          if (lumNorm < 0.035) continue;

          const pinkAmount = clamp01(pink * cardCalmMask + ripplePinkBoost * 0.85);
          const nextFillStyle =
            pinkAmount > 0.34
              ? PINK_LUT[Math.min(PINK_LEVELS - 1, Math.round(lumNorm * (PINK_LEVELS - 1)))]
              : MONO_LUT[Math.min(MONO_LEVELS - 1, Math.round(lumNorm * (MONO_LEVELS - 1)))];

          if (nextFillStyle !== lastFillStyle) {
            ctx.fillStyle = nextFillStyle;
            lastFillStyle = nextFillStyle;
          }

          if (shape === SHAPE_DASH) {
            const wBar = (4.4 + lumNorm * 6.4 + cursorBoost * 1.3) * sizeScale;
            const hBar = Math.max(1.25, (1.55 + lumNorm * 1.0) * sizeScale);
            ctx.fillRect(drawX - wBar * 0.5, drawY - hBar * 0.5, wBar, hBar);
          } else if (shape === SHAPE_SOLID) {
            const size = (2.1 + lumNorm * 5.2 + cursorBoost * 1.8) * sizeScale;
            ctx.fillRect(drawX - size * 0.5, drawY - size * 0.5, size, size);
          } else if (shape === SHAPE_HOLLOW) {
            const size = (3.4 + lumNorm * 4.8 + cursorBoost * 1.6) * sizeScale;
            const stroke = Math.max(1.0, size * 0.24);
            const half = size * 0.5;
            const left = drawX - half;
            const top = drawY - half;
            ctx.fillRect(left, top, size, stroke);
            ctx.fillRect(left, top + size - stroke, size, stroke);
            ctx.fillRect(left, top + stroke, stroke, size - stroke * 2);
            ctx.fillRect(left + size - stroke, top + stroke, stroke, size - stroke * 2);
          } else if (shape === SHAPE_PLUS) {
            const arm = (3.6 + lumNorm * 4.6 + cursorBoost * 1.6) * sizeScale;
            const thick = Math.max(1.0, (1.2 + lumNorm * 0.65) * sizeScale);
            ctx.fillRect(drawX - arm * 0.5, drawY - thick * 0.5, arm, thick);
            ctx.fillRect(drawX - thick * 0.5, drawY - arm * 0.5, thick, arm);
          } else if (shape === SHAPE_DIAMOND) {
            const rDia = (1.9 + lumNorm * 3.2 + cursorBoost * 1.4) * sizeScale;
            ctx.beginPath();
            ctx.moveTo(drawX, drawY - rDia);
            ctx.lineTo(drawX + rDia, drawY);
            ctx.lineTo(drawX, drawY + rDia);
            ctx.lineTo(drawX - rDia, drawY);
            ctx.closePath();
            ctx.fill();
          } else {
            const radius = (1.15 + lumNorm * 2.85 + cursorBoost * 1.25) * sizeScale;
            ctx.beginPath();
            ctx.arc(drawX, drawY, radius, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      rafId = window.requestAnimationFrame(renderFrame);
    };

    rafId = window.requestAnimationFrame(renderFrame);

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('blur', onPointerLeave);
      document.removeEventListener('mouseleave', onDocumentMouseLeave);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 w-full h-full pointer-events-none select-none"
    />
  );
}
