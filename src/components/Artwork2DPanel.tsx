import React, { useEffect, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  Bold,
  Copy,
  Lock,
  Minus,
  Palette,
  RotateCcw,
  ShieldCheck,
  Square,
  SquareDashed,
  Trash2,
  Type,
  Unlock,
  X,
} from 'lucide-react';
import {
  Artwork2DConfig,
  ArtworkCustomElement,
  ArtworkElementKind,
  BoxStyle,
  DielinePaths,
  PalletPatternEvaluation,
} from '../types';
import { computePlakbanZoneMetrics } from '../utils/dieline';
import {
  TactileButton,
  TactileCheckbox,
  TactileInputWell,
  TactileSegmented,
  TactileSelect,
  TactileSwitch,
  TactileTextareaWell,
} from './tactile/TactileUI';

export type ArtworkPanelTab = 'plakban' | 'pallet' | 'canvas';

interface Artwork2DPanelProps {
  artwork: Artwork2DConfig;
  paths: DielinePaths;
  flapGapMm: number;
  boxStyle: BoxStyle;
  palletEvaluation: PalletPatternEvaluation | null;
  selectedElementId: string | null;
  onSelectElement: (id: string | null) => void;
  onChange: (next: Artwork2DConfig) => void;
  onClose: () => void;
  activeTab?: ArtworkPanelTab;
  onActiveTabChange?: (tab: ArtworkPanelTab) => void;
  className?: string;
}

const FLEXO_SWATCHES = [
  { hex: '#111827', name: 'Hitam Flexo' },
  { hex: '#DC2626', name: 'Merah FMCG' },
  { hex: '#1D4ED8', name: 'Biru Industri' },
  { hex: '#15803D', name: 'Hijau Segel' },
  { hex: '#D97706', name: 'Amber / Kuning' },
  { hex: '#7C2D12', name: 'Coklat Tua' },
  { hex: '#FFFFFF', name: 'Putih' },
];

const TAPE_WIDTH_PRESETS: Array<{ widthMm: number; tag?: string }> = [
  { widthMm: 36 },
  { widthMm: 48, tag: 'Standar' },
  { widthMm: 60, tag: 'Lebar' },
  { widthMm: 72, tag: 'Ekstra' },
];

type SnapTarget = 'L1' | 'W1' | 'L2' | 'W2' | 'topL1' | 'topL2';

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

