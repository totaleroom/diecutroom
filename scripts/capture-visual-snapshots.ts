import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * DieCut.Room — Zero-Dependency Automated Visual Snapshot Capturer (Node 22+ CDP)
 *
 * Captures authentic live screenshots of every page, sub-tab, 3D mode, modal,
 * admin console tab, and responsive mobile core view into `docs/visual-snapshots/`.
 *
 * Uses a non-destructive requestAnimationFrame gate during Page.captureScreenshot
 * so continuous 60fps Canvas/WebGL loops never starve headless SwiftShader while
 * preserving live Three.js animation chains seamlessly between captures.
 *
 * Requirements:
 * - Node.js v22+ (native WebSocket & TypeScript type-stripping)
 * - Running DieCut.Room server (default: http://127.0.0.1:3000)
 * - Local Chromium / Chrome / Playwright headless shell binary
 *
 * Usage:
 *   npm run snapshots:capture
 *   CAPTURE_URL=http://127.0.0.1:3000 node scripts/capture-visual-snapshots.ts
 */

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'docs', 'visual-snapshots');
const BASE_URL = (process.env.CAPTURE_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'totale.room@gmail.com';
const ADMIN_PASSWORD = process.env.ADMIN_INITIAL_PASSWORD || 'DieCutAdmin2026!';

const RAF_GATE_INIT_SCRIPT = `(() => {
  const nativeRaf = window.requestAnimationFrame.bind(window);
  window.__snapPaused = false;
  window.__snapRafQueue = [];
  window.requestAnimationFrame = function(cb) {
    if (window.__snapPaused) {
      window.__snapRafQueue.push(cb);
      return 0;
    }
    return nativeRaf(cb);
  };
  window.__snapSetPaused = function(paused) {
    window.__snapPaused = Boolean(paused);
    if (!window.__snapPaused && window.__snapRafQueue.length > 0) {
      const queued = window.__snapRafQueue.splice(0, window.__snapRafQueue.length);
      for (const cb of queued) nativeRaf(cb);
    }
  };
})();`;

interface SnapshotResult {
  file: string;
  viewport: string;
  bytes: number;
  label: string;
}

function printHelp() {
  console.log(`
DieCut.Room — Automated Visual State Snapshot Capturer (Node 22+ CDP)

Usage:
  node scripts/capture-visual-snapshots.ts [--help]
  npm run snapshots:capture

Environment Variables:
  CAPTURE_URL             Target server URL (default: http://127.0.0.1:3000)
  CHROME_PATH             Optional explicit path to Chromium / Chrome binary
  ADMIN_EMAIL             Admin email for authenticated capture (default: totale.room@gmail.com)
  ADMIN_INITIAL_PASSWORD  Admin password for authenticated capture (default: DieCutAdmin2026!)

Output:
  docs/visual-snapshots/*.png (21 Desktop 1440x900 + 6 Mobile 390x844 snapshots)
`);
}

function findChromeBinary(): string {
  const candidates = [
    process.env.CHROME_PATH,
    '/ms-playwright/chrome-headless-shell-linux64/chrome-headless-shell',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean) as string[];

  for (const bin of candidates) {
    if (fs.existsSync(bin)) return bin;
  }

  if (fs.existsSync('/ms-playwright')) {
    for (const entry of fs.readdirSync('/ms-playwright')) {
      const p1 = path.join(
        '/ms-playwright',
        entry,
        'chrome-headless-shell-linux64',
        'chrome-headless-shell'
      );
      const p2 = path.join('/ms-playwright', entry, 'chrome-linux', 'chrome');
      if (fs.existsSync(p1)) return p1;
      if (fs.existsSync(p2)) return p2;
    }
  }

  throw new Error(
    'Chromium / Chrome binary not found. Set CHROME_PATH=/path/to/chromium or install Chromium.'
  );
}

class CDPClient {
  private ws: WebSocket;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();

  private constructor(ws: WebSocket) {
    this.ws = ws;
    ws.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(String(event.data));
        if (typeof msg.id === 'number' && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id)!;
          this.pending.delete(msg.id);
          if (msg.error) {
            reject(new Error(`CDP error ${msg.error.code}: ${msg.error.message}`));
          } else {
            resolve(msg.result);
          }
        }
      } catch {
        // Ignore non-JSON frames
      }
    });
  }

  static async connect(wsUrl: string): Promise<CDPClient> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error(`Timed out connecting to CDP at ${wsUrl}`));
      }, 15_000);
      ws.addEventListener('open', () => {
        clearTimeout(timer);
        resolve(new CDPClient(ws));
      });
      ws.addEventListener('error', (err) => {
        clearTimeout(timer);
        reject(new Error(`CDP WebSocket error: ${String(err)}`));
      });
    });
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<any> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout on ${method}`));
      }, 30_000);
      this.pending.set(id, {
        resolve: (val) => {
          clearTimeout(timer);
          resolve(val);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval<T = unknown>(expression: string): Promise<T> {
    const res = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (res?.exceptionDetails) {
      throw new Error(
        `Page eval failed: ${res.exceptionDetails.exception?.description || res.exceptionDetails.text}`
      );
    }
    return res?.result?.value as T;
  }

  close() {
    try {
      this.ws.close();
    } catch {
      // ignore
    }
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function launchChromium(): Promise<{
  proc: ChildProcess;
  debugPort: number;
  userDataDir: string;
}> {
  const bin = findChromeBinary();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'diecut-snap-'));
  const args = [
    '--headless',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-webgl',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--disable-gpu-vsync',
    '--hide-scrollbars',
    '--window-size=1440,900',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ];

  const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });

  const debugPort = await new Promise<number>((resolve, reject) => {
    let stderrBuf = '';
    const timeout = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error(`Timed out waiting for Chromium DevTools port. stderr:\n${stderrBuf}`));
    }, 20_000);

    proc.stderr?.on('data', (chunk) => {
      stderrBuf += chunk.toString('utf8');
      const m = stderrBuf.match(/DevTools listening on ws:\/\/[^:]+:(\d+)\//);
      if (m) {
        clearTimeout(timeout);
        resolve(Number(m[1]));
      }
    });

    proc.on('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Chromium exited early with code ${code}. stderr:\n${stderrBuf}`));
    });
  });

  return { proc, debugPort, userDataDir };
}

