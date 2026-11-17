import React, { useId, useMemo } from 'react';

/**
 * Lightweight static SVG halftone perimeter frame surrounding the matte login sheet.
 * Uses userSpaceOnUse patterns on 4 edges + 4 corner bridges so circles stay perfectly
 * round at any card width/height with zero ResizeObserver or JS animation overhead.
 */
export function HalftonePerimeterFrame() {
  const uid = useId().replace(/:/g, '');
  const pTop = `ht-top-${uid}`;
  const pBottom = `ht-btm-${uid}`;
  const pLeft = `ht-lft-${uid}`;
  const pRight = `ht-rgt-${uid}`;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none select-none -inset-[16px] sm:-inset-[20px] absolute z-0"
    >
      {/* Top horizontal halftone fade (card top edge -> outward top) */}
      <svg className="absolute top-0 left-[16px] right-[16px] sm:left-[20px] sm:right-[20px] h-[16px] sm:h-[20px] w-[calc(100%-32px)] sm:w-[calc(100%-40px)]">
        <defs>
          <pattern id={pTop} width="24" height="20" patternUnits="userSpaceOnUse">
            {/* Outer sparse row */}
            <circle cx="3" cy="3" r="0.55" fill="rgba(229,231,235,0.18)" />
            <circle cx="15" cy="3.5" r="0.7" fill="rgba(229,231,235,0.22)" />
            {/* Mid transition row */}
            <circle cx="9" cy="8.5" r="1.05" fill="rgba(229,231,235,0.34)" />
            <circle cx="21" cy="8.5" r="0.9" fill="rgba(229,231,235,0.30)" />
            {/* Inner dense row near sheet edge */}
            <circle cx="3" cy="14" r="1.5" fill="rgba(244,245,247,0.52)" />
            <circle cx="15" cy="14" r="1.65" fill="rgba(244,245,247,0.58)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${pTop})`} />
      </svg>

      {/* Bottom horizontal halftone fade (card bottom edge -> outward bottom) */}
      <svg className="absolute bottom-0 left-[16px] right-[16px] sm:left-[20px] sm:right-[20px] h-[16px] sm:h-[20px] w-[calc(100%-32px)] sm:w-[calc(100%-40px)]">
        <defs>
          <pattern id={pBottom} width="24" height="20" patternUnits="userSpaceOnUse">
            <circle cx="3" cy="5.5" r="1.6" fill="rgba(244,245,247,0.56)" />
            <circle cx="15" cy="5.5" r="1.45" fill="rgba(244,245,247,0.50)" />
            <circle cx="9" cy="11" r="1.05" fill="rgba(229,231,235,0.34)" />
            <circle cx="21" cy="11" r="0.95" fill="rgba(229,231,235,0.28)" />
            <circle cx="3" cy="16.5" r="0.65" fill="rgba(229,231,235,0.20)" />
            <circle cx="15" cy="16.5" r="0.55" fill="rgba(229,231,235,0.16)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${pBottom})`} />
      </svg>

      {/* Left vertical halftone fade */}
      <svg className="absolute top-[16px] bottom-[16px] sm:top-[20px] sm:bottom-[20px] left-0 w-[16px] sm:w-[20px] h-[calc(100%-32px)] sm:h-[calc(100%-40px)]">
        <defs>
          <pattern id={pLeft} width="20" height="24" patternUnits="userSpaceOnUse">
            <circle cx="3" cy="4" r="0.55" fill="rgba(229,231,235,0.16)" />
            <circle cx="3.5" cy="16" r="0.7" fill="rgba(229,231,235,0.22)" />
            <circle cx="8.5" cy="10" r="1.05" fill="rgba(229,231,235,0.34)" />
            <circle cx="8.5" cy="22" r="0.9" fill="rgba(229,231,235,0.28)" />
            <circle cx="14" cy="4" r="1.5" fill="rgba(244,245,247,0.52)" />
            <circle cx="14" cy="16" r="1.65" fill="rgba(244,245,247,0.58)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${pLeft})`} />
      </svg>

      {/* Right vertical halftone fade */}
      <svg className="absolute top-[16px] bottom-[16px] sm:top-[20px] sm:bottom-[20px] right-0 w-[16px] sm:w-[20px] h-[calc(100%-32px)] sm:h-[calc(100%-40px)]">
        <defs>
          <pattern id={pRight} width="20" height="24" patternUnits="userSpaceOnUse">
            <circle cx="5.5" cy="4" r="1.65" fill="rgba(244,245,247,0.58)" />
            <circle cx="5.5" cy="16" r="1.45" fill="rgba(244,245,247,0.50)" />
            <circle cx="11" cy="10" r="1.0" fill="rgba(229,231,235,0.32)" />
            <circle cx="11" cy="22" r="0.9" fill="rgba(229,231,235,0.28)" />
            <circle cx="16.5" cy="4" r="0.65" fill="rgba(229,231,235,0.20)" />
            <circle cx="16.5" cy="16" r="0.55" fill="rgba(229,231,235,0.16)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${pRight})`} />
      </svg>

      {/* Four Corner Halftone Bridges aligned to the 6px staggered edge grid */}
      <svg
        width="20"
        height="20"
        viewBox="0 0 20 20"
        className="absolute top-0 left-0 size-[16px] sm:size-[20px] overflow-hidden"
      >
        <circle cx="15" cy="14.5" r="1.5" fill="rgba(244,245,247,0.54)" />
        <circle cx="9" cy="14.5" r="1.15" fill="rgba(229,231,235,0.38)" />
        <circle cx="15" cy="8.5" r="1.15" fill="rgba(229,231,235,0.38)" />
        <circle cx="9" cy="8.5" r="0.85" fill="rgba(229,231,235,0.26)" />
        <circle cx="15" cy="3.5" r="0.6" fill="rgba(229,231,235,0.18)" />
        <circle cx="3.5" cy="14.5" r="0.6" fill="rgba(229,231,235,0.18)" />
      </svg>
      <svg
        width="20"
        height="20"
        viewBox="0 0 20 20"
        className="absolute top-0 right-0 size-[16px] sm:size-[20px] overflow-hidden"
      >
        <circle cx="5" cy="14.5" r="1.5" fill="rgba(244,245,247,0.54)" />
        <circle cx="11" cy="14.5" r="1.15" fill="rgba(229,231,235,0.38)" />
        <circle cx="5" cy="8.5" r="1.15" fill="rgba(229,231,235,0.38)" />
        <circle cx="11" cy="8.5" r="0.85" fill="rgba(229,231,235,0.26)" />
        <circle cx="5" cy="3.5" r="0.6" fill="rgba(229,231,235,0.18)" />
        <circle cx="16.5" cy="14.5" r="0.6" fill="rgba(229,231,235,0.18)" />
      </svg>
      <svg
        width="20"
        height="20"
        viewBox="0 0 20 20"
        className="absolute bottom-0 left-0 size-[16px] sm:size-[20px] overflow-hidden"
      >
        <circle cx="15" cy="5.5" r="1.5" fill="rgba(244,245,247,0.54)" />
        <circle cx="9" cy="5.5" r="1.15" fill="rgba(229,231,235,0.38)" />
        <circle cx="15" cy="11.5" r="1.15" fill="rgba(229,231,235,0.38)" />
        <circle cx="9" cy="11.5" r="0.85" fill="rgba(229,231,235,0.26)" />
        <circle cx="15" cy="16.5" r="0.6" fill="rgba(229,231,235,0.18)" />
        <circle cx="3.5" cy="5.5" r="0.6" fill="rgba(229,231,235,0.18)" />
      </svg>
      <svg
        width="20"
        height="20"
        viewBox="0 0 20 20"
        className="absolute bottom-0 right-0 size-[16px] sm:size-[20px] overflow-hidden"
      >
        <circle cx="5" cy="5.5" r="1.5" fill="rgba(244,245,247,0.54)" />
        <circle cx="11" cy="5.5" r="1.15" fill="rgba(229,231,235,0.38)" />
        <circle cx="5" cy="11.5" r="1.15" fill="rgba(229,231,235,0.38)" />
        <circle cx="11" cy="11.5" r="0.85" fill="rgba(229,231,235,0.26)" />
        <circle cx="5" cy="16.5" r="0.6" fill="rgba(229,231,235,0.18)" />
        <circle cx="16.5" cy="5.5" r="0.6" fill="rgba(229,231,235,0.18)" />
      </svg>
    </div>
  );
}

