import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Eye, EyeOff, RotateCcw, ChevronDown, ChevronUp, Scissors } from 'lucide-react';
import {
  BoxConfig,
  DielinePaths,
  FluteDirection,
  PERFORATION_OPTIONS,
} from '../types';
import { formatValue } from '../utils/units';
import { getEngineProfile, createDynamicResolutionController } from '../utils/browserEngine';
import { TactileButton, TactileSegmented } from './tactile/TactileUI';

interface Box3DViewerProps {
  config: BoxConfig;
  paths: DielinePaths;
  hasMobileFloatingDock?: boolean;
  isShortLandscape?: boolean;
  focusMode?: boolean;
}

type CameraViewPreset = 'iso' | 'front' | 'top' | 'side';

function createCardboardTexture(
  colorMode: 'kraft' | 'white',
  fluteDirection: FluteDirection,
  isInner = false
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  if (colorMode === 'kraft') {
    ctx.fillStyle = isInner ? '#BA9566' : '#CAA87B';
  } else {
    ctx.fillStyle = isInner ? '#E2E8F0' : '#F6F8FA';
  }
  ctx.fillRect(0, 0, 256, 256);

  // Corrugated flute ribs matching vertical or horizontal grain
  ctx.fillStyle =
    colorMode === 'kraft'
      ? isInner
        ? 'rgba(84, 52, 22, 0.065)'
        : 'rgba(92, 61, 30, 0.048)'
      : 'rgba(148, 163, 184, 0.06)';

  if (fluteDirection === 'vertical') {
    for (let x = 0; x < 256; x += 8) {
      ctx.fillRect(x, 0, 3, 256);
    }
  } else {
    for (let y = 0; y < 256; y += 8) {
      ctx.fillRect(0, y, 256, 3);
    }
  }

  // Natural paper fibers (deterministic pattern so textures stay clean without noise flicker)
  for (let i = 0; i < 520; i++) {
    const px = ((i * 73) % 251) + (i % 5);
    const py = ((i * 137) % 249) + (i % 7);
    const len = 1 + (i % 3);
    ctx.fillStyle =
      colorMode === 'kraft'
        ? i % 2 === 0
          ? 'rgba(101, 67, 33, 0.11)'
          : 'rgba(255, 245, 225, 0.1)'
        : 'rgba(148, 163, 184, 0.09)';
    ctx.fillRect(px, py, len, 1);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function disposeObject3D(root: THREE.Object3D) {
  root.traverse((obj) => {
    const geom = (obj as THREE.Mesh).geometry;
    if (geom) geom.dispose();
    const mat = (obj as THREE.Mesh).material;
    if (mat) {
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat.dispose();
    }
  });
}

function addRoundedRectHole(
  shape: THREE.Shape,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rad: number
) {
  const r = Math.min(rad, (x2 - x1) / 2 - 0.001, (y2 - y1) / 2 - 0.001);
  const hole = new THREE.Path();
  hole.moveTo(x1 + r, y1);
  hole.lineTo(x2 - r, y1);
  hole.absarc(x2 - r, y1 + r, r, -Math.PI / 2, 0, false);
  hole.lineTo(x2, y2 - r);
  hole.absarc(x2 - r, y2 - r, r, 0, Math.PI / 2, false);
  hole.lineTo(x1 + r, y2);
  hole.absarc(x1 + r, y2 - r, r, Math.PI / 2, Math.PI, false);
  hole.lineTo(x1, y1 + r);
  hole.absarc(x1 + r, y1 + r, r, Math.PI, Math.PI * 1.5, false);
  shape.holes.push(hole);
}

function buildRoundedRectShape(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rad: number
): THREE.Shape {
  const r = Math.min(rad, (x2 - x1) / 2 - 0.001, (y2 - y1) / 2 - 0.001);
  const s = new THREE.Shape();
  s.moveTo(x1 + r, y1);
  s.lineTo(x2 - r, y1);
  s.absarc(x2 - r, y1 + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x2, y2 - r);
  s.absarc(x2 - r, y2 - r, r, 0, Math.PI / 2, false);
  s.lineTo(x1 + r, y2);
  s.absarc(x1 + r, y2 - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x1, y1 + r);
  s.absarc(x1 + r, y1 + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

function addPillHole(
  shape: THREE.Shape,
  cx: number,
  cy: number,
  w: number,
  h: number
) {
  if (w <= h) return;
  const rad = h / 2;
  const x1 = cx - w / 2 + rad;
  const x2 = cx + w / 2 - rad;
  const hole = new THREE.Path();
  hole.moveTo(x1, cy - rad);
  hole.lineTo(x2, cy - rad);
  hole.absarc(x2, cy, rad, -Math.PI / 2, Math.PI / 2, false);
  hole.lineTo(x1, cy + rad);
  hole.absarc(x1, cy, rad, Math.PI / 2, Math.PI * 1.5, false);
  shape.holes.push(hole);
}

function buildPillShape(cx: number, cy: number, w: number, h: number): THREE.Shape {
  const rad = h / 2;
  const x1 = cx - w / 2 + rad;
  const x2 = cx + w / 2 - rad;
  const s = new THREE.Shape();
  s.moveTo(x1, cy - rad);
  s.lineTo(x2, cy - rad);
  s.absarc(x2, cy, rad, -Math.PI / 2, Math.PI / 2, false);
  s.lineTo(x1, cy + rad);
  s.absarc(x1, cy, rad, Math.PI / 2, Math.PI * 1.5, false);
  return s;
}

function addVerticalSlotHole(
  shape: THREE.Shape,
  cx: number,
  cy: number,
  w: number,
  h: number
) {
  if (h <= w) return;
  const rad = w / 2;
  const y1 = cy - h / 2 + rad;
  const y2 = cy + h / 2 - rad;
  const hole = new THREE.Path();
  hole.moveTo(cx - rad, y1);
  hole.absarc(cx, y1, rad, Math.PI, 0, false);
  hole.lineTo(cx + rad, y2);
  hole.absarc(cx, y2, rad, 0, Math.PI, false);
  hole.closePath();
  shape.holes.push(hole);
}

function buildVerticalSlotShape(cx: number, cy: number, w: number, h: number): THREE.Shape {
  const rad = w / 2;
  const y1 = cy - h / 2 + rad;
  const y2 = cy + h / 2 - rad;
  const s = new THREE.Shape();
  s.moveTo(cx - rad, y1);
  s.absarc(cx, y1, rad, Math.PI, 0, false);
  s.lineTo(cx + rad, y2);
  s.absarc(cx, y2, rad, 0, Math.PI, false);
  s.closePath();
  return s;
}

interface TearAnimator {
  apply: (t: number, baseOpacity: number, isXray: boolean) => void;
}

interface HingeRefs {
  w1: THREE.Group;
  l1: THREE.Group;
  glue: THREE.Group;
  w2: THREE.Group;
  botFlapsInner: THREE.Group[];
  botFlapsOuter: THREE.Group[];
  topFlapsInner: THREE.Group[];
  topFlapsOuter: THREE.Group[];
  productGroup: THREE.Group;
  boxMaterials: THREE.MeshStandardMaterial[];
  removableMaterials: THREE.MeshStandardMaterial[];
  tearAnimator: TearAnimator | null;
  hasTopFlaps: boolean;
  isOverlapOuter: boolean;
}

export default function Box3DViewer({
  config,
  paths,
  hasMobileFloatingDock = false,
  isShortLandscape = false,
  focusMode = false,
}: Box3DViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [foldPercent, setFoldPercent] = useState<number>(82);
  const [tearPercent, setTearPercent] = useState<number>(0);
  const [xrayMode, setXrayMode] = useState<boolean>(true);
  const [dockCollapsed, setDockCollapsed] = useState<boolean>(
    () => typeof window !== 'undefined' && window.innerWidth < 640
  );
  const [activeCamPreset, setActiveCamPreset] = useState<CameraViewPreset>('iso');
  const [contextLost, setContextLost] = useState<boolean>(false);

  const targetFoldRef = useRef<number>(0.82);
  const currentFoldRef = useRef<number>(0.82);
  const targetTearRef = useRef<number>(0);
  const currentTearRef = useRef<number>(0);
  const xrayRef = useRef<boolean>(true);
  const hingesRef = useRef<HingeRefs | null>(null);
  const requestRenderRef = useRef<() => void>(() => {});
  const setCamPresetRef = useRef<(preset: CameraViewPreset) => void>(() => {});
  const sceneRootRef = useRef<THREE.Group | null>(null);
  const outerTexRef = useRef<THREE.CanvasTexture | null>(null);
  const innerTexRef = useRef<THREE.CanvasTexture | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  // Auto-reset tear simulation if perforation gets disabled
  useEffect(() => {
    if (!config.perforation.enabled && tearPercent !== 0) {
      setTearPercent(0);
    }
  }, [config.perforation.enabled, tearPercent]);

  // Sync UI state into refs and trigger damped render
  useEffect(() => {
    targetFoldRef.current = foldPercent / 100;
    requestRenderRef.current();
  }, [foldPercent]);

  useEffect(() => {
    targetTearRef.current = config.perforation.enabled ? tearPercent / 100 : 0;
    requestRenderRef.current();
  }, [tearPercent, config.perforation.enabled]);

  useEffect(() => {
    xrayRef.current = xrayMode;
    const h = hingesRef.current;
    if (h) {
      const baseOp = xrayMode ? 0.36 : 1.0;
      h.boxMaterials.forEach((mat) => {
        mat.transparent = xrayMode;
        mat.opacity = baseOp;
        mat.depthWrite = !xrayMode;
        mat.needsUpdate = true;
      });
      if (h.tearAnimator) {
        h.tearAnimator.apply(currentTearRef.current, baseOp, xrayMode);
      }
    }
    requestRenderRef.current();
  }, [xrayMode]);

  // Keyboard shortcut 'H' to collapse/expand bottom dock
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key.toLowerCase() === 'h' &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)
      ) {
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
    scene.background = new THREE.Color('#F1F5F9');
    scene.fog = new THREE.Fog('#F1F5F9', 9, 22);

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.05, 50);
    camera.position.set(2.35, 1.95, 2.65);

    const renderer = new THREE.WebGLRenderer({
      antialias: profile.antialias,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(basePixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.04;
    renderer.shadowMap.enabled = profile.shadowsEnabled;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;
    const drs = createDynamicResolutionController(renderer, basePixelRatio, isSoftwareGl);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
    };
    const onContextRestored = () => {
      setContextLost(false);
      requestRenderRef.current();
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Studio environment map
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmremGenerator.dispose();

    // 3-point warm/cool studio lighting
    const hemiLight = new THREE.HemisphereLight('#F8FAFC', '#94A3B8', 0.85);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight('#FFF7ED', 1.45);
    keyLight.position.set(4, 6.5, 4.5);
    keyLight.castShadow = profile.shadowsEnabled;
    keyLight.shadow.mapSize.set(profile.shadowMapSize, profile.shadowMapSize);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 16;
    keyLight.shadow.camera.left = -3;
    keyLight.shadow.camera.right = 3;
    keyLight.shadow.camera.top = 3;
    keyLight.shadow.camera.bottom = -3;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight('#E0E7FF', 0.65);
    rimLight.position.set(-4, 3, -4);
    scene.add(rimLight);

    // Ground drafting grid & shadow catcher
    const grid = new THREE.GridHelper(12, 24, '#CBD5E1', '#E2E8F0');
    grid.position.y = -0.002;
    (grid.material as THREE.Material).polygonOffset = true;
    (grid.material as THREE.Material).polygonOffsetFactor = 1;
    scene.add(grid);

    const shadowGeo = new THREE.PlaneGeometry(12, 12);
    const shadowMat = new THREE.ShadowMaterial({ opacity: 0.14 });
    const shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.receiveShadow = true;
    scene.add(shadowPlane);

    const rootGroup = new THREE.Group();
    scene.add(rootGroup);
    sceneRootRef.current = rootGroup;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;
    controls.minDistance = 1.1;
    controls.maxDistance = 9;
    controls.target.set(0, 0.55, 0);
    controls.update();

    // Pre-allocated camera transition targets
    let camTransitioning = false;
    const goalCamPos = new THREE.Vector3(2.35, 1.95, 2.65);
    const goalTarget = new THREE.Vector3(0, 0.55, 0);

    const CAMERA_PRESETS: Record<CameraViewPreset, { pos: [number, number, number]; target: [number, number, number] }> = {
      iso: { pos: [2.35, 1.95, 2.65], target: [0, 0.55, 0] },
      front: { pos: [0, 0.85, 3.05], target: [0, 0.55, 0] },
      top: { pos: [0.01, 3.25, 0.65], target: [0, 0.4, 0] },
      side: { pos: [2.95, 0.9, 0.15], target: [0, 0.55, 0] },
    };

    const onControlStart = () => {
      camTransitioning = false;
    };
    controls.addEventListener('start', onControlStart);

    // On-demand + damped render scheduler
    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let lastTime = performance.now();

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (!gl || typeof gl.fenceSync !== 'function') {
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
    }

    function applyFoldKinematics(t: number) {
      const h = hingesRef.current;
      if (!h) return;

      const wallT = THREE.MathUtils.clamp(t / 0.55, 0, 1);
      const wallAngle = wallT * (Math.PI / 2);
      h.w1.rotation.y = wallAngle;
      h.l1.rotation.y = wallAngle;
      h.glue.rotation.y = wallAngle;
      h.w2.rotation.y = -wallAngle;

      const botInnerT = THREE.MathUtils.clamp((t - 0.45) / 0.25, 0, 1);
      const botOuterT = THREE.MathUtils.clamp((t - 0.58) / 0.25, 0, 1);
      h.botFlapsInner.forEach((g) => {
        g.rotation.x = -botInnerT * (Math.PI / 2);
      });
      h.botFlapsOuter.forEach((g) => {
        g.rotation.x = -botOuterT * (Math.PI / 2);
      });

      if (h.hasTopFlaps) {
        const topInnerT = THREE.MathUtils.clamp((t - 0.65) / 0.25, 0, 1);
        const topOuterT = THREE.MathUtils.clamp((t - 0.78) / 0.22, 0, 1);
        h.topFlapsInner.forEach((g) => {
          g.rotation.x = topInnerT * (Math.PI / 2);
        });
        h.topFlapsOuter.forEach((g, idx) => {
          const maxAng = h.isOverlapOuter && idx === 1 ? Math.PI / 2 - 0.025 : Math.PI / 2;
          g.rotation.x = topOuterT * maxAng;
        });
      }

      const prodScale = THREE.MathUtils.lerp(0.85, 1.0, wallT);
      h.productGroup.scale.setScalar(prodScale);
      h.productGroup.visible = t > 0.2;
    }

    function requestRender() {
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame((now) => {
        renderDirty = false;
        const dt = Math.min(0.1, Math.max(0.001, (now - lastTime) / 1000));
        lastTime = now;

        let needsAnother = false;

        // Smooth fold damping
        if (Math.abs(currentFoldRef.current - targetFoldRef.current) > 0.0008) {
          currentFoldRef.current = THREE.MathUtils.damp(
            currentFoldRef.current,
            targetFoldRef.current,
            10,
            dt
          );
          needsAnother = true;
        } else {
          currentFoldRef.current = targetFoldRef.current;
        }
        applyFoldKinematics(currentFoldRef.current);

        // Smooth tear / perforation opening damping
        if (Math.abs(currentTearRef.current - targetTearRef.current) > 0.0008) {
          currentTearRef.current = THREE.MathUtils.damp(
            currentTearRef.current,
            targetTearRef.current,
            8,
            dt
          );
          needsAnother = true;
        } else {
          currentTearRef.current = targetTearRef.current;
        }
        if (hingesRef.current?.tearAnimator) {
          const isXray = xrayRef.current;
          hingesRef.current.tearAnimator.apply(
            currentTearRef.current,
            isXray ? 0.36 : 1.0,
            isXray
          );
        }

        // Smooth camera damping (auto-cancelled on OrbitControls 'start')
        if (camTransitioning) {
          const alpha = 1 - Math.exp(-8 * dt);
          camera.position.lerp(goalCamPos, alpha);
          controls.target.lerp(goalTarget, alpha);
          if (
            camera.position.distanceTo(goalCamPos) < 0.008 &&
            controls.target.distanceTo(goalTarget) < 0.008
          ) {
            camera.position.copy(goalCamPos);
            controls.target.copy(goalTarget);
            camTransitioning = false;
          } else {
            needsAnother = true;
          }
        }

        const ctrlMoving = controls.update();
        if (ctrlMoving && !isSoftwareGl) needsAnother = true;

        const renderStart = performance.now();
        renderer.render(scene, camera);
        const renderCost = performance.now() - renderStart;
        drs.recordFrameCost(renderCost, Boolean(needsAnother || ctrlMoving));

        if (!needsAnother && !renderDirty && drs.restoreFullResolution()) {
          renderer.render(scene, camera);
        }

        const done = () => {
          renderBusy = false;
          if (renderDirty || needsAnother) requestRender();
        };
        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    }

    requestRenderRef.current = requestRender;
    controls.addEventListener('change', requestRender);

    setCamPresetRef.current = (preset: CameraViewPreset) => {
      const spec = CAMERA_PRESETS[preset];
      goalCamPos.set(...spec.pos);
      goalTarget.set(...spec.target);
      camTransitioning = true;
      requestRender();
    };

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || 800;
      const h = container.clientHeight || 600;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    };
    window.addEventListener('resize', onResize);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }
    requestRender();

    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', onResize);
      controls.removeEventListener('change', requestRender);
      controls.removeEventListener('start', onControlStart);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);
      controls.dispose();
      if (outerTexRef.current) outerTexRef.current.dispose();
      if (innerTexRef.current) innerTexRef.current.dispose();
      envTex.dispose();
      shadowGeo.dispose();
      shadowMat.dispose();
      disposeObject3D(rootGroup);
      renderer.dispose();
    };
  }, []);

  // Rebuild procedural corrugated carton, SRP perforation sub-meshes & product proxy
  useEffect(() => {
    const root = sceneRootRef.current;
    if (!root) return;

    disposeObject3D(root);
    if (outerTexRef.current) {
      outerTexRef.current.dispose();
      outerTexRef.current = null;
    }
    if (innerTexRef.current) {
      innerTexRef.current.dispose();
      innerTexRef.current = null;
    }

    const { panelCoords } = paths;
    const L = panelCoords.lPanel;
    const W = panelCoords.wPanel;
    const D = panelCoords.dPanel;
    const T = config.fluteThickness;
    const G = config.glueFlapWidth;

    const maxDim = Math.max(L, W, D, 100);
    const scale = 1.6 / maxDim;

    const sL = L * scale;
    const sW = W * scale;
    const sD = D * scale;
    const sT = Math.max(0.009, T * scale);
    const sG = G * scale;
    const sBotFlapL = panelCoords.flapL * scale;
    const sBotFlapW = panelCoords.flapW * scale;
    const sTopFlapL = panelCoords.topFlapL * scale;
    const sTopFlapW = panelCoords.topFlapW * scale;
    const sSlotGap = config.advanced.slotGap * scale;

    const outerTex = createCardboardTexture(config.materialColor, config.prepress.fluteDirection, false);
    const innerTex = createCardboardTexture(config.materialColor, config.prepress.fluteDirection, true);
    if (rendererRef.current) {
      const aniso = Math.min(
        getEngineProfile().maxAnisotropyCap,
        rendererRef.current.capabilities.getMaxAnisotropy()
      );
      outerTex.anisotropy = aniso;
      innerTex.anisotropy = aniso;
    }
    outerTexRef.current = outerTex;
    innerTexRef.current = innerTex;

    const isXray = xrayRef.current;
    const baseOpacity = isXray ? 0.36 : 1.0;

    const boardMat = new THREE.MeshStandardMaterial({
      map: outerTex,
      color: config.materialColor === 'kraft' ? '#D6B88D' : '#F8FAFC',
      roughness: 0.85,
      metalness: 0.02,
      transparent: isXray,
      opacity: baseOpacity,
      depthWrite: !isXray,
    });

    const removableMat = new THREE.MeshStandardMaterial({
      map: innerTex,
      color: config.materialColor === 'kraft' ? '#CFAF82' : '#F1F5F9',
      roughness: 0.84,
      metalness: 0.02,
      transparent: true,
      opacity: baseOpacity,
      depthWrite: !isXray,
    });

    const edgeMat = new THREE.LineBasicMaterial({
      color: config.materialColor === 'kraft' ? '#78552B' : '#94A3B8',
      transparent: true,
      opacity: 0.65,
    });

    const isSolidPerf =
      config.perforation.ruleMode === 'solid' || config.perforation.tie <= 0;

    const perfSeamMat: THREE.LineBasicMaterial | THREE.LineDashedMaterial = isSolidPerf
      ? new THREE.LineBasicMaterial({
          color: '#16A34A',
          transparent: true,
          opacity: 0.92,
        })
      : new THREE.LineDashedMaterial({
          color: '#16A34A',
          dashSize: Math.max(0.014, config.perforation.cut * scale),
          gapSize: Math.max(0.008, config.perforation.tie * scale),
          transparent: true,
          opacity: 0.95,
        });

    const creaseSeamMat = new THREE.LineDashedMaterial({
      color: '#E11D48',
      dashSize: 0.026,
      gapSize: 0.014,
      transparent: true,
      opacity: 0.9,
    });

    const boxMaterials: THREE.MeshStandardMaterial[] = [boardMat];
    const removableMaterials: THREE.MeshStandardMaterial[] = [removableMat];

    const makeBoxPanel = (
      pw: number,
      ph: number,
      pt: number,
      mat: THREE.MeshStandardMaterial = boardMat
    ) => {
      const geo = new THREE.BoxGeometry(Math.max(0.005, pw), Math.max(0.005, ph), pt);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat);
      mesh.add(edges);
      return mesh;
    };

    const makeExtrudedShape = (
      shape: THREE.Shape,
      pt: number,
      mat: THREE.MeshStandardMaterial = boardMat
    ) => {
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: pt,
        bevelEnabled: false,
        curveSegments: 16,
      });
      geo.translate(0, 0, -pt / 2);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 22), edgeMat);
      mesh.add(edges);
      return mesh;
    };

    const addPerfSeam = (parent: THREE.Object3D, pts: Array<[number, number]>) => {
      if (pts.length < 2) return;
      const zOut = -sT / 2 - 0.0016;
      const vertices = pts.map(([px, py]) => new THREE.Vector3(px, py, zOut));
      const geo = new THREE.BufferGeometry().setFromPoints(vertices);
      const line = new THREE.Line(geo, perfSeamMat);
      if (!isSolidPerf) line.computeLineDistances();
      parent.add(line);
    };

    const addCreaseSeam = (parent: THREE.Object3D, pts: Array<[number, number]>) => {
      if (pts.length < 2) return;
      const zOut = -sT / 2 - 0.0016;
      const vertices = pts.map(([px, py]) => new THREE.Vector3(px, py, zOut));
      const geo = new THREE.BufferGeometry().setFromPoints(vertices);
      const line = new THREE.Line(geo, creaseSeamMat);
      line.computeLineDistances();
      parent.add(line);
    };

    const makePolygonShape = (pts: Array<[number, number]>) => {
      const s = new THREE.Shape();
      pts.forEach(([px, py], i) => {
        if (i === 0) s.moveTo(px, py);
        else s.lineTo(px, py);
      });
      s.closePath();
      return s;
    };

    // Anchor: Back panel L2 standing upright centered at X=0, Z=-sW/2, bottom at Y = 2*sT
    const baseElevation = sT * 2;
    const cartonGroup = new THREE.Group();
    cartonGroup.position.set(0, baseElevation, -sW / 2);
    root.add(cartonGroup);

    // Kinematic Hinges
    const w1Hinge = new THREE.Group();
    w1Hinge.position.set(-sL / 2, 0, 0);
    cartonGroup.add(w1Hinge);

    const l1Hinge = new THREE.Group();
    l1Hinge.position.set(-sW, 0, 0);
    w1Hinge.add(l1Hinge);

    const glueHinge = new THREE.Group();
    glueHinge.position.set(-sL, 0, 0);
    l1Hinge.add(glueHinge);
    const glueMesh = makeBoxPanel(sG, sD * 0.94, sT * 0.8);
    glueMesh.position.set(-sG / 2, sD / 2, sT * 0.9);
    glueHinge.add(glueMesh);

    const w2Hinge = new THREE.Group();
    w2Hinge.position.set(sL / 2, 0, 0);
    cartonGroup.add(w2Hinge);

    // Tear animation registries
    const hoodGroups: THREE.Group[] = [];
    const ejectOutGroups: Array<{ group: THREE.Group; distZ: number; liftY: number }> = [];
    const zipperStrips: Array<{ group: THREE.Group; dirX: number }> = [];
    let dropDoorHinge: THREE.Group | null = null;
    let perfTopFlapMode = false;

    const perfEnabled = config.perforation.enabled;
    const perfType = config.perforation.type;

    // Build Wall Panels (either clean full panels or exact SRP/perforation split panels)
    if (!perfEnabled) {
      const l2Mesh = makeBoxPanel(sL, sD, sT);
      l2Mesh.position.set(0, sD / 2, 0);
      cartonGroup.add(l2Mesh);

      const w1Mesh = makeBoxPanel(sW, sD, sT);
      w1Mesh.position.set(-sW / 2, sD / 2, 0);
      w1Hinge.add(w1Mesh);

      const l1Mesh = makeBoxPanel(sL, sD, sT);
      l1Mesh.position.set(-sL / 2, sD / 2, 0);
      l1Hinge.add(l1Mesh);

      const w2Mesh = makeBoxPanel(sW, sD, sT);
      w2Mesh.position.set(sW / 2, sD / 2, 0);
      w2Hinge.add(w2Mesh);
    } else if (
      perfType === 'angled-display' ||
      perfType === 'wrap-around' ||
      perfType === 'twin-split-tray'
    ) {
      perfTopFlapMode = true;
      const frontH =
        perfType === 'wrap-around'
          ? sD * 0.25
          : perfType === 'twin-split-tray'
          ? sD * 0.3
          : sD * 0.45;
      const backH =
        perfType === 'wrap-around'
          ? sD * 0.25
          : perfType === 'twin-split-tray'
          ? sD * 0.64
          : sD * 0.75;

      // L2 (Back Wall): Fixed tray [0..backH] + Hood [backH..sD]
      const l2Tray = makeBoxPanel(sL, backH, sT);
      l2Tray.position.set(0, backH / 2, 0);
      cartonGroup.add(l2Tray);
      addPerfSeam(cartonGroup, [
        [-sL / 2, backH],
        [sL / 2, backH],
      ]);

      const l2Hood = new THREE.Group();
      cartonGroup.add(l2Hood);
      const l2Upper = makeBoxPanel(sL, sD - backH, sT, removableMat);
      l2Upper.position.set(0, backH + (sD - backH) / 2, 0);
      l2Hood.add(l2Upper);
      hoodGroups.push(l2Hood);

      // L1 (Front Wall): Fixed tray [0..frontH] + Hood [frontH..sD]
      const l1Tray = makeBoxPanel(sL, frontH, sT);
      l1Tray.position.set(-sL / 2, frontH / 2, 0);
      l1Hinge.add(l1Tray);
      addPerfSeam(l1Hinge, [
        [-sL, frontH],
        [0, frontH],
      ]);

      const l1Hood = new THREE.Group();
      l1Hinge.add(l1Hood);
      const l1Upper = makeBoxPanel(sL, sD - frontH, sT, removableMat);
      l1Upper.position.set(-sL / 2, frontH + (sD - frontH) / 2, 0);
      l1Hood.add(l1Upper);
      hoodGroups.push(l1Hood);

      // W1 (x in [-sW, 0]): at x=-sW touches L1 (frontH); at x=0 touches L2 (backH)
      // W2 (x in [0, sW]): at x=0 touches L2 (backH); at x=+sW touches L1 (frontH)
      if (perfType === 'twin-split-tray') {
        const stepW = sW * 0.35;
        const w1LowPts: Array<[number, number]> = [
          [-sW, 0],
          [0, 0],
          [0, backH],
          [-stepW * 0.4, backH],
          [-sW + stepW, frontH],
          [-sW, frontH],
        ];
        const w1HighPts: Array<[number, number]> = [
          [-sW, frontH],
          [-sW + stepW, frontH],
          [-stepW * 0.4, backH],
          [0, backH],
          [0, sD],
          [-sW, sD],
        ];
        w1Hinge.add(makeExtrudedShape(makePolygonShape(w1LowPts), sT, boardMat));
        const w1Hood = new THREE.Group();
        w1Hood.add(makeExtrudedShape(makePolygonShape(w1HighPts), sT, removableMat));
        w1Hinge.add(w1Hood);
        hoodGroups.push(w1Hood);
        addPerfSeam(w1Hinge, [
          [-sW, frontH],
          [-sW + stepW, frontH],
          [-stepW * 0.4, backH],
          [0, backH],
        ]);

        const w2LowPts: Array<[number, number]> = [
          [0, 0],
          [sW, 0],
          [sW, frontH],
          [sW - stepW, frontH],
          [stepW * 0.4, backH],
          [0, backH],
        ];
        const w2HighPts: Array<[number, number]> = [
          [0, backH],
          [stepW * 0.4, backH],
          [sW - stepW, frontH],
          [sW, frontH],
          [sW, sD],
          [0, sD],
        ];
        w2Hinge.add(makeExtrudedShape(makePolygonShape(w2LowPts), sT, boardMat));
        const w2Hood = new THREE.Group();
        w2Hood.add(makeExtrudedShape(makePolygonShape(w2HighPts), sT, removableMat));
        w2Hinge.add(w2Hood);
        hoodGroups.push(w2Hood);
        addPerfSeam(w2Hinge, [
          [0, backH],
          [stepW * 0.4, backH],
          [sW - stepW, frontH],
          [sW, frontH],
        ]);
      } else {
        // Linear slant or flat cut on W1 & W2
        const w1LowPts: Array<[number, number]> = [
          [-sW, 0],
          [0, 0],
          [0, backH],
          [-sW, frontH],
        ];
        const w1HighPts: Array<[number, number]> = [
          [-sW, frontH],
          [0, backH],
          [0, sD],
          [-sW, sD],
        ];
        w1Hinge.add(makeExtrudedShape(makePolygonShape(w1LowPts), sT, boardMat));
        const w1Hood = new THREE.Group();
        w1Hood.add(makeExtrudedShape(makePolygonShape(w1HighPts), sT, removableMat));
        w1Hinge.add(w1Hood);
        hoodGroups.push(w1Hood);
        addPerfSeam(w1Hinge, [
          [-sW, frontH],
          [0, backH],
        ]);

        const w2LowPts: Array<[number, number]> = [
          [0, 0],
          [sW, 0],
          [sW, frontH],
          [0, backH],
        ];
        const w2HighPts: Array<[number, number]> = [
          [0, backH],
          [sW, frontH],
          [sW, sD],
          [0, sD],
        ];
        w2Hinge.add(makeExtrudedShape(makePolygonShape(w2LowPts), sT, boardMat));
        const w2Hood = new THREE.Group();
        w2Hood.add(makeExtrudedShape(makePolygonShape(w2HighPts), sT, removableMat));
        w2Hinge.add(w2Hood);
        hoodGroups.push(w2Hood);
        addPerfSeam(w2Hinge, [
          [0, backH],
          [sW, frontH],
        ]);
      }
    } else if (perfType === 'shelf-tray-scoop') {
      perfTopFlapMode = true;
      const shoulderH = sD * 0.44;
      const backH = sD * 0.68;
      const lipH = Math.min(26, Math.max(16, D * 0.2)) * scale;
      const shoulderW = Math.min(26, L * 0.18) * scale;
      const cx = -sL / 2;
      const scoopHalfW = Math.max(16 * scale, (sL - shoulderW * 2) / 2);
      const dropH = Math.max(0.01, shoulderH - lipH);
      const arcR = Math.min(scoopHalfW * 0.45, dropH * 0.7);
      const sx1 = cx - scoopHalfW;
      const sx2 = cx + scoopHalfW;

      // L2 (back wall)
      const l2Tray = makeBoxPanel(sL, backH, sT);
      l2Tray.position.set(0, backH / 2, 0);
      cartonGroup.add(l2Tray);
      addPerfSeam(cartonGroup, [
        [-sL / 2, backH],
        [sL / 2, backH],
      ]);
      const l2Hood = new THREE.Group();
      const l2Upper = makeBoxPanel(sL, sD - backH, sT, removableMat);
      l2Upper.position.set(0, backH + (sD - backH) / 2, 0);
      l2Hood.add(l2Upper);
      cartonGroup.add(l2Hood);
      hoodGroups.push(l2Hood);

      // L1 front U-scoop retainer tray + upper removable plug hood
      const l1Low = new THREE.Shape();
      l1Low.moveTo(-sL, 0);
      l1Low.lineTo(0, 0);
      l1Low.lineTo(0, shoulderH);
      l1Low.lineTo(sx2, shoulderH);
      l1Low.lineTo(sx2, lipH + arcR);
      l1Low.absarc(sx2 - arcR, lipH + arcR, arcR, 0, -Math.PI / 2, true);
      l1Low.lineTo(sx1 + arcR, lipH);
      l1Low.absarc(sx1 + arcR, lipH + arcR, arcR, -Math.PI / 2, Math.PI, true);
      l1Low.lineTo(sx1, shoulderH);
      l1Low.lineTo(-sL, shoulderH);
      l1Low.closePath();
      l1Hinge.add(makeExtrudedShape(l1Low, sT, boardMat));

      const l1High = new THREE.Shape();
      l1High.moveTo(-sL, shoulderH);
      l1High.lineTo(sx1, shoulderH);
      l1High.lineTo(sx1, lipH + arcR);
      l1High.absarc(sx1 + arcR, lipH + arcR, arcR, Math.PI, -Math.PI / 2, false);
      l1High.lineTo(sx2 - arcR, lipH);
      l1High.absarc(sx2 - arcR, lipH + arcR, arcR, -Math.PI / 2, 0, false);
      l1High.lineTo(sx2, shoulderH);
      l1High.lineTo(0, shoulderH);
      l1High.lineTo(0, sD);
      l1High.lineTo(-sL, sD);
      l1High.closePath();
      const l1Hood = new THREE.Group();
      l1Hood.add(makeExtrudedShape(l1High, sT, removableMat));
      l1Hinge.add(l1Hood);
      hoodGroups.push(l1Hood);

      // Seam trace on L1
      const seamPts: Array<[number, number]> = [
        [-sL, shoulderH],
        [sx1, shoulderH],
        [sx1, lipH + arcR],
        [sx1 + arcR * 0.3, lipH + arcR * 0.3],
        [sx1 + arcR, lipH],
        [sx2 - arcR, lipH],
        [sx2 - arcR * 0.3, lipH + arcR * 0.3],
        [sx2, lipH + arcR],
        [sx2, shoulderH],
        [0, shoulderH],
      ];
      addPerfSeam(l1Hinge, seamPts);

      // W1 & W2 sloped rails
      w1Hinge.add(
        makeExtrudedShape(
          makePolygonShape([
            [-sW, 0],
            [0, 0],
            [0, backH],
            [-sW, shoulderH],
          ]),
          sT,
          boardMat
        )
      );
      const w1Hood = new THREE.Group();
      w1Hood.add(
        makeExtrudedShape(
          makePolygonShape([
            [-sW, shoulderH],
            [0, backH],
            [0, sD],
            [-sW, sD],
          ]),
          sT,
          removableMat
        )
      );
      w1Hinge.add(w1Hood);
      hoodGroups.push(w1Hood);
      addPerfSeam(w1Hinge, [
        [-sW, shoulderH],
        [0, backH],
      ]);

      w2Hinge.add(
        makeExtrudedShape(
          makePolygonShape([
            [0, 0],
            [sW, 0],
            [sW, shoulderH],
            [0, backH],
          ]),
          sT,
          boardMat
        )
      );
      const w2Hood = new THREE.Group();
      w2Hood.add(
        makeExtrudedShape(
          makePolygonShape([
            [0, backH],
            [sW, shoulderH],
            [sW, sD],
            [0, sD],
          ]),
          sT,
          removableMat
        )
      );
      w2Hinge.add(w2Hood);
      hoodGroups.push(w2Hood);
      addPerfSeam(w2Hinge, [
        [0, backH],
        [sW, shoulderH],
      ]);
    } else if (perfType === 'drop-front-pdq') {
      // Back & sides solid; L1 splits into U-frame pillars + lip and hinged fold-down door
      const l2Mesh = makeBoxPanel(sL, sD, sT);
      l2Mesh.position.set(0, sD / 2, 0);
      cartonGroup.add(l2Mesh);
      const w1Mesh = makeBoxPanel(sW, sD, sT);
      w1Mesh.position.set(-sW / 2, sD / 2, 0);
      w1Hinge.add(w1Mesh);
      const w2Mesh = makeBoxPanel(sW, sD, sT);
      w2Mesh.position.set(sW / 2, sD / 2, 0);
      w2Hinge.add(w2Mesh);

      const sideInset = Math.min(22, Math.max(12, L * 0.14)) * scale;
      const lipH = Math.min(38, Math.max(22, D * 0.3)) * scale;
      const doorW = Math.max(0.02, sL - sideInset * 2);
      const doorH = Math.max(0.02, sD - lipH);

      // Left pillar
      const pL = makeBoxPanel(sideInset, sD, sT);
      pL.position.set(-sL + sideInset / 2, sD / 2, 0);
      l1Hinge.add(pL);
      // Right pillar
      const pR = makeBoxPanel(sideInset, sD, sT);
      pR.position.set(-sideInset / 2, sD / 2, 0);
      l1Hinge.add(pR);
      // Bottom retainer lip
      const lip = makeBoxPanel(doorW, lipH, sT);
      lip.position.set(-sL / 2, lipH / 2, 0);
      l1Hinge.add(lip);

      // Hinged door pivoted at bottom lip hinge (y = lipH)
      dropDoorHinge = new THREE.Group();
      dropDoorHinge.position.set(-sL / 2, lipH, 0);
      const doorMesh = makeBoxPanel(doorW, doorH, sT, removableMat);
      doorMesh.position.set(0, doorH / 2, 0);
      dropDoorHinge.add(doorMesh);
      l1Hinge.add(dropDoorHinge);

      addPerfSeam(l1Hinge, [
        [-sL + sideInset, sD],
        [-sL + sideInset, lipH],
      ]);
      addPerfSeam(l1Hinge, [
        [-sideInset, sD],
        [-sideInset, lipH],
      ]);
      addCreaseSeam(l1Hinge, [
        [-sL + sideInset, lipH],
        [-sideInset, lipH],
      ]);
    } else if (perfType === 'twin-zipper-window') {
      const l2Mesh = makeBoxPanel(sL, sD, sT);
      l2Mesh.position.set(0, sD / 2, 0);
      cartonGroup.add(l2Mesh);
      const w1Mesh = makeBoxPanel(sW, sD, sT);
      w1Mesh.position.set(-sW / 2, sD / 2, 0);
      w1Hinge.add(w1Mesh);
      const w2Mesh = makeBoxPanel(sW, sD, sT);
      w2Mesh.position.set(sW / 2, sD / 2, 0);
      w2Hinge.add(w2Mesh);

      const pillar = Math.min(18, Math.max(10, L * 0.12)) * scale;
      const zipW = Math.min(10, Math.max(6, L * 0.065)) * scale;
      const topGap = Math.min(18, D * 0.16) * scale;
      const botLip = Math.min(32, Math.max(18, D * 0.25)) * scale;
      const winW = Math.max(0.02, sL - (pillar + zipW) * 2);
      const winH = Math.max(0.02, sD - topGap - botLip);

      // Fixed U-frame + top bridge
      const pL = makeBoxPanel(pillar, sD, sT);
      pL.position.set(-sL + pillar / 2, sD / 2, 0);
      l1Hinge.add(pL);
      const pR = makeBoxPanel(pillar, sD, sT);
      pR.position.set(-pillar / 2, sD / 2, 0);
      l1Hinge.add(pR);
      const botBar = makeBoxPanel(sL - pillar * 2, botLip, sT);
      botBar.position.set(-sL / 2, botLip / 2, 0);
      l1Hinge.add(botBar);
      const topBar = makeBoxPanel(winW, topGap, sT);
      topBar.position.set(-sL / 2, sD - topGap / 2, 0);
      l1Hinge.add(topBar);

      // Left & Right zipper strips
      const stripH = sD - botLip;
      const zipL = new THREE.Group();
      zipL.position.set(-sL + pillar + zipW / 2, botLip, 0);
      const zipLMesh = makeBoxPanel(zipW, stripH, sT, removableMat);
      zipLMesh.position.set(0, stripH / 2, 0);
      zipL.add(zipLMesh);
      l1Hinge.add(zipL);
      zipperStrips.push({ group: zipL, dirX: -1 });

      const zipR = new THREE.Group();
      zipR.position.set(-pillar - zipW / 2, botLip, 0);
      const zipRMesh = makeBoxPanel(zipW, stripH, sT, removableMat);
      zipRMesh.position.set(0, stripH / 2, 0);
      zipR.add(zipRMesh);
      l1Hinge.add(zipR);
      zipperStrips.push({ group: zipR, dirX: 1 });

      // Central removable window plug
      const winGroup = new THREE.Group();
      const winMesh = makeBoxPanel(winW, winH, sT, removableMat);
      winMesh.position.set(-sL / 2, botLip + winH / 2, 0);
      winGroup.add(winMesh);
      l1Hinge.add(winGroup);
      ejectOutGroups.push({ group: winGroup, distZ: sD * 0.45, liftY: -sD * 0.08 });

      // Seam outlines
      const lxOut = -sL + pillar;
      const lxIn = lxOut + zipW;
      const rxOut = -pillar;
      const rxIn = rxOut - zipW;
      addPerfSeam(l1Hinge, [
        [lxOut, sD],
        [lxOut, botLip],
        [rxOut, botLip],
        [rxOut, sD],
      ]);
      addPerfSeam(l1Hinge, [
        [lxIn, sD - topGap],
        [rxIn, sD - topGap],
      ]);
      addPerfSeam(l1Hinge, [
        [lxIn, sD],
        [lxIn, botLip],
      ]);
      addPerfSeam(l1Hinge, [
        [rxIn, sD],
        [rxIn, botLip],
      ]);
    } else if (perfType === 'front-cutout') {
      const l2Mesh = makeBoxPanel(sL, sD, sT);
      l2Mesh.position.set(0, sD / 2, 0);
      cartonGroup.add(l2Mesh);
      const w1Mesh = makeBoxPanel(sW, sD, sT);
      w1Mesh.position.set(-sW / 2, sD / 2, 0);
      w1Hinge.add(w1Mesh);
      const w2Mesh = makeBoxPanel(sW, sD, sT);
      w2Mesh.position.set(sW / 2, sD / 2, 0);
      w2Hinge.add(w2Mesh);

      const offX = Math.min(20, L * 0.2) * scale;
      const offY = Math.min(20, D * 0.2) * scale;
      const rad = Math.min(8 * scale, (sL - offX * 2) / 4, (sD - offY * 2) / 4);
      const fx1 = -sL + offX;
      const fx2 = -offX;
      const fy1 = offY;
      const fy2 = sD - offY;

      const frameShape = new THREE.Shape();
      frameShape.moveTo(-sL, 0);
      frameShape.lineTo(0, 0);
      frameShape.lineTo(0, sD);
      frameShape.lineTo(-sL, sD);
      frameShape.closePath();
      addRoundedRectHole(frameShape, fx1, fy1, fx2, fy2, rad);
      l1Hinge.add(makeExtrudedShape(frameShape, sT, boardMat));

      const plugGroup = new THREE.Group();
      plugGroup.add(makeExtrudedShape(buildRoundedRectShape(fx1, fy1, fx2, fy2, rad), sT, removableMat));
      l1Hinge.add(plugGroup);
      ejectOutGroups.push({ group: plugGroup, distZ: sD * 0.45, liftY: -sD * 0.05 });

      addPerfSeam(l1Hinge, [
        [fx1 + rad, fy1],
        [fx2 - rad, fy1],
        [fx2, fy1 + rad],
        [fx2, fy2 - rad],
        [fx2 - rad, fy2],
        [fx1 + rad, fy2],
        [fx1, fy2 - rad],
        [fx1, fy1 + rad],
        [fx1 + rad, fy1],
      ]);
    } else if (perfType === 'u-scoop-front' || perfType === 'thumb-hole-punch') {
      const l2Mesh = makeBoxPanel(sL, sD, sT);
      l2Mesh.position.set(0, sD / 2, 0);
      cartonGroup.add(l2Mesh);
      const w1Mesh = makeBoxPanel(sW, sD, sT);
      w1Mesh.position.set(-sW / 2, sD / 2, 0);
      w1Hinge.add(w1Mesh);
      const w2Mesh = makeBoxPanel(sW, sD, sT);
      w2Mesh.position.set(sW / 2, sD / 2, 0);
      w2Hinge.add(w2Mesh);

      const cx = -sL / 2;
      if (perfType === 'thumb-hole-punch') {
        const rHole = Math.min(20, L * 0.25, D * 0.3) * scale;
        const frame = new THREE.Shape();
        frame.moveTo(-sL, 0);
        frame.lineTo(0, 0);
        frame.lineTo(0, sD);
        frame.lineTo(cx + rHole, sD);
        frame.absarc(cx, sD, rHole, 0, Math.PI, true);
        frame.lineTo(-sL, sD);
        frame.closePath();
        l1Hinge.add(makeExtrudedShape(frame, sT, boardMat));

        const plug = new THREE.Shape();
        plug.moveTo(cx - rHole, sD);
        plug.absarc(cx, sD, rHole, Math.PI, 0, false);
        plug.closePath();
        const plugGroup = new THREE.Group();
        plugGroup.add(makeExtrudedShape(plug, sT, removableMat));
        l1Hinge.add(plugGroup);
        ejectOutGroups.push({ group: plugGroup, distZ: sD * 0.35, liftY: sD * 0.08 });
      } else {
        const scoopW = Math.min(L * 0.56, Math.max(40, L - 36)) * scale;
        const scoopDepth = Math.min(D * 0.45, Math.max(25, D - 30)) * scale;
        const rx = scoopW / 2;
        const arcR = Math.min(rx, scoopDepth * 0.65);
        const sx1 = cx - rx;
        const sx2 = cx + rx;
        const syBottom = sD - scoopDepth;

        const frame = new THREE.Shape();
        frame.moveTo(-sL, 0);
        frame.lineTo(0, 0);
        frame.lineTo(0, sD);
        frame.lineTo(sx2, sD);
        frame.lineTo(sx2, syBottom + arcR);
        frame.absarc(sx2 - arcR, syBottom + arcR, arcR, 0, -Math.PI / 2, true);
        frame.lineTo(sx1 + arcR, syBottom);
        frame.absarc(sx1 + arcR, syBottom + arcR, arcR, -Math.PI / 2, Math.PI, true);
        frame.lineTo(sx1, sD);
        frame.lineTo(-sL, sD);
        frame.closePath();
        l1Hinge.add(makeExtrudedShape(frame, sT, boardMat));

        const plug = new THREE.Shape();
        plug.moveTo(sx1, sD);
        plug.lineTo(sx1, syBottom + arcR);
        plug.absarc(sx1 + arcR, syBottom + arcR, arcR, Math.PI, -Math.PI / 2, false);
        plug.lineTo(sx2 - arcR, syBottom);
        plug.absarc(sx2 - arcR, syBottom + arcR, arcR, -Math.PI / 2, 0, false);
        plug.lineTo(sx2, sD);
        plug.closePath();
        const plugGroup = new THREE.Group();
        plugGroup.add(makeExtrudedShape(plug, sT, removableMat));
        l1Hinge.add(plugGroup);
        ejectOutGroups.push({ group: plugGroup, distZ: sD * 0.4, liftY: sD * 0.08 });

        addPerfSeam(l1Hinge, [
          [sx1, sD],
          [sx1, syBottom + arcR],
          [sx1 + arcR, syBottom],
          [sx2 - arcR, syBottom],
          [sx2, syBottom + arcR],
          [sx2, sD],
        ]);
      }
    } else if (perfType === 'tear-strip' || perfType === 'zipper-rule') {
      perfTopFlapMode = true;
      const stripH = (perfType === 'tear-strip' ? Math.min(10, D * 0.2) : Math.min(12, D * 0.22)) * scale;
      const stripTop = perfType === 'tear-strip' ? sD * (2 / 3) : sD * 0.5 + stripH / 2;
      const stripBot = stripTop - stripH;

      const buildBandWall = (
        parent: THREE.Object3D,
        cx: number,
        w: number,
        xStart: number,
        xEnd: number
      ) => {
        const lower = makeBoxPanel(w, stripBot, sT, boardMat);
        lower.position.set(cx, stripBot / 2, 0);
        parent.add(lower);

        const bandG = new THREE.Group();
        const band = makeBoxPanel(w, stripH, sT, removableMat);
        band.position.set(cx, stripBot + stripH / 2, 0);
        bandG.add(band);
        parent.add(bandG);
        ejectOutGroups.push({ group: bandG, distZ: sD * 0.28, liftY: 0 });

        const upperH = sD - stripTop;
        const upperG = new THREE.Group();
        const upper = makeBoxPanel(w, upperH, sT, removableMat);
        upper.position.set(cx, stripTop + upperH / 2, 0);
        upperG.add(upper);
        parent.add(upperG);
        hoodGroups.push(upperG);

        addPerfSeam(parent, [
          [xStart, stripTop],
          [xEnd, stripTop],
        ]);
        addPerfSeam(parent, [
          [xStart, stripBot],
          [xEnd, stripBot],
        ]);
      };

      buildBandWall(cartonGroup, 0, sL, -sL / 2, sL / 2);
      buildBandWall(w1Hinge, -sW / 2, sW, -sW, 0);
      buildBandWall(l1Hinge, -sL / 2, sL, -sL, 0);
      buildBandWall(w2Hinge, sW / 2, sW, 0, sW);
    } else if (perfType === 'carry-handles' || perfType === 'ventilation-slots') {
      const l2Mesh = makeBoxPanel(sL, sD, sT);
      l2Mesh.position.set(0, sD / 2, 0);
      cartonGroup.add(l2Mesh);
      const l1Mesh = makeBoxPanel(sL, sD, sT);
      l1Mesh.position.set(-sL / 2, sD / 2, 0);
      l1Hinge.add(l1Mesh);

      const buildSideCutouts = (parent: THREE.Object3D, xMin: number, xMax: number) => {
        const cx = (xMin + xMax) / 2;
        const shape = new THREE.Shape();
        shape.moveTo(xMin, 0);
        shape.lineTo(xMax, 0);
        shape.lineTo(xMax, sD);
        shape.lineTo(xMin, sD);
        shape.closePath();

        if (perfType === 'carry-handles') {
          const handleW = Math.min(85, W * 0.55) * scale;
          const handleH = Math.min(24, D * 0.22) * scale;
          const hy = sD - Math.min(D * 0.32, Math.max(28, D * 0.25)) * scale;
          addPillHole(shape, cx, hy, handleW, handleH);
          parent.add(makeExtrudedShape(shape, sT, boardMat));

          const plugG = new THREE.Group();
          plugG.add(makeExtrudedShape(buildPillShape(cx, hy, handleW, handleH), sT, removableMat));
          parent.add(plugG);
          ejectOutGroups.push({ group: plugG, distZ: sD * 0.32, liftY: -sD * 0.04 });

          const rad = handleH / 2;
          addPerfSeam(parent, [
            [cx - handleW / 2 + rad, hy - rad],
            [cx + handleW / 2 - rad, hy - rad],
            [cx + handleW / 2, hy],
            [cx + handleW / 2 - rad, hy + rad],
            [cx - handleW / 2 + rad, hy + rad],
            [cx - handleW / 2, hy],
            [cx - handleW / 2 + rad, hy - rad],
          ]);
        } else {
          const slotW = Math.min(10, W * 0.08) * scale;
          const slotH = Math.min(40, D * 0.45) * scale;
          const spread = Math.min(W * 0.22, 26) * scale;
          const cy = sD / 2;
          [cx - spread, cx + spread].forEach((vx) => {
            addVerticalSlotHole(shape, vx, cy, slotW, slotH);
            const plugG = new THREE.Group();
            plugG.add(makeExtrudedShape(buildVerticalSlotShape(vx, cy, slotW, slotH), sT, removableMat));
            parent.add(plugG);
            ejectOutGroups.push({ group: plugG, distZ: sD * 0.26, liftY: 0 });
          });
          parent.add(makeExtrudedShape(shape, sT, boardMat));
        }
      };

      buildSideCutouts(w1Hinge, -sW, 0);
      buildSideCutouts(w2Hinge, 0, sW);
    }

    // Bottom Flaps
    const botFlapsInner: THREE.Group[] = [];
    const botFlapsOuter: THREE.Group[] = [];
    const addBottomFlap = (
      parent: THREE.Object3D,
      cx: number,
      fw: number,
      fh: number,
      yOff: number,
      isInner: boolean
    ) => {
      const hinge = new THREE.Group();
      hinge.position.set(cx, yOff, 0);
      parent.add(hinge);
      const mesh = makeBoxPanel(Math.max(0.01, fw), fh, sT);
      mesh.position.set(0, -fh / 2, 0);
      hinge.add(mesh);
      if (isInner) botFlapsInner.push(hinge);
      else botFlapsOuter.push(hinge);
    };

    const innerWFlapWidth = Math.max(0.02, sW - sSlotGap * 0.5);
    const outerLFlapWidth = Math.max(0.02, sL - sSlotGap);
    const l1OuterLFlapWidth = Math.max(0.02, sL - sSlotGap * 0.5);

    addBottomFlap(w1Hinge, -sW / 2, sW - sSlotGap, sBotFlapW, 0, true);
    addBottomFlap(w2Hinge, sW / 2 + sSlotGap * 0.25, innerWFlapWidth, sBotFlapW, 0, true);
    addBottomFlap(cartonGroup, 0, outerLFlapWidth, sBotFlapL, -sT, false);
    addBottomFlap(l1Hinge, -sL / 2 - sSlotGap * 0.25, l1OuterLFlapWidth, sBotFlapL, -sT, false);

    // Top Flaps (lift & fade with hood when hood-tear SRP is active)
    const topFlapsInner: THREE.Group[] = [];
    const topFlapsOuter: THREE.Group[] = [];
    if (panelCoords.hasTopFlaps) {
      const addTopFlap = (
        parent: THREE.Object3D,
        cx: number,
        fw: number,
        fh: number,
        yOff: number,
        isInner: boolean
      ) => {
        const hinge = new THREE.Group();
        hinge.position.set(cx, sD + yOff, 0);
        parent.add(hinge);

        const liftGroup = new THREE.Group();
        hinge.add(liftGroup);
        const mesh = makeBoxPanel(
          Math.max(0.01, fw),
          fh,
          sT,
          perfTopFlapMode ? removableMat : boardMat
        );
        mesh.position.set(0, fh / 2, 0);
        liftGroup.add(mesh);
        if (perfTopFlapMode) {
          hoodGroups.push(liftGroup);
        }

        if (isInner) topFlapsInner.push(hinge);
        else topFlapsOuter.push(hinge);
      };

      addTopFlap(w1Hinge, -sW / 2, sW - sSlotGap, sTopFlapW, 0, true);
      addTopFlap(w2Hinge, sW / 2 + sSlotGap * 0.25, innerWFlapWidth, sTopFlapW, 0, true);
      addTopFlap(cartonGroup, 0, outerLFlapWidth, sTopFlapL, sT, false);
      addTopFlap(l1Hinge, -sL / 2 - sSlotGap * 0.25, l1OuterLFlapWidth, sTopFlapL, sT, false);
    }

    // Product Fit, Multi-Unit Clearance & Headspace Proxy
    const productGroup = new THREE.Group();
    const innerL = config.dimensions.length * scale;
    const innerW = config.dimensions.width * scale;
    const innerD = config.dimensions.depth * scale;
    const prodL =
      (config.inputMode === 'product' ? config.product.length : config.dimensions.length * 0.92) *
      scale;
    const prodW =
      (config.inputMode === 'product' ? config.product.width : config.dimensions.width * 0.92) *
      scale;
    const prodD =
      (config.inputMode === 'product' ? config.product.depth : config.dimensions.depth * 0.85) *
      scale;

    const cavityFloorY = baseElevation + (config.advanced.compensateInnerFlapDepth ? sT : 0);
    productGroup.position.set(0, cavityFloorY, 0);
    root.add(productGroup);

    const prodCoreGeo = new THREE.BoxGeometry(prodL, prodD, prodW);
    const prodCoreMat = new THREE.MeshStandardMaterial({
      color: '#3B82F6',
      roughness: 0.35,
      metalness: 0.08,
    });
    const prodCore = new THREE.Mesh(prodCoreGeo, prodCoreMat);
    prodCore.position.y = prodD / 2;
    prodCore.castShadow = true;
    productGroup.add(prodCore);

    const bandGeo = new THREE.BoxGeometry(prodL * 1.006, prodD * 0.2, prodW * 1.006);
    const bandMat = new THREE.MeshStandardMaterial({
      color: '#1E40AF',
      roughness: 0.25,
      metalness: 0.15,
    });
    const bandMesh = new THREE.Mesh(bandGeo, bandMat);
    bandMesh.position.y = prodD * 0.72;
    productGroup.add(bandMesh);

    // Subtle retail pack grid lines on top face so user sees multi-pack orientation inside SRP tray
    const gridCols = Math.max(1, Math.min(4, Math.round(L / 75)));
    if (gridCols > 1 && perfEnabled) {
      const divMat = new THREE.LineBasicMaterial({
        color: '#DBEAFE',
        transparent: true,
        opacity: 0.55,
      });
      for (let i = 1; i < gridCols; i++) {
        const dx = -prodL / 2 + (prodL * i) / gridCols;
        const pts = [
          new THREE.Vector3(dx, prodD + 0.002, -prodW / 2),
          new THREE.Vector3(dx, prodD + 0.002, prodW / 2),
        ];
        productGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), divMat));
      }
    }

    const cavityGeo = new THREE.BoxGeometry(innerL, innerD, innerW);
    const cavityEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(cavityGeo),
      new THREE.LineBasicMaterial({ color: '#0F172A', transparent: true, opacity: 0.36 })
    );
    cavityEdges.position.y = innerD / 2;
    productGroup.add(cavityEdges);

    const hsMm =
      config.inputMode === 'product'
        ? config.dimensions.depth - config.product.depth
        : config.dimensions.depth * 0.15;
    if (hsMm > 0.2) {
      const hsH = Math.max(0.005, hsMm * scale);
      const hsGeo = new THREE.BoxGeometry(prodL * 0.98, hsH, prodW * 0.98);
      const hsColor = hsMm > 6 ? '#F59E0B' : '#10B981';
      const hsMat = new THREE.MeshStandardMaterial({
        color: hsColor,
        transparent: true,
        opacity: 0.35,
        roughness: 0.5,
        depthWrite: false,
      });
      const hsMesh = new THREE.Mesh(hsGeo, hsMat);
      hsMesh.position.y = prodD + hsH / 2;
      productGroup.add(hsMesh);
    }

    // Build smooth 0..1 tear animator for every perforation pattern
    const tearAnimator: TearAnimator = {
      apply: (t: number, baseOp: number, isXrayMode: boolean) => {
        const eased = t * t * (3 - 2 * t);

        // Hood / top-sleeve lift & fade
        hoodGroups.forEach((g) => {
          g.position.y = sD * 0.36 * eased;
          g.rotation.x = -0.14 * eased;
          g.visible = t < 0.92;
        });

        // Front / side cutout plug ejection
        ejectOutGroups.forEach(({ group, distZ, liftY }) => {
          group.position.z = -distZ * eased;
          group.position.y = liftY * eased;
          group.rotation.x = -0.22 * eased;
          group.visible = t < 0.9;
        });

        // Twin zipper ribbon peel (active early: 0 -> 0.5)
        const zipT = THREE.MathUtils.clamp(t / 0.55, 0, 1);
        zipperStrips.forEach(({ group, dirX }) => {
          group.rotation.x = -zipT * 1.15;
          group.rotation.z = dirX * zipT * 0.22;
          group.position.z = -sD * 0.12 * zipT;
          group.visible = t < 0.72;
        });

        // Drop-front PDQ door stays visible & hinges cleanly downward (-rotation.x = outward)
        if (dropDoorHinge) {
          dropDoorHinge.rotation.x = -eased * (Math.PI * 0.62);
        }

        // Opacity fade for removable tear pieces (Drop-Front door stays solid!)
        const fadeOut = dropDoorHinge ? 1 : THREE.MathUtils.clamp(1 - t * 1.15, 0, 1);
        removableMaterials.forEach((mat) => {
          mat.opacity = baseOp * fadeOut;
          mat.transparent = true;
          mat.depthWrite = !isXrayMode && fadeOut > 0.95;
          mat.needsUpdate = true;
        });
      },
    };

    hingesRef.current = {
      w1: w1Hinge,
      l1: l1Hinge,
      glue: glueHinge,
      w2: w2Hinge,
      botFlapsInner,
      botFlapsOuter,
      topFlapsInner,
      topFlapsOuter,
      productGroup,
      boxMaterials,
      removableMaterials,
      tearAnimator,
      hasTopFlaps: panelCoords.hasTopFlaps,
      isOverlapOuter: config.boxStyle === '0202' || config.boxStyle === '0203',
    };

    requestRenderRef.current();
  }, [
    config.dimensions,
    config.product,
    config.inputMode,
    config.boxStyle,
    config.materialColor,
    config.fluteThickness,
    config.glueFlapWidth,
    config.flapOverlapMm,
    config.advanced,
    config.prepress.fluteDirection,
    config.perforation,
    paths,
  ]);

  const diag = paths.info.headspaceDiagnostic;
  const fmt = (mm: number) => formatValue(mm, config.unit);
  const foldPresetValue =
    foldPercent <= 5
      ? 'flat'
      : Math.abs(foldPercent - 82) <= 8
      ? 'open'
      : foldPercent >= 96
      ? 'closed'
      : 'custom';
  const activePerfSpec =
    PERFORATION_OPTIONS.find((p) => p.id === config.perforation.type) || PERFORATION_OPTIONS[0];

  return (
    <div className="@container flex-1 relative bg-[var(--ground)] overflow-hidden select-none">
      {/* Isolated WebGL Mount Container */}
      <div ref={mountRef} className="w-full h-full" />

      {contextLost && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[var(--ground)] p-6">
          <div className="surface-raised bg-[var(--surface-top)] rounded-[var(--radius-container)] shadow-[var(--shadow-card)] p-4 max-w-[320px] text-center space-y-2">
            <div className="text-[13px] font-medium text-[var(--ink-12)]">
              3D context temporarily suspended
            </div>
            <p className="text-[12px] leading-[18px] text-[var(--ink-11)]">
              Switch back to 2D Dieline CAD or reload the view to restore WebGL rendering.
            </p>
          </div>
        </div>
      )}

      {/* Top-Right Floating Camera POV Presets Capsule (Decoupled from Fold Controls) */}
      <div
        role="group"
        aria-label="Preset sudut kamera 3D"
        className="pointer-events-auto absolute top-2.5 right-2.5 sm:top-3 sm:right-3 z-10 flex items-center gap-1 p-1 rounded-[var(--radius-container)] bg-[var(--surface-top)]/92 backdrop-blur-md border-[0.5px] border-[var(--line)] shadow-[var(--shadow-card)] max-w-[calc(100vw-20px)] overflow-x-auto"
      >
        {(['iso', 'front', 'top', 'side'] as const).map((preset) => (
          <TactileButton
            key={preset}
            type="button"
            variant={activeCamPreset === preset ? 'primary' : 'secondary'}
            size="inline"
            className="h-[26px] px-2 capitalize text-[11px]"
            onClick={() => {
              setActiveCamPreset(preset);
              setCamPresetRef.current(preset);
            }}
          >
            {preset}
          </TactileButton>
        ))}
        <div className="h-3.5 w-[0.5px] bg-[var(--line)] mx-0.5 shrink-0" />
        <TactileButton
          type="button"
          variant="ghost"
          size="inline"
          className="h-[26px] w-[26px] px-0 justify-center shrink-0"
          onClick={() => {
            setActiveCamPreset('iso');
            setCamPresetRef.current('iso');
          }}
          title="Reset camera view"
          aria-label="Reset camera view"
        >
          <RotateCcw size={12} />
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
                title="Tampilkan kontrol 3D (H)"
              >
                <ChevronUp size={13} />
                <span className="font-mono tabular-nums">Fold {foldPercent}%</span>
              </button>
            ) : (
              <div className="pointer-events-auto w-full rounded-[var(--radius-container)] bg-[var(--surface-top)]/95 backdrop-blur-md border-[0.5px] border-[var(--line)] shadow-[var(--shadow-modal)] px-2.5 py-1.5 flex items-center justify-between gap-2 overflow-hidden">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[11px] font-medium text-[var(--ink-12)] whitespace-nowrap shrink-0">
                    Fold
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={foldPercent}
                    onChange={(e) => setFoldPercent(Number(e.target.value))}
                    className="tactile-range w-[64px] shrink-0"
                    aria-label="Box fold percentage"
                  />
                  <span className="text-[11px] font-mono tabular-nums text-[var(--ink-11)] w-8 text-right shrink-0">
                    {foldPercent}%
                  </span>
                  <TactileSegmented
                    value={foldPresetValue}
                    size="compact"
                    ariaLabel="Fold preset"
                    className="shrink-0"
                    onChange={(val) => {
                      if (val === 'flat') setFoldPercent(0);
                      else if (val === 'open') setFoldPercent(82);
                      else if (val === 'closed') setFoldPercent(100);
                    }}
                    options={[
                      { value: 'flat', label: 'Flat' },
                      { value: 'open', label: 'Open' },
                      { value: 'closed', label: 'Closed' },
                    ]}
                  />
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {config.perforation.enabled && (
                    <TactileButton
                      type="button"
                      variant={tearPercent >= 85 ? 'secondary' : 'primary'}
                      size="inline"
                      onClick={() => setTearPercent((v) => (v >= 85 ? 0 : 100))}
                    >
                      <Scissors size={11} />
                      <span>{tearPercent >= 85 ? 'Reset' : 'Peel'}</span>
                    </TactileButton>
                  )}

                  <TactileButton
                    type="button"
                    variant={xrayMode ? 'primary' : 'secondary'}
                    size="inline"
                    className="h-[26px] px-2"
                    onClick={() => setXrayMode((x) => !x)}
                  >
                    {xrayMode ? <Eye size={12} /> : <EyeOff size={12} />}
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
              className="pointer-events-auto h-[26px] px-2.5 bg-[var(--surface-top)] rounded-[var(--radius-control)] border-[0.5px] border-[var(--line)] shadow-[var(--shadow-button)] text-[11px] leading-[16px] text-[var(--ink-11)] hover:text-[var(--ink-12)] flex items-center gap-1.5 whitespace-nowrap cursor-pointer active:scale-[0.98] transition-[transform,scale,color] duration-[var(--dur-hover)]"
              title="Toggle 3D controls (H)"
            >
              {dockCollapsed ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              <span>{dockCollapsed ? 'Show controls (H)' : 'Hide controls (H)'}</span>
            </button>

            <div className="pointer-events-auto w-full surface-raised bg-[var(--surface-top)] rounded-[var(--radius-container)] shadow-[var(--shadow-modal)] px-3 sm:px-3.5 py-2 overflow-hidden">
              {/* Row 1: Summary Band (Always visible even when controls collapse) */}
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11px]">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
                  <span className="text-[12px] font-semibold text-[var(--ink-12)] whitespace-nowrap">
                    SRP &amp; cavity clearance
                  </span>
                  <span aria-hidden="true" className="text-[var(--ink-8)]">·</span>
                  <span className="font-mono tabular-nums text-[var(--ink-10)] whitespace-nowrap">
                    {config.prepress.fluteDirection === 'vertical' ? 'Vert flute' : 'Horiz flute'}
                  </span>
                  <span aria-hidden="true" className="text-[var(--ink-8)]">·</span>
                  <span className="font-mono tabular-nums font-medium text-[var(--ink-12)] whitespace-nowrap">
                    ID {`${fmt(config.dimensions.length)}×${fmt(config.dimensions.width)}×${fmt(config.dimensions.depth)} ${config.unit}`}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 ml-auto min-w-0 max-w-full">
                  {diag ? (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                      <span className="text-[var(--ink-10)] whitespace-nowrap">
                        Clearance{' '}
                        <span className="font-mono tabular-nums text-[var(--ink-12)]">
                          +{fmt(diag.clearanceLMm)} / +{fmt(diag.clearanceWMm)} {config.unit}
                        </span>
                      </span>
                      <span
                        className={`font-mono tabular-nums font-medium whitespace-nowrap ${
                          diag.status === 'optimal'
                            ? 'text-[var(--green-11)]'
                            : diag.status === 'excessive'
                            ? 'text-[var(--amber-11)]'
                            : 'text-[var(--red-11)]'
                        }`}
                      >
                        Headspace {`${fmt(diag.headspaceMm)} ${config.unit} (${diag.volumeUtilizationPct}% fill)`}
                      </span>
                    </div>
                  ) : (
                    <span className="text-[var(--ink-10)] whitespace-nowrap">
                      Product fit off · Aktifkan di Structure
                    </span>
                  )}

                  {config.perforation.enabled && (
                    <div className="flex items-center gap-1.5 sm:gap-2 pl-2 border-l-[0.5px] border-[var(--line)] min-w-0">
                      <Scissors size={12} className="text-[var(--green-11)] shrink-0" />
                      <span className="font-medium text-[var(--ink-12)] whitespace-nowrap hidden @[860px]:inline">
                        {activePerfSpec.label}
                      </span>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={tearPercent}
                        onChange={(e) => setTearPercent(Number(e.target.value))}
                        className="tactile-range w-[56px] sm:w-[64px] shrink-0"
                        aria-label="Perforation tear and open progress"
                      />
                      <span className="font-mono tabular-nums text-[var(--ink-11)] w-8 text-right shrink-0">
                        {tearPercent}%
                      </span>
                      <TactileButton
                        type="button"
                        variant={tearPercent >= 85 ? 'secondary' : 'primary'}
                        size="inline"
                        onClick={() => setTearPercent((v) => (v >= 85 ? 0 : 100))}
                      >
                        {tearPercent >= 85 ? 'Reset' : 'Peel SRP'}
                      </TactileButton>
                    </div>
                  )}
                </div>
              </div>

              {/* Row 2: Responsive Controls Band (Cleanly Separated From Top-Right POV Capsule) */}
              {!dockCollapsed && (
                <div className="mt-2 pt-2 border-t-[0.5px] border-[var(--line)] flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                  {/* Fold Slider (Safe 64px) + Flat/Open/Closed Capsule */}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 min-w-0 max-w-full">
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[12px] font-medium text-[var(--ink-12)] whitespace-nowrap">
                        Fold
                      </span>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={foldPercent}
                        onChange={(e) => setFoldPercent(Number(e.target.value))}
                        className="tactile-range w-[64px] shrink-0"
                        aria-label="Box fold percentage"
                      />
                      <span className="text-[11px] font-mono tabular-nums text-[var(--ink-11)] w-8 text-right shrink-0">
                        {foldPercent}%
                      </span>
                    </div>

                    <TactileSegmented
                      value={foldPresetValue}
                      size="compact"
                      ariaLabel="Fold preset"
                      className="shrink-0 max-w-full"
                      onChange={(val) => {
                        if (val === 'flat') setFoldPercent(0);
                        else if (val === 'open') setFoldPercent(82);
                        else if (val === 'closed') setFoldPercent(100);
                      }}
                      options={[
                        { value: 'flat', label: 'Flat' },
                        { value: 'open', label: 'Open' },
                        { value: 'closed', label: 'Closed' },
                      ]}
                    />
                  </div>

                  {/* Right Action: X-Ray Fit */}
                  <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                    <TactileButton
                      type="button"
                      variant={xrayMode ? 'primary' : 'secondary'}
                      size="compact"
                      onClick={() => setXrayMode((x) => !x)}
                    >
                      {xrayMode ? <Eye size={13} /> : <EyeOff size={13} />}
                      <span>X-Ray fit</span>
                    </TactileButton>
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      )}
    </div>
  );
}
