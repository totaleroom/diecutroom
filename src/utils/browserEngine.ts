import type * as THREE from 'three';

export type EngineTier = 'ultra' | 'balanced' | 'eco' | 'software';

export interface EngineQualityProfile {
  tier: EngineTier;
  isSoftwareGl: boolean;
  isMobileOrTouch: boolean;
  prefersReducedMotion: boolean;
  hardwareCores: number;
  deviceMemoryGb: number | null;
  gpuRenderer: string;
  maxPixelRatio: number;
  antialias: boolean;
  shadowsEnabled: boolean;
  shadowMapSize: number;
  maxAnisotropyCap: number;
  matrixSpacing: number;
  matrixMaxDpr: number;
}

let cachedProfile: EngineQualityProfile | null = null;

export function getEngineProfile(): EngineQualityProfile {
  if (cachedProfile) return cachedProfile;

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    cachedProfile = {
      tier: 'balanced',
      isSoftwareGl: false,
      isMobileOrTouch: false,
      prefersReducedMotion: false,
      hardwareCores: 4,
      deviceMemoryGb: null,
      gpuRenderer: 'unknown',
      maxPixelRatio: 1.5,
      antialias: true,
      shadowsEnabled: true,
      shadowMapSize: 1024,
      maxAnisotropyCap: 4,
      matrixSpacing: 12,
      matrixMaxDpr: 1.5,
    };
    return cachedProfile;
  }

  let isSoftwareGl = false;
  let gpuRenderer = 'unknown';

  try {
    const probeCanvas = document.createElement('canvas');
    const gl =
      (probeCanvas.getContext('webgl2', { failIfMajorPerformanceCaveat: false }) as WebGL2RenderingContext | null) ||
      (probeCanvas.getContext('webgl', { failIfMajorPerformanceCaveat: false }) as WebGLRenderingContext | null);

    if (!gl) {
      isSoftwareGl = true;
      gpuRenderer = 'no-webgl';
    } else {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      gpuRenderer = String(gl.getParameter(param) || '');
      isSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render|Microsoft Basic/i.test(
        gpuRenderer
      );
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    isSoftwareGl = true;
  }

  const hardwareCores = Math.max(2, Number(navigator.hardwareConcurrency || 4));
  const rawMem = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
  const deviceMemoryGb = typeof rawMem === 'number' && Number.isFinite(rawMem) ? rawMem : null;

  const isMobileOrTouch = Boolean(
    window.matchMedia?.('(pointer: coarse)').matches ||
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '')
  );

  const prefersReducedMotion = Boolean(
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );

  const isLowPowerGpu =
    /Apple A\d+|Mali-G5|Mali-T|Adreno \(TM\) [345]/i.test(gpuRenderer) ||
    (isMobileOrTouch && hardwareCores <= 4);

  let tier: EngineTier = 'balanced';
  if (isSoftwareGl) {
    tier = 'software';
  } else if (
    isLowPowerGpu ||
    hardwareCores <= 2 ||
    (deviceMemoryGb !== null && deviceMemoryGb <= 2)
  ) {
    tier = 'eco';
  } else if (
    !isMobileOrTouch &&
    hardwareCores >= 6 &&
    (deviceMemoryGb === null || deviceMemoryGb >= 8)
  ) {
    tier = 'ultra';
  }

  const nativeDpr = window.devicePixelRatio || 1;
  const profileMap: Record<
    EngineTier,
    Pick<
      EngineQualityProfile,
      | 'maxPixelRatio'
      | 'antialias'
      | 'shadowsEnabled'
      | 'shadowMapSize'
      | 'maxAnisotropyCap'
      | 'matrixSpacing'
      | 'matrixMaxDpr'
    >
  > = {
    ultra: {
      maxPixelRatio: Math.min(nativeDpr, 2.0),
      antialias: true,
      shadowsEnabled: true,
      shadowMapSize: 1024,
      maxAnisotropyCap: 8,
      matrixSpacing: 11,
      matrixMaxDpr: Math.min(nativeDpr, 2.0),
    },
    balanced: {
      maxPixelRatio: Math.min(nativeDpr, 1.5),
      antialias: true,
      shadowsEnabled: true,
      shadowMapSize: 1024,
      maxAnisotropyCap: 4,
      matrixSpacing: 12,
      matrixMaxDpr: Math.min(nativeDpr, 1.5),
    },
    eco: {
      maxPixelRatio: Math.min(nativeDpr, 1.15),
      antialias: false,
      shadowsEnabled: false,
      shadowMapSize: 512,
      maxAnisotropyCap: 2,
      matrixSpacing: 16,
      matrixMaxDpr: Math.min(nativeDpr, 1.15),
    },
    software: {
      maxPixelRatio: 1.0,
      antialias: false,
      shadowsEnabled: false,
      shadowMapSize: 512,
      maxAnisotropyCap: 1,
      matrixSpacing: 16,
      matrixMaxDpr: 1.0,
    },
  };

  cachedProfile = {
    tier,
    isSoftwareGl,
    isMobileOrTouch,
    prefersReducedMotion,
    hardwareCores,
    deviceMemoryGb,
    gpuRenderer,
    ...profileMap[tier],
  };

  return cachedProfile;
}

export function createDynamicResolutionController(
  renderer: THREE.WebGLRenderer,
  basePixelRatio: number,
  isSoftwareGl: boolean
) {
  let currentScale = 1.0;
  let slowStreak = 0;
  let fastStreak = 0;
  const minScale = isSoftwareGl ? 1.0 : Math.max(0.65, 0.9 / Math.max(1, basePixelRatio));

  return {
    recordFrameCost(renderMs: number, isInteracting: boolean) {
      if (isSoftwareGl) return;

      if (renderMs > 26) {
        slowStreak++;
        fastStreak = 0;
        if (slowStreak >= 3 && currentScale > minScale) {
          currentScale = Math.max(minScale, Number((currentScale - 0.15).toFixed(2)));
          renderer.setPixelRatio(Math.max(0.85, basePixelRatio * currentScale));
          slowStreak = 0;
        }
      } else if (renderMs < 13 && !isInteracting) {
        fastStreak++;
        slowStreak = 0;
        if (fastStreak >= 5 && currentScale < 1.0) {
          currentScale = Math.min(1.0, Number((currentScale + 0.15).toFixed(2)));
          renderer.setPixelRatio(basePixelRatio * currentScale);
          fastStreak = 0;
        }
      } else {
        slowStreak = 0;
      }
    },
    restoreFullResolution(): boolean {
      if (isSoftwareGl || currentScale >= 1.0) return false;
      currentScale = 1.0;
      renderer.setPixelRatio(basePixelRatio);
      return true;
    },
  };
}

export function scheduleIdleWork(callback: () => void, timeoutMs = 1500): () => void {
  if (typeof window === 'undefined') return () => {};
  const win = window as unknown as {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (typeof win.requestIdleCallback === 'function') {
    const id = win.requestIdleCallback(callback, { timeout: timeoutMs });
    return () => win.cancelIdleCallback?.(id);
  }
  const timer = window.setTimeout(callback, Math.min(300, timeoutMs));
  return () => window.clearTimeout(timer);
}