export default function Artwork2DPanel({
  artwork,
  paths,
  flapGapMm,
  boxStyle,
  palletEvaluation,
  selectedElementId,
  onSelectElement,
  onChange,
  onClose,
  activeTab: controlledTab,
  onActiveTabChange,
  className = '',
}: Artwork2DPanelProps) {
  const [internalTab, setInternalTab] = useState<ArtworkPanelTab>('plakban');
  const activeTab = controlledTab ?? internalTab;
  const setTab = (t: ArtworkPanelTab) => {
    setInternalTab(t);
    onActiveTabChange?.(t);
  };

  // Auto-focus Canvas tab when user clicks an element directly on the 2D SVG
  useEffect(() => {
    if (selectedElementId && activeTab !== 'canvas') {
      setTab('canvas');
    }
  }, [selectedElementId]);

  const { antiCounterfeit: ac, palletMarks: pm, elements } = artwork;
  const selectedEl = elements.find((el) => el.id === selectedElementId) || null;
  const pc = paths.panelCoords;
  const activeFlapHeightMm = pc.hasTopFlaps ? pc.topFlapL : pc.flapL;
  const tapeMetrics = computePlakbanZoneMetrics(
    ac.tapeWidthMm,
    activeFlapHeightMm,
    flapGapMm,
    boxStyle
  );
  const tapeWidthOptions = TAPE_WIDTH_PRESETS.map((p) => {
    const m = computePlakbanZoneMetrics(p.widthMm, activeFlapHeightMm, flapGapMm, boxStyle);
    const title = p.tag ? `${p.widthMm} mm ${p.tag}` : `${p.widthMm} mm`;
    return {
      value: String(p.widthMm),
      label: `${title} (${m.zoneDepthMm} mm/flap)`,
    };
  });

  const updateAC = (patch: Partial<Artwork2DConfig['antiCounterfeit']>) => {
    onChange({
      ...artwork,
      antiCounterfeit: { ...ac, ...patch },
    });
  };

  const updatePM = (patch: Partial<Artwork2DConfig['palletMarks']>) => {
    onChange({
      ...artwork,
      palletMarks: { ...pm, ...patch },
    });
  };

  const updateElement = (id: string, patch: Partial<ArtworkCustomElement>) => {
    onChange({
      ...artwork,
      elements: elements.map((el) => (el.id === id ? { ...el, ...patch } : el)),
    });
  };

  const addElement = (kind: ArtworkElementKind) => {
    const id = `art-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const panelW = pc.pL1_x2 - pc.pL1_x1;
    const panelH = pc.y2 - pc.y1;
    const midX = pc.pL1_x1 + panelW / 2;
    const midY = pc.y1 + panelH / 2;
    const countOfKind = elements.filter((e) => e.kind === kind).length + 1;

    let created: ArtworkCustomElement;
    if (kind === 'stripe') {
      const h = Math.max(4, Math.min(12, round1(panelH * 0.08)));
      created = {
        id,
        kind: 'stripe',
        label: `Garis Panjang ${countOfKind}`,
        x: round1(pc.pL1_x1 + 2),
        y: round1(pc.y1 + panelH * 0.18),
        width: round1(Math.max(20, panelW - 4)),
        height: h,
        rotation: 0,
        fillColor: '#DC2626',
        strokeColor: 'none',
        strokeWidthMm: 0,
        opacity: 1,
      };
    } else if (kind === 'block') {
      const w = round1(Math.max(24, panelW * 0.72));
      const h = round1(Math.max(18, panelH * 0.45));
      created = {
        id,
        kind: 'block',
        label: `Blok Penuh ${countOfKind}`,
        x: round1(midX - w / 2),
        y: round1(midY - h / 2),
        width: w,
        height: h,
        rotation: 0,
        fillColor: '#111827',
        strokeColor: 'none',
        strokeWidthMm: 0,
        opacity: 0.9,
      };
    } else if (kind === 'frame') {
      const w = round1(Math.max(26, panelW * 0.65));
      const h = round1(Math.max(18, panelH * 0.35));
      created = {
        id,
        kind: 'frame',
        label: `Kotak Frame ${countOfKind}`,
        x: round1(midX - w / 2),
        y: round1(midY - h / 2),
        width: w,
        height: h,
        rotation: 0,
        fillColor: 'none',
        strokeColor: '#111827',
        strokeWidthMm: 1.5,
        opacity: 1,
      };
    } else {
      const w = round1(Math.max(40, panelW * 0.78));
      const fontSizeMm = round1(Math.max(5, Math.min(14, panelH * 0.095)));
      const h = round1(fontSizeMm * 1.6);
      created = {
        id,
        kind: 'text',
        label: `Teks ${countOfKind}`,
        x: round1(midX - w / 2),
        y: round1(midY - h / 2),
        width: w,
        height: h,
        rotation: 0,
        fillColor: '#111827',
        strokeColor: 'none',
        strokeWidthMm: 0,
        opacity: 1,
        text: 'HANDLE WITH CARE',
        fontSizeMm,
        fontWeight: 'bold',
        textAlign: 'center',
      };
    }

    onChange({
      ...artwork,
      elements: [...elements, created],
    });
    onSelectElement(created.id);
    setTab('canvas');
  };

  const duplicateSelected = () => {
    if (!selectedEl) return;
    const copy: ArtworkCustomElement = {
      ...selectedEl,
      id: `art-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      label: `${selectedEl.label} (Salin)`,
      x: round1(selectedEl.x + 8),
      y: round1(selectedEl.y + 8),
      locked: false,
    };
    onChange({
      ...artwork,
      elements: [...elements, copy],
    });
    onSelectElement(copy.id);
  };

  const deleteElement = (id: string) => {
    onChange({
      ...artwork,
      elements: elements.filter((el) => el.id !== id),
    });
    if (selectedElementId === id) {
      onSelectElement(null);
    }
  };

  const reorderElement = (id: string, dir: 'up' | 'down') => {
    const idx = elements.findIndex((el) => el.id === id);
    if (idx < 0) return;
    const nextIdx = dir === 'up' ? idx + 1 : idx - 1;
    if (nextIdx < 0 || nextIdx >= elements.length) return;
    const copy = [...elements];
    const [moved] = copy.splice(idx, 1);
    copy.splice(nextIdx, 0, moved);
    onChange({ ...artwork, elements: copy });
  };

  const snapElementToPanel = (target: SnapTarget) => {
    if (!selectedEl) return;
    const rectMap: Record<SnapTarget, { x: number; y: number; w: number; h: number }> = {
      L1: { x: pc.pL1_x1, y: pc.y1, w: pc.pL1_x2 - pc.pL1_x1, h: pc.y2 - pc.y1 },
      W1: { x: pc.pW1_x1, y: pc.y1, w: pc.pW1_x2 - pc.pW1_x1, h: pc.y2 - pc.y1 },
      L2: { x: pc.pL2_x1, y: pc.y1, w: pc.pL2_x2 - pc.pL2_x1, h: pc.y2 - pc.y1 },
      W2: { x: pc.pW2_x1, y: pc.y1, w: pc.pW2_x2 - pc.pW2_x1, h: pc.y2 - pc.y1 },
      topL1: {
        x: pc.pL1_x1,
        y: pc.y0_L,
        w: pc.pL1_x2 - pc.pL1_x1,
        h: Math.max(10, pc.y1 - pc.y0_L),
      },
      topL2: {
        x: pc.pL2_x1,
        y: pc.y0_L,
        w: pc.pL2_x2 - pc.pL2_x1,
        h: Math.max(10, pc.y1 - pc.y0_L),
      },
    };
    const r = rectMap[target];
    if (selectedEl.kind === 'block') {
      updateElement(selectedEl.id, {
        x: round1(r.x),
        y: round1(r.y),
        width: round1(r.w),
        height: round1(r.h),
      });
    } else if (selectedEl.kind === 'stripe') {
      updateElement(selectedEl.id, {
        x: round1(r.x),
        y: round1(r.y + (r.h - selectedEl.height) / 2),
        width: round1(r.w),
      });
    } else {
      const w = Math.min(selectedEl.width, Math.max(16, r.w - 8));
      const h = Math.min(selectedEl.height, Math.max(10, r.h - 6));
      updateElement(selectedEl.id, {
        x: round1(r.x + (r.w - w) / 2),
        y: round1(r.y + (r.h - h) / 2),
        width: round1(w),
        height: round1(h),
      });
    }
  };

  return (
    <aside
      aria-label="Panel Artwork 2D"
      className={`surface-rail w-[308px] xl:w-[324px] h-full bg-[var(--surface-top)] border-l-[0.5px] border-[var(--line)] flex flex-col shrink-0 min-h-0 ${className}`}
    >
      {/* Header */}
      <div className="px-3.5 py-2.5 border-b-[0.5px] border-[var(--line)] flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Palette size={15} className="text-[var(--accent-10)] shrink-0" />
          <div className="min-w-0">
            <h2 className="text-[13px] leading-[17px] font-semibold text-[var(--ink-12)] truncate">
              Artwork 2D Studio
            </h2>
            <p className="text-[10.5px] leading-[14px] text-[var(--ink-10)] truncate">
              Ikut terekspor 1:1 mm ke SVG &amp; PDF
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup panel Artwork 2D"
          title="Tutup panel Artwork"
          className="size-7 rounded-[var(--radius-control)] flex items-center justify-center text-[var(--ink-10)] hover:text-[var(--ink-12)] hover:bg-[var(--ink-3)] cursor-pointer shrink-0"
        >
          <X size={14} />
        </button>
      </div>

      {/* 3 Sub-Tabs: Plakban | Pallet L2 | Kanvas */}
      <div className="px-3.5 py-2 border-b-[0.5px] border-[var(--line)] shrink-0">
        <TactileSegmented<ArtworkPanelTab>
          value={activeTab}
          onChange={setTab}
          size="compact"
          fullWidth
          ariaLabel="Bagian Artwork 2D"
          options={[
            { value: 'plakban', label: ac.enabled ? 'Plakban ●' : 'Plakban' },
            { value: 'pallet', label: pm.enabled ? 'Pallet L2 ●' : 'Pallet L2' },
            { value: 'canvas', label: `Kanvas (${elements.length})` },
          ]}
        />
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto px-3.5 py-3 space-y-3.5 text-[12px]">
        {/* TAB 1: ZONA ANTI-COUNTERFEIT (PLAKBAN) */}
        {activeTab === 'plakban' && (
          <div className="space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[12.5px] font-semibold text-[var(--ink-12)] flex items-center gap-1.5">
                  <ShieldCheck size={13} className="text-[var(--accent-10)] shrink-0" />
                  <span>Segel Anti-Counterfeit</span>
                </div>
                <p className="text-[11px] text-[var(--ink-10)] mt-0.5">
                  Terkunci otomatis di area lakban transparan tepi flap
                </p>
              </div>
              <TactileSwitch
                checked={ac.enabled}
                onChange={(enabled) => updateAC({ enabled })}
                ariaLabel="Aktifkan strip anti-counterfeit plakban"
              />
            </div>

            {ac.enabled && (
              <>
                <div className="space-y-2 pt-2 border-t-[0.5px] border-[var(--line)]">
                  <div>
                    <label className="block text-[11px] text-[var(--ink-10)] mb-1">
                      Teks Segel Brand / Anti-Counterfeit
                    </label>
                    <TactileInputWell
                      type="text"
                      value={ac.text}
                      placeholder="Mis. ARNOTT'S atau NAMA BRAND"
                      onChange={(e) => updateAC({ text: e.target.value })}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2">
                      <label className="block text-[11px] text-[var(--ink-10)] mb-1">
                        Lebar Plakban Bening (Zona Aman)
                      </label>
                      <TactileSelect
                        value={String(ac.tapeWidthMm)}
                        options={tapeWidthOptions}
                        onChange={(v) => updateAC({ tapeWidthMm: Number(v) || 48 })}
                        ariaLabel="Lebar plakban"
                      />
                    </div>
                  </div>

                  <div className="rounded-[var(--radius-control)] bg-[var(--ink-2)] px-2.5 py-1.5 space-y-0.5 text-[11px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[var(--ink-10)]">Zona efektif per tepi flap</span>
                      <span className="font-mono tabular-nums font-semibold text-[var(--ink-12)]">
                        {tapeMetrics.zoneDepthMm} mm
                      </span>
                    </div>
                    <div className="text-[10px] text-[var(--ink-10)] font-mono tabular-nums">
                      {tapeMetrics.effectiveGapMm > 0
                        ? `(${ac.tapeWidthMm} − ${tapeMetrics.effectiveGapMm} celah) ÷ 2 = ${tapeMetrics.rawSideMm} mm`
                        : `${ac.tapeWidthMm} ÷ 2 = ${tapeMetrics.rawSideMm} mm (flap overlap)`}
                      {tapeMetrics.wasCappedByFlap ? ' · batas 44% flap' : ''}
                    </div>
                    <div className="text-[10px] text-[var(--ink-10)]">
                      Teks &amp; garis warna masuk penuh di dalam batas lakban.
                    </div>
                  </div>
                </div>

                {/* Pengulangan, Ukuran Teks & Tebal Garis */}
                <div className="space-y-2.5 pt-2 border-t-[0.5px] border-[var(--line)]">
                  <div>
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="text-[var(--ink-10)]">Pengulangan Teks</span>
                      <span className="font-mono tabular-nums text-[var(--ink-12)]">{ac.repeatCount}×</span>
                    </div>
                    <input
                      type="range"
                      min={2}
                      max={10}
                      value={ac.repeatCount}
                      onChange={(e) => updateAC({ repeatCount: Number(e.target.value) })}
                      className="w-full"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] text-[var(--ink-10)] mb-1">
                        Tinggi Font (mm)
                      </label>
                      <TactileInputWell
                        type="number"
                        mono
                        min={2.5}
                        max={14}
                        step={0.5}
                        value={ac.fontSizeMm}
                        onChange={(e) =>
                          updateAC({
                            fontSizeMm: Math.max(2.5, Math.min(14, Number(e.target.value) || 5.5)),
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[var(--ink-10)] mb-1">
                        Tebal Garis (mm)
                      </label>
                      <TactileInputWell
                        type="number"
                        mono
                        min={0}
                        max={8}
                        step={0.5}
                        value={ac.stripeHeightMm}
                        onChange={(e) =>
                          updateAC({
                            stripeHeightMm: Math.max(0, Math.min(8, Number(e.target.value) || 0)),
                          })
                        }
                      />
                    </div>
                  </div>
                </div>

                {/* Flap Placement Toggles */}
                <div className="space-y-1.5 pt-2 border-t-[0.5px] border-[var(--line)]">
                  <div className="text-[11px] text-[var(--ink-10)] mb-1">
                    Posisi Flap Panjang Aktif
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <TactileCheckbox
                      checked={ac.flaps.topL1}
                      onChange={(v) => updateAC({ flaps: { ...ac.flaps, topL1: v } })}
                      label="L1 Atas"
                    />
                    <TactileCheckbox
                      checked={ac.flaps.topL2}
                      onChange={(v) => updateAC({ flaps: { ...ac.flaps, topL2: v } })}
                      label="L2 Atas (Panel 3)"
                    />
                    <TactileCheckbox
                      checked={ac.flaps.bottomL1}
                      onChange={(v) => updateAC({ flaps: { ...ac.flaps, bottomL1: v } })}
                      label="L1 Bawah (180°)"
                    />
                    <TactileCheckbox
                      checked={ac.flaps.bottomL2}
                      onChange={(v) => updateAC({ flaps: { ...ac.flaps, bottomL2: v } })}
                      label="L2 Bawah (180°)"
                    />
                  </div>
                </div>

                {/* Colors */}
                <div className="space-y-2.5 pt-2 border-t-[0.5px] border-[var(--line)]">
                  <div>
                    <div className="flex items-center justify-between text-[11px] mb-1.5">
                      <span className="text-[var(--ink-10)]">Warna Garis Plakban</span>
                      <span className="font-mono text-[10.5px] text-[var(--ink-11)]">{ac.stripeColor}</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {FLEXO_SWATCHES.map((sw) => (
                        <button
                          key={`stripe-${sw.hex}`}
                          type="button"
                          title={sw.name}
                          onClick={() => updateAC({ stripeColor: sw.hex })}
                          className={`size-6 rounded-[var(--radius-sm)] border cursor-pointer transition-transform ${
                            ac.stripeColor.toLowerCase() === sw.hex.toLowerCase()
                              ? 'ring-2 ring-[var(--accent-9)] ring-offset-1 scale-105 border-[var(--ink-12)]'
                              : 'border-[var(--line)] hover:scale-105'
                          }`}
                          style={{ backgroundColor: sw.hex }}
                        />
                      ))}
                      <input
                        type="color"
                        aria-label="Pilih warna garis kustom"
                        value={ac.stripeColor}
                        onChange={(e) => updateAC({ stripeColor: e.target.value })}
                        className="size-6 rounded-[var(--radius-sm)] border border-[var(--line)] cursor-pointer p-0 bg-transparent"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-[11px] mb-1.5">
                      <span className="text-[var(--ink-10)]">Warna Teks Segel</span>
                      <span className="font-mono text-[10.5px] text-[var(--ink-11)]">{ac.textColor}</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {FLEXO_SWATCHES.map((sw) => (
                        <button
                          key={`text-${sw.hex}`}
                          type="button"
                          title={sw.name}
                          onClick={() => updateAC({ textColor: sw.hex })}
                          className={`size-6 rounded-[var(--radius-sm)] border cursor-pointer transition-transform ${
                            ac.textColor.toLowerCase() === sw.hex.toLowerCase()
                              ? 'ring-2 ring-[var(--accent-9)] ring-offset-1 scale-105 border-[var(--ink-12)]'
                              : 'border-[var(--line)] hover:scale-105'
                          }`}
                          style={{ backgroundColor: sw.hex }}
                        />
                      ))}
                      <input
                        type="color"
                        aria-label="Pilih warna teks segel kustom"
                        value={ac.textColor}
                        onChange={(e) => updateAC({ textColor: e.target.value })}
                        className="size-6 rounded-[var(--radius-sm)] border border-[var(--line)] cursor-pointer p-0 bg-transparent"
                      />
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* TAB 2: VEKTOR PALLET PATTERN (FLAP PANEL 3 / L2) */}
        {activeTab === 'pallet' && (
          <div className="space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[12.5px] font-semibold text-[var(--ink-12)]">
                  Vektor AI · Flap Panel 3 (L2)
                </div>
                <p className="text-[11px] text-[var(--ink-10)] mt-0.5">
                  Line-art transparan 3-panel otomatis dari Palletizer
                </p>
              </div>
              <TactileSwitch
                checked={pm.enabled}
                onChange={(enabled) => updatePM({ enabled })}
                ariaLabel="Tampilkan vektor Pallet Pattern di Flap Panel 3"
              />
            </div>

            {!pc.hasTopFlaps && (
              <div className="rounded-[var(--radius-control)] bg-[var(--amber-3)] border-[0.5px] border-[var(--amber-6)] px-2.5 py-2 text-[11px] text-[var(--amber-11)]">
                Style box saat ini (FEFCO 0200 HSC) tidak memiliki flap atas. Ganti ke RSC (0201) untuk menampilkan shipping mark di Flap Panel 3.
              </div>
            )}

            {palletEvaluation && (
              <div className="rounded-[var(--radius-control)] bg-[var(--ink-2)] px-2.5 py-2 space-y-1 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-[var(--ink-10)]">Sinkron Palletizer</span>
                  <span className="font-semibold text-[var(--ink-12)]">{palletEvaluation.label}</span>
                </div>
                <div className="flex items-center justify-between font-mono tabular-nums text-[var(--ink-11)]">
                  <span>{palletEvaluation.casesPerLayer} dus/layer · {palletEvaluation.layerCount} layer</span>
                  <span>{palletEvaluation.totalCases} dus/palet</span>
                </div>
              </div>
            )}

            {pm.enabled && (
              <>
                <div className="space-y-2 pt-2 border-t-[0.5px] border-[var(--line)]">
                  <TactileCheckbox
                    checked={pm.includeFramesAndText}
                    onChange={(includeFramesAndText) => updatePM({ includeFramesAndText })}
                    label="Bingkai kotak & teks dwibahasa (ID/EN)"
                  />
                  <TactileCheckbox
                    checked={pm.includeMaxStackPanel}
                    onChange={(includeMaxStackPanel) => updatePM({ includeMaxStackPanel })}
                    label="Sertakan panel 3 (Maximum Stacking)"
                  />
                </div>

                <div className="space-y-2.5 pt-2 border-t-[0.5px] border-[var(--line)]">
                  <div>
                    <label className="block text-[11px] text-[var(--ink-10)] mb-1">
                      Ketebalan Garis Vektor
                    </label>
                    <TactileSegmented<'thin' | 'standard' | 'bold'>
                      value={pm.strokePreset}
                      onChange={(strokePreset) => updatePM({ strokePreset })}
                      size="compact"
                      fullWidth
                      ariaLabel="Ketebalan garis vektor"
                      options={[
                        { value: 'thin', label: 'Tipis' },
                        { value: 'standard', label: 'Standar' },
                        { value: 'bold', label: 'Tebal' },
                      ]}
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="text-[var(--ink-10)]">Skala di Flap Panel 3</span>
                      <span className="font-mono tabular-nums text-[var(--ink-12)]">{pm.scalePct}%</span>
                    </div>
                    <input
                      type="range"
                      min={55}
                      max={100}
                      value={pm.scalePct}
                      onChange={(e) => updatePM({ scalePct: Number(e.target.value) })}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-[11px] mb-1.5">
                      <span className="text-[var(--ink-10)]">Warna Tinta Vektor</span>
                      <span className="font-mono text-[10.5px] text-[var(--ink-11)]">{pm.inkColor}</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {FLEXO_SWATCHES.slice(0, 6).map((sw) => (
                        <button
                          key={`pm-${sw.hex}`}
                          type="button"
                          title={sw.name}
                          onClick={() => updatePM({ inkColor: sw.hex })}
                          className={`size-6 rounded-[var(--radius-sm)] border cursor-pointer transition-transform ${
                            pm.inkColor.toLowerCase() === sw.hex.toLowerCase()
                              ? 'ring-2 ring-[var(--accent-9)] ring-offset-1 scale-105 border-[var(--ink-12)]'
                              : 'border-[var(--line)] hover:scale-105'
                          }`}
                          style={{ backgroundColor: sw.hex }}
                        />
                      ))}
                      <input
                        type="color"
                        aria-label="Pilih warna tinta vektor kustom"
                        value={pm.inkColor}
                        onChange={(e) => updatePM({ inkColor: e.target.value })}
                        className="size-6 rounded-[var(--radius-sm)] border border-[var(--line)] cursor-pointer p-0 bg-transparent"
                      />
                    </div>
                  </div>
                </div>

                {/* Fine Offset inside Top Flap Panel 3 */}
                <div className="space-y-2 pt-2 border-t-[0.5px] border-[var(--line)]">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-[var(--ink-10)]">Geser Halus di Flap L2 (mm)</span>
                    {(pm.offsetXMm !== 0 || pm.offsetYMm !== 0) && (
                      <button
                        type="button"
                        onClick={() => updatePM({ offsetXMm: 0, offsetYMm: 0 })}
                        className="inline-flex items-center gap-1 text-[var(--accent-10)] hover:underline cursor-pointer"
                      >
                        <RotateCcw size={10} />
                        <span>Pusatkan</span>
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10.5px] text-[var(--ink-10)] mb-0.5">Offset X</label>
                      <TactileInputWell
                        type="number"
                        mono
                        step={1}
                        value={pm.offsetXMm}
                        onChange={(e) => updatePM({ offsetXMm: Number(e.target.value) || 0 })}
                      />
                    </div>
                    <div>
                      <label className="block text-[10.5px] text-[var(--ink-10)] mb-0.5">Offset Y</label>
                      <TactileInputWell
                        type="number"
                        mono
                        step={1}
                        value={pm.offsetYMm}
                        onChange={(e) => updatePM({ offsetYMm: Number(e.target.value) || 0 })}
                      />
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* TAB 3: KANVAS KUSTOM (SHAPE & TEKS BEBAS) */}
        {activeTab === 'canvas' && (
          <div className="space-y-3.5">
            {/* Quick Add 2x2 Grid */}
            <div>
              <div className="text-[11px] text-[var(--ink-10)] mb-1.5">
                Tambah Aset ke Kanvas 2D
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <TactileButton
                  type="button"
                  variant="secondary"
                  size="compact"
                  onClick={() => addElement('stripe')}
                  className="justify-start px-2.5"
                >
                  <Minus size={13} className="text-[var(--accent-10)] shrink-0" />
                  <span>Garis Panjang</span>
                </TactileButton>
                <TactileButton
                  type="button"
                  variant="secondary"
                  size="compact"
                  onClick={() => addElement('block')}
                  className="justify-start px-2.5"
                >
                  <Square size={13} className="text-[var(--accent-10)] fill-current shrink-0" />
                  <span>Blok Penuh</span>
                </TactileButton>
                <TactileButton
                  type="button"
                  variant="secondary"
                  size="compact"
                  onClick={() => addElement('frame')}
                  className="justify-start px-2.5"
                >
                  <SquareDashed size={13} className="text-[var(--accent-10)] shrink-0" />
                  <span>Kotak Frame</span>
                </TactileButton>
                <TactileButton
                  type="button"
                  variant="secondary"
                  size="compact"
                  onClick={() => addElement('text')}
                  className="justify-start px-2.5"
                >
                  <Type size={13} className="text-[var(--accent-10)] shrink-0" />
                  <span>Teks Bebas</span>
                </TactileButton>
              </div>
              <p className="text-[10.5px] text-[var(--ink-10)] mt-1.5 leading-[14px]">
                Klik &amp; seret langsung di kanvas 2D untuk memindahkan, atau tarik titik sudut untuk mengubah ukuran.
              </p>
            </div>

            {/* Selected Element Properties Inspector */}
            {selectedEl && (
              <div className="rounded-[var(--radius-container)] border-[0.5px] border-[var(--accent-7)] bg-[var(--ink-2)]/60 p-2.5 space-y-2.5">
                <div className="flex items-center justify-between gap-1.5">
                  <span className="text-[11.5px] font-semibold text-[var(--ink-12)] truncate">
                    {selectedEl.label}
                  </span>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => updateElement(selectedEl.id, { locked: !selectedEl.locked })}
                      title={selectedEl.locked ? 'Buka kunci posisi' : 'Kunci posisi'}
                      className="size-6 rounded-[var(--radius-sm)] flex items-center justify-center text-[var(--ink-10)] hover:text-[var(--ink-12)] hover:bg-[var(--ink-3)] cursor-pointer"
                    >
                      {selectedEl.locked ? <Lock size={12} /> : <Unlock size={12} />}
                    </button>
                    <button
                      type="button"
                      onClick={duplicateSelected}
                      title="Duplikat elemen"
                      className="size-6 rounded-[var(--radius-sm)] flex items-center justify-center text-[var(--ink-10)] hover:text-[var(--ink-12)] hover:bg-[var(--ink-3)] cursor-pointer"
                    >
                      <Copy size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteElement(selectedEl.id)}
                      title="Hapus elemen"
                      className="size-6 rounded-[var(--radius-sm)] flex items-center justify-center text-[var(--red-11)] hover:bg-[var(--red-3)] cursor-pointer"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                {/* Text Controls */}
                {selectedEl.kind === 'text' && (
                  <div className="space-y-2">
                    <div>
                      <label className="block text-[10.5px] text-[var(--ink-10)] mb-0.5">
                        Isi Teks (bisa multi-baris)
                      </label>
                      <TactileTextareaWell
                        rows={2}
                        value={selectedEl.text || ''}
                        onChange={(e) =>
                          updateElement(selectedEl.id, {
                            text: e.target.value,
                            label: e.target.value.trim().slice(0, 18) || 'Teks Bebas',
                          })
                        }
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 items-end">
                      <div>
                        <label className="block text-[10.5px] text-[var(--ink-10)] mb-0.5">
                          Font (mm)
                        </label>
                        <TactileInputWell
                          type="number"
                          mono
                          min={2}
                          max={60}
                          step={0.5}
                          value={selectedEl.fontSizeMm ?? 10}
                          onChange={(e) => {
                            const fs = Math.max(2, Math.min(60, Number(e.target.value) || 8));
                            updateElement(selectedEl.id, {
                              fontSizeMm: fs,
                              height: Math.max(selectedEl.height, round1(fs * 1.4)),
                            });
                          }}
                        />
                      </div>
                      <TactileButton
                        type="button"
                        variant={selectedEl.fontWeight === 'bold' ? 'primary' : 'secondary'}
                        size="compact"
                        onClick={() =>
                          updateElement(selectedEl.id, {
                            fontWeight: selectedEl.fontWeight === 'bold' ? 'normal' : 'bold',
                          })
                        }
                        title="Tebal (Bold)"
                      >
                        <Bold size={12} />
                        <span>Bold</span>
                      </TactileButton>
                      <div className="flex items-center bg-[var(--surface-top)] border-[0.5px] border-[var(--line)] rounded-[var(--radius-control)] p-[2px]">
                        {(
                          [
                            { v: 'left', Icon: AlignLeft },
                            { v: 'center', Icon: AlignCenter },
                            { v: 'right', Icon: AlignRight },
                          ] as const
                        ).map(({ v, Icon }) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => updateElement(selectedEl.id, { textAlign: v })}
                            className={`flex-1 h-[24px] rounded-[var(--radius-sm)] flex items-center justify-center cursor-pointer ${
                              (selectedEl.textAlign || 'center') === v
                                ? 'bg-[var(--ink-12)] text-white'
                                : 'text-[var(--ink-10)] hover:text-[var(--ink-12)]'
                            }`}
                          >
                            <Icon size={12} />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Quick 1-Click Snap to Panel */}
                <div>
                  <div className="text-[10.5px] text-[var(--ink-10)] mb-1">
                    Pas Cepat ke Panel (1-Klik)
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {(
                      [
                        { id: 'L1', label: 'Panel L1' },
                        { id: 'W1', label: 'Panel W1' },
                        { id: 'L2', label: 'Panel L2' },
                        { id: 'W2', label: 'Panel W2' },
                        { id: 'topL1', label: 'Flap L1' },
                        { id: 'topL2', label: 'Flap L2' },
                      ] as Array<{ id: SnapTarget; label: string }>
                    ).map((btn) => (
                      <button
                        key={btn.id}
                        type="button"
                        onClick={() => snapElementToPanel(btn.id)}
                        className="h-[24px] px-1.5 rounded-[var(--radius-sm)] bg-[var(--surface-top)] border-[0.5px] border-[var(--line)] text-[10.5px] text-[var(--ink-11)] hover:text-[var(--ink-12)] hover:border-[var(--ink-8)] cursor-pointer transition-colors"
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Coordinates X / Y / W / H (mm) */}
                <div className="grid grid-cols-4 gap-1.5">
                  <div>
                    <label className="block text-[10px] text-[var(--ink-10)] mb-0.5">X (mm)</label>
                    <TactileInputWell
                      type="number"
                      mono
                      step={1}
                      value={round1(selectedEl.x)}
                      onChange={(e) => updateElement(selectedEl.id, { x: Number(e.target.value) || 0 })}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-[var(--ink-10)] mb-0.5">Y (mm)</label>
                    <TactileInputWell
                      type="number"
                      mono
                      step={1}
                      value={round1(selectedEl.y)}
                      onChange={(e) => updateElement(selectedEl.id, { y: Number(e.target.value) || 0 })}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-[var(--ink-10)] mb-0.5">W (mm)</label>
                    <TactileInputWell
                      type="number"
                      mono
                      min={2}
                      step={1}
                      value={round1(selectedEl.width)}
                      onChange={(e) =>
                        updateElement(selectedEl.id, {
                          width: Math.max(2, Number(e.target.value) || 2),
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-[var(--ink-10)] mb-0.5">H (mm)</label>
                    <TactileInputWell
                      type="number"
                      mono
                      min={1}
                      step={1}
                      value={round1(selectedEl.height)}
                      onChange={(e) =>
                        updateElement(selectedEl.id, {
                          height: Math.max(1, Number(e.target.value) || 1),
                        })
                      }
                    />
                  </div>
                </div>

                {/* Rotation */}
                <div>
                  <label className="block text-[10.5px] text-[var(--ink-10)] mb-1">Rotasi</label>
                  <TactileSegmented<'0' | '90' | '180' | '270'>
                    value={String(selectedEl.rotation) as '0' | '90' | '180' | '270'}
                    onChange={(v) =>
                      updateElement(selectedEl.id, { rotation: Number(v) as 0 | 90 | 180 | 270 })
                    }
                    size="compact"
                    fullWidth
                    ariaLabel="Rotasi elemen"
                    options={[
                      { value: '0', label: '0°' },
                      { value: '90', label: '90°' },
                      { value: '180', label: '180°' },
                      { value: '270', label: '270°' },
                    ]}
                  />
                </div>

                {/* Fill / Text Color */}
                <div>
                  <div className="flex items-center justify-between text-[10.5px] mb-1">
                    <span className="text-[var(--ink-10)]">
                      {selectedEl.kind === 'text' ? 'Warna Teks' : 'Warna Isi (Fill)'}
                    </span>
                    <span className="font-mono text-[10px] text-[var(--ink-11)]">
                      {selectedEl.fillColor === 'none' ? 'Transparan' : selectedEl.fillColor}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {selectedEl.kind !== 'text' && (
                      <button
                        type="button"
                        title="Transparan (Tanpa Isi)"
                        onClick={() => updateElement(selectedEl.id, { fillColor: 'none' })}
                        className={`size-6 rounded-[var(--radius-sm)] border text-[9px] font-bold flex items-center justify-center cursor-pointer bg-white text-[var(--red-11)] ${
                          selectedEl.fillColor === 'none'
                            ? 'ring-2 ring-[var(--accent-9)] ring-offset-1 border-[var(--ink-12)]'
                            : 'border-[var(--line)]'
                        }`}
                      >
                        /
                      </button>
                    )}
                    {FLEXO_SWATCHES.map((sw) => (
                      <button
                        key={`el-fill-${sw.hex}`}
                        type="button"
                        title={sw.name}
                        onClick={() => updateElement(selectedEl.id, { fillColor: sw.hex })}
                        className={`size-6 rounded-[var(--radius-sm)] border cursor-pointer ${
                          selectedEl.fillColor.toLowerCase() === sw.hex.toLowerCase()
                            ? 'ring-2 ring-[var(--accent-9)] ring-offset-1 border-[var(--ink-12)]'
                            : 'border-[var(--line)]'
                        }`}
                        style={{ backgroundColor: sw.hex }}
                      />
                    ))}
                    <input
                      type="color"
                      aria-label="Warna isi kustom"
                      value={selectedEl.fillColor === 'none' ? '#111827' : selectedEl.fillColor}
                      onChange={(e) => updateElement(selectedEl.id, { fillColor: e.target.value })}
                      className="size-6 rounded-[var(--radius-sm)] border border-[var(--line)] cursor-pointer p-0 bg-transparent"
                    />
                  </div>
                </div>

                {/* Stroke (for non-text shapes) */}
                {selectedEl.kind !== 'text' && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[10.5px]">
                      <span className="text-[var(--ink-10)]">Garis Tepi (Stroke)</span>
                      <span className="font-mono text-[10px] text-[var(--ink-11)]">
                        {selectedEl.strokeColor === 'none'
                          ? 'Tanpa garis'
                          : `${selectedEl.strokeColor} · ${selectedEl.strokeWidthMm} mm`}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        title="Tanpa Garis Tepi"
                        onClick={() =>
                          updateElement(selectedEl.id, { strokeColor: 'none', strokeWidthMm: 0 })
                        }
                        className={`size-6 rounded-[var(--radius-sm)] border text-[9px] font-bold flex items-center justify-center cursor-pointer bg-white text-[var(--red-11)] ${
                          selectedEl.strokeColor === 'none'
                            ? 'ring-2 ring-[var(--accent-9)] ring-offset-1 border-[var(--ink-12)]'
                            : 'border-[var(--line)]'
                        }`}
                      >
                        /
                      </button>
                      {FLEXO_SWATCHES.slice(0, 5).map((sw) => (
                        <button
                          key={`el-stroke-${sw.hex}`}
                          type="button"
                          title={sw.name}
                          onClick={() =>
                            updateElement(selectedEl.id, {
                              strokeColor: sw.hex,
                              strokeWidthMm: Math.max(0.8, selectedEl.strokeWidthMm || 1.2),
                            })
                          }
                          className={`size-6 rounded-[var(--radius-sm)] border cursor-pointer ${
                            selectedEl.strokeColor.toLowerCase() === sw.hex.toLowerCase()
                              ? 'ring-2 ring-[var(--accent-9)] ring-offset-1 border-[var(--ink-12)]'
                              : 'border-[var(--line)]'
                          }`}
                          style={{ backgroundColor: sw.hex }}
                        />
                      ))}
                      <input
                        type="number"
                        aria-label="Ketebalan garis mm"
                        min={0}
                        max={8}
                        step={0.3}
                        value={selectedEl.strokeWidthMm}
                        onChange={(e) => {
                          const w = Math.max(0, Math.min(8, Number(e.target.value) || 0));
                          updateElement(selectedEl.id, {
                            strokeWidthMm: w,
                            strokeColor: w === 0 ? 'none' : selectedEl.strokeColor === 'none' ? '#111827' : selectedEl.strokeColor,
                          });
                        }}
                        className="w-[54px] h-6 px-1.5 rounded-[var(--radius-sm)] bg-[var(--surface-top)] border-[0.5px] border-[var(--line)] font-mono text-[11px] text-[var(--ink-12)]"
                      />
                    </div>
                  </div>
                )}

                {/* Opacity */}
                <div>
                  <div className="flex items-center justify-between text-[10.5px] mb-1">
                    <span className="text-[var(--ink-10)]">Opasitas</span>
                    <span className="font-mono tabular-nums text-[var(--ink-12)]">
                      {Math.round(selectedEl.opacity * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    value={Math.round(selectedEl.opacity * 100)}
                    onChange={(e) =>
                      updateElement(selectedEl.id, { opacity: Number(e.target.value) / 100 })
                    }
                    className="w-full"
                  />
                </div>
              </div>
            )}

            {/* Layer List */}
            <div className="pt-2 border-t-[0.5px] border-[var(--line)] space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-[var(--ink-10)]">
                <span>Daftar Elemen Kustom</span>
                <span className="font-mono tabular-nums">{elements.length} item</span>
              </div>

              {elements.length === 0 ? (
                <div className="rounded-[var(--radius-control)] border-[0.5px] border-dashed border-[var(--line)] px-3 py-4 text-center text-[11px] text-[var(--ink-10)]">
                  Belum ada shape atau teks kustom. Klik salah satu tombol di atas untuk mulai mendesain di kanvas 2D.
                </div>
              ) : (
                <div className="space-y-1">
                  {[...elements].reverse().map((el) => {
                    const isSel = el.id === selectedElementId;
                    return (
                      <div
                        key={el.id}
                        onClick={() => onSelectElement(el.id)}
                        className={`px-2 py-1.5 rounded-[var(--radius-control)] border-[0.5px] flex items-center justify-between gap-1.5 cursor-pointer transition-colors ${
                          isSel
                            ? 'bg-[var(--accent-3)]/70 border-[var(--accent-7)] text-[var(--ink-12)]'
                            : 'bg-[var(--surface-top)] border-[var(--line)] hover:bg-[var(--ink-2)] text-[var(--ink-11)]'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="size-3 rounded-[2px] border border-[var(--line)] shrink-0"
                            style={{
                              backgroundColor:
                                el.fillColor !== 'none'
                                  ? el.fillColor
                                  : el.strokeColor !== 'none'
                                  ? el.strokeColor
                                  : '#111827',
                            }}
                          />
                          <span className="text-[11.5px] font-medium truncate">{el.label}</span>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              reorderElement(el.id, 'up');
                            }}
                            title="Naikkan layer"
                            className="size-5 rounded flex items-center justify-center text-[var(--ink-10)] hover:text-[var(--ink-12)] hover:bg-[var(--ink-3)] cursor-pointer"
                          >
                            <ArrowUp size={11} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              reorderElement(el.id, 'down');
                            }}
                            title="Turunkan layer"
                            className="size-5 rounded flex items-center justify-center text-[var(--ink-10)] hover:text-[var(--ink-12)] hover:bg-[var(--ink-3)] cursor-pointer"
                          >
                            <ArrowDown size={11} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteElement(el.id);
                            }}
                            title="Hapus"
                            className="size-5 rounded flex items-center justify-center text-[var(--red-11)] hover:bg-[var(--red-3)] cursor-pointer"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