interface HalftoneDot {
  x: number;
  y: number;
  r: number;
  o: number;
}

/**
 * Static staggered 45-degree halftone raster accent anchored in the top-right corner
 * of the offset-print matte white form sheet.
 */
export function TopRightSheetHalftone() {
  const dots = useMemo<HalftoneDot[]>(() => {
    const W = 228;
    const H = 136;
    const pitchX = 6.5;
    const pitchY = 6.5;
    const out: HalftoneDot[] = [];

    const rows = Math.ceil(H / pitchY);
    const cols = Math.ceil(W / pitchX);

    for (let row = 0; row <= rows; row++) {
      const y = row * pitchY + 3;
      const offsetX = row % 2 === 1 ? pitchX * 0.5 : 0;

      for (let col = 0; col <= cols; col++) {
        const x = col * pitchX + offsetX + 2;
        if (x > W - 1 || y > H - 1) continue;

        // Normalized distance from top-right anchor (x = W, y = 0)
        const dx = (W - x) / W;
        const dy = y / H;
        const dist = Math.hypot(dx * 0.92, dy * 1.18);
        if (dist >= 1.0) continue;

        // Deterministic micro-variation for authentic offset raster breakup
        const hash = Math.sin(row * 17.3 + col * 31.7) * 43758.5453;
        const jitter = (hash - Math.floor(hash) - 0.5) * 0.14;

        const falloff = Math.pow(1 - dist, 1.5) + jitter * (1 - dist * 0.4);
        if (falloff <= 0.08) continue;

        const r = Math.max(0.45, Math.min(2.15, falloff * 2.2));
        const o = Math.max(0.035, Math.min(0.2, falloff * 0.21));
        out.push({
          x: Number(x.toFixed(1)),
          y: Number(y.toFixed(1)),
          r: Number(r.toFixed(2)),
          o: Number(o.toFixed(3)),
        });
      }
    }
    return out;
  }, []);

  return (
    <svg
      aria-hidden="true"
      width={228}
      height={136}
      viewBox="0 0 228 136"
      className="pointer-events-none select-none absolute top-0 right-0 z-0"
    >
      {dots.map((d, idx) => (
        <circle
          key={idx}
          cx={d.x}
          cy={d.y}
          r={d.r}
          fill="#17191f"
          fillOpacity={d.o}
        />
      ))}
    </svg>
  );
}
