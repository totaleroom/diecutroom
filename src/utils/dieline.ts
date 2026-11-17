import { BoxConfig, DielinePaths, DimensionLine, HeadspaceDiagnostic } from '../types';
import { formatValue } from './units';

export function generateRSCDieline(config: BoxConfig): DielinePaths {
  const {
    boxStyle,
    flapOverlapMm,
    dimensions,
    fluteThickness,
    glueFlapWidth,
    advanced,
    prepress,
    barcode,
    glueFlapPosition,
    perforation,
    unit,
  } = config;

  const L = Math.max(20, dimensions.length);
  const W = Math.max(20, dimensions.width);
  const D = Math.max(20, dimensions.depth);
  const T = Math.max(0.5, fluteThickness);
  const G = Math.max(10, glueFlapWidth);
  const flapGap = Math.max(0, advanced.flapGap);
  const slotGap = Math.max(2, advanced.slotGap);
  const fishtailCompensation = advanced.fishtailCompensation;
  const hasTopFlaps = boxStyle !== '0200';

  const bleedMm = Math.max(0, Math.min(15, prepress?.bleedMm ?? 5));
  const safeMarginMm = Math.max(2, Math.min(25, prepress?.scoreSafeMarginMm ?? 6));
  const fluteDirection = prepress?.fluteDirection ?? 'vertical';

  // Horizontal Panel Scoring Allowance (Centerline to Centerline: Inner + T)
  const lPanel = L + T;
  const wPanel = W + T;

  // Vertical Depth Scoring Allowance:
  // Closed inner flaps fold inward and consume T per closed side (2*T for slotted top+bottom, T for HSC bottom only)
  const depthAllowanceMm = advanced.compensateInnerFlapDepth ? (hasTopFlaps ? 2 * T : T) : 0;
  const dPanel = D + depthAllowanceMm;

  // True Outer Dimensions (OD):
  // Wall thickness adds 2*T to Length and Width; top & bottom double flap layers add 4*T (or 2*T for HSC)
  const outerL = L + 2 * T;
  const outerW = W + 2 * T;
  const outerD = D + (hasTopFlaps ? 4 * T : 2 * T);

  // Flap lengths by FEFCO standard (measured from fold centerline wPanel = W + T)
  let bottomFlapL = Math.max(10, (wPanel - flapGap) / 2);
  let bottomFlapW = Math.max(10, (wPanel - flapGap) / 2);

  if (boxStyle === '0202') {
    // OSC: Outer flaps overlap by flapOverlapMm across centerline
    bottomFlapL = Math.min(wPanel - T / 2, Math.max(10, (wPanel + Math.max(0, flapOverlapMm)) / 2));
  } else if (boxStyle === '0203') {
    // FOL: Full overlap outer flaps span across full centerline width
    bottomFlapL = Math.max(wPanel / 2, wPanel - Math.max(flapGap, T / 2));
  } else if (boxStyle === '0204') {
    // CSSC: Inner flaps meet at center along L (lPanel/2), outer flaps meet at center along W (wPanel/2)
    bottomFlapW = Math.max(10, (lPanel - flapGap) / 2);
  }

  if (fishtailCompensation) {
    bottomFlapW = Math.max(10, bottomFlapW - T / 2);
  }

  const topFlapL = hasTopFlaps ? bottomFlapL : 0;
  const topFlapW = hasTopFlaps ? bottomFlapW : 0;

  const halfSlot = slotGap / 2;
  const slotOvercut = fishtailCompensation ? T : 0;
  const topSlotOvercut = hasTopFlaps ? slotOvercut : 0;

  let x0: number, x1: number, x2: number, x3: number, x4: number, x5: number;
  let pL1_x1: number, pL1_x2: number;
  let pW1_x1: number, pW1_x2: number;
  let pL2_x1: number, pL2_x2: number;
  let pW2_x1: number, pW2_x2: number;
  let pGlue_x1: number, pGlue_x2: number;

  if (glueFlapPosition === 'left') {
    x0 = 0;
    x1 = G;
    x2 = x1 + lPanel;
    x3 = x2 + wPanel;
    x4 = x3 + lPanel;
    x5 = x4 + wPanel;
    pGlue_x1 = x0; pGlue_x2 = x1;
    pL1_x1 = x1; pL1_x2 = x2;
    pW1_x1 = x2; pW1_x2 = x3;
    pL2_x1 = x3; pL2_x2 = x4;
    pW2_x1 = x4; pW2_x2 = x5;
  } else {
    x0 = 0;
    x1 = lPanel;
    x2 = x1 + wPanel;
    x3 = x2 + lPanel;
    x4 = x3 + wPanel;
    x5 = x4 + G;
    pL1_x1 = x0; pL1_x2 = x1;
    pW1_x1 = x1; pW1_x2 = x2;
    pL2_x1 = x2; pL2_x2 = x3;
    pW2_x1 = x3; pW2_x2 = x4;
    pGlue_x1 = x4; pGlue_x2 = x5;
  }

  const y1 = hasTopFlaps ? Math.max(topFlapL, topFlapW) : 0;
  const y0_L = y1 - topFlapL;
  const y0_W = y1 - topFlapW;

  const y2 = y1 + dPanel;
  const y3_L = y2 + bottomFlapL;
  const y3_W = y2 + bottomFlapW;

  const glueTaper = Math.min(15, dPanel / 4, bottomFlapL / 2);
  const r = (val: number) => Math.round(val * 100) / 100;

  // 1. Clean Non-Overlapping Cut Lines
  const cutLines: string[] = [];
  const addLine = (xA: number, yA: number, xB: number, yB: number) => {
    if (Math.abs(xA - xB) < 0.001 && Math.abs(yA - yB) < 0.001) return;
    cutLines.push(`M ${r(xA)} ${r(yA)} L ${r(xB)} ${r(yB)}`);
  };

  if (glueFlapPosition === 'left') {
    addLine(pGlue_x1, y1 + glueTaper, pGlue_x2, y1);
    addLine(pGlue_x1, y1 + glueTaper, pGlue_x1, y2 - glueTaper);
    addLine(pGlue_x1, y2 - glueTaper, pGlue_x2, y2);
    addLine(pW2_x2, y1, pW2_x2, y2);
  } else {
    addLine(pL1_x1, y1, pL1_x1, y2);
    addLine(pGlue_x1, y1, pGlue_x2, y1 + glueTaper);
    addLine(pGlue_x2, y1 + glueTaper, pGlue_x2, y2 - glueTaper);
    addLine(pGlue_x2, y2 - glueTaper, pGlue_x1, y2);
  }

  // Top Perimeter
  if (hasTopFlaps) {
    addLine(pL1_x1, y1, pL1_x1, y0_L);
    addLine(pL1_x1, y0_L, pL1_x2 - halfSlot, y0_L);
    addLine(pL1_x2 - halfSlot, y0_L, pL1_x2 - halfSlot, y1 + topSlotOvercut);

    addLine(pL1_x2 - halfSlot, y1 + topSlotOvercut, pW1_x1 + halfSlot, y1 + topSlotOvercut);
    addLine(pW1_x1 + halfSlot, y1 + topSlotOvercut, pW1_x1 + halfSlot, y0_W);
    addLine(pW1_x1 + halfSlot, y0_W, pW1_x2 - halfSlot, y0_W);
    addLine(pW1_x2 - halfSlot, y0_W, pW1_x2 - halfSlot, y1 + topSlotOvercut);

    addLine(pW1_x2 - halfSlot, y1 + topSlotOvercut, pL2_x1 + halfSlot, y1 + topSlotOvercut);
    addLine(pL2_x1 + halfSlot, y1 + topSlotOvercut, pL2_x1 + halfSlot, y0_L);
    addLine(pL2_x1 + halfSlot, y0_L, pL2_x2 - halfSlot, y0_L);
    addLine(pL2_x2 - halfSlot, y0_L, pL2_x2 - halfSlot, y1 + topSlotOvercut);

    addLine(pL2_x2 - halfSlot, y1 + topSlotOvercut, pW2_x1 + halfSlot, y1 + topSlotOvercut);
    addLine(pW2_x1 + halfSlot, y1 + topSlotOvercut, pW2_x1 + halfSlot, y0_W);
    addLine(pW2_x1 + halfSlot, y0_W, pW2_x2, y0_W);
    addLine(pW2_x2, y0_W, pW2_x2, y1);
  } else {
    addLine(pL1_x1, y1, pW2_x2, y1);
  }

  // Bottom Perimeter
  addLine(pW2_x2, y2, pW2_x2, y3_W);
  addLine(pW2_x2, y3_W, pW2_x1 + halfSlot, y3_W);
  addLine(pW2_x1 + halfSlot, y3_W, pW2_x1 + halfSlot, y2 - slotOvercut);

  addLine(pW2_x1 + halfSlot, y2 - slotOvercut, pL2_x2 - halfSlot, y2 - slotOvercut);
  addLine(pL2_x2 - halfSlot, y2 - slotOvercut, pL2_x2 - halfSlot, y3_L);
  addLine(pL2_x2 - halfSlot, y3_L, pL2_x1 + halfSlot, y3_L);
  addLine(pL2_x1 + halfSlot, y3_L, pL2_x1 + halfSlot, y2 - slotOvercut);

  addLine(pL2_x1 + halfSlot, y2 - slotOvercut, pW1_x2 - halfSlot, y2 - slotOvercut);
  addLine(pW1_x2 - halfSlot, y2 - slotOvercut, pW1_x2 - halfSlot, y3_W);
  addLine(pW1_x2 - halfSlot, y3_W, pW1_x1 + halfSlot, y3_W);
  addLine(pW1_x1 + halfSlot, y3_W, pW1_x1 + halfSlot, y2 - slotOvercut);

  addLine(pW1_x1 + halfSlot, y2 - slotOvercut, pL1_x2 - halfSlot, y2 - slotOvercut);
  addLine(pL1_x2 - halfSlot, y2 - slotOvercut, pL1_x2 - halfSlot, y3_L);
  addLine(pL1_x2 - halfSlot, y3_L, pL1_x1, y3_L);
  addLine(pL1_x1, y3_L, pL1_x1, y2);

  // 2. Crease Lines
  const creaseLines: string[] = [];
  const addCrease = (xA: number, yA: number, xB: number, yB: number) => {
    creaseLines.push(`M ${r(xA)} ${r(yA)} L ${r(xB)} ${r(yB)}`);
  };

  if (hasTopFlaps) {
    addCrease(pL1_x1, y1, pW2_x2, y1);
  }
  addCrease(pL1_x1, y2, pW2_x2, y2);

  if (glueFlapPosition === 'left') {
    addCrease(pL1_x1, y1, pL1_x1, y2);
  } else {
    addCrease(pW2_x2, y1, pW2_x2, y2);
  }
  addCrease(pW1_x1, y1 + topSlotOvercut, pW1_x1, y2 - slotOvercut);
  addCrease(pL2_x1, y1 + topSlotOvercut, pL2_x1, y2 - slotOvercut);
  addCrease(pW2_x1, y1 + topSlotOvercut, pW2_x1, y2 - slotOvercut);

  // 3. Perforation & Functional Cutouts (+ optional fold crease hinges for Drop-Front PDQ)
  const perfLines: string[] = [];
  const perfFoldLines: string[] = [];
  const bodyStartX = pL1_x1;
  const bodyEndX = pW2_x2;

  if (perforation.enabled) {
    if (perforation.type === 'front-cutout') {
      const pOffsetX = Math.min(20, lPanel * 0.2);
      const pOffsetY = Math.min(20, dPanel * 0.2);
      const rad = Math.min(8, (lPanel - pOffsetX * 2) / 4, (dPanel - pOffsetY * 2) / 4);
      const fx1 = pL1_x1 + pOffsetX;
      const fx2 = pL1_x2 - pOffsetX;
      const fy1 = y1 + pOffsetY;
      const fy2 = y2 - pOffsetY;
      perfLines.push(
        `M ${r(fx1 + rad)} ${r(fy1)} L ${r(fx2 - rad)} ${r(fy1)} A ${r(rad)} ${r(rad)} 0 0 1 ${r(fx2)} ${r(fy1 + rad)} L ${r(fx2)} ${r(fy2 - rad)} A ${r(rad)} ${r(rad)} 0 0 1 ${r(fx2 - rad)} ${r(fy2)} L ${r(fx1 + rad)} ${r(fy2)} A ${r(rad)} ${r(rad)} 0 0 1 ${r(fx1)} ${r(fy2 - rad)} L ${r(fx1)} ${r(fy1 + rad)} A ${r(rad)} ${r(rad)} 0 0 1 ${r(fx1 + rad)} ${r(fy1)}`
      );
    } else if (perforation.type === 'angled-display') {
      perfLines.push(`M ${r(pL1_x1)} ${r(y1 + dPanel * 0.55)} L ${r(pL1_x2)} ${r(y1 + dPanel * 0.55)}`);
      perfLines.push(`M ${r(pW1_x1)} ${r(y1 + dPanel * 0.55)} L ${r(pW1_x2)} ${r(y1 + dPanel * 0.25)}`);
      perfLines.push(`M ${r(pL2_x1)} ${r(y1 + dPanel * 0.25)} L ${r(pL2_x2)} ${r(y1 + dPanel * 0.25)}`);
      perfLines.push(`M ${r(pW2_x1)} ${r(y1 + dPanel * 0.25)} L ${r(pW2_x2)} ${r(y1 + dPanel * 0.55)}`);
    } else if (perforation.type === 'drop-front-pdq') {
      const sideInset = Math.min(22, Math.max(12, lPanel * 0.14));
      const lipHeight = Math.min(38, Math.max(22, dPanel * 0.3));
      const sx1 = pL1_x1 + sideInset;
      const sx2 = pL1_x2 - sideInset;
      const lipY = y2 - lipHeight;
      const cx = (sx1 + sx2) / 2;
      const notchR = Math.min(12, (sx2 - sx1) * 0.16);
      // Twin vertical side tears on Front Panel L1
      perfLines.push(`M ${r(sx1)} ${r(y1)} L ${r(sx1)} ${r(lipY)}`);
      perfLines.push(`M ${r(sx2)} ${r(y1)} L ${r(sx2)} ${r(lipY)}`);
      // Finger starter pull arc on top crease
      perfLines.push(`M ${r(cx - notchR)} ${r(y1)} A ${r(notchR)} ${r(notchR)} 0 0 0 ${r(cx + notchR)} ${r(y1)}`);
      // Bottom anchor hinge crease (dashed red) for fold-down PDQ front lip
      perfFoldLines.push(`M ${r(sx1)} ${r(lipY)} L ${r(sx2)} ${r(lipY)}`);
    } else if (perforation.type === 'twin-zipper-window') {
      const pillar = Math.min(18, Math.max(10, lPanel * 0.12));
      const zipW = Math.min(10, Math.max(6, lPanel * 0.065));
      const topGap = y1 + Math.min(18, dPanel * 0.16);
      const botLip = y2 - Math.min(32, Math.max(18, dPanel * 0.25));
      const lxOut = pL1_x1 + pillar;
      const lxIn = lxOut + zipW;
      const rxOut = pL1_x2 - pillar;
      const rxIn = rxOut - zipW;
      // Left vertical zipper strip
      perfLines.push(`M ${r(lxOut)} ${r(y1)} L ${r(lxOut)} ${r(botLip)}`);
      perfLines.push(`M ${r(lxIn)} ${r(topGap)} L ${r(lxIn)} ${r(botLip)}`);
      // Right vertical zipper strip
      perfLines.push(`M ${r(rxOut)} ${r(y1)} L ${r(rxOut)} ${r(botLip)}`);
      perfLines.push(`M ${r(rxIn)} ${r(topGap)} L ${r(rxIn)} ${r(botLip)}`);
      // Top & Bottom window tear seams connecting both zippers
      perfLines.push(`M ${r(lxIn)} ${r(topGap)} L ${r(rxIn)} ${r(topGap)}`);
      perfLines.push(`M ${r(lxOut)} ${r(botLip)} L ${r(rxOut)} ${r(botLip)}`);
      // Starter pull notches at top
      perfLines.push(`M ${r(lxOut)} ${r(y1)} L ${r((lxOut + lxIn) / 2)} ${r(topGap)} L ${r(lxIn)} ${r(y1)}`);
      perfLines.push(`M ${r(rxOut)} ${r(y1)} L ${r((rxOut + rxIn) / 2)} ${r(topGap)} L ${r(rxIn)} ${r(y1)}`);
    } else if (perforation.type === 'twin-split-tray') {
      const frontY = y1 + dPanel * 0.7;
      const backY = y1 + dPanel * 0.36;
      const stepSpanW = wPanel * 0.35;
      // Front L1 low tray lip
      perfLines.push(`M ${r(pL1_x1)} ${r(frontY)} L ${r(pL1_x2)} ${r(frontY)}`);
      // W1 stepped rise front-to-back
      perfLines.push(
        `M ${r(pW1_x1)} ${r(frontY)} L ${r(pW1_x1 + stepSpanW)} ${r(frontY)} L ${r(pW1_x2 - stepSpanW * 0.4)} ${r(backY)} L ${r(pW1_x2)} ${r(backY)}`
      );
      // Back L2 high wall
      perfLines.push(`M ${r(pL2_x1)} ${r(backY)} L ${r(pL2_x2)} ${r(backY)}`);
      // W2 stepped return back-to-front
      perfLines.push(
        `M ${r(pW2_x1)} ${r(backY)} L ${r(pW2_x1 + stepSpanW * 0.4)} ${r(backY)} L ${r(pW2_x2 - stepSpanW)} ${r(frontY)} L ${r(pW2_x2)} ${r(frontY)}`
      );
    } else if (perforation.type === 'shelf-tray-scoop') {
      const sideFrontY = y1 + dPanel * 0.56;
      const backWallY = y1 + dPanel * 0.32;
      const scoopBottomY = y2 - Math.min(26, Math.max(16, dPanel * 0.2));
      const shoulderW = Math.min(26, lPanel * 0.18);
      const cx = (pL1_x1 + pL1_x2) / 2;
      const scoopHalfW = Math.max(16, (lPanel - shoulderW * 2) / 2);
      const dropH = Math.max(8, scoopBottomY - sideFrontY);
      const arcR = Math.min(scoopHalfW * 0.45, dropH * 0.7);
      const sx1 = cx - scoopHalfW;
      const sx2 = cx + scoopHalfW;
      // Front L1 shoulder -> U-scoop retainer -> right shoulder
      perfLines.push(
        `M ${r(pL1_x1)} ${r(sideFrontY)} L ${r(sx1)} ${r(sideFrontY)} L ${r(sx1)} ${r(scoopBottomY - arcR)} A ${r(arcR)} ${r(arcR)} 0 0 0 ${r(sx1 + arcR)} ${r(scoopBottomY)} L ${r(sx2 - arcR)} ${r(scoopBottomY)} A ${r(arcR)} ${r(arcR)} 0 0 0 ${r(sx2)} ${r(scoopBottomY - arcR)} L ${r(sx2)} ${r(sideFrontY)} L ${r(pL1_x2)} ${r(sideFrontY)}`
      );
      // Side W1 diagonal/stepped rise
      perfLines.push(`M ${r(pW1_x1)} ${r(sideFrontY)} L ${r(pW1_x2)} ${r(backWallY)}`);
      // Back L2 high billboard
      perfLines.push(`M ${r(pL2_x1)} ${r(backWallY)} L ${r(pL2_x2)} ${r(backWallY)}`);
      // Side W2 return
      perfLines.push(`M ${r(pW2_x1)} ${r(backWallY)} L ${r(pW2_x2)} ${r(sideFrontY)}`);
    } else if (perforation.type === 'tear-strip') {
      const stripH = Math.min(10, dPanel * 0.2);
      const stripY = y1 + dPanel / 3;
      const tabW = Math.min(12, lPanel * 0.12);
      perfLines.push(`M ${r(bodyStartX + tabW)} ${r(stripY)} L ${r(bodyEndX)} ${r(stripY)}`);
      perfLines.push(`M ${r(bodyStartX + tabW)} ${r(stripY + stripH)} L ${r(bodyEndX)} ${r(stripY + stripH)}`);
      perfLines.push(`M ${r(bodyStartX)} ${r(stripY + stripH / 2)} L ${r(bodyStartX + tabW)} ${r(stripY)}`);
      perfLines.push(`M ${r(bodyStartX)} ${r(stripY + stripH / 2)} L ${r(bodyStartX + tabW)} ${r(stripY + stripH)}`);
    } else if (perforation.type === 'wrap-around') {
      const trayHeight = dPanel / 4;
      const trayY = y2 - trayHeight;
      perfLines.push(`M ${r(bodyStartX)} ${r(trayY)} L ${r(bodyEndX)} ${r(trayY)}`);
    } else if (perforation.type === 'zipper-rule') {
      const stripH = Math.min(12, dPanel * 0.22);
      const stripY = y1 + dPanel / 2 - stripH / 2;
      const tabW = Math.min(14, lPanel * 0.14);
      perfLines.push(`M ${r(bodyStartX + tabW)} ${r(stripY)} L ${r(bodyEndX)} ${r(stripY)}`);
      perfLines.push(`M ${r(bodyStartX + tabW)} ${r(stripY + stripH)} L ${r(bodyEndX)} ${r(stripY + stripH)}`);
      perfLines.push(`M ${r(bodyStartX + tabW)} ${r(stripY)} L ${r(bodyStartX)} ${r(stripY + stripH / 2)} L ${r(bodyStartX + tabW)} ${r(stripY + stripH)}`);
    } else if (perforation.type === 'thumb-hole-punch') {
      const cx = (pL1_x1 + pL1_x2) / 2;
      const rHole = Math.min(20, lPanel * 0.25, dPanel * 0.3);
      perfLines.push(`M ${r(cx - rHole)} ${r(y1)} A ${r(rHole)} ${r(rHole)} 0 0 0 ${r(cx + rHole)} ${r(y1)}`);
    } else if (perforation.type === 'u-scoop-front') {
      const cx = (pL1_x1 + pL1_x2) / 2;
      const scoopW = Math.min(lPanel * 0.56, Math.max(40, lPanel - 36));
      const scoopDepth = Math.min(dPanel * 0.45, Math.max(25, dPanel - 30));
      const rx = scoopW / 2;
      const arcR = Math.min(rx, scoopDepth * 0.65);
      const sx1 = cx - rx;
      const sx2 = cx + rx;
      const syBottom = y1 + scoopDepth;
      perfLines.push(
        `M ${r(sx1)} ${r(y1)} L ${r(sx1)} ${r(syBottom - arcR)} A ${r(arcR)} ${r(arcR)} 0 0 0 ${r(sx1 + arcR)} ${r(syBottom)} L ${r(sx2 - arcR)} ${r(syBottom)} A ${r(arcR)} ${r(arcR)} 0 0 0 ${r(sx2)} ${r(syBottom - arcR)} L ${r(sx2)} ${r(y1)}`
      );
    } else if (perforation.type === 'carry-handles') {
      const handleW = Math.min(85, wPanel * 0.55);
      const handleH = Math.min(24, dPanel * 0.22);
      const hy = y1 + Math.min(dPanel * 0.32, Math.max(28, dPanel * 0.25));
      const rad = handleH / 2;
      [
        (pW1_x1 + pW1_x2) / 2,
        (pW2_x1 + pW2_x2) / 2,
      ].forEach((cx) => {
        if (handleW > handleH) {
          const hx1 = cx - handleW / 2 + rad;
          const hx2 = cx + handleW / 2 - rad;
          perfLines.push(
            `M ${r(hx1)} ${r(hy - rad)} L ${r(hx2)} ${r(hy - rad)} A ${r(rad)} ${r(rad)} 0 0 1 ${r(hx2)} ${r(hy + rad)} L ${r(hx1)} ${r(hy + rad)} A ${r(rad)} ${r(rad)} 0 0 1 ${r(hx1)} ${r(hy - rad)}`
          );
        }
      });
    } else if (perforation.type === 'ventilation-slots') {
      const slotW = Math.min(10, wPanel * 0.08);
      const slotH = Math.min(40, dPanel * 0.45);
      const rad = slotW / 2;
      const cy = (y1 + y2) / 2;
      [
        (pW1_x1 + pW1_x2) / 2,
        (pW2_x1 + pW2_x2) / 2,
      ].forEach((panelCx) => {
        const spread = Math.min(wPanel * 0.22, 26);
        [panelCx - spread, panelCx + spread].forEach((vx) => {
          const vy1 = cy - slotH / 2 + rad;
          const vy2 = cy + slotH / 2 - rad;
          perfLines.push(
            `M ${r(vx - rad)} ${r(vy1)} A ${r(rad)} ${r(rad)} 0 0 1 ${r(vx + rad)} ${r(vy1)} L ${r(vx + rad)} ${r(vy2)} A ${r(rad)} ${r(rad)} 0 0 1 ${r(vx - rad)} ${r(vy2)} Z`
          );
        });
      });
    }
  }

  // 4. Pre-Press Overlays: Outer Print Bleed Contour, Score Safe Zones, Glue Knockout, Flute Arrow
  const b = bleedMm;
  const bleedPts: Array<[number, number]> = [];
  const stepX = (boundaryX: number, yLeft: number, yRight: number) => {
    if (Math.abs(yLeft - yRight) < 0.05) return;
    // Step cleanly near slot centerline while preserving full bleed on taller flap
    const sx =
      yLeft < yRight
        ? Math.min(boundaryX - halfSlot + b, boundaryX + halfSlot)
        : Math.max(boundaryX + halfSlot - b, boundaryX - halfSlot);
    bleedPts.push([sx, yLeft]);
    bleedPts.push([sx, yRight]);
  };

  if (hasTopFlaps) {
    bleedPts.push([pL1_x1 - b, y0_L - b]);
    stepX(pL1_x2, y0_L - b, y0_W - b);
    stepX(pW1_x2, y0_W - b, y0_L - b);
    stepX(pL2_x2, y0_L - b, y0_W - b);
    bleedPts.push([pW2_x2 + b, y0_W - b]);
  } else {
    bleedPts.push([pL1_x1 - b, y1 - b]);
    bleedPts.push([pW2_x2 + b, y1 - b]);
  }

  if (glueFlapPosition === 'right') {
    bleedPts.push([pW2_x2 + b, y1 - b]);
    bleedPts.push([pGlue_x2 + b, y1 + glueTaper - b * 0.25]);
    bleedPts.push([pGlue_x2 + b, y2 - glueTaper + b * 0.25]);
    bleedPts.push([pW2_x2 + b, y2 + b]);
  }
  bleedPts.push([pW2_x2 + b, y3_W + b]);

  // Bottom edge right-to-left
  const stepBottomX = (boundaryX: number, yRight: number, yLeft: number) => {
    if (Math.abs(yRight - yLeft) < 0.05) return;
    const sx =
      yRight > yLeft
        ? Math.max(boundaryX + halfSlot - b, boundaryX - halfSlot)
        : Math.min(boundaryX - halfSlot + b, boundaryX + halfSlot);
    bleedPts.push([sx, yRight]);
    bleedPts.push([sx, yLeft]);
  };

  stepBottomX(pW2_x1, y3_W + b, y3_L + b);
  stepBottomX(pL2_x1, y3_L + b, y3_W + b);
  stepBottomX(pW1_x1, y3_W + b, y3_L + b);
  bleedPts.push([pL1_x1 - b, y3_L + b]);

  if (glueFlapPosition === 'left') {
    bleedPts.push([pL1_x1 - b, y2 + b]);
    bleedPts.push([pGlue_x1 - b, y2 - glueTaper + b * 0.25]);
    bleedPts.push([pGlue_x1 - b, y1 + glueTaper - b * 0.25]);
    bleedPts.push([pL1_x1 - b, y1 - b]);
  }

  const bleedPath =
    bleedPts.length > 2
      ? `M ${bleedPts.map(([px, py]) => `${r(px)} ${r(py)}`).join(' L ')} Z`
      : '';

  // Score-Line Safe Print Zones (inset by safeMarginMm inside each panel & outer flap)
  const safeZoneBoxes: DielinePaths['safeZoneBoxes'] = [];
  const panelSpecs: Array<{ x1: number; x2: number; name: string; flapTopY: number; flapBotY: number }> = [
    { x1: pL1_x1, x2: pL1_x2, name: 'L1', flapTopY: y0_L, flapBotY: y3_L },
    { x1: pW1_x1, x2: pW1_x2, name: 'W1', flapTopY: y0_W, flapBotY: y3_W },
    { x1: pL2_x1, x2: pL2_x2, name: 'L2', flapTopY: y0_L, flapBotY: y3_L },
    { x1: pW2_x1, x2: pW2_x2, name: 'W2', flapTopY: y0_W, flapBotY: y3_W },
  ];

  panelSpecs.forEach((p, idx) => {
    const pw = p.x2 - p.x1;
    const sw = pw - safeMarginMm * 2;
    const sh = dPanel - safeMarginMm * 2;
    if (sw > 10 && sh > 10) {
      safeZoneBoxes.push({
        x: r(p.x1 + safeMarginMm),
        y: r(y1 + safeMarginMm),
        width: r(sw),
        height: r(sh),
        panelName: p.name,
      });
    }

    const leftInset = idx === 0 ? safeMarginMm : halfSlot + safeMarginMm;
    const rightInset = idx === 3 ? safeMarginMm : halfSlot + safeMarginMm;
    const flapSafeW = pw - leftInset - rightInset;

    if (hasTopFlaps) {
      const topFlapSafeH = y1 - p.flapTopY - safeMarginMm * 2;
      if (flapSafeW > 10 && topFlapSafeH > 8) {
        safeZoneBoxes.push({
          x: r(p.x1 + leftInset),
          y: r(p.flapTopY + safeMarginMm),
          width: r(flapSafeW),
          height: r(topFlapSafeH),
          panelName: `${p.name}-Top`,
        });
      }
    }

    const botFlapSafeH = p.flapBotY - y2 - safeMarginMm * 2;
    if (flapSafeW > 10 && botFlapSafeH > 8) {
      safeZoneBoxes.push({
        x: r(p.x1 + leftInset),
        y: r(y2 + safeMarginMm),
        width: r(flapSafeW),
        height: r(botFlapSafeH),
        panelName: `${p.name}-Bot`,
      });
    }
  });

  // Glue Flap Unprinted Knockout Zone (inset 1.5mm inside cut & crease edges)
  const gkPad = Math.min(2, G * 0.12);
  const gkVertPad = Math.min(3, dPanel * 0.05);
  let glueKnockoutPolygon = '';
  if (glueFlapPosition === 'left') {
    const gx1 = pGlue_x1 + gkPad;
    const gx2 = pGlue_x2 - gkPad;
    glueKnockoutPolygon = [
      `${r(gx1)},${r(y1 + glueTaper + gkVertPad)}`,
      `${r(gx2)},${r(y1 + gkVertPad)}`,
      `${r(gx2)},${r(y2 - gkVertPad)}`,
      `${r(gx1)},${r(y2 - glueTaper - gkVertPad)}`,
    ].join(' ');
  } else {
    const gx1 = pGlue_x1 + gkPad;
    const gx2 = pGlue_x2 - gkPad;
    glueKnockoutPolygon = [
      `${r(gx1)},${r(y1 + gkVertPad)}`,
      `${r(gx2)},${r(y1 + glueTaper + gkVertPad)}`,
      `${r(gx2)},${r(y2 - glueTaper - gkVertPad)}`,
      `${r(gx1)},${r(y2 - gkVertPad)}`,
    ].join(' ');
  }

  const glueKnockoutBounds = {
    cx: r((pGlue_x1 + pGlue_x2) / 2),
    cy: r((y1 + y2) / 2),
    width: r(G - gkPad * 2),
    height: r(dPanel - glueTaper * 2),
  };

  // Flute Direction Indicator centered in Panel L2 (keeps L1 & W1 clean for product overlay)
  const fluteIndicator = {
    cx: r((pL2_x1 + pL2_x2) / 2),
    cy: r(y1 + Math.min(dPanel * 0.36, 42)),
    direction: fluteDirection,
    span: r(Math.max(18, Math.min(38, dPanel * 0.38, lPanel * 0.35))),
  };

  // 5. Dimension Lines (Labels formatted in active DisplayUnit, geometry always in mm)
  const dimLines: DimensionLine[] = [];
  const topAnchor = Math.min(y0_L, y0_W, y1);
  const bottomAnchor = Math.max(y3_L, y3_W, y2);
  const dimOffsetTop = topAnchor - 26;
  const dimOffsetTopTotal = topAnchor - 52;
  const dimOffsetLeft = x0 - 26;
  const dimOffsetLeftTotal = x0 - 52;

  const fmt = (mm: number) => formatValue(mm, unit);

  dimLines.push({ x1: x0, y1: dimOffsetTop, x2: x1, y2: dimOffsetTop, text: fmt(x1 - x0), isVertical: false });
  dimLines.push({ x1: x1, y1: dimOffsetTop, x2: x2, y2: dimOffsetTop, text: fmt(x2 - x1), isVertical: false });
  dimLines.push({ x1: x2, y1: dimOffsetTop, x2: x3, y2: dimOffsetTop, text: fmt(x3 - x2), isVertical: false });
  dimLines.push({ x1: x3, y1: dimOffsetTop, x2: x4, y2: dimOffsetTop, text: fmt(x4 - x3), isVertical: false });
  dimLines.push({ x1: x4, y1: dimOffsetTop, x2: x5, y2: dimOffsetTop, text: fmt(x5 - x4), isVertical: false });

  dimLines.push({ x1: x0, y1: dimOffsetTopTotal, x2: x5, y2: dimOffsetTopTotal, text: fmt(x5 - x0), isVertical: false });

  if (hasTopFlaps) {
    dimLines.push({ x1: dimOffsetLeft, y1: y0_L, x2: dimOffsetLeft, y2: y1, text: fmt(topFlapL), isVertical: true });
  }
  dimLines.push({ x1: dimOffsetLeft, y1: y1, x2: dimOffsetLeft, y2: y2, text: fmt(dPanel), isVertical: true });
  dimLines.push({ x1: dimOffsetLeft, y1: y2, x2: dimOffsetLeft, y2: y3_L, text: fmt(bottomFlapL), isVertical: true });

  dimLines.push({
    x1: dimOffsetLeftTotal,
    y1: topAnchor,
    x2: dimOffsetLeftTotal,
    y2: bottomAnchor,
    text: fmt(bottomAnchor - topAnchor),
    isVertical: true,
  });

  // 6. Barcode Placement
  let barcodeBox;
  if (barcode.enabled) {
    const bcW = 152.4;
    const bcH = 41.4;
    const marginBottom = 28;
    const marginRight = 18;

    let panelLeft = pL1_x1;
    let panelRight = pL1_x2;
    if (barcode.panel === 2) { panelLeft = pW1_x1; panelRight = pW1_x2; }
    if (barcode.panel === 3) { panelLeft = pL2_x1; panelRight = pL2_x2; }
    if (barcode.panel === 4) { panelLeft = pW2_x1; panelRight = pW2_x2; }

    const panelW = panelRight - panelLeft;
    const availableW = Math.max(20, panelW - marginRight * 2);
    const scaleW = availableW < bcW ? availableW / bcW : 1;
    const availableH = Math.max(16, dPanel - marginBottom * 1.4);
    const scaleH = availableH < bcH ? availableH / bcH : 1;
    const scale = Math.max(0.15, Math.min(scaleW, scaleH));

    const finalW = bcW * scale;
    const finalH = bcH * scale;
    const bcX = panelRight - marginRight * scale - finalW;
    const bcY = y2 - marginBottom * scale - finalH;

    barcodeBox = {
      x: r(bcX),
      y: r(bcY),
      width: r(finalW),
      height: r(finalH),
      text: barcode.value,
    };
  }

  // 7. Product Simulation & Anti-Headspace Diagnostic
  const productSimulationBoxes: DielinePaths['productSimulationBoxes'] = [];
  let headspaceDiagnostic: HeadspaceDiagnostic | undefined;

  if (config.inputMode === 'product' && config.product) {
    const pL = Math.max(1, config.product.length);
    const pW = Math.max(1, config.product.width);
    const pD = Math.max(1, config.product.depth);

    const headspaceMm = r(D - pD);
    const clearanceLMm = r(L - pL);
    const clearanceWMm = r(W - pW);
    const boxVol = L * W * D;
    const prodVol = pL * pW * pD;
    const volumeUtilizationPct = boxVol > 0 ? Math.min(100, Math.round((prodVol / boxVol) * 1000) / 10) : 0;

    let status: HeadspaceDiagnostic['status'] = 'optimal';
    let message = 'Ideal snug fit with controlled top clearance.';
    if (headspaceMm < 0 || clearanceLMm < 0 || clearanceWMm < 0) {
      status = 'interference';
      message = 'Product exceeds inner box cavity - increase clearance or box dimensions.';
    } else if (headspaceMm > 6) {
      status = 'excessive';
      message = `${headspaceMm} mm top headspace may cause crushing or require void fill.`;
    } else if (headspaceMm < 0.5) {
      status = 'tight';
      message = 'Zero-gap press fit; ensure board caliper tolerance does not pinch lid.';
    }

    headspaceDiagnostic = {
      headspaceMm,
      clearanceLMm,
      clearanceWMm,
      volumeUtilizationPct,
      status,
      message,
    };

    const bottomRestY = y2 - (advanced.compensateInnerFlapDepth ? T : 0);
    productSimulationBoxes.push({
      x: r((pL1_x1 + pL1_x2) / 2 - pL / 2),
      y: r(bottomRestY - pD),
      width: r(pL),
      height: r(pD),
      label: `PRODUCT L x D (${fmt(pL)} x ${fmt(pD)})`,
      headspaceMm,
    });
    productSimulationBoxes.push({
      x: r((pW1_x1 + pW1_x2) / 2 - pW / 2),
      y: r(bottomRestY - pD),
      width: r(pW),
      height: r(pD),
      label: `SIDE W x D (${fmt(pW)} x ${fmt(pD)})`,
      headspaceMm,
    });
  }

  const boxWidth = r(x5 - x0);
  const boxHeight = r(bottomAnchor - topAnchor);
  const totalAreaM2 = (boxWidth / 1000) * (boxHeight / 1000);

  return {
    cutSegments: cutLines,
    creaseSegments: creaseLines,
    perforationSegments: perfLines,
    perforationFoldSegments: perfFoldLines,
    bleedPath,
    safeZoneBoxes,
    glueKnockoutPolygon,
    glueKnockoutBounds,
    fluteIndicator,
    productSimulationBoxes,
    dimensionLines: dimLines,
    barcodeBox,
    width: boxWidth,
    height: boxHeight,
    panelCoords: {
      x0, x1, x2, x3, x4, x5,
      pL1_x1, pL1_x2,
      pW1_x1, pW1_x2,
      pL2_x1, pL2_x2,
      pW2_x1, pW2_x2,
      pGlue_x1, pGlue_x2,
      y0_L, y0_W, y1, y2, y3_L, y3_W,
      lPanel, wPanel, dPanel,
      flapL: bottomFlapL,
      flapW: bottomFlapW,
      topFlapL,
      topFlapW,
      hasTopFlaps,
    },
    info: {
      innerDimensions: { length: L, width: W, depth: D },
      outerDimensions: { length: outerL, width: outerW, depth: outerD },
      blankDimensions: { width: boxWidth, height: boxHeight },
      totalAreaSqM: totalAreaM2,
      depthAllowanceMm,
      headspaceDiagnostic,
    },
    dielineBounds: {
      minX: x0 - bleedMm,
      minY: topAnchor - bleedMm,
      maxX: x5 + bleedMm,
      maxY: bottomAnchor + bleedMm,
    },
    boundingBox: {
      minX: Math.min(dimOffsetLeftTotal - 16, x0 - bleedMm - 4),
      minY: Math.min(dimOffsetTopTotal - 14, topAnchor - bleedMm - 4),
      maxX: x5 + Math.max(14, bleedMm + 6),
      maxY: bottomAnchor + Math.max(14, bleedMm + 6),
    },
  };
}
