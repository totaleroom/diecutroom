import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import {
  Download,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Layers,
  RotateCcw,
  ChevronDown,
} from 'lucide-react';
import JsBarcode from 'jsbarcode';
import {
  DielinePaths,
  BoxConfig,
  LayerVisibility,
  ExportMode,
  BOX_STYLES,
} from '../types';
import { formatValue } from '../utils/units';
import {
  TactileButton,
  TactileCheckbox,
  TactileSegmented,
} from './tactile/TactileUI';

interface BoxPreviewProps {
  paths: DielinePaths;
  config: BoxConfig;
  layers: LayerVisibility;
  onToggleLayer: (layer: keyof LayerVisibility) => void;
  exportMode: ExportMode;
  onChangeExportMode: (mode: ExportMode) => void;
  hasMobileFloatingDock?: boolean;
  focusMode?: boolean;
}

interface FlattenedBarcode {
  markup: string;
  origW: number;
  origH: number;
}

function truncateText(text: string, maxLen: number): string {
  if (!text) return '-';
  return text.length > maxLen ? `${text.slice(0, maxLen - 3)}...` : text;
}

function wrapLines(text: string, lineLen: number, maxLines: number): string[] {
  if (!text.trim()) return ['-'];
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if ((current + ' ' + word).trim().length <= lineLen) {
      current = (current + ' ' + word).trim();
    } else {
      if (current) lines.push(current);
      current = word.length > lineLen ? word.slice(0, lineLen - 3) + '...' : word;
      if (lines.length === maxLines) break;
    }
  }
  if (current && lines.length < maxLines) {
    lines.push(current);
  }
  return lines.slice(0, maxLines);
}