async function getPageWsUrl(port: number): Promise<string> {
  const res = await fetch(`http://127.0.0.1:${port}/json/list`);
  const targets = (await res.json()) as Array<{ type: string; webSocketDebuggerUrl?: string }>;
  const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
  if (!page?.webSocketDebuggerUrl) {
    throw new Error('No inspectable page target found in headless Chromium.');
  }
  return page.webSocketDebuggerUrl;
}

async function setViewport(cdp: CDPClient, width: number, height: number, mobile = false) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: mobile ? 2 : 1,
    mobile,
    screenWidth: width,
    screenHeight: height,
  });
}

async function waitFrames(cdp: CDPClient, count = 4, extraMs = 400) {
  await cdp.eval(`(async () => {
    window.__snapSetPaused?.(false);
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
    for (let i = 0; i < ${count}; i++) {
      await new Promise((r) => requestAnimationFrame(r));
    }
  })()`);
  if (extraMs > 0) await sleep(extraMs);
}

async function waitForSelector(cdp: CDPClient, selector: string, timeoutMs = 15_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = await cdp.eval<boolean>(
      `Boolean(document.querySelector(${JSON.stringify(selector)}))`
    );
    if (found) return;
    await sleep(150);
  }
  throw new Error(`Timed out waiting for selector: ${selector}`);
}

async function waitForText(cdp: CDPClient, text: string, timeoutMs = 15_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = await cdp.eval<boolean>(
      `(document.body?.innerText || '').includes(${JSON.stringify(text)})`
    );
    if (found) return;
    await sleep(150);
  }
  throw new Error(`Timed out waiting for text: ${text}`);
}

async function clickByText(
  cdp: CDPClient,
  text: string,
  opts?: { exact?: boolean; rootSelector?: string }
) {
  const exact = opts?.exact ?? false;
  const rootSel = opts?.rootSelector ?? '';
  const clicked = await cdp.eval<boolean>(`(() => {
    const root = ${rootSel ? `document.querySelector(${JSON.stringify(rootSel)})` : 'document'};
    if (!root) return false;
    const els = Array.from(root.querySelectorAll('button, [role="tab"], [role="radio"], a'));
    const target = ${JSON.stringify(text)};
    for (const el of els) {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const txt = (el.textContent || '').replace(/\\s+/g, ' ').trim();
      const match = ${exact ? 'txt === target' : 'txt.includes(target)'};
      if (match) {
        el.click();
        return true;
      }
    }
    return false;
  })()`);
  if (!clicked) {
    throw new Error(
      `Could not find clickable element matching text: "${text}" (root: "${rootSel}")`
    );
  }
}

