import React from 'react';
import { AlertTriangle, CheckCircle2, Info, Package, Truck } from 'lucide-react';
import {
  FloorLoadingEvaluation,
  PalletConfig,
  PalletPatternEvaluation,
  PalletVehicleConfig,
  VehicleLoadingEvaluation,
  VehicleLoadingMode,
  VehiclePalletVsFloorComparison,
} from '../types';
import { TactileButton, TactileSegmented } from './tactile/TactileUI';

interface VehicleLoadingBlueprintProps {
  vehicle: PalletVehicleConfig;
  pallet: PalletConfig;
  evaluation: PalletPatternEvaluation;
  vehicleEval: VehicleLoadingEvaluation;
  floorEval: FloorLoadingEvaluation;
  comparison: VehiclePalletVsFloorComparison;
  onChangeLoadingMode: (mode: VehicleLoadingMode) => void;
  onSwitchTo3D: () => void;
}

export default function VehicleLoadingBlueprint({
  vehicle,
  pallet,
  evaluation,
  vehicleEval,
  floorEval,
  comparison,
  onChangeLoadingMode,
  onSwitchTo3D,
}: VehicleLoadingBlueprintProps) {
  const activeMode: VehicleLoadingMode = vehicle.loadingMode ?? 'palletized';
  const isFloorMode = activeMode === 'floor-loading';

  const floorPallets = vehicleEval.placements.filter((p) => p.tier === 1);
  const vL = Math.max(1000, vehicle.internalLengthMm);
  const vW = Math.max(1000, vehicle.internalWidthMm);
  const vH = Math.max(1000, vehicle.internalHeightMm);
  const doorH = Math.min(vH, Math.max(800, vehicle.doorHeightMm));

  // ---- TOP VIEW SVG COORDINATES ----
  const topSvgW = 920;
  const topSvgH = 290;
  const padL = 74;
  const padR = 96;
  const padT = 44;
  const padB = 46;
  const topScale = Math.min((topSvgW - padL - padR) / vL, (topSvgH - padT - padB) / vW);
  const topBoxW = vL * topScale;
  const topBoxH = vW * topScale;
  const topOx = padL + (topSvgW - padL - padR - topBoxW) / 2;
  const topOy = padT + (topSvgH - padT - padB - topBoxH) / 2;

  const toTopX = (mmX: number) => topOx + mmX * topScale;
  const toTopY = (mmZ: number) => topOy + (mmZ + vW / 2) * topScale;

  // ---- SIDE VIEW SVG COORDINATES ----
  const sideSvgW = 920;
  const sideSvgH = 250;
  const sPadL = 74;
  const sPadR = 112;
  const sPadT = 36;
  const sPadB = 40;
  const sideScale = Math.min((sideSvgW - sPadL - sPadR) / vL, (sideSvgH - sPadT - sPadB) / vH);
  const sideBoxW = vL * sideScale;
  const sideBoxH = vH * sideScale;
  const sideOx = sPadL + (sideSvgW - sPadL - sPadR - sideBoxW) / 2;
  const sideFloorY = sPadT + sideBoxH + (sideSvgH - sPadT - sPadB - sideBoxH) / 2;

  const toSideX = (mmX: number) => sideOx + mmX * sideScale;
  const toSideY = (mmY: number) => sideFloorY - mmY * sideScale;

  // Group pallets by unique X column along length for Side View projection
  const sideColumns = React.useMemo(() => {
    const map = new Map<
      string,
      { x: number; sizeX: number; hasTier2: boolean; countInCol: number }
    >();
    for (const p of vehicleEval.placements) {
      const key = `${Math.round(p.x / 20)}-${Math.round(p.sizeX / 20)}`;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          x: p.x,
          sizeX: p.sizeX,
          hasTier2: p.tier === 2,
          countInCol: 1,
        });
      } else {
        if (p.tier === 2) existing.hasTier2 = true;
        existing.countInCol += 1;
      }
    }
    return Array.from(map.values()).sort((a, b) => a.x - b.x);
  }, [vehicleEval.placements]);

  // Group floor-loading cartons by unique X column along length for Side View projection
  const floorSideColumns = React.useMemo(() => {
    const map = new Map<string, { x: number; sizeX: number; rotated90: boolean }>();
    for (const s of floorEval.floorSlots) {
      const key = `${Math.round(s.x / 10)}-${Math.round(s.sizeX / 10)}`;
      if (!map.has(key)) {
        map.set(key, { x: s.x, sizeX: s.sizeX, rotated90: s.rotated90 });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.x - b.x);
  }, [floorEval.floorSlots]);

  const activeOverallStatus = isFloorMode ? floorEval.overallStatus : vehicleEval.overallStatus;
  const statusBadge =
    activeOverallStatus === 'optimal'
      ? {
          label: 'Muat Optimal',
          cls: 'bg-[var(--green-3)] border-[var(--green-6)] text-[var(--green-11)]',
        }
      : activeOverallStatus === 'warning'
      ? {
          label: 'Perlu Perhatian',
          cls: 'bg-[var(--amber-3)] border-[var(--amber-6)] text-[var(--amber-11)]',
        }
      : {
          label: 'Risiko / Tidak Muat',
          cls: 'bg-[var(--red-3)] border-[var(--red-6)] text-[var(--red-11)]',
        };

  const activeWarnings = isFloorMode ? floorEval.warnings : vehicleEval.warnings;
  const activeEffW = isFloorMode ? floorEval.effectiveWidthMm : vehicleEval.effectiveWidthMm;
  const activeEffL = isFloorMode ? floorEval.effectiveLengthMm : vehicleEval.effectiveLengthMm;
  const activeEffH = isFloorMode
    ? floorEval.effectiveClearHeightMm
    : vehicleEval.effectiveClearHeightMm;

  const formatDuration = (mins: number) => {
    if (mins < 60) return `~${mins} mnt`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `~${h}j ${m}m` : `~${h} jam`;
  };

  return (
    <div className="w-full h-full overflow-y-auto bg-[var(--ground)] p-4 sm:p-5">
      <div className="max-w-[1060px] mx-auto space-y-4">
        {/* Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b-[0.5px] border-[var(--line)]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Truck size={15} className="text-[var(--ink-12)] shrink-0" />
              <h2 className="text-[14px] font-semibold text-[var(--ink-12)] truncate">
                Denah Muat {isFloorMode ? 'Floor Loading' : 'Palet'} — {vehicle.name}
              </h2>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-[var(--radius-sm)] border-[0.5px] text-[10.5px] font-medium ${statusBadge.cls}`}
              >
                {statusBadge.label}
              </span>
            </div>
            <p className="text-[11.5px] text-[var(--ink-10)] mt-0.5 font-mono tabular-nums">
              Dalam {vL.toLocaleString('id-ID')}×{vW.toLocaleString('id-ID')}×{vH.toLocaleString('id-ID')} mm · Pintu{' '}
              {vehicle.doorWidthMm.toLocaleString('id-ID')}×{vehicle.doorHeightMm.toLocaleString('id-ID')} mm · Pola{' '}
              {isFloorMode
                ? `${floorEval.layoutLabel} · ${floorEval.layersLoaded} Layer`
                : `${vehicleEval.layoutLabel} · ${vehicleEval.activeTiers} Tier`}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <TactileSegmented<VehicleLoadingMode>
              value={activeMode}
              onChange={onChangeLoadingMode}
              size="compact"
              ariaLabel="Metode muat armada"
              options={[
                { value: 'palletized', label: 'Pakai Palet' },
                { value: 'floor-loading', label: 'Floor Loading' },
              ]}
            />
            <TactileButton type="button" variant="secondary" size="compact" onClick={onSwitchTo3D}>
              <Package size={13} />
              <span>Kembali ke 3D Palet</span>
            </TactileButton>
          </div>
        </div>

        {/* Side-by-Side Comparison Strip: Palet vs Floor Loading */}
        <div className="rounded-[var(--radius-container)] border-[0.5px] border-[var(--line)] bg-[var(--surface-top)] px-3.5 py-2.5 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] font-mono tabular-nums">
            <span className="font-sans font-semibold text-[var(--ink-12)]">
              Palet vs Floor Loading:
            </span>
            <span className="text-[var(--ink-11)]">
              Palet{' '}
              <strong className="text-[var(--ink-12)]">
                {comparison.palletCases.toLocaleString('id-ID')} dus
              </strong>{' '}
              ({comparison.palletVolumePct}% vol · {formatDuration(comparison.palletLoadMinutesEst)})
            </span>
            <span className="text-[var(--ink-7)]">vs</span>
            <span className="text-[var(--ink-11)]">
              Floor{' '}
              <strong className="text-[var(--ink-12)]">
                {comparison.floorCases.toLocaleString('id-ID')} dus
              </strong>{' '}
              ({comparison.floorVolumePct}% vol · {formatDuration(comparison.floorLoadMinutesEst)})
            </span>
            <span
              className={`font-semibold ${
                comparison.deltaCases > 0 ? 'text-[var(--green-11)]' : 'text-[var(--ink-11)]'
              }`}
            >
              {comparison.deltaCases >= 0 ? '+' : ''}
              {comparison.deltaCases.toLocaleString('id-ID')} dus ({comparison.deltaCasesPct >= 0 ? '+' : ''}
              {comparison.deltaCasesPct}%)
            </span>
          </div>
          <div className="text-[11px] text-[var(--ink-10)] leading-[15px] lg:text-right">
            {comparison.recommendationNote}
          </div>
        </div>

        {/* 4 Summary KPI Cards */}
        {isFloorMode ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            <div className="rounded-[var(--radius-container)] border-[0.5px] border-[var(--line)] bg-[var(--surface-top)] p-3">
              <div className="text-[10.5px] uppercase tracking-[0.04em] text-[var(--ink-10)]">
                Total Karton (Floor Load)
              </div>
              <div className="mt-1 font-mono tabular-nums text-[18px] font-bold text-[var(--ink-12)]">
                {floorEval.totalCases.toLocaleString('id-ID')}{' '}
                <span className="text-[11.5px] font-normal text-[var(--ink-10)]">dus</span>
              </div>
              <div className="text-[11px] font-mono tabular-nums text-[var(--ink-10)] mt-0.5">
                {floorEval.totalUnits.toLocaleString('id-ID')} pcs · {formatDuration(floorEval.estimatedHandLoadMinutes)}
              </div>
            </div>

            <div className="rounded-[var(--radius-container)] border-[0.5px] border-[var(--line)] bg-[var(--surface-top)] p-3">
              <div className="text-[10.5px] uppercase tracking-[0.04em] text-[var(--ink-10)]">
                Susunan Lantai &amp; Tumpukan
              </div>
              <div className="mt-1 font-mono tabular-nums text-[18px] font-bold text-[var(--ink-12)]">
                {floorEval.casesPerLayer}{' '}
                <span className="text-[11.5px] font-normal text-[var(--ink-10)]">
                  × {floorEval.layersLoaded} lyr
                </span>
              </div>
              <div className="text-[11px] font-mono tabular-nums text-[var(--ink-10)] mt-0.5">
                Tinggi {floorEval.stackHeightMm} mm · BCT aman ≤{floorEval.maxSafeLayersByBct} lyr
              </div>
            </div>

            <div className="rounded-[var(--radius-container)] border-[0.5px] border-[var(--line)] bg-[var(--surface-top)] p-3">
              <div className="text-[10.5px] uppercase tracking-[0.04em] text-[var(--ink-10)]">
                Utilisasi Kubik (CBM)
              </div>
              <div className="mt-1 font-mono tabular-nums text-[18px] font-bold text-[var(--ink-12)]">
                {floorEval.volumeUtilizationPct}%{' '}
                <span className="text-[11.5px] font-normal text-[var(--ink-10)]">vol</span>
              </div>
              <div className="text-[11px] font-mono tabular-nums text-[var(--ink-10)] mt-0.5">
                {floorEval.cargoVolumeCbm} / {floorEval.vehicleVolumeCbm} CBM · Lantai {floorEval.floorUtilizationPct}%
              </div>
            </div>

            <div className="rounded-[var(--radius-container)] border-[0.5px] border-[var(--line)] bg-[var(--surface-top)] p-3">
              <div className="text-[10.5px] uppercase tracking-[0.04em] text-[var(--ink-10)]">
                BCT Dasar &amp; Payload
              </div>
              <div
                className={`mt-1 font-mono tabular-nums text-[18px] font-bold ${
                  floorEval.bctStatus === 'overload'
                    ? 'text-[var(--red-11)]'
                    : floorEval.bctStatus === 'marginal'
                    ? 'text-[var(--amber-11)]'
                    : 'text-[var(--green-11)]'
                }`}
              >
                SF {floorEval.bottomLayerSafetyFactor}:1{' '}
                <span className="text-[11.5px] font-normal text-[var(--ink-10)]">
                  ({(floorEval.totalGrossWeightKg / 1000).toFixed(2)}t)
                </span>
              </div>
              <div className="text-[11px] font-mono tabular-nums text-[var(--ink-10)] mt-0.5">
                Beban dasar {floorEval.bottomLayerLoadKgf} kgf · {floorEval.weightUtilizationPct}% payload
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            <div className="rounded-[var(--radius-container)] border-[0.5px] border-[var(--line)] bg-[var(--surface-top)] p-3">
              <div className="text-[10.5px] uppercase tracking-[0.04em] text-[var(--ink-10)]">
                Total Muatan Palet
              </div>
              <div className="mt-1 font-mono tabular-nums text-[18px] font-bold text-[var(--ink-12)]">
                {vehicleEval.totalPallets}{' '}
                <span className="text-[11.5px] font-normal text-[var(--ink-10)]">palet</span>
              </div>
              <div className="text-[11px] font-mono tabular-nums text-[var(--ink-10)] mt-0.5">
                {vehicleEval.floorPalletCount} lantai × {vehicleEval.activeTiers} tier
                {vehicleEval.limitedByWeight ? ` (limit berat)` : ''}
              </div>
            </div>

            <div className="rounded-[var(--radius-container)] border-[0.5px] border-[var(--line)] bg-[var(--surface-top)] p-3">
              <div className="text-[10.5px] uppercase tracking-[0.04em] text-[var(--ink-10)]">
                Total Master Dus &amp; Produk
              </div>
              <div className="mt-1 font-mono tabular-nums text-[18px] font-bold text-[var(--ink-12)]">
                {vehicleEval.totalCases.toLocaleString('id-ID')}{' '}
                <span className="text-[11.5px] font-normal text-[var(--ink-10)]">dus</span>
              </div>
              <div className="text-[11px] font-mono tabular-nums text-[var(--ink-10)] mt-0.5">
                {vehicleEval.totalUnits.toLocaleString('id-ID')} pcs · {evaluation.totalCases} dus/palet
              </div>
            </div>

            <div className="rounded-[var(--radius-container)] border-[0.5px] border-[var(--line)] bg-[var(--surface-top)] p-3">
              <div className="text-[10.5px] uppercase tracking-[0.04em] text-[var(--ink-10)]">
                Utilisasi Volume &amp; Lantai
              </div>
              <div className="mt-1 font-mono tabular-nums text-[18px] font-bold text-[var(--ink-12)]">
                {vehicleEval.volumeUtilizationPct}%{' '}
                <span className="text-[11.5px] font-normal text-[var(--ink-10)]">vol</span>
              </div>
              <div className="text-[11px] font-mono tabular-nums text-[var(--ink-10)] mt-0.5">
                Lantai {vehicleEval.floorUtilizationPct}% ·{' '}
                {((vL * vW * vH) / 1e9).toFixed(1)} CBM
              </div>
            </div>

            <div className="rounded-[var(--radius-container)] border-[0.5px] border-[var(--line)] bg-[var(--surface-top)] p-3">
              <div className="text-[10.5px] uppercase tracking-[0.04em] text-[var(--ink-10)]">
                Bobot vs Maks Payload
              </div>
              <div
                className={`mt-1 font-mono tabular-nums text-[18px] font-bold ${
                  vehicleEval.weightUtilizationPct > 100
                    ? 'text-[var(--red-11)]'
                    : vehicleEval.weightUtilizationPct > 90
                    ? 'text-[var(--amber-11)]'
                    : 'text-[var(--ink-12)]'
                }`}
              >
                {(vehicleEval.totalGrossWeightKg / 1000).toFixed(2)}{' '}
                <span className="text-[11.5px] font-normal text-[var(--ink-10)]">
                  / {(vehicle.maxPayloadKg / 1000).toFixed(1)} t
                </span>
              </div>
              <div className="text-[11px] font-mono tabular-nums text-[var(--ink-10)] mt-0.5">
                {vehicleEval.weightUtilizationPct}% payload · Netto{' '}
                {vehicleEval.totalNetCargoKg.toLocaleString('id-ID')} kg
              </div>
            </div>
          </div>
        )}

        {/* CARD 1: 2D TOP VIEW BLUEPRINT */}
        <div className="rounded-[var(--radius-container)] border-[0.5px] border-[var(--line)] bg-[var(--surface-top)] overflow-hidden">
          <div className="px-3.5 py-2 border-b-[0.5px] border-[var(--line)] bg-[var(--ink-2)] flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--ink-12)]">
              {isFloorMode
                ? 'Denah 2D Top View — Susunan Karton Floor Loading & Zona Dunnage'
                : 'Denah 2D Top View (Tampak Atas & Clearance Dinding Forklift)'}
            </span>
            <div className="flex items-center gap-3 text-[11px] font-mono tabular-nums text-[var(--ink-11)]">
              {isFloorMode ? (
                <>
                  <span>Sisi Kosong: ±{floorEval.actualSideVoidPerSideMm} mm/sisi</span>
                  <span>·</span>
                  <span>Sisa Belakang: {floorEval.actualRearVoidMm} mm</span>
                  <span>·</span>
                  <span>{floorEval.casesPerLayer} dus/layer</span>
                </>
              ) : (
                <>
                  <span>Sisi Dinding: ±{vehicleEval.actualSideClearancePerSideMm} mm/sisi</span>
                  <span>·</span>
                  <span>Celah Palet: {vehicle.palletGapMm} mm</span>
                  <span>·</span>
                  <span>Pintu Belakang: {vehicleEval.actualRearDoorClearanceMm} mm</span>
                </>
              )}
            </div>
          </div>

          <div className="p-3 bg-white">
            <svg
              viewBox={`0 0 ${topSvgW} ${topSvgH}`}
              className="w-full h-auto block"
              role="img"
              aria-label={
                isFloorMode
                  ? 'Denah 2D Top View susunan karton floor loading di dalam kendaraan'
                  : 'Denah 2D Top View susunan palet di dalam kendaraan'
              }
            >
              {/* Vehicle Outer Shell */}
              <rect
                x={topOx}
                y={topOy}
                width={topBoxW}
                height={topBoxH}
                fill="#F8FAFC"
                stroke="#17191F"
                strokeWidth={2}
              />

              {/* Wingbox Side Opening Dashed Highlight */}
              {vehicle.loadingAccess === 'side-wingbox' && (
                <>
                  <line
                    x1={topOx + 8}
                    y1={topOy}
                    x2={topOx + topBoxW - 8}
                    y2={topOy}
                    stroke="#4F46E5"
                    strokeWidth={3}
                    strokeDasharray="6 4"
                  />
                  <line
                    x1={topOx + 8}
                    y1={topOy + topBoxH}
                    x2={topOx + topBoxW - 8}
                    y2={topOy + topBoxH}
                    stroke="#4F46E5"
                    strokeWidth={3}
                    strokeDasharray="6 4"
                  />
                </>
              )}

              {/* Rear Door Opening Highlight */}
              {vehicle.loadingAccess === 'rear' && (
                <line
                  x1={topOx + topBoxW}
                  y1={toTopY(-vehicle.doorWidthMm / 2)}
                  x2={topOx + topBoxW}
                  y2={toTopY(vehicle.doorWidthMm / 2)}
                  stroke="#EA580C"
                  strokeWidth={3.5}
                />
              )}

              {/* Safe Envelope (Dashed Indigo) */}
              <rect
                x={toTopX(vehicle.nonStandardToleranceMm)}
                y={toTopY(-activeEffW / 2)}
                width={activeEffL * topScale}
                height={activeEffW * topScale}
                fill="none"
                stroke="#4F46E5"
                strokeWidth={1}
                strokeDasharray="4 3"
              />

              {/* Floor Loading Cartons OR Pallets */}
              {isFloorMode ? (
                <>
                  {floorEval.floorSlots.map((slot, idx) => {
                    const sx = toTopX(slot.x - slot.sizeX / 2);
                    const sy = toTopY(slot.z - slot.sizeZ / 2);
                    const sw = Math.max(1.5, slot.sizeX * topScale);
                    const sh = Math.max(1.5, slot.sizeZ * topScale);
                    return (
                      <rect
                        key={idx}
                        x={sx}
                        y={sy}
                        width={sw}
                        height={sh}
                        rx={0.8}
                        fill={slot.rotated90 ? '#DBEAFE' : '#FEF3C7'}
                        stroke="#17191F"
                        strokeWidth={floorEval.floorSlots.length > 180 ? 0.45 : 0.75}
                      />
                    );
                  })}

                  {/* Rear Dunnage / Airbag Void Shading when rear void >= 140 mm */}
                  {floorEval.actualRearVoidMm >= 140 && floorEval.usedLengthMm > 0 && (
                    <g>
                      <rect
                        x={toTopX(vehicle.nonStandardToleranceMm + floorEval.usedLengthMm + 4)}
                        y={toTopY(-floorEval.usedWidthMm / 2)}
                        width={Math.max(4, (floorEval.actualRearVoidMm - 12) * topScale)}
                        height={floorEval.usedWidthMm * topScale}
                        fill="#FFFBEB"
                        fillOpacity={0.85}
                        stroke="#D97706"
                        strokeWidth={1}
                        strokeDasharray="4 3"
                      />
                      {(floorEval.actualRearVoidMm - 12) * topScale > 34 && (
                        <text
                          x={
                            toTopX(
                              vehicle.nonStandardToleranceMm +
                                floorEval.usedLengthMm +
                                floorEval.actualRearVoidMm / 2
                            )
                          }
                          y={toTopY(0)}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fontSize={8.5}
                          fontFamily="monospace"
                          fontWeight="600"
                          fill="#B45309"
                          transform={`rotate(-90 ${toTopX(
                            vehicle.nonStandardToleranceMm +
                              floorEval.usedLengthMm +
                              floorEval.actualRearVoidMm / 2
                          )} ${toTopY(0)})`}
                        >
                          DUNNAGE / LASHING
                        </text>
                      )}
                    </g>
                  )}
                </>
              ) : (
                floorPallets.map((p) => {
                  const px = toTopX(p.x - p.sizeX / 2);
                  const py = toTopY(p.z - p.sizeZ / 2);
                  const pw = p.sizeX * topScale;
                  const ph = p.sizeZ * topScale;
                  const hasDouble = vehicleEval.placements.some(
                    (other) =>
                      other.tier === 2 &&
                      Math.abs(other.x - p.x) < 5 &&
                      Math.abs(other.z - p.z) < 5
                  );
                  return (
                    <g key={p.index}>
                      <rect
                        x={px}
                        y={py}
                        width={pw}
                        height={ph}
                        rx={2}
                        fill={p.rotated90 ? '#DBEAFE' : '#FEF3C7'}
                        stroke="#17191F"
                        strokeWidth={1.3}
                      />
                      <text
                        x={px + pw / 2}
                        y={py + ph / 2 - (ph > 34 ? 4 : 0)}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize={Math.max(9, Math.min(12, Math.min(pw, ph) * 0.24))}
                        fontWeight="700"
                        fontFamily="monospace"
                        fill="#17191F"
                      >
                        #{p.index}
                        {hasDouble ? ' ×2' : ''}
                      </text>
                      {ph > 34 && pw > 44 && (
                        <text
                          x={px + pw / 2}
                          y={py + ph / 2 + 10}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fontSize={8.5}
                          fontFamily="monospace"
                          fill="#474D58"
                        >
                          {Math.round(p.sizeX)}×{Math.round(p.sizeZ)}
                        </text>
                      )}
                    </g>
                  );
                })
              )}

              {/* Front Bulkhead Label */}
              <text
                x={topOx - 10}
                y={topOy + topBoxH / 2}
                textAnchor="middle"
                fontSize={10}
                fontWeight="600"
                fill="#5C626E"
                transform={`rotate(-90 ${topOx - 10} ${topOy + topBoxH / 2})`}
              >
                DEPAN / KABIN
              </text>

              {/* Rear Door Label */}
              <text
                x={topOx + topBoxW + 14}
                y={topOy + topBoxH / 2}
                textAnchor="middle"
                fontSize={10}
                fontWeight="600"
                fill={vehicle.loadingAccess === 'rear' ? '#C2410C' : '#4F46E5'}
                transform={`rotate(90 ${topOx + topBoxW + 14} ${topOy + topBoxH / 2})`}
              >
                {vehicle.loadingAccess === 'rear' ? 'PINTU BELAKANG' : 'BELAKANG'}
              </text>

              {/* Top Length Dimension Line */}
              <line x1={topOx} y1={topOy - 18} x2={topOx + topBoxW} y2={topOy - 18} stroke="#5C626E" strokeWidth={1} />
              <line x1={topOx} y1={topOy - 22} x2={topOx} y2={topOy - 14} stroke="#5C626E" strokeWidth={1} />
              <line x1={topOx + topBoxW} y1={topOy - 22} x2={topOx + topBoxW} y2={topOy - 14} stroke="#5C626E" strokeWidth={1} />
              <text
                x={topOx + topBoxW / 2}
                y={topOy - 23}
                textAnchor="middle"
                fontSize={10.5}
                fontFamily="monospace"
                fontWeight="600"
                fill="#17191F"
              >
                Panjang Dalam {vL.toLocaleString('id-ID')} mm (Terpakai{' '}
                {Math.round(isFloorMode ? floorEval.usedLengthMm : vehicleEval.usedLengthMm)} mm · Sisa Pintu{' '}
                {Math.round(isFloorMode ? floorEval.actualRearVoidMm : vehicleEval.actualRearDoorClearanceMm)} mm)
              </text>

              {/* Bottom Side-Wall Clearance Callout */}
              <text
                x={topOx + topBoxW / 2}
                y={topOy + topBoxH + 22}
                textAnchor="middle"
                fontSize={10.5}
                fontFamily="monospace"
                fill="#474D58"
              >
                Lebar Dalam {vW.toLocaleString('id-ID')} mm · Zona Efektif {Math.round(activeEffW)} mm · Sisi Kiri/Kanan ±
                {isFloorMode ? floorEval.actualSideVoidPerSideMm : vehicleEval.actualSideClearancePerSideMm} mm · Kuning=0° / Biru=90°
              </text>
            </svg>
          </div>
        </div>

        {/* CARD 2: 2D SIDE VIEW BLUEPRINT */}
        <div className="rounded-[var(--radius-container)] border-[0.5px] border-[var(--line)] bg-[var(--surface-top)] overflow-hidden">
          <div className="px-3.5 py-2 border-b-[0.5px] border-[var(--line)] bg-[var(--ink-2)] flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--ink-12)]">
              {isFloorMode
                ? 'Denah 2D Side View — Tumpukan Karton Langsung di Lantai & Batas Plafon'
                : 'Denah 2D Side View (Tampak Samping, Ambang Pintu & Ruang Angkat Forklift)'}
            </span>
            <div className="flex items-center gap-3 text-[11px] font-mono tabular-nums text-[var(--ink-11)]">
              {isFloorMode ? (
                <>
                  <span>Tinggi Tumpukan: {floorEval.stackHeightMm} mm ({floorEval.layersLoaded} lyr)</span>
                  <span>·</span>
                  <span>Celah Plafon: {floorEval.actualVerticalRoofClearanceMm} mm</span>
                </>
              ) : (
                <>
                  <span>Tinggi Palet: {vehicleEval.totalStackHeightInVehicleMm} mm</span>
                  <span>·</span>
                  <span
                    className={
                      vehicleEval.actualVerticalDoorClearanceMm < vehicle.forkliftLiftClearanceMm
                        ? 'text-[var(--red-11)] font-semibold'
                        : 'text-[var(--green-11)] font-semibold'
                    }
                  >
                    Celah Pintu: {vehicleEval.actualVerticalDoorClearanceMm} mm
                  </span>
                  <span>·</span>
                  <span>Celah Plafon: {vehicleEval.actualVerticalRoofClearanceMm} mm</span>
                </>
              )}
            </div>
          </div>

          <div className="p-3 bg-white">
            <svg
              viewBox={`0 0 ${sideSvgW} ${sideSvgH}`}
              className="w-full h-auto block"
              role="img"
              aria-label={
                isFloorMode
                  ? 'Denah 2D Side View ketinggian tumpukan karton floor loading'
                  : 'Denah 2D Side View ketinggian tumpukan palet terhadap pintu dan plafon'
              }
            >
              {/* Vehicle Side Profile */}
              <rect
                x={sideOx}
                y={toSideY(vH)}
                width={sideBoxW}
                height={sideBoxH}
                fill="#F8FAFC"
                stroke="#17191F"
                strokeWidth={2}
              />

              {/* Door Header Drop Beam */}
              {doorH < vH && (
                <>
                  <rect
                    x={sideOx + sideBoxW - 10}
                    y={toSideY(vH)}
                    width={10}
                    height={(vH - doorH) * sideScale}
                    fill="#EA580C"
                  />
                  <line
                    x1={sideOx}
                    y1={toSideY(doorH)}
                    x2={sideOx + sideBoxW}
                    y2={toSideY(doorH)}
                    stroke="#EA580C"
                    strokeWidth={1.2}
                    strokeDasharray="5 4"
                  />
                  <text
                    x={sideOx + sideBoxW + 8}
                    y={toSideY(doorH) + 3}
                    fontSize={9.5}
                    fontFamily="monospace"
                    fontWeight="600"
                    fill="#C2410C"
                  >
                    Pintu {doorH}mm
                  </text>
                </>
              )}

              {/* Reefer Red Load Line */}
              {vehicle.reeferLoadLineMm && vehicle.reeferLoadLineMm > 0 && (
                <>
                  <line
                    x1={sideOx}
                    y1={toSideY(vehicle.reeferLoadLineMm)}
                    x2={sideOx + sideBoxW}
                    y2={toSideY(vehicle.reeferLoadLineMm)}
                    stroke="#DC2626"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                  />
                  <text
                    x={sideOx + 8}
                    y={toSideY(vehicle.reeferLoadLineMm) - 4}
                    fontSize={9}
                    fontFamily="monospace"
                    fontWeight="700"
                    fill="#DC2626"
                  >
                    RED LOAD LINE ({vehicle.reeferLoadLineMm} mm)
                  </text>
                </>
              )}

              {/* Effective Max Cargo Height Line */}
              <line
                x1={sideOx}
                y1={toSideY(activeEffH)}
                x2={sideOx + sideBoxW}
                y2={toSideY(activeEffH)}
                stroke="#4F46E5"
                strokeWidth={1}
                strokeDasharray="3 3"
              />

              {/* Floor Loading Stacked Cartons OR Stacked Pallet Columns */}
              {isFloorMode ? (
                floorSideColumns.map((col, idx) => {
                  const colX = toSideX(col.x - col.sizeX / 2);
                  const colW = Math.max(1.5, col.sizeX * sideScale);
                  const totalH = Math.max(2, floorEval.stackHeightMm * sideScale);
                  const topY = toSideY(floorEval.stackHeightMm);
                  const layers = Math.max(1, floorEval.layersLoaded);
                  return (
                    <g key={idx}>
                      <rect
                        x={colX}
                        y={topY}
                        width={colW}
                        height={totalH}
                        fill={col.rotated90 ? '#DBEAFE' : '#FEF3C7'}
                        stroke="#17191F"
                        strokeWidth={floorSideColumns.length > 26 ? 0.5 : 0.8}
                      />
                      {Array.from({ length: layers - 1 }).map((_, li) => {
                        const ly = topY + (totalH * (li + 1)) / layers;
                        return (
                          <line
                            key={li}
                            x1={colX}
                            y1={ly}
                            x2={colX + colW}
                            y2={ly}
                            stroke="#64748B"
                            strokeWidth={0.5}
                          />
                        );
                      })}
                    </g>
                  );
                })
              ) : (
                sideColumns.map((col, idx) => {
                  const colX = toSideX(col.x - col.sizeX / 2);
                  const colW = col.sizeX * sideScale;
                  const pDeckH = pallet.palletHeightMm * sideScale;
                  const cargoH = Math.max(
                    4,
                    (evaluation.totalStackHeightMm - pallet.palletHeightMm) * sideScale
                  );
                  const fullPalletH = pDeckH + cargoH;

                  const renderTier = (baseMm: number, tierNum: 1 | 2) => {
                    const deckTopY = toSideY(baseMm + pallet.palletHeightMm);
                    const cargoTopY = toSideY(baseMm + evaluation.totalStackHeightMm);
                    const layerLines = Math.max(1, evaluation.layerCount);
                    return (
                      <g key={tierNum}>
                        <rect
                          x={colX}
                          y={deckTopY}
                          width={colW}
                          height={pDeckH}
                          fill="#D6B588"
                          stroke="#17191F"
                          strokeWidth={1}
                        />
                        <rect
                          x={colX + 1.5}
                          y={cargoTopY}
                          width={Math.max(2, colW - 3)}
                          height={cargoH}
                          fill={tierNum === 1 ? '#E2E8F0' : '#DBEAFE'}
                          stroke="#17191F"
                          strokeWidth={1.1}
                        />
                        {Array.from({ length: layerLines - 1 }).map((_, li) => {
                          const ly = cargoTopY + (cargoH * (li + 1)) / layerLines;
                          return (
                            <line
                              key={li}
                              x1={colX + 1.5}
                              y1={ly}
                              x2={colX + colW - 1.5}
                              y2={ly}
                              stroke="#64748B"
                              strokeWidth={0.6}
                            />
                          );
                        })}
                      </g>
                    );
                  };

                  return (
                    <g key={idx}>
                      {renderTier(0, 1)}
                      {col.hasTier2 && renderTier(evaluation.totalStackHeightMm, 2)}
                      <title>
                        Kolom #{idx + 1} · {col.hasTier2 ? '2 Tier' : '1 Tier'} ·{' '}
                        {Math.round(fullPalletH / sideScale)} mm/palet
                      </title>
                    </g>
                  );
                })
              )}

              {/* Roof Height Label */}
              <text
                x={sideOx + sideBoxW + 8}
                y={toSideY(vH) + 8}
                fontSize={9.5}
                fontFamily="monospace"
                fill="#5C626E"
              >
                Plafon {vH}mm
              </text>

              {/* Bottom Caption */}
              <text
                x={sideOx + sideBoxW / 2}
                y={sideFloorY + 22}
                textAnchor="middle"
                fontSize={10.5}
                fontFamily="monospace"
                fill="#474D58"
              >
                {isFloorMode
                  ? `Tumpukan Floor Loading: ${floorEval.stackHeightMm} mm (${floorEval.layersLoaded} layer langsung di lantai · tanpa dek palet) · BCT Dasar SF ${floorEval.bottomLayerSafetyFactor}:1`
                  : `Tinggi 1 Palet: ${evaluation.totalStackHeightMm} mm (${evaluation.layerCount} lyr) · ${
                      vehicleEval.activeTiers === 2
                        ? `Double-Stack Total ${vehicleEval.totalStackHeightInVehicleMm} mm · BCT 2-Tier: ${
                            vehicleEval.doubleStackSafetyFactor
                              ? `SF ${vehicleEval.doubleStackSafetyFactor}:1`
                              : '-'
                          }`
                        : `Ruang Angkat Garpu di Pintu: ${vehicleEval.actualVerticalDoorClearanceMm} mm (Min ${vehicle.forkliftLiftClearanceMm} mm)`
                    }`}
              </text>
            </svg>
          </div>
        </div>

        {/* CARD 3: OPERATIONAL AUDIT & WARNINGS */}
        <div className="rounded-[var(--radius-container)] border-[0.5px] border-[var(--line)] bg-[var(--surface-top)] p-3.5 space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--ink-12)]">
            {isFloorMode
              ? 'Audit Lapangan Floor Loading, BCT Tumpukan & Dunnage'
              : 'Audit Lapangan Forklift, Karoseri & Keamanan Muat'}
          </div>
          {activeWarnings.length === 0 ? (
            <div className="flex items-center gap-2 text-[12px] text-[var(--green-11)]">
              <CheckCircle2 size={14} className="shrink-0" />
              <span>
                Seluruh dimensi, clearance ruang muat, BCT lapisan bawah, dan kapasitas berat berada dalam zona aman optimal.
              </span>
            </div>
          ) : (
            <div className="space-y-1.5">
              {activeWarnings.map((w, idx) => (
                <div
                  key={idx}
                  className={`rounded-[var(--radius-control)] border-[0.5px] px-2.5 py-2 flex items-start gap-2 text-[11.5px] ${
                    w.severity === 'critical'
                      ? 'bg-[var(--red-3)] border-[var(--red-6)] text-[var(--red-11)]'
                      : w.severity === 'warning'
                      ? 'bg-[var(--amber-3)] border-[var(--amber-6)] text-[var(--amber-11)]'
                      : 'bg-[var(--ink-2)] border-[var(--line)] text-[var(--ink-11)]'
                  }`}
                >
                  {w.severity === 'info' ? (
                    <Info size={14} className="shrink-0 mt-0.5 text-[var(--accent-10)]" />
                  ) : (
                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0">
                    <div className="font-semibold text-[var(--ink-12)]">{w.title}</div>
                    <div className="mt-0.5 leading-[16px]">{w.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