export default function BoxPreview({
  paths,
  config,
  layers,
  onToggleLayer,
  exportMode,
  onChangeExportMode,
  hasMobileFloatingDock = false,
  focusMode = false,
}: BoxPreviewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  // 2D CAD Interactive Pan & Zoom
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  // Flatten JsBarcode bars into pure SVG <g> primitives (bearer bars, 10X quiet zones, & HRI rendered cleanly in mm)
  const flattenedBarcode = useMemo<FlattenedBarcode | null>(() => {
    if (!paths.barcodeBox) return null;
    try {
      const tempSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      const opts = {
        width: 2,
        height: 100,
        displayValue: false,
        margin: 0,
        background: '',
        lineColor: '#000000',
      };
      try {
        JsBarcode(tempSvg, paths.barcodeBox.text, { format: 'ITF14', ...opts });
      } catch {
        JsBarcode(tempSvg, paths.barcodeBox.text, { format: 'CODE128', ...opts });
      }
      const origW = parseFloat(tempSvg.getAttribute('width') || '200');
      const origH = parseFloat(tempSvg.getAttribute('height') || '100');
      return {
        markup: tempSvg.innerHTML,
        origW: Number.isFinite(origW) && origW > 0 ? origW : 200,
        origH: Number.isFinite(origH) && origH > 0 ? origH : 100,
      };
    } catch {
      return null;
    }
  }, [paths.barcodeBox]);

  // Exact union viewport calculation (guarantees 0 clipping on Legend/Title Block)
  const margin = 20;
  const tbGap = 16;
  const titleBlockWidth = 760;
  const titleBlockHeight = 132;

  const computeViewportMetrics = useCallback(
    (includeDims: boolean, includeTitleBlock: boolean) => {
      const bounds = includeDims ? paths.boundingBox : paths.dielineBounds;
      const contentW = bounds.maxX - bounds.minX;
      const minCanvasW = includeTitleBlock ? Math.max(contentW, titleBlockWidth) : contentW;
      const viewBoxW = minCanvasW + margin * 2;
      const viewBoxMinX = bounds.minX - margin - (minCanvasW - contentW) / 2;
      const viewBoxMinY = bounds.minY - margin;

      const tbX = viewBoxMinX + (viewBoxW - titleBlockWidth) / 2;
      const tbY = bounds.maxY + tbGap;
      const viewBoxMaxY = includeTitleBlock ? tbY + titleBlockHeight + margin : bounds.maxY + margin;
      const viewBoxH = viewBoxMaxY - viewBoxMinY;

      return {
        viewBoxMinX,
        viewBoxMinY,
        viewBoxW,
        viewBoxH,
        viewBoxStr: `${viewBoxMinX} ${viewBoxMinY} ${viewBoxW} ${viewBoxH}`,
        tbX,
        tbY,
      };
    },
    [paths]
  );

  const previewMetrics = useMemo(
    () => computeViewportMetrics(layers.dimensions, layers.titleBlock),
    [computeViewportMetrics, layers.dimensions, layers.titleBlock]
  );

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Close layers popover on outside click or Escape
  useEffect(() => {
    if (!layersOpen) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-layers-menu]')) {
        setLayersOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLayersOpen(false);
    };
    window.addEventListener('mousedown', handleClick);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('mousedown', handleClick);
      window.removeEventListener('keydown', handleKey);
    };
  }, [layersOpen]);

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    setZoom((prev) => Math.min(6, Math.max(0.25, Math.round(prev * factor * 100) / 100)));
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    setIsPanning(true);
    panStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPanning || !panStartRef.current) return;
    setPan({
      x: panStartRef.current.panX + (e.clientX - panStartRef.current.x),
      y: panStartRef.current.panY + (e.clientY - panStartRef.current.y),
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPanning) return;
    setIsPanning(false);
    panStartRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore if not captured
    }
  };

  // Build clean standalone SVG clone matching exact ExportMode (Spec Sheet vs Clean CAD)
  const buildExportSVG = (): { element: SVGSVGElement; widthMm: number; heightMm: number } | null => {
    if (!svgRef.current) return null;
    const isSpecSheet = exportMode === 'spec-sheet';
    const metrics = computeViewportMetrics(isSpecSheet, isSpecSheet);

    const svgClone = svgRef.current.cloneNode(true) as SVGSVGElement;
    svgClone.removeAttribute('style');
    svgClone.removeAttribute('class');
    svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svgClone.setAttribute('viewBox', metrics.viewBoxStr);
    svgClone.setAttribute('width', `${metrics.viewBoxW}mm`);
    svgClone.setAttribute('height', `${metrics.viewBoxH}mm`);

    const removeByRole = (role: string) => {
      svgClone.querySelectorAll(`[data-export-role="${role}"]`).forEach((el) => el.remove());
    };

    if (!isSpecSheet) {
      // Clean CAD: keep ONLY Cut, Crease, Perforation (and optional Barcode if enabled)
      removeByRole('dimensions');
      removeByRole('product-overlay');
      removeByRole('title-block');
      removeByRole('artboard-bg');
      removeByRole('prepress-bleed');
      removeByRole('prepress-safezone');
      removeByRole('prepress-glue-knockout');
      removeByRole('prepress-flute');
      if (!config.barcode.enabled) {
        removeByRole('barcode');
      }
    } else {
      // Spec Sheet: force Title Block & Dimensions visible; strip any preview-hidden pre-press layers
      const tbGroup = svgClone.querySelector('[data-export-role="title-block"]');
      if (tbGroup) {
        tbGroup.setAttribute('transform', `translate(${metrics.tbX}, ${metrics.tbY})`);
        tbGroup.removeAttribute('display');
      }
      const dimsGroup = svgClone.querySelector('[data-export-role="dimensions"]');
      if (dimsGroup) {
        dimsGroup.removeAttribute('display');
      }
      const bgRect = svgClone.querySelector('[data-export-role="artboard-bg"]');
      if (bgRect) {
        bgRect.setAttribute('x', String(metrics.viewBoxMinX));
        bgRect.setAttribute('y', String(metrics.viewBoxMinY));
        bgRect.setAttribute('width', String(metrics.viewBoxW));
        bgRect.setAttribute('height', String(metrics.viewBoxH));
      }
      if (!layers.printBleed) removeByRole('prepress-bleed');
      if (!layers.scoreSafeZone) removeByRole('prepress-safezone');
      if (!layers.glueKnockout || !config.prepress.showGlueKnockout) removeByRole('prepress-glue-knockout');
      if (!layers.fluteDirection) removeByRole('prepress-flute');
    }

    return {
      element: svgClone,
      widthMm: metrics.viewBoxW,
      heightMm: metrics.viewBoxH,
    };
  };

  const downloadSVG = () => {
    const built = buildExportSVG();
    if (!built) return;
    const headerComment = `<!-- Exported from DieCut.Room (by Totale.Room) · FEFCO ${config.boxStyle} · 1 unit = 1 mm -->\n`;
    const svgData =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      headerComment +
      new XMLSerializer().serializeToString(built.element);
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const suffix = exportMode === 'clean-cad' ? 'cad' : 'spec';
    link.download = `diecut-room-fefco-${config.boxStyle}-${Math.round(paths.width)}x${Math.round(paths.height)}mm-${suffix}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const downloadPDF = async () => {
    if (exportingPdf) return;
    const built = buildExportSVG();
    if (!built) return;
    setExportingPdf(true);
    try {
      const [{ jsPDF }, { svg2pdf }] = await Promise.all([
        import('jspdf'),
        import('svg2pdf.js'),
      ]);

      const doc = new jsPDF({
        orientation: built.widthMm > built.heightMm ? 'landscape' : 'portrait',
        unit: 'mm',
        format: [built.widthMm, built.heightMm],
      });

      const suffix = exportMode === 'clean-cad' ? 'cad' : 'spec';
      doc.setProperties({
        title: `DieCut.Room — FEFCO ${config.boxStyle} (${Math.round(paths.width)}x${Math.round(paths.height)}mm)`,
        subject: 'DieCut.Room Structural Packaging CAD Dieline & Spec Sheet',
        creator: 'DieCut.Room by Totale.Room',
        author: config.metadata.userName || 'DieCut.Room',
      });

      await svg2pdf(built.element, doc, {
        x: 0,
        y: 0,
        width: built.widthMm,
        height: built.heightMm,
      });

      doc.save(
        `diecut-room-fefco-${config.boxStyle}-${Math.round(paths.width)}x${Math.round(paths.height)}mm-${suffix}.pdf`
      );
    } finally {
      setExportingPdf(false);
    }
  };

  const paperColor = config.materialColor === 'kraft' ? '#E5D3B3' : '#FFFFFF';
  const hasPerf = paths.perforationSegments.length > 0;
  const isSolidPerf = config.perforation.ruleMode === 'solid' || config.perforation.tie <= 0;
  const activeStyleInfo = BOX_STYLES.find((s) => s.id === config.boxStyle) || BOX_STYLES[0];
  const gradeLabel = config.boardGrade === 'single-wall' ? 'Single Wall' : 'Double Wall';
  const colorLabel = config.materialColor === 'kraft' ? 'Kraft' : 'White';
  const unitLabel = config.unit;
  const fmt = (mm: number) => formatValue(mm, config.unit);
  const noteLines = wrapLines(config.metadata.notes, 28, 3);

  // Flute indicator coordinates
  const fl = paths.fluteIndicator;
  const flHalf = fl.span / 2;
  const flIsV = fl.direction === 'vertical';

  return (
    <div className="flex-1 flex flex-col relative bg-[var(--ground)] overflow-hidden min-h-0">
      {/* Adaptive Workspace Toolbar */}
      <div className="surface-panel min-h-[48px] py-1.5 border-b-[0.5px] border-[var(--line)] bg-[var(--surface-top)] flex flex-wrap lg:flex-nowrap items-center justify-between px-3 sm:px-4 shrink-0 gap-2">
        {/* Left: Zoom & Layer Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          <div className="flex items-center bg-[var(--ink-3)] rounded-[var(--radius-control)] p-[3px] gap-0.5">
            <TactileButton
              type="button"
              variant="icon"
              onClick={() => setZoom((z) => Math.max(0.25, Math.round((z - 0.15) * 100) / 100))}
              title="Zoom out"
              aria-label="Zoom out"
            >
              <ZoomOut size={14} />
            </TactileButton>
            <span className="px-1.5 text-[12px] font-mono tabular-nums text-[var(--ink-12)] min-w-[48px] text-center select-none">
              {Math.round(zoom * 100)}%
            </span>
            <TactileButton
              type="button"
              variant="icon"
              onClick={() => setZoom((z) => Math.min(6, Math.round((z + 0.15) * 100) / 100))}
              title="Zoom in"
              aria-label="Zoom in"
            >
              <ZoomIn size={14} />
            </TactileButton>
            <TactileButton
              type="button"
              variant="pill"
              onClick={resetView}
              title="Fit to viewport"
            >
              <Maximize2 size={13} />
              Fit
            </TactileButton>
          </div>

          {/* Tactile Layers Dropdown */}
          <div className="relative" data-layers-menu>
            <TactileButton
              type="button"
              variant="secondary"
              size="compact"
              aria-expanded={layersOpen}
              onClick={() => setLayersOpen((o) => !o)}
            >
              <Layers size={14} className="text-[var(--ink-10)]" />
              <span>Layers</span>
              <ChevronDown
                size={14}
                className={`text-[var(--ink-9)] transition-transform duration-[var(--dur-hover)] ease-[var(--ease-out)] ${
                  layersOpen ? 'rotate-180' : ''
                }`}
              />
            </TactileButton>

            {layersOpen && (
              <div
                className="surface-overlay absolute left-0 top-full mt-1.5 w-[240px] bg-[var(--overlay)] rounded-[var(--radius-container)] shadow-[var(--shadow-menu)] p-1.5 z-40 origin-top"
                style={{ animation: 'tactileMenuIn 150ms cubic-bezier(0.23, 1, 0.32, 1)' }}
              >
                <div className="px-2 py-1 text-[12px] leading-[16px] text-[var(--ink-10)]">
                  CAD and annotations
                </div>
                <div className="flex flex-col gap-0.5">
                  {(
                    [
                      { key: 'dimensions', label: 'Dimension lines' },
                      { key: 'productOverlay', label: 'Product fit overlay' },
                      { key: 'barcode', label: 'ITF-14 barcode' },
                      { key: 'titleBlock', label: 'Legend and title block' },
                      { key: 'grid', label: 'Drafting grid' },
                    ] as Array<{ key: keyof LayerVisibility; label: string }>
                  ).map((item) => (
                    <div
                      key={item.key}
                      className="px-2 py-1.5 rounded-[var(--radius-control)] hover:bg-[var(--root-ink-2)] transition-colors duration-[var(--dur-hover)]"
                    >
                      <TactileCheckbox
                        checked={layers[item.key]}
                        onChange={() => onToggleLayer(item.key)}
                        label={item.label}
                        className="w-full"
                      />
                    </div>
                  ))}
                </div>

                <hr className="my-1.5 -mx-1.5 border-0 border-t-[0.5px] border-[var(--line)]" />

                <div className="px-2 py-1 text-[12px] leading-[16px] text-[var(--ink-10)]">
                  Pre-press overlays
                </div>
                <div className="flex flex-col gap-0.5">
                  {(
                    [
                      { key: 'printBleed', label: `Print bleed (${config.prepress.bleedMm} mm)` },
                      {
                        key: 'scoreSafeZone',
                        label: `Score safe zone (${config.prepress.scoreSafeMarginMm} mm)`,
                      },
                      { key: 'glueKnockout', label: 'Glue no-ink zone' },
                      { key: 'fluteDirection', label: 'Flute grain direction' },
                    ] as Array<{ key: keyof LayerVisibility; label: string }>
                  ).map((item) => (
                    <div
                      key={item.key}
                      className="px-2 py-1.5 rounded-[var(--radius-control)] hover:bg-[var(--root-ink-2)] transition-colors duration-[var(--dur-hover)]"
                    >
                      <TactileCheckbox
                        checked={layers[item.key]}
                        onChange={() => onToggleLayer(item.key)}
                        label={item.label}
                        className="w-full"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {(pan.x !== 0 || pan.y !== 0 || zoom !== 1) && (
            <TactileButton type="button" variant="ghost" size="compact" onClick={resetView}>
              <RotateCcw size={13} />
              <span className="hidden sm:inline">Reset pan</span>
              <span className="sm:hidden">Reset</span>
            </TactileButton>
          )}
        </div>

        {/* Right: Export Mode + Vector/PDF Downloads (single primary CTA on surface) */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0 ml-auto">
          <TactileSegmented
            value={exportMode}
            onChange={onChangeExportMode}
            size="compact"
            ariaLabel="Export mode"
            options={[
              { value: 'spec-sheet', label: 'Spec sheet' },
              { value: 'clean-cad', label: 'Clean CAD' },
            ]}
          />

          <TactileButton type="button" variant="secondary" size="compact" onClick={downloadSVG}>
            <span className="hidden sm:inline">Export </span>SVG
          </TactileButton>

          <TactileButton
            type="button"
            variant="primary"
            size="compact"
            onClick={downloadPDF}
            disabled={exportingPdf}
          >
            <Download size={14} />
            {exportingPdf ? (
              'PDF...'
            ) : (
              <>
                <span className="hidden sm:inline">Export </span>PDF
              </>
            )}
          </TactileButton>
        </div>
      </div>

      {/* Interactive 2D CAD Drawing Area */}
      <div
        ref={viewportRef}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className={`flex-1 flex items-center justify-center p-3 sm:p-5 ${
          hasMobileFloatingDock && !focusMode ? 'pb-20 md:pb-5' : ''
        } overflow-hidden relative select-none touch-none ${
          isPanning ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        style={
          layers.grid
            ? {
                backgroundImage:
                  'radial-gradient(circle, #CBD5E1 1px, transparent 1px)',
                backgroundSize: '20px 20px',
              }
            : undefined
        }
      >
        <div
          className="relative rounded-[var(--radius-container)] shadow-[var(--shadow-card)] p-4 w-full h-full flex items-center justify-center transition-colors duration-200"
          style={{
            backgroundColor: paperColor,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
          }}
        >
          <svg
            ref={svgRef}
            viewBox={previewMetrics.viewBoxStr}
            className="w-full h-full"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Clean Artboard Background for Spec Sheet PDF/SVG */}
            <rect
              data-export-role="artboard-bg"
              x={previewMetrics.viewBoxMinX}
              y={previewMetrics.viewBoxMinY}
              width={previewMetrics.viewBoxW}
              height={previewMetrics.viewBoxH}
              fill={paperColor}
              stroke="none"
            />

            {/* Pre-Press Print Bleed Perimeter */}
            {paths.bleedPath && config.prepress.bleedMm > 0 && (
              <g
                id="LAYER_PREPRESS_BLEED"
                data-export-role="prepress-bleed"
                display={layers.printBleed ? undefined : 'none'}
              >
                <path
                  d={paths.bleedPath}
                  fill="none"
                  stroke="#9333EA"
                  strokeWidth="1.0"
                  strokeDasharray="6,4"
                />
              </g>
            )}

            {/* Pre-Press Score-Line Safe Print Zones */}
            {paths.safeZoneBoxes.length > 0 && (
              <g
                id="LAYER_PREPRESS_SAFEZONE"
                data-export-role="prepress-safezone"
                display={layers.scoreSafeZone ? undefined : 'none'}
              >
                {paths.safeZoneBoxes.map((box, idx) => (
                  <rect
                    key={`safe-${idx}`}
                    x={box.x}
                    y={box.y}
                    width={box.width}
                    height={box.height}
                    fill="#0284C7"
                    fillOpacity="0.03"
                    stroke="#0284C7"
                    strokeWidth="0.7"
                    strokeDasharray="3,3"
                  />
                ))}
              </g>
            )}

            {/* Pre-Press Glue Flap Unprinted Knockout Zone */}
            {paths.glueKnockoutPolygon && config.prepress.showGlueKnockout && (
              <g
                id="LAYER_PREPRESS_GLUE_KNOCKOUT"
                data-export-role="prepress-glue-knockout"
                display={layers.glueKnockout ? undefined : 'none'}
              >
                <polygon
                  points={paths.glueKnockoutPolygon}
                  fill="#F59E0B"
                  fillOpacity="0.14"
                  stroke="#D97706"
                  strokeWidth="0.9"
                  strokeDasharray="4,3"
                />
                {paths.glueKnockoutBounds.height > 26 && (
                  <text
                    x={paths.glueKnockoutBounds.cx}
                    y={paths.glueKnockoutBounds.cy + 2.5}
                    fontSize="7"
                    fontFamily="Arial, Helvetica, sans-serif"
                    fontWeight="bold"
                    fill="#92400E"
                    textAnchor="middle"
                    transform={`rotate(-90 ${paths.glueKnockoutBounds.cx},${paths.glueKnockoutBounds.cy})`}
                  >
                    NO INK / GLUE
                  </text>
                )}
              </g>
            )}

            {/* Cut lines: Solid Black */}
            <g
              id="LAYER_CUT"
              stroke="#000000"
              strokeWidth="1.5"
              strokeLinecap="square"
              fill="none"
            >
              {paths.cutSegments.map((d, i) => (
                <path key={`cut-${i}`} d={d} />
              ))}
            </g>

            {/* Crease lines: Dashed Red */}
            <g
              id="LAYER_CREASE"
              stroke="#E11D48"
              strokeWidth="1.3"
              strokeDasharray="10, 5"
              strokeLinecap="square"
              fill="none"
            >
              {paths.creaseSegments.map((d, i) => (
                <path key={`crease-${i}`} d={d} />
              ))}
              {paths.perforationFoldSegments.map((d, i) => (
                <path key={`perf-crease-${i}`} d={d} />
              ))}
            </g>

            {/* Perforation lines: Solid or Dashed Green */}
            {hasPerf && (
              <g
                id="LAYER_PERFORATION"
                stroke="#16A34A"
                strokeWidth="1.5"
                strokeDasharray={isSolidPerf ? undefined : `${config.perforation.cut},${config.perforation.tie}`}
                strokeLinecap="square"
                fill="none"
              >
                {paths.perforationSegments.map((d, i) => (
                  <path key={`perf-${i}`} d={d} />
                ))}
              </g>
            )}

            {/* Pre-Press Flute Grain Direction Indicator (Panel L2) */}
            <g
              id="LAYER_PREPRESS_FLUTE"
              data-export-role="prepress-flute"
              display={layers.fluteDirection ? undefined : 'none'}
            >
              {flIsV ? (
                <>
                  <line
                    x1={fl.cx}
                    y1={fl.cy - flHalf}
                    x2={fl.cx}
                    y2={fl.cy + flHalf}
                    stroke="#475569"
                    strokeWidth="1.1"
                  />
                  <polygon
                    points={`${fl.cx - 2.5},${fl.cy - flHalf + 5} ${fl.cx},${fl.cy - flHalf} ${fl.cx + 2.5},${fl.cy - flHalf + 5}`}
                    fill="#475569"
                  />
                  <polygon
                    points={`${fl.cx - 2.5},${fl.cy + flHalf - 5} ${fl.cx},${fl.cy + flHalf} ${fl.cx + 2.5},${fl.cy + flHalf - 5}`}
                    fill="#475569"
                  />
                  <text
                    x={fl.cx}
                    y={fl.cy + flHalf + 10}
                    fontSize="7"
                    fontFamily="Arial, Helvetica, sans-serif"
                    fontWeight="bold"
                    fill="#334155"
                    textAnchor="middle"
                  >
                    FLUTE VERTICAL
                  </text>
                </>
              ) : (
                <>
                  <line
                    x1={fl.cx - flHalf}
                    y1={fl.cy}
                    x2={fl.cx + flHalf}
                    y2={fl.cy}
                    stroke="#B45309"
                    strokeWidth="1.1"
                  />
                  <polygon
                    points={`${fl.cx - flHalf + 5},${fl.cy - 2.5} ${fl.cx - flHalf},${fl.cy} ${fl.cx - flHalf + 5},${fl.cy + 2.5}`}
                    fill="#B45309"
                  />
                  <polygon
                    points={`${fl.cx + flHalf - 5},${fl.cy - 2.5} ${fl.cx + flHalf},${fl.cy} ${fl.cx + flHalf - 5},${fl.cy + 2.5}`}
                    fill="#B45309"
                  />
                  <text
                    x={fl.cx}
                    y={fl.cy + 12}
                    fontSize="7"
                    fontFamily="Arial, Helvetica, sans-serif"
                    fontWeight="bold"
                    fill="#B45309"
                    textAnchor="middle"
                  >
                    FLUTE HORIZONTAL
                  </text>
                </>
              )}
            </g>

            {/* Product Fit & Headspace Simulation Boxes */}
            {paths.productSimulationBoxes.length > 0 && (
              <g
                id="LAYER_PRODUCT_FIT"
                data-export-role="product-overlay"
                display={layers.productOverlay ? undefined : 'none'}
              >
                {paths.productSimulationBoxes.map((box, idx) => {
                  const hs = box.headspaceMm;
                  const boxMidX = box.x + box.width / 2;
                  const boxMidY = box.y + box.height / 2;
                  return (
                    <g key={`prod-${idx}`}>
                      <rect
                        x={box.x}
                        y={box.y}
                        width={box.width}
                        height={box.height}
                        rx="2"
                        stroke="#2563EB"
                        strokeWidth="1.2"
                        strokeDasharray="6,4"
                        fill="#3B82F6"
                        fillOpacity="0.08"
                      />
                      <text
                        x={boxMidX}
                        y={hs > 0.2 ? boxMidY - 2 : boxMidY + 3.5}
                        fontSize="9.5"
                        fontFamily="Arial, Helvetica, sans-serif"
                        fontWeight="bold"
                        fill="#1D4ED8"
                        textAnchor="middle"
                      >
                        {box.label}
                      </text>
                      {hs > 0.2 && (
                        <text
                          x={boxMidX}
                          y={boxMidY + 12}
                          fontSize="8"
                          fontFamily="Arial, Helvetica, sans-serif"
                          fontWeight="bold"
                          fill="#B45309"
                          textAnchor="middle"
                        >
                          {`Top Headspace: ${fmt(hs)} ${unitLabel}`}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            )}

            {/* Dimensions (Pure Arial/Helvetica + exact baseline offsets for Illustrator/CorelDRAW safety) */}
            <g
              id="LAYER_DIMENSIONS"
              data-export-role="dimensions"
              display={layers.dimensions ? undefined : 'none'}
              stroke="#3B82F6"
              strokeWidth="0.6"
              fill="none"
            >
              {paths.dimensionLines.map((dim, i) => {
                const cx = (dim.x1 + dim.x2) / 2;
                const cy = (dim.y1 + dim.y2) / 2;
                const isV = dim.isVertical;
                const a1 = isV
                  ? `${dim.x1 - 2},${dim.y1 + 4} ${dim.x1},${dim.y1} ${dim.x1 + 2},${dim.y1 + 4}`
                  : `${dim.x1 + 4},${dim.y1 - 2} ${dim.x1},${dim.y1} ${dim.x1 + 4},${dim.y1 + 2}`;
                const a2 = isV
                  ? `${dim.x2 - 2},${dim.y2 - 4} ${dim.x2},${dim.y2} ${dim.x2 + 2},${dim.y2 - 4}`
                  : `${dim.x2 - 4},${dim.y2 - 2} ${dim.x2},${dim.y2} ${dim.x2 - 4},${dim.y2 + 2}`;

                const fontSize = config.appearance.dimFontSize || 8;
                const textLen = dim.text.length * (fontSize * 0.62);
                const boxW = isV ? fontSize + 4 : textLen + 8;
                const boxH = isV ? textLen + 8 : fontSize + 4;
                const baselineY = cy + fontSize * 0.35;

                return (
                  <g key={`dim-${i}`}>
                    <line x1={dim.x1} y1={dim.y1} x2={dim.x2} y2={dim.y2} />
                    <polygon points={a1} fill="#3B82F6" stroke="none" />
                    <polygon points={a2} fill="#3B82F6" stroke="none" />
                    {isV ? (
                      <>
                        <line x1={dim.x1 - 3} y1={dim.y1} x2={dim.x1 + 3} y2={dim.y1} stroke="#2563EB" strokeWidth="0.9" />
                        <line x1={dim.x2 - 3} y1={dim.y2} x2={dim.x2 + 3} y2={dim.y2} stroke="#2563EB" strokeWidth="0.9" />
                      </>
                    ) : (
                      <>
                        <line x1={dim.x1} y1={dim.y1 - 3} x2={dim.x1} y2={dim.y1 + 3} stroke="#2563EB" strokeWidth="0.9" />
                        <line x1={dim.x2} y1={dim.y2 - 3} x2={dim.x2} y2={dim.y2 + 3} stroke="#2563EB" strokeWidth="0.9" />
                      </>
                    )}
                    <rect
                      x={cx - boxW / 2}
                      y={cy - boxH / 2}
                      width={boxW}
                      height={boxH}
                      fill={paperColor}
                      stroke="none"
                    />
                    <text
                      x={cx}
                      y={baselineY}
                      fill="#1D4ED8"
                      stroke="none"
                      fontSize={fontSize}
                      fontFamily="Arial, Helvetica, sans-serif"
                      fontWeight="bold"
                      textAnchor="middle"
                      transform={isV ? `rotate(-90 ${cx},${cy})` : undefined}
                    >
                      {dim.text}
                    </text>
                  </g>
                );
              })}
            </g>

            {/* Flattened Vector GS1 ITF-14 Barcode with Proportional Standard 4-Sided Bearer Bars & 10X Quiet Zones */}
            {paths.barcodeBox && flattenedBarcode && (() => {
              const bc = paths.barcodeBox;
              const b = bc.bearerThicknessMm;
              const qz = bc.quietZoneMm;
              const innerX = b + qz;
              const innerY = b;
              const innerW = Math.max(4, bc.frameWidth - 2 * (b + qz));
              const innerH = Math.max(4, bc.frameHeight - 2 * b);
              const hriFontSize = Math.max(3.2, bc.hriHeight * 0.74);
              const magScale = bc.magnificationPct / 100;
              return (
                <g
                  id="LAYER_BARCODE"
                  data-export-role="barcode"
                  display={layers.barcode ? undefined : 'none'}
                  transform={`translate(${bc.x}, ${bc.y})`}
                >
                  {/* Clean white substrate + quiet zone background */}
                  <rect
                    width={bc.width}
                    height={bc.height}
                    fill="#FFFFFF"
                    stroke="none"
                  />
                  {/* Standard 4-sided filled Bearer Bar frame (4.8mm at 100% GS1 mag) */}
                  <rect x="0" y="0" width={bc.frameWidth} height={b} fill="#000000" />
                  <rect x="0" y={bc.frameHeight - b} width={bc.frameWidth} height={b} fill="#000000" />
                  <rect x="0" y={b} width={b} height={Math.max(0, bc.frameHeight - 2 * b)} fill="#000000" />
                  <rect
                    x={bc.frameWidth - b}
                    y={b}
                    width={b}
                    height={Math.max(0, bc.frameHeight - 2 * b)}
                    fill="#000000"
                  />
                  {/* ITF-14 symbol bars scaled to exact 1:1 mm X-dimension inside 10X quiet zones */}
                  <g
                    transform={`translate(${innerX}, ${innerY}) scale(${innerW / flattenedBarcode.origW}, ${
                      innerH / flattenedBarcode.origH
                    })`}
                    dangerouslySetInnerHTML={{ __html: flattenedBarcode.markup }}
                  />
                  {/* Human Readable Interpretation (HRI) cleanly below bottom bearer bar */}
                  <text
                    x={bc.frameWidth * 0.5}
                    y={bc.frameHeight + bc.hriHeight * 0.8}
                    textAnchor="middle"
                    fontSize={hriFontSize}
                    fontFamily="Arial, Helvetica, sans-serif"
                    fontWeight="bold"
                    letterSpacing={Math.max(0.2, 0.55 * magScale)}
                    fill="#000000"
                  >
                    {bc.text}
                  </text>
                </g>
              );
            })()}

            {/* Exportable Legend & Technical Title Block (Guaranteed inside viewBox with 20mm margin) */}
            <g
              id="LAYER_TITLE_BLOCK"
              data-export-role="title-block"
              display={layers.titleBlock ? undefined : 'none'}
              transform={`translate(${previewMetrics.tbX}, ${previewMetrics.tbY})`}
            >
              <rect
                x="0"
                y="0"
                width={titleBlockWidth}
                height={titleBlockHeight}
                fill="#FFFFFF"
                stroke="#94A3B8"
                strokeWidth="1.2"
                rx="4"
              />

              {/* Column 1: Legend & Scale (0..145) */}
              <text x="14" y="20" fontSize="9.5" fontFamily="Arial, Helvetica, sans-serif" fill="#334155" fontWeight="bold">
                LEGEND &amp; SCALE
              </text>
              <line x1="14" y1="34" x2="42" y2="34" stroke="#000000" strokeWidth="1.5" />
              <text x="48" y="37" fontSize="8" fontFamily="Arial, Helvetica, sans-serif" fill="#0F172A">
                CUT LINE
              </text>

              <line x1="14" y1="49" x2="42" y2="49" stroke="#E11D48" strokeWidth="1.3" strokeDasharray="5,3" />
              <text x="48" y="52" fontSize="8" fontFamily="Arial, Helvetica, sans-serif" fill="#0F172A">
                CREASE LINE
              </text>

              <line
                x1="14"
                y1="64"
                x2="42"
                y2="64"
                stroke={hasPerf ? '#16A34A' : '#CBD5E1'}
                strokeWidth="1.5"
                strokeDasharray={
                  !hasPerf || isSolidPerf
                    ? undefined
                    : `${config.perforation.cut},${config.perforation.tie}`
                }
              />
              <text x="48" y="67" fontSize="8" fontFamily="Arial, Helvetica, sans-serif" fill={hasPerf ? '#0F172A' : '#94A3B8'}>
                {!hasPerf
                  ? 'PERF (OFF)'
                  : isSolidPerf
                  ? 'CUTOUT (SOLID)'
                  : `PERF (${config.perforation.cut}/${config.perforation.tie}mm)`}
              </text>

              <line x1="14" y1="79" x2="42" y2="79" stroke="#9333EA" strokeWidth="1.0" strokeDasharray="4,3" />
              <text x="48" y="82" fontSize="8" fontFamily="Arial, Helvetica, sans-serif" fill="#0F172A">
                {`BLEED (${config.prepress.bleedMm}mm)`}
              </text>

              <text x="14" y="96" fontSize="7.5" fontFamily="Arial, Helvetica, sans-serif" fill="#64748B">
                Scale: 1:1 (1 unit = 1 mm)
              </text>
              <text x="14" y="108" fontSize="7.5" fontFamily="Arial, Helvetica, sans-serif" fill="#64748B">
                {`Flute: ${config.prepress.fluteDirection.toUpperCase()} (${unitLabel.toUpperCase()})`}
              </text>
              <text x="14" y="121" fontSize="8" fontFamily="Timeless Grotesk, Plus Jakarta Sans, Arial, sans-serif" fontWeight="bold" fill="#0F172A">
                CAD: DieCut.Room
              </text>

              <line x1="148" y1="12" x2="148" y2={titleBlockHeight - 12} stroke="#E2E8F0" strokeWidth="1" />

              {/* Column 2: Box Specifications (148..396) */}
              <text x="162" y="20" fontSize="9.5" fontFamily="Arial, Helvetica, sans-serif" fill="#334155" fontWeight="bold">
                BOX SPECIFICATIONS
              </text>

              <text x="162" y="36" fontSize="8.5" fontFamily="Arial, Helvetica, sans-serif" fill="#64748B">
                Style:
              </text>
              <text x="234" y="36" fontSize="8.5" fontFamily="Arial, Helvetica, sans-serif" fill="#0F172A" fontWeight="bold">
                {`${activeStyleInfo.abbrev} (${activeStyleInfo.id})`}
              </text>

              <text x="162" y="52" fontSize="8.5" fontFamily="Arial, Helvetica, sans-serif" fill="#64748B">
                Inner (ID):
              </text>
              <text x="234" y="52" fontSize="8.5" fontFamily="Arial, Helvetica, sans-serif" fill="#0F172A" fontWeight="bold">
                {`${fmt(paths.info.innerDimensions.length)} x ${fmt(paths.info.innerDimensions.width)} x ${fmt(paths.info.innerDimensions.depth)} ${unitLabel}`}
              </text>

              <text x="162" y="68" fontSize="8.5" fontFamily="Arial, Helvetica, sans-serif" fill="#64748B">
                Outer (OD):
              </text>
              <text x="234" y="68" fontSize="8.5" fontFamily="Arial, Helvetica, sans-serif" fill="#0F172A" fontWeight="bold">
                {`${fmt(paths.info.outerDimensions.length)} x ${fmt(paths.info.outerDimensions.width)} x ${fmt(paths.info.outerDimensions.depth)} ${unitLabel}`}
              </text>

              <text x="162" y="84" fontSize="8.5" fontFamily="Arial, Helvetica, sans-serif" fill="#64748B">
                Blank / Area:
              </text>
              <text x="234" y="84" fontSize="8.5" fontFamily="Arial, Helvetica, sans-serif" fill="#0F172A">
                {`${Math.ceil(paths.width)} x ${Math.ceil(paths.height)} mm (${paths.info.totalAreaSqM.toFixed(3)} m2)`}
              </text>

              <text x="162" y="100" fontSize="8.5" fontFamily="Arial, Helvetica, sans-serif" fill="#64748B">
                Board / ECT:
              </text>
              <text x="234" y="100" fontSize="8.5" fontFamily="Arial, Helvetica, sans-serif" fill="#0F172A">
                {`${gradeLabel} (${config.fluteThickness}mm) - ${config.engineering.ectValue} ECT - ${colorLabel}`}
              </text>

              <text x="162" y="116" fontSize="8.5" fontFamily="Arial, Helvetica, sans-serif" fill="#64748B">
                Gap / Slot:
              </text>
              <text x="234" y="116" fontSize="8.5" fontFamily="Arial, Helvetica, sans-serif" fill="#0F172A">
                {`${config.advanced.flapGap}mm / ${config.advanced.slotGap}mm${config.advanced.fishtailCompensation ? ' (Anti-Fishtail)' : ''}`}
              </text>

              <line x1="396" y1="12" x2="396" y2={titleBlockHeight - 12} stroke="#E2E8F0" strokeWidth="1" />

              {/* Column 3: Production Details (396..590) */}
              <text x="410" y="20" fontSize="9.5" fontFamily="Arial, Helvetica, sans-serif" fill="#334155" fontWeight="bold">
                PRODUCTION DETAILS
              </text>

              <text x="410" y="36" fontSize="8.5" fontFamily="Arial, Helvetica, sans-serif" fill="#64748B">
                Product:
              </text>
              <text x="464" y="36" fontSize="8.5" fontFamily="Arial, Helvetica, sans-serif" fill="#0F172A" fontWeight="bold">
                {truncateText(config.metadata.productName, 26)}
              </text>

              <text x="410" y="52" fontSize="8.5" fontFamily="Arial, Helvetica, sans-serif" fill="#64748B">
                Substance:
              </text>
              <text x="464" y="52" fontSize="8.5" fontFamily="Arial, Helvetica, sans-serif" fill="#0F172A">
                {truncateText(config.metadata.materialSubstance, 24)}
              </text>

              <text x="410" y="68" fontSize="8.5" fontFamily="Arial, Helvetica, sans-serif" fill="#64748B">
                Colors:
              </text>
              <text x="464" y="68" fontSize="8.5" fontFamily="Arial, Helvetica, sans-serif" fill="#0F172A">
                {truncateText(
                  `${config.metadata.printColorsCount}${
                    config.metadata.printColorCodes ? ` (${config.metadata.printColorCodes})` : ''
                  }`,
                  25
                )}
              </text>

              <text x="410" y="84" fontSize="8.5" fontFamily="Arial, Helvetica, sans-serif" fill="#64748B">
                Drafter:
              </text>
              <text x="464" y="84" fontSize="8.5" fontFamily="Arial, Helvetica, sans-serif" fill="#0F172A">
                {truncateText(config.metadata.userName, 24)}
              </text>

              <text x="410" y="100" fontSize="8.5" fontFamily="Arial, Helvetica, sans-serif" fill="#64748B">
                Date:
              </text>
              <text x="464" y="100" fontSize="8.5" fontFamily="Arial, Helvetica, sans-serif" fill="#0F172A">
                {config.metadata.date || '-'}
              </text>

              <text x="410" y="116" fontSize="8.5" fontFamily="Arial, Helvetica, sans-serif" fill="#64748B">
                By:
              </text>
              <g transform="translate(464, 108.5) scale(0.22)" fill="#0F172A">
                <path d="M1.28.81c.87,0,25.04-.24,25.66.38.25.25.38.54.38.86,0,5.64,1.17,4.59-9.99,4.59,0,.88.24,26.11-.38,26.74-.25.25-.54.38-.86.38h-4.81c-.65,0-1.24-.59-1.24-1.24V6.65C-1.13,6.65.03,7.7.03,2.05.03,1.41.62.81,1.28.81Z"/>
                <path d="M25.18,21.01c0-14.98,16.29-14.77,21.6-9.45,4.16,4.37,4.47,14.14-.11,18.8-5.69,5.69-21.5,5.43-21.5-9.35ZM37.71,13.45c-3.46,0-5.19,2.52-5.19,7.56,0,3.76,1.11,7.67,4.86,7.67,4.18,0,5.24-3.53,5.24-7.67s-.84-7.56-4.92-7.56Z"/>
                <path d="M54.87,8.75c.28-9.53-1.28-8.21,5.4-8.21.65,0,1.24.58,1.24,1.24,0,2.88-.77,6.93,2.04,6.97,2.84.05,2.45.47,2.45,3.77,0,.76-.54,1.09-1.29,1.22-1.8.32-3.2,1.76-3.21,3.58-.1,10.28-.42,11.61,3.2,11.18,2.27-.37,2.06,4.2.86,4.59l-.05.05c-2.8.78-7.1,1.08-9.34-1.03-2.41-2.58-1.57-6.9-1.57-18.36-3.22,0-3.02.04-3.02-3.78,0-1.52,1.78-1.24,3.29-1.24Z"/>
                <path d="M81.82,18.1c0-2.72-.25-4.92-3.03-4.92-1.97,0-2.56.69-2.97,2.32v-.05c-.19,1.49-4.37,1.03-5.99,1.03-2.76-.47-.21-4.68,1.94-6.32,3.44-2.39,10.92-2.76,14.48.48,3.51,3.14,2.59,7.89,2.59,15.23,0,1.89.05,3.08,1.89,3.08.83-.15,1.4.53,1.4,1.3,0,2.71.31,3.3-3.19,3.3-3.27.15-5.53-.41-6.21-3.78-3.51,5.09-10.44,4.9-13.34,2-2.8-2.8-2.93-8.84.54-11.5,3.05-2.44,7.87-2.07,11.88-2.16ZM75.33,27.92c1.63,2.12,6.48.15,6.48-5.56-3.93.08-7.19-.39-7.19,3.35,0,1.01.24,1.73.7,2.16v.05Z"/>
                <path d="M99.52,33.33h-4.54c-.65,0-1.24-.59-1.24-1.24,0-.87-.24-31.09.38-31.71.25-.25.54-.38.86-.38h4.54c.65,0,1.24.59,1.24,1.24,0,.88.24,31.08-.38,31.71-.25.25-.54.38-.86.38Z"/>
                <path d="M122.09,11.88c2.91,3.64,3.18,10.31,2.46,10.64-.58.27-14.19.16-14.83.16.04,1.98.45,3.48,1.24,4.48,1.53,2.3,5.63,2.23,6.75-.43.22-.52.74-.77,1.24-.7,2.38.2,6.31.1,5.08,2.16-3.72,7.23-14.43,6.93-18.69,2.21-3.97-4.41-4.07-14.31.05-18.8,3.98-4.26,12.84-4.72,16.69.27ZM109.78,17.93h8.26c-.46-6.61-7.78-6.6-8.26,0Z"/>
                <path d="M135.04,33.33h-4.7c-.65,0-1.24-.59-1.24-1.24v-5.08c0-.66.59-1.24,1.24-1.24h4.7c.65,0,1.24.59,1.24,1.24v5.08c0,.32-.13.61-.38.86-.25.25-.54.38-.86.38Z"/>
                <path d="M141.24,1.62c15.19,0,19.46-.63,23.39,2.49,5.08,3.94,4.1,13.89-3.4,16.1,9.25,14.41,9.57,13.13.76,13.13-.47,0-.79-.18-.97-.54-7.53-12.28-5.6-11.18-13.72-11.18,0,13.64,1.6,11.72-6.05,11.72-.66,0-1.24-.59-1.24-1.24V2.86c0-.65.58-1.24,1.24-1.24ZM160.42,11.5c0-5.02-5.34-4-13.13-4v8.21c7.79,0,13.13.95,13.13-4.21Z"/>
                <path d="M170.07,21.01c0-15.05,16.35-14.7,21.6-9.45,4.17,4.39,4.46,14.16-.11,18.8-5.7,5.7-21.5,5.43-21.5-9.35ZM182.6,13.45c-3.46,0-5.19,2.52-5.19,7.56,0,3.76,1.11,7.67,4.86,7.67,4.18,0,5.24-3.53,5.24-7.67s-.84-7.56-4.92-7.56Z"/>
                <path d="M208.79,33.76c-16.63,0-16.72-25.44.11-25.44s16.81,25.44-.11,25.44ZM209,13.45c-3.46,0-5.19,2.52-5.19,7.56,0,3.76,1.11,7.67,4.86,7.67,4.18,0,5.24-3.53,5.24-7.67s-.84-7.56-4.92-7.56Z"/>
                <path d="M242.64,33.33h-4.48c-.66,0-1.24-.6-1.24-1.24,0-12.81.77-18.31-3.13-18.31-5,0-3.78,10.21-3.78,18.31,0,.65-.58,1.24-1.24,1.24h-4.54c-.32,0-.61-.13-.86-.38-.58-.58-.37-20.6-.43-21.5-.13-1.31-.16-2.7,1.19-2.7,6.16,0,5.47-.67,5.73,5.19l-.43-.43h.05l-.38.27c3.28-7.91,12.75-6.86,14.31.05l-.43-.32h.11l-.38.27c1.49-3.6,3.66-5.46,7.56-5.46,5.42,0,7.56,4.1,7.56,9.56,0,.88.24,14.45-.38,15.07-.25.25-.54.38-.86.38h-4.54c-.66,0-1.24-.59-1.24-1.24,0-12.67.78-18.31-3.13-18.31-4.97,0-3.78,9.78-3.78,18.31,0,.65-.59,1.24-1.24,1.24Z"/>
              </g>

              <line x1="590" y1="12" x2="590" y2={titleBlockHeight - 12} stroke="#E2E8F0" strokeWidth="1" />

              {/* Column 4: Approval & Notes (590..760) */}
              <text x="604" y="20" fontSize="9.5" fontFamily="Arial, Helvetica, sans-serif" fill="#334155" fontWeight="bold">
                APPROVAL &amp; NOTES
              </text>

              <text x="604" y="36" fontSize="8.5" fontFamily="Arial, Helvetica, sans-serif" fill="#64748B">
                Approved:
              </text>
              <text x="652" y="36" fontSize="8.5" fontFamily="Arial, Helvetica, sans-serif" fill="#0F172A">
                {truncateText(config.metadata.approvalSignee, 20)}
              </text>

              <text x="604" y="54" fontSize="8.5" fontFamily="Arial, Helvetica, sans-serif" fill="#64748B">
                Notes:
              </text>
              {noteLines.map((line, li) => (
                <text
                  key={`note-${li}`}
                  x="604"
                  y={68 + li * 12}
                  fontSize="8"
                  fontFamily="Arial, Helvetica, sans-serif"
                  fill="#0F172A"
                >
                  {line}
                </text>
              ))}
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
}