async function clickSelector(cdp: CDPClient, selector: string) {
  const clicked = await cdp.eval<boolean>(`(() => {
    const els = Array.from(document.querySelectorAll(${JSON.stringify(selector)}));
    for (const el of els) {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      el.click();
      return true;
    }
    return false;
  })()`);
  if (!clicked) {
    throw new Error(`Could not find visible clickable element matching selector: ${selector}`);
  }
}

async function snap(
  cdp: CDPClient,
  results: SnapshotResult[],
  file: string,
  viewport: string,
  label: string,
  opts?: { frames?: number; extraMs?: number }
) {
  await waitFrames(cdp, opts?.frames ?? 4, opts?.extraMs ?? 450);

  // Non-destructive rAF pause so SwiftShader finishes painting cleanly while
  // preserving every active Three.js / Canvas animation loop upon resume.
  await cdp.eval(`window.__snapSetPaused?.(true)`);
  await sleep(120);

  let data = '';
  try {
    const res = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      optimizeForSpeed: true,
    });
    data = res.data;
  } finally {
    await cdp.eval(`window.__snapSetPaused?.(false)`);
  }

  const buf = Buffer.from(data, 'base64');
  const fullPath = path.join(OUT_DIR, file);
  fs.writeFileSync(fullPath, buf);
  if (buf.length < 5_000) {
    throw new Error(`Captured screenshot ${file} looks unexpectedly small (${buf.length} bytes).`);
  }
  results.push({ file, viewport, bytes: buf.length, label });
  console.log(
    `  ✓ ${file.padEnd(36)} ${(buf.length / 1024).toFixed(1).padStart(7)} KB  [${viewport}] ${label}`
  );
}

async function loginAsAdmin(cdp: CDPClient) {
  const ok = await cdp.eval<boolean>(`(async () => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        email: ${JSON.stringify(ADMIN_EMAIL)},
        password: ${JSON.stringify(ADMIN_PASSWORD)},
      }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (data?.token) {
      try {
        window.sessionStorage.setItem('diecut_room_session_token', data.token);
      } catch {}
    }
    return true;
  })()`);
  if (!ok) {
    throw new Error(
      `Admin login failed for ${ADMIN_EMAIL}. Check ADMIN_EMAIL / ADMIN_INITIAL_PASSWORD.`
    );
  }
  await cdp.send('Page.reload', { ignoreCache: true });
  await waitForSelector(cdp, 'header', 20_000);
}

async function openAdminConsole(cdp: CDPClient) {
  // Click inline Users button if visible; otherwise open header overflow menu ("Menu lainnya")
  const openedDirect = await cdp.eval<boolean>(`(() => {
    const btn = document.querySelector('button[title="Kelola akun user, aktivasi, reset password & hapus"]');
    if (btn) {
      const r = btn.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        btn.click();
        return true;
      }
    }
    return false;
  })()`);

  if (!openedDirect) {
    await clickSelector(cdp, 'button[aria-label="Menu lainnya"]');
    await sleep(250);
    await clickByText(cdp, 'Kelola Users', { exact: false });
  }
  await waitForText(cdp, 'Pengguna & Sesi', 12_000);
}

async function openProjectsModal(cdp: CDPClient) {
  const openedDirect = await cdp.eval<boolean>(`(() => {
    const btn = document.querySelector('button[title="Simpan atau muat proyek box dieline"]');
    if (btn) {
      const r = btn.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        btn.click();
        return true;
      }
    }
    return false;
  })()`);

  if (!openedDirect) {
    await clickSelector(cdp, 'button[aria-label="Menu lainnya"]');
    await sleep(250);
    await clickByText(cdp, 'Proyek', { exact: false });
  }
  await sleep(600);
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  try {
    const health = await fetch(`${BASE_URL}/api/health`);
    if (!health.ok) throw new Error(`HTTP ${health.status}`);
  } catch (err) {
    console.error(
      `Error: DieCut.Room server is not reachable at ${BASE_URL}/api/health (${String(err)}).`
    );
    console.error('Start the server first (e.g., npm run dev) and retry.');
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`Launching headless Chromium against ${BASE_URL} ...`);

  const { proc, debugPort, userDataDir } = await launchChromium();
  const results: SnapshotResult[] = [];
  let cdp: CDPClient | null = null;

  try {
    const wsUrl = await getPageWsUrl(debugPort);
    cdp = await CDPClient.connect(wsUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: RAF_GATE_INIT_SCRIPT });

    const mobileOnly = process.argv.includes('--mobile-only');

    if (!mobileOnly) {
      // =========================================================================
      // PART A: DESKTOP SUITE (1440 x 900)
      // =========================================================================
      console.log('\n[1/2] Capturing Desktop Suite (1440x900)...');
      await setViewport(cdp, 1440, 900, false);
      await cdp.send('Page.navigate', { url: BASE_URL });
      await waitForText(cdp, 'Masuk ke Workstation', 20_000);

      // 01. Auth Login
      await snap(cdp, results, '01-auth-login.png', '1440x900', 'Auth Portal — Login', {
        frames: 6,
        extraMs: 500,
      });

      // 02. Auth Register
      await clickByText(cdp, 'Daftar', { exact: true });
      await waitForText(cdp, 'Daftar Akun', 5_000);
      await snap(cdp, results, '02-auth-register.png', '1440x900', 'Auth Portal — Register');

      // 03. Hidden Admin Recovery (Alt+Shift+R)
      await cdp.eval(`(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', altKey: true, shiftKey: true, bubbles: true }));
      })()`);
      await waitForText(cdp, 'Pemulihan Akses Admin', 6_000);
      await snap(
        cdp,
        results,
        '03-auth-admin-recovery.png',
        '1440x900',
        'Auth Portal — Hidden Admin Recovery'
      );

      // Log in cleanly via API
      await loginAsAdmin(cdp);

      // 04. Main Workspace: 2D CAD + Specs (Structure) + BCT Pro (Calc)
      await snap(
        cdp,
        results,
        '04-workspace-2d-specs-structure.png',
        '1440x900',
        '2D Die-Line CAD + Specs (Structure) + BCT Pro (Calc)',
        { frames: 5, extraMs: 700 }
      );

      // 05. Specs Rail — Pre-press Tab (enable SRP perforation to show active controls)
      await clickByText(cdp, 'Pre-press', { exact: true });
      await waitForText(cdp, 'Pre-press print boundaries', 5_000);
      await clickSelector(cdp, '[aria-label="Enable perforation"]');
      await snap(
        cdp,
        results,
        '05-specs-prepress.png',
        '1440x900',
        'Specs Rail — Pre-press & SRP Perforation Active',
        { frames: 5, extraMs: 500 }
      );

      // 06. Specs Rail — Title Block Tab
      await clickByText(cdp, 'Title block', { exact: true });
      await snap(
        cdp,
        results,
        '06-specs-titleblock.png',
        '1440x900',
        'Specs Rail — Title Block Metadata'
      );

      // Return Specs to Structure
      await clickByText(cdp, 'Structure', { exact: true });

      // 07. 3D Fit & Tear — Folded / X-Ray Standard View
      await clickByText(cdp, '3D', { exact: false, rootSelector: 'header' });
      await waitForSelector(cdp, 'canvas', 12_000);
      await snap(
        cdp,
        results,
        '07-workspace-3d-folded.png',
        '1440x900',
        '3D Fit & Tear — Folded Carton & X-Ray Cavity',
        { frames: 18, extraMs: 1_200 }
      );

      // 08. 3D Fit & Tear — Active SRP Tear Open (Peel 100%)
      await clickByText(cdp, 'Peel', { exact: false });
      await snap(
        cdp,
        results,
        '08-workspace-3d-srp-tear.png',
        '1440x900',
        '3D Fit & Tear — Active SRP Supermarket Tear Open',
        { frames: 35, extraMs: 1_600 }
      );

      // 09. Palletizer Pro 3D — Normal Stack View
      await clickByText(cdp, 'Pallet', { exact: false, rootSelector: 'header' });
      await waitForText(cdp, 'Export PDF', 15_000);
      await snap(
        cdp,
        results,
        '09-palletizer-normal.png',
        '1440x900',
        'Palletizer Pro 3D — Normal Stack & Efficiency HUD',
        { frames: 20, extraMs: 1_400 }
      );

      // 10. Palletizer Pro 3D — Lock Heat-Map Mode + Layer Overlap Mini-Blueprint
      await clickSelector(cdp, 'button[title="Mode Heat-Map Penguncian Antar Layer"]');
      await snap(
        cdp,
        results,
        '10-palletizer-heatmap.png',
        '1440x900',
        'Palletizer Pro 3D — Lock Heat-Map & L1/L2 Overlap Blueprint',
        { frames: 20, extraMs: 1_200 }
      );

      // 11. Palletizer Pro 3D — Inspect Layer Slice (Layer 2)
      await clickSelector(cdp, 'button[title="Mode Heat-Map Penguncian Antar Layer"]');
      await sleep(300);
      await cdp.eval(`(() => {
        const sliders = Array.from(document.querySelectorAll('input[type="range"]'));
        for (const input of sliders) {
          const min = Number(input.min || '0');
          const max = Number(input.max || '0');
          if (min === 1 && max >= 2) {
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            setter?.call(input, '2');
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          }
        }
        return false;
      })()`);
      await snap(
        cdp,
        results,
        '11-palletizer-inspect-layer.png',
        '1440x900',
        'Palletizer Pro 3D — Inspect Layer Slice (Layer 2)',
        { frames: 20, extraMs: 1_200 }
      );

      // 12. Export PDF Palletizer Modal
      await clickByText(cdp, 'Export PDF', { exact: false });
      await waitForSelector(cdp, 'button[aria-label="Tutup dialog Export PDF"]', 5_000);
      await snap(
        cdp,
        results,
        '12-palletizer-pdf-modal.png',
        '1440x900',
        'Palletizer Pro — Export PDF A4 Orthographic Modal'
      );
      await clickSelector(cdp, 'button[aria-label="Tutup dialog Export PDF"]');
      await sleep(300);

      // Return to 2D CAD for BCT Pro Rail tabs & Modals
      await clickByText(cdp, '2D', { exact: false, rootSelector: 'header' });
      await sleep(600);

      // 13. BCT Pro Rail — Audit Tab
      await clickByText(cdp, 'Audit', { exact: true });
      await snap(
        cdp,
        results,
        '13-bct-audit.png',
        '1440x900',
        'BCT Pro Rail — Structural Audit & Board Advisor'
      );

      // 14. BCT Pro Rail — History Tab
      await clickByText(cdp, 'Hist (', { exact: false });
      await snap(
        cdp,
        results,
        '14-bct-history.png',
        '1440x900',
        'BCT Pro Rail — Persisted SQLite History Log'
      );

      // 15. BCT Pro Rail — Compare Tab
      await clickByText(cdp, 'Cmp', { exact: true });
      await snap(
        cdp,
        results,
        '15-bct-compare.png',
        '1440x900',
        'BCT Pro Rail — Multi-Grade Flute Comparison'
      );

      // Back to Calc tab
      await clickByText(cdp, 'Calc', { exact: true });

      // 16. Pre-Flight Engineering Sheet Modal
      await clickSelector(cdp, 'button[title^="Corrected BCT"]');
      await waitForText(cdp, 'Corrugated engineering and pre-flight', 6_000);
      await snap(
        cdp,
        results,
        '16-modal-engineering-sheet.png',
        '1440x900',
        'Pre-Flight Engineering Audit & Costing Sheet',
        { frames: 5, extraMs: 600 }
      );
      await clickByText(cdp, 'Close', { exact: true });
      await sleep(400);

      // 17. Saved Projects Modal
      await openProjectsModal(cdp);
      await snap(
        cdp,
        results,
        '17-modal-projects.png',
        '1440x900',
        'Saved Box Projects Modal',
        { frames: 5, extraMs: 600 }
      );
      await cdp.eval(`(() => {
        const dialog = document.querySelector('[role="dialog"]');
        const btn = dialog?.querySelector('button[aria-label*="Tutup"], button[aria-label*="Close"]');
        if (btn) btn.click();
        else window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      })()`);
      await sleep(400);

      // 18-21. Admin Console (4 Tabs)
      await openAdminConsole(cdp);
      await snap(
        cdp,
        results,
        '18-admin-users.png',
        '1440x900',
        'Admin Console — Tab 1: Pengguna & Sesi',
        { frames: 6, extraMs: 700 }
      );

      await clickByText(cdp, 'Kesehatan & Prediksi', { exact: false });
      await snap(
        cdp,
        results,
        '19-admin-health.png',
        '1440x900',
        'Admin Console — Tab 2: Health Radar & Prediksi',
        { frames: 6, extraMs: 800 }
      );

      await clickByText(cdp, 'Log Audit', { exact: true });
      await snap(
        cdp,
        results,
        '20-admin-audit.png',
        '1440x900',
        'Admin Console — Tab 3: Log Audit Keamanan',
        { frames: 6, extraMs: 700 }
      );

      await clickByText(cdp, 'Keamanan & Backup', { exact: true });
      await snap(
        cdp,
        results,
        '21-admin-security.png',
        '1440x900',
        'Admin Console — Tab 4: Keamanan, SMTP, Agent & Backup',
        { frames: 6, extraMs: 700 }
      );

      // Close Admin Console cleanly using its dedicated aria-label
      await clickSelector(cdp, 'button[aria-label="Tutup konsol admin"]');
      await sleep(400);
    } else {
      await setViewport(cdp, 390, 844, true);
      await cdp.send('Page.navigate', { url: BASE_URL });
      await waitForText(cdp, 'Masuk ke Workstation', 20_000);
      await loginAsAdmin(cdp);
    }

    // =========================================================================
    // PART B: MOBILE CORE SUITE (390 x 844)
    // =========================================================================
    console.log('\n[2/2] Capturing Mobile Core Suite (390x844)...');
    await setViewport(cdp, 390, 844, true);
    await waitForSelector(cdp, 'nav[aria-label="Kontrol cepat mobile"]', 8_000);
    await sleep(600);

    // m02. Mobile 2D CAD + Floating Thumb Dock
    await snap(
      cdp,
      results,
      'm02-mobile-2d-cad.png',
      '390x844',
      'Mobile — 2D Die-Line CAD & Floating Thumb Dock',
      { frames: 6, extraMs: 600 }
    );

    // m03. Mobile Specs Drawer
    await clickByText(cdp, 'Specs', {
      exact: true,
      rootSelector: 'nav[aria-label="Kontrol cepat mobile"]',
    });
    await waitForText(cdp, 'Structure', 5_000);
    await snap(
      cdp,
      results,
      'm03-mobile-specs-drawer.png',
      '390x844',
      'Mobile — Specs Slide-Over Drawer',
      { frames: 5, extraMs: 500 }
    );
    await clickSelector(cdp, 'button[aria-label="Minimize panel spesifikasi"]');
    await sleep(400);

    // m06. Mobile BCT Pro Drawer
    await clickByText(cdp, 'BCT', {
      exact: true,
      rootSelector: 'nav[aria-label="Kontrol cepat mobile"]',
    });
    await waitForText(cdp, 'TAPPI Calibrated', 5_000);
    await snap(
      cdp,
      results,
      'm06-mobile-bct-drawer.png',
      '390x844',
      'Mobile — BCT Pro Slide-Over Drawer',
      { frames: 5, extraMs: 500 }
    );
    await clickSelector(cdp, 'button[aria-label="Minimize BCT sidebar"]');
    await sleep(400);

    // m04. Mobile 3D Fit & Tear
    await clickByText(cdp, '3D', { exact: false, rootSelector: 'header' });
    await waitForSelector(cdp, 'canvas', 12_000);
    await snap(
      cdp,
      results,
      'm04-mobile-3d-viewer.png',
      '390x844',
      'Mobile — 3D Fit & Tear Viewport',
      { frames: 18, extraMs: 1_200 }
    );

    // m05. Mobile Palletizer Pro 3D
    await clickByText(cdp, 'Pallet', { exact: false, rootSelector: 'header' });
    await waitForSelector(cdp, 'canvas', 12_000);
    await snap(
      cdp,
      results,
      'm05-mobile-palletizer.png',
      '390x844',
      'Mobile — Palletizer Pro 3D Viewport',
      { frames: 20, extraMs: 1_400 }
    );

    // m01. Mobile Auth Portal (logout cleanly first)
    await cdp.eval(`(async () => {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      try { window.sessionStorage.removeItem('diecut_room_session_token'); } catch {}
    })()`);
    await cdp.send('Page.reload', { ignoreCache: true });
    await waitForText(cdp, 'Masuk ke Workstation', 15_000);
    await snap(
      cdp,
      results,
      'm01-mobile-auth.png',
      '390x844',
      'Mobile — Auth Portal',
      { frames: 6, extraMs: 600 }
    );

    const totalKb = results.reduce((acc, r) => acc + r.bytes, 0) / 1024;
    console.log(
      `\nDone! Captured ${results.length} live visual snapshots (${(totalKb / 1024).toFixed(2)} MB total) in docs/visual-snapshots/.`
    );
  } finally {
    cdp?.close();
    proc.kill('SIGTERM');
    await sleep(300);
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup error
    }
  }
}

main().catch((err) => {
  console.error('\nVisual snapshot capture failed:', err);
  process.exit(1);
});
