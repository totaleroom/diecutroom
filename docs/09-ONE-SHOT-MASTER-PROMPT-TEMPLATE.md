# 09. Universal One-Shot Master Prompt Blueprint (DieCut.Room Production Standard)

This document distills the entire engineering architecture, **Precision Tactile Studio** visual system, security & 4-tab Admin Ops suite, responsive 4-tier ergonomics, WebGL/Worker/PDF resilience, Debian VPS coexistence topology, and Agent-First documentation/drift-guard discipline of **DieCut.Room** into a single **copy-paste-ready, modular One-Shot Master Prompt**.

It is engineered for **universal compatibility** across **Google AI Studio Build**, **Cursor**, **ADE Antigravity**, **OpenAI Codex**, and **Claude Code**.

---

## Quick-Fill Usage Guide (3 Steps)

1. **Edit ONLY the top ~15% (`<project_variables>` & `<feature_toggles>`)**: Replace every `{{PLACEHOLDER}}` with your new app's domain details and flip each `[ON | OFF]` module switch to match your scope.
2. **Keep the locked ~85% invariants verbatim**: Do not dilute the design tokens, responsive math, security contract, negative constraints, or Definition-of-Done gate — those invariants prevent visual drift and eliminate repetitive follow-up prompts.
3. **Paste the entire fenced prompt block as Turn 1** into your chosen AI builder or coding agent. If using a Planning Mode workflow, let the agent verify scope once, then approve to build the complete production codebase in a single execution cycle.

> **Tip for Multi-App Ecosystems (e.g., Totale.Room Suite)**: Keep `BRAND_SUITE`, the **Precision Tactile Studio** tokens, the `2px` Halftone Auth Portal, and the subdomain isolation pattern identical across every app so all apps launched from your main Astro landing page feel like one cohesive engineering suite.

---

## Copy-Paste Ready One-Shot Master Prompt

````markdown
<role_and_mission>
Act as a Principal Full-Stack Systems Engineer and Design Systems Architect.
Build a complete, production-ready, zero-stub web application from scratch that adheres strictly to every variable, enabled feature module, visual design token, security invariant, responsive ergonomic rule, and verification gate defined below.

Operating principles:
- Treat every section below as an executable engineering contract, not loose inspiration.
- Implement complete, working event handlers, state transitions, persistence, validation, and error/loading/empty states on the first pass — never leave placeholder stubs, fake mock arrays, or "TODO" comments.
- Honor all `[OFF]` feature toggles strictly (omit disabled modules cleanly with zero dead code or unused dependencies).
- Prioritize deterministic precision, visual restraint, runtime resilience, and low server resource footprint.
</role_and_mission>

<project_variables>
<!-- ======================================================================= -->
<!-- EDIT ONLY THIS SECTION + <feature_toggles> FOR EACH NEW APPLICATION     -->
<!-- ======================================================================= -->
APP_NAME: "{{APP_NAME}}"                                 # e.g., "LabelSpec.Room"
APP_SLUG: "{{APP_SLUG}}"                                 # e.g., "labelspec-room" (Docker/PM2/Nginx/cookie prefix)
APP_TAGLINE: "{{APP_TAGLINE}}"                           # e.g., "Thermal Label CAD & Print Costing Studio"
BRAND_SUITE: "{{BRAND_SUITE}}"                           # e.g., "Totale.Room"
BRAND_LOGO_PATH: "{{BRAND_LOGO_PATH}}"                   # e.g., "public/assets/brand/totale-room-logo.svg" (or "NONE")
UI_LANGUAGE: "{{UI_LANGUAGE}}"                           # e.g., "Indonesian UI labels + English engineering terms" or "English"
PRODUCTION_SUBDOMAIN: "{{PRODUCTION_SUBDOMAIN}}"         # e.g., "label.totaleroom.com"
HUB_LANDING_URL: "{{HUB_LANDING_URL}}"                   # e.g., "https://totaleroom.com" (Astro hub) or "NONE"
WHATSAPP_ADMIN_E164: "{{WHATSAPP_ADMIN_E164}}"           # Digits only, no '+', e.g., "6282125086328" (or "NONE")

TARGET_PERSONA: "{{TARGET_PERSONA}}"                     # e.g., "Packaging & Production Engineers, QA Managers"
CORE_PROBLEM_AND_OUTCOME: "{{CORE_PROBLEM_AND_OUTCOME}}" # 1-2 concrete sentences describing input -> computation -> deliverable
UNIT_SYSTEM: "{{UNIT_SYSTEM}}"                           # e.g., "mm / cm / in (internal 1:1 mm canonical math)" or "N/A"

PRIMARY_VIEWS:
  # Topbar view switcher tabs (1 to 4 primary canvas/workspace modes)
  - id: "{{VIEW_1_ID}}" | label: "{{VIEW_1_LABEL}}" | purpose: "{{VIEW_1_PURPOSE}}"
  - id: "{{VIEW_2_ID}}" | label: "{{VIEW_2_LABEL}}" | purpose: "{{VIEW_2_PURPOSE}}"
  - id: "{{VIEW_3_ID}}" | label: "{{VIEW_3_LABEL}}" | purpose: "{{VIEW_3_PURPOSE}}"

LEFT_RAIL_CONFIG_TABS:
  # Left collapsible configurator panel tabs (e.g., Specs / Parameters / Rules)
  - id: "{{LEFT_TAB_1}}" | controls: "{{LEFT_TAB_1_CONTROLS}}"
  - id: "{{LEFT_TAB_2}}" | controls: "{{LEFT_TAB_2_CONTROLS}}"
  - id: "{{LEFT_TAB_3}}" | controls: "{{LEFT_TAB_3_CONTROLS}}"

RIGHT_RAIL_INSPECTOR_TABS:
  # Right collapsible analysis/telemetry panel tabs (or "NONE" for 2-column layout)
  - id: "{{RIGHT_TAB_1}}" | purpose: "{{RIGHT_TAB_1_PURPOSE}}"
  - id: "{{RIGHT_TAB_2}}" | purpose: "{{RIGHT_TAB_2_PURPOSE}}"
  - id: "{{RIGHT_TAB_3}}" | purpose: "{{RIGHT_TAB_3_PURPOSE}}"
  - id: "{{RIGHT_TAB_4}}" | purpose: "{{RIGHT_TAB_4_PURPOSE}}"

OPERATIONAL_MODALS:
  # Global topbar modals (beyond Admin Console)
  - name: "{{MODAL_1_NAME}}" | purpose: "{{MODAL_1_PURPOSE}}" # e.g., Pre-Flight Audit + 1-Click Auto-Fix + Costing
  - name: "{{MODAL_2_NAME}}" | purpose: "{{MODAL_2_PURPOSE}}" # e.g., Saved Projects Manager (Save/Load/Delete/Empty)

DOMAIN_ENGINES:
  # Deterministic math, geometry, rule engines, or optimization solvers to implement in src/utils/
  - "{{ENGINE_1_SPEC}}"
  - "{{ENGINE_2_SPEC}}"
  - "{{ENGINE_3_SPEC}}"

SQLITE_DOMAIN_TABLES:
  # Domain-specific tables persisted per user_id (ON DELETE CASCADE) alongside core auth/ops tables
  - "{{TABLE_1_NAME}}: {{TABLE_1_COLUMNS_AND_PURPOSE}}"
  - "{{TABLE_2_NAME}}: {{TABLE_2_COLUMNS_AND_PURPOSE}}"

PDF_REPORT_STRUCTURE:
  # Used only when MODULE_PDF_ENGINEERING_REPORT = ON
  - Page 1: "{{PDF_PAGE_1_CONTENT}}"
  - Page 2: "{{PDF_PAGE_2_CONTENT}}"
</project_variables>

<feature_toggles>
<!-- Flip each module to ON or OFF before sending. Implement every ON module in full. -->
MODULE_AUTH_HALFTONE:           ON   # Private AuthGate (2px Halftone Offset-Sheet, Pending/Disabled, Lockout, Hidden Admin Recovery Key + SMTP OTP, WhatsApp metadata CTA)
MODULE_ADMIN_CONSOLE_4TAB:      ON   # 4-Tab Admin Console (Users/Bulk Approve/Revoke, Health Radar, Audit Logs, Security/SMTP/Agent Key/SQLite & JSON Backup)
MODULE_SQLITE_WAL:              ON   # Embedded Node.js 22+ `node:sqlite` (WAL mode, zero external DB server)
MODULE_WORKSPACE_4TIER:         ON   # 4-Tier Responsive Studio Shell + Focus Mode (F/Esc) + Mobile Floating Thumb Dock + Short-Landscape HUD
MODULE_2D_VECTOR_CAD:           ON   # Interactive Pan/Zoom 2D SVG CAD Canvas + Layer Toggles + 1:1 Vector SVG/PDF Export
MODULE_3D_WEBGL_ADAPTIVE:       ON   # Three.js WebGL Viewport + Adaptive GPU Quality Tiers + POV Camera Capsule + WebGL Context-Lost Recovery
MODULE_WEB_WORKER:              ON   # Off-thread Web Worker for heavy optimization/simulation loops (keeps UI 60fps)
MODULE_PDF_ENGINEERING_REPORT:  ON   # Studio-styled A4 Multi-Page Vector/Orthographic PDF Export with left app credit & right suite logo
MODULE_AGENT_REST_MCP:          OFF  # Machine API (`/api/agent/*`) + JSON-RPC MCP server (`/api/mcp`) authenticated via `X-Agent-Key`
MODULE_PWA_RESILIENT:           ON   # Workbox PWA (NetworkFirst HTML, NetworkOnly `/api/*`, chunk-load retry, boot watchdog)
MODULE_VPS_ASTRO_DEPLOY:        ON   # Multi-Stage Docker Slim (~160 MB / 256m RAM), PM2 Node 22 fallback, Debian Nginx coexistence, optional Split-Deploy (`VITE_API_BASE_URL` + `CORS_ALLOWED_ORIGINS`)
MODULE_AGENT_DOCS_VISUAL_GUARD: ON   # Root `DESIGN.md`, `AGENTS.md`, `.agents/rules/project.md`, `docs/STATUS.md`, zero-dep Codebase Indexer, Docs-Drift Checker, & Headless CDP Visual Snapshot Catalog
</feature_toggles>

<visual_design_contract>
Design System: **Precision Tactile Studio** (light-mode first, quiet physical drafting workstation).
All tokens MUST live in `src/index.css` via Tailwind CSS v4 (`@import "tailwindcss";`) and all reusable controls MUST live in `src/components/tactile/TactileUI.tsx`.

1. Exact Color Palette Tokens:
   - Surfaces & Neutrals (Cool Slate-Sand Hybrid):
     - `--surface-top`: `#FFFFFF` | `--root-ink-1`: `#FCFCFD` (raised cards, panels, modals)
     - `--ground` / `--root-ink-2`: `#F4F5F7` (studio workspace canvas background)
     - `--root-ink-3`: `#ECEEF1` (sunken input wells, subtle section header tints)
     - `--root-ink-4`: `#E3E6EB` (focused/hover input wells)
     - `--line` / `--root-ink-6`: `#CDD2DB` (crisp `0.5px` hairline dividers & card rings)
     - `--root-ink-10`: `#5C626E` (metadata, units, timestamps, helper hints)
     - `--root-ink-11`: `#474D58` (secondary labels, body descriptions)
     - `--primary-bg` / `--root-ink-12`: `#17191F` (titles, primary values, solid primary CTA fill)
     - `--primary-fg`: `#FFFFFF`
   - Semantic Hues (Meaning ONLY — pair `-3` tint fill with `-11` text; `-9` solid only for status dots/bars/destructive modal confirm):
     - Accent (Active selection / CAD highlight): `-3 #EEF2FF` · `-6 #C7D2FE` · `-9 #4F46E5` · `-11 #3730A3`
     - Green (Pass / Safe / Locked):            `-3 #ECFDF5` · `-6 #A7F3D0` · `-9 #16A34A` · `-11 #15803D`
     - Amber (Warning / Marginal / Pending):    `-3 #FFFBEB` · `-6 #FDE68A` · `-9 #D97706` · `-11 #B45309`
     - Red (Danger / Error / Destructive):      `-3 #FEF2F2` · `-6 #FECACA` · `-9 #DC2626` · `-11 #B91C1C`
     - Blue (Informational / Print notes):      `-3 #EFF6FF` · `-6 #BFDBFE` · `-9 #2563EB` · `-11 #1D4ED8`

2. Typography & Tabular Precision:
   - Brand/Display (`--font-brand`): Optional runtime drop-in `"Timeless Grotesk"` from `public/fonts/` via `GET /api/fonts/available` (zero 404s when empty), cleanly falling back to `"Plus Jakarta Sans"`.
   - UI Body (`--font-sans`): `"Plus Jakarta Sans"`, base `13px / 20px`, meta `12px / 16px`, card/modal title `16px / 24px`, section `20px / 28px`.
   - Engineering / Numeric Data (`--font-mono`): `"JetBrains Mono"` with `font-variant-numeric: tabular-nums` on every measurement, KPI, currency, score, percentage, dimension, and code.
   - Touch Floor: Under `@media (pointer: coarse)`, step input fields up to `16px` font-size to prevent iOS Safari auto-zoom.

3. Surfaces, Radii, Controls & Motion:
   - Radii Ladder: `--radius-sm: 4px`, `--radius-control: 6px`, `--radius-container: 8px`, `--radius-feature: 12px`; utility pills & status badges use `9999px`.
   - Control Heights: `34px` default, `30px` compact, `28px` utility pill, `24px` inline, `22px` icon button, `20px` badge, `38px` table row.
   - Sunken Input Wells: Inputs use `--root-ink-3` fill without heavy outer borders, crisp `2px` `--focus-ring` on `:focus-visible`.
   - Single Primary CTA Rule: Maximum ONE solid `#17191F` primary button per surface/modal. Secondary buttons are white with tight hairline shadow (`--shadow-button`). Destructive triggers stay white with `--red-11` text; only final destructive confirm inside a modal uses solid `--red-9`.
   - Motion: Subtle tactile press `scale(0.97)` (`150ms`), strong ease-out `cubic-bezier(0.23, 1, 0.32, 1)` (`150–300ms`). Zero decorative bounce or idle looping animations.
   - Distinct Auth Surface (`MODULE_AUTH_HALFTONE = ON`): Matte white sheet with sharp `2px` border radius over an interactive dark dot-matrix canvas, framed by perimeter halftone dots and top-right raster gradient accent.
</visual_design_contract>

<responsive_ergonomics_contract>
When `MODULE_WORKSPACE_4TIER = ON`, implement `src/hooks/useWorkspaceLayout.ts` with:
- 4-Tier Breakpoints: `desktop (>= 1280px)`, `compact (1024–1279px, auto-minimizes right rail)`, `tablet (768–1023px, overlay drawers)`, `mobile (< 768px, full-canvas + slide-over drawers)`.
- Short-Landscape Detection: `isShortLandscape = height <= 500 && width >= 560` (renders compact single-row floating HUD bar for 3D/canvas views and hides footer to maximize canvas height).
- Mutual Exclusion: Opening one overlay drawer on tablet/mobile automatically closes the opposing drawer.
- 1-Click Focus Mode (`F` / `Esc`): Collapses side rails and footer with a floating exit pill.
- Mobile Floating Thumb Dock (`< 768px`): Centered bottom pill offering 1-tap access to Left Rail, Right Rail (with live semantic status dot), and Focus Mode.
- Adaptive Header Overflow Menu (`···`): Collapses secondary topbar utilities gracefully at narrower widths without horizontal overflow.
- Compact Sliders: `64px` track width inside canvas HUD bars with strict `@layer components` CSS containment so thumbs never overflow borders on narrow viewports.
</responsive_ergonomics_contract>

<architecture_security_and_persistence_contract>
1. Runtime & Full-Stack Monolith:
   - Frontend: React 19 + TypeScript 5.8 + Vite 6 + Tailwind CSS v4 (SPA with lazy-loaded heavy views via `src/utils/lazyWithRetry.ts`).
   - Backend: Express 4 (`server.ts`) running directly on **Node.js 22+ native TypeScript type-stripping** (`NODE_ENV=production node server.ts` — no backend transpile step). In development, `tsx server.ts` binds `http.createServer` immediately on port `3000` (instant health-check readiness) and mounts Vite dev middleware asynchronously (`ws: false` when `DISABLE_HMR=true`).
   - API URL Resolution: All frontend API calls go through `src/utils/apiSession.ts` (`resolveApiUrl` reading optional `VITE_API_BASE_URL` for Split-Deploy + `authFetch` attaching `Authorization: Bearer <token>` and `credentials: 'include'`).
   - CORS Policy: Same-origin by default; when `CORS_ALLOWED_ORIGINS` is explicitly configured in `.env`, apply strict allowlist CORS with credentials on `/api/*`.

2. Embedded Persistence (`MODULE_SQLITE_WAL = ON`):
   - Use Node.js 22+ built-in `node:sqlite` (`DatabaseSync`) stored at `SQLITE_PATH` (default `./data/{{APP_SLUG}}.db`) with `PRAGMA journal_mode = WAL` and `PRAGMA foreign_keys = ON`.
   - Core tables: `users` (with `role`, `status`, `token_version`, `failed_login_count`, `locked_until`, access origin/device/IP metadata), `system_meta`, `audit_logs`, plus all domain tables defined in `<project_variables>` (`ON DELETE CASCADE` on `user_id`).
   - Never add external database servers or native C++ `node-gyp` SQLite packages.

3. Hardened Authentication & Recovery (`MODULE_AUTH_HALFTONE = ON`):
   - Passwords hashed with `crypto.scryptSync` (16-byte random salt + 64-byte derived key) compared via `crypto.timingSafeEqual`.
   - Dual Session Transport: `HttpOnly; SameSite=None; Secure; Partitioned` HMAC-SHA256 cookie + `Authorization: Bearer` token mirrored in `sessionStorage` so both standalone browsers, PWAs, and embedded iframes stay authenticated.
   - Registration Gate: New registrations start as `status = 'pending'` and receive `403 ACCOUNT_PENDING` until an Admin activates them. Seed initial Admin once on boot via `ADMIN_EMAIL` & `ADMIN_INITIAL_PASSWORD`.
   - Brute-Force Lockout: Track `failed_login_count` and lock temporarily via `locked_until` (`429 ACCOUNT_LOCKED`) with clear user countdown feedback.
   - Hidden Admin Recovery: Accessible on `AuthGate` via `Alt+Shift+R`, `Ctrl+Shift+Alt+A`, or 5× logo tap within 2.5s — supports both **Admin Recovery Key** and **SMTP Email OTP** (6-digit code with 60s cooldown), plus server-side emergency CLI `scripts/admin-reset.ts` (`npm run admin:reset`).
   - WhatsApp Admin CTA (when `WHATSAPP_ADMIN_E164 != NONE`): Pre-fills origin subdomain, full URL, referrer, OS/browser summary, display mode (`Standalone PWA` vs `Web Browser`), screen size, and IANA timezone.
   - Zero Hardcoded Secrets: All secrets read from `process.env` (documented in `.env.example` without secret values) with auto-generated fallback `.session_secret` inside `./data/` (gitignored).

4. 4-Tab Admin Command Console (`MODULE_ADMIN_CONSOLE_4TAB = ON`):
   - Accessible to `role === 'admin'` via topbar button or `Ctrl/Cmd+Shift+A`.
   - Tab 1 (`Users & Sessions`): Account stats, search/filter, Create User, Edit Profile/Role, Bulk Approve Pending, Activate/Disable, Reset Password, Revoke Sessions (`token_version++`), Delete User, and access origin/IP/device inspection.
   - Tab 2 (`Health Radar & Predictions`): Real-time process RSS memory vs `MEMORY_LIMIT_MB`, SQLite WAL file size, uptime, and actionable security/capacity warnings with deep-link buttons to relevant tabs.
   - Tab 3 (`Audit Logs`): Filterable security timeline (`info / warn / critical`, actor, target, IP, origin, timestamp).
   - Tab 4 (`Security & Backups`): Change own Admin password, rotate Recovery Key, configure & test SMTP Email OTP, manage optional Agent/MCP API Key (`MODULE_AGENT_REST_MCP = ON`), and download consistent live **SQLite `.db`** (`VACUUM INTO`) or **JSON** backups.
</architecture_security_and_persistence_contract>

<module_specifications>
Implement each specification below ONLY when its corresponding flag in `<feature_toggles>` is `ON`:

- `MODULE_2D_VECTOR_CAD`:
  - True-scale `1:1` vector SVG renderer with smooth pan/zoom, Fit button, layer visibility toggles, technical dimension callouts, title block metadata, and Clean CAD vs Spec Sheet export (SVG + PDF).
- `MODULE_3D_WEBGL_ADAPTIVE`:
  - Three.js WebGL scene with `src/utils/browserEngine.ts` profiling GPU/CPU into `ultra / balanced / eco / software` quality tiers + dynamic pixel-ratio scaling.
  - Top-right POV Camera Capsule (`Iso / Front / Top / Side / Reset`), collapsible bottom HUD (`H`), clean disposal of geometries/materials/textures on unmount, and a **WebGL Context-Lost Recovery Overlay** (`webglcontextlost`) so users can restore the viewport without losing state.
- `MODULE_WEB_WORKER`:
  - Dedicated typed Web Worker (`src/workers/*.worker.ts`) offloading iterative optimization/solver calculations with cancellation/latest-request guards and instant fallback if Worker fails.
- `MODULE_PDF_ENGINEERING_REPORT`:
  - Studio-styled A4 multi-page PDF generator (`jspdf`) mirroring **Precision Tactile Studio** hex tokens (`#17191F`, `#F4F5F7`, `#ECEEF1`, `#CDD2DB`, `#4F46E5`).
  - Header left: `"GENERATED BY {{APP_NAME}}"` (or localized equivalent); Header far right: rendered `{{BRAND_LOGO_PATH}}` vector/raster brand wordmark.
  - If 3D snapshots are embedded, render via `THREE.OrthographicCamera` tightly fitted via `Box3` (zero perspective cropping), high-contrast orientation/category coloring + crisp `#17191F` edge outlines, and projected vector `L × W × H` dimension callouts.
- `MODULE_AGENT_REST_MCP`:
  - Machine-readable skill manifest (`/api/agent/skill`), connection check (`/api/agent/connect`), domain compute/export endpoints, and JSON-RPC **MCP** endpoint (`/api/mcp`) authenticated via `X-Agent-Key` or Bearer token hashed in `system_meta`.
- `MODULE_PWA_RESILIENT`:
  - `vite-plugin-pwa` Workbox configuration: `NetworkFirst` for HTML navigations (`navigateFallback: null`), `CacheFirst` for immutable `/assets/*`, strict `NetworkOnly` for `/api/*`.
  - Production Express returns explicit `404` for missing `/assets/*` or `/fonts/*` (never serves `index.html` masquerading as JS/CSS).
  - Include `index.html` SW boot-recovery watchdog and `src/utils/lazyWithRetry.ts` dynamic-import reload guard.
- `MODULE_VPS_ASTRO_DEPLOY`:
  - Multi-stage `Dockerfile` (`node:22-alpine`): Builder compiles `./dist`, Runner installs ONLY `express` + `dotenv` and copies `server.ts`, `./dist`, and `scripts/admin-reset.ts` (~160 MB image, `mem_limit: 256m`, `NODE_OPTIONS=--max-old-space-size=192`).
  - `docker-compose.yml` binding `127.0.0.1:${HOST_PORT:-3000}:3000` with `./data:/app/data`.
  - `deploy/nginx-{{APP_SLUG}}.conf` template for Debian Nginx coexistence (`sites-available`, auth `limit_req`, `Cache-Control: no-cache` on `/sw.js`, `/manifest.webmanifest`, `/index.html`).
  - `vercel.json` for optional Split-Deploy (Vercel static SPA + VPS backend), and subdomain isolation architecture when linked from an Astro landing hub (`{{HUB_LANDING_URL}}`).
- `MODULE_AGENT_DOCS_VISUAL_GUARD`:
  - Create root `DESIGN.md`, `AGENTS.md`, `.agents/rules/project.md`, `.agents/environment.json`, `docs/STATUS.md` (Capability Ledger distinguishing `IMPLEMENTED` vs `NOT PRESENT`), and `docs/06-API-REFERENCE.md`.
  - Create zero-dependency Node 22+ scripts:
    - `scripts/generate-codebase-index.ts` (`npm run index:build` -> `docs/CODEBASE_INDEX.md` with symbol exports, large-file line anchors, and every `/api/*` route line number).
    - `scripts/check-docs-drift.ts` (`npm run docs:check -- --strict` verifying API routes, SQLite schema, runtime env vars, npm scripts + Dockerfile parity, codebase index freshness, and visual catalog PNG integrity).
    - `scripts/capture-visual-snapshots.ts` (`npm run snapshots:capture` via Node 22+ native WebSocket CDP + headless Chromium with non-destructive rAF pause/resume -> `docs/VISUAL-STATE-CATALOG.md` + `docs/visual-snapshots/*.png`).
</module_specifications>

<strict_negative_constraints>
STRICT DO-NOTs (Zero Tolerance):
1. DO NOT use glassmorphism, neon glow cards, rainbow SaaS gradients, oversized rounded pill walls, or default unstyled component libraries that violate **Precision Tactile Studio**.
2. DO NOT add chatbots, "Ask AI" sidebars, or LLM API calls unless explicitly listed in `<project_variables>` (`DOMAIN_ENGINES`).
3. DO NOT rewrite the Express + embedded `node:sqlite` backend into Supabase, Firebase, Base44 SDK, or serverless SQLite when `MODULE_SQLITE_WAL = ON`.
4. DO NOT use `window.alert`, `window.confirm`, or `window.open` popups (always use in-app `TactileUI` modals/confirmations and iframe-safe links).
5. DO NOT leave dead buttons, empty `onClick={() => {}}` handlers, hardcoded mock history rows, or missing loading/empty/error states.
6. DO NOT expose raw secrets, default passwords, SMTP credentials, or API keys in UI, client bundles, `.env.example`, or visual snapshots.
7. DO NOT claim automated unit/E2E tests passed unless an actual test suite was created and executed; explicitly record `automated_tests: NOT PRESENT` in `docs/STATUS.md` if no test runner exists.
8. DO NOT commit `./data/*`, `.env`, `.session_secret`, `dev-dist/`, or temporary reference screenshots into `public/`.
</strict_negative_constraints>

<execution_order_and_definition_of_done>
Execute cleanly in this deterministic order:
1. **Contracts & Tokens**: Define `src/types.ts`, `src/index.css` (exact Precision Tactile Studio tokens), and `src/components/tactile/TactileUI.tsx`.
2. **Pure Domain Engines**: Implement deterministic calculation, geometry, validation/pre-flight rules, and optional Web Worker in `src/utils/` & `src/workers/`.
3. **Backend & Persistence**: Build `server.ts` (instant HTTP bind, SQLite WAL schema, auth/lockout/recovery, 4-tab Admin APIs, domain CRUD, backup endpoints, fonts discovery) + `scripts/admin-reset.ts` + `.env.example`.
4. **Core UI & Interactive Workspaces**: Build `AuthGate`, `useWorkspaceLayout`, `App.tsx`, Left/Right rails, primary 2D/3D/workspace views, Pre-Flight & Projects modals, 4-tab Admin Console, and optional PDF exporter.
5. **Deploy & Ops Artifacts**: Create `Dockerfile`, `docker-compose.yml`, `deploy/nginx-*.conf`, `vercel.json`, and PWA config (per enabled toggles).
6. **Agent-First Docs & Automation**: Create `DESIGN.md`, `AGENTS.md`, `.agents/rules/project.md`, `docs/STATUS.md`, `docs/06-API-REFERENCE.md`, `scripts/generate-codebase-index.ts`, `scripts/check-docs-drift.ts`, and `scripts/capture-visual-snapshots.ts`.
7. **Mandatory Verification Gate (Do NOT finish until all pass)**:
   - Run `npm run lint` (`tsc --noEmit`) → 0 errors.
   - Run `npm run build` (`vite build`) → clean production bundle.
   - If `MODULE_AGENT_DOCS_VISUAL_GUARD = ON`: run `npm run index:build` and `npm run docs:check -- --strict` → 0 failures.
   - Verify `GET /api/health` returns `200 OK` and every enabled view, modal, and responsive breakpoint renders cleanly without console errors.
</execution_order_and_definition_of_done>
````

---

## Filled Mini-Example (Adapting the Blueprint to a Brand-New App)

Below is an example of editing **only** `<project_variables>` and `<feature_toggles>` to build a completely different engineering app inside the same **Totale.Room** ecosystem (`LabelSpec.Room`):

```yaml
# Example <project_variables> override (keep the remaining 85% of the prompt verbatim)
APP_NAME: "LabelSpec.Room"
APP_SLUG: "labelspec-room"
APP_TAGLINE: "Thermal Barcode Label CAD & Roll Costing Studio"
BRAND_SUITE: "Totale.Room"
BRAND_LOGO_PATH: "public/assets/aistudio/Asset_2_5ca58983.svg"
UI_LANGUAGE: "Indonesian UI labels + English technical terms"
PRODUCTION_SUBDOMAIN: "label.totaleroom.com"
HUB_LANDING_URL: "https://totaleroom.com"
WHATSAPP_ADMIN_E164: "6282125086328"

TARGET_PERSONA: "Production Planners, Warehouse Ops & Label Print Operators"
CORE_PROBLEM_AND_OUTCOME: "Eliminate label waste and barcode scan failures by designing true-scale 1:1 mm thermal/adhesive labels with GS1 barcode validation, roll die-cut imposition yield, and instant A4 print-shop spec sheets."
UNIT_SYSTEM: "mm / cm / in (internal 1:1 mm canonical math)"

PRIMARY_VIEWS:
  - id: "2d"    | label: "Label CAD" | purpose: "1:1 mm interactive SVG label layout with GS1-128 / QR / EAN-13, quiet zones, bleed, and corner radius"
  - id: "roll"  | label: "Roll Layout" | purpose: "2D web-press / thermal roll imposition preview (across-web columns, gap pitch, core ID, outer roll OD)"
  - id: "batch" | label: "Print Cost" | purpose: "Ribbon & substrate yield calculator across Direct Thermal / Thermal Transfer / Semi-Gloss / BOPP"

LEFT_RAIL_CONFIG_TABS:
  - id: "geometry" | controls: "Label W×H, corner radius, gap pitch, core size (1\"/1.5\"/3\"), unwind direction (1-8)"
  - id: "barcode"  | controls: "GS1-128 / EAN-13 / QR payload, X-dimension mil, quiet zone audit, DPI (203/300/600)"
  - id: "material" | controls: "Facestock, adhesive temp range, liner caliper, title block client/SKU metadata"

RIGHT_RAIL_INSPECTOR_TABS:
  - id: "yield"   | purpose: "Labels per roll, total roll length, OD check vs printer max OD, cost per 1,000 labels"
  - id: "audit"   | purpose: "8 Pre-Flight barcode & die-cut rules (quiet zone, min X-dim at DPI, roll OD fit)"
  - id: "history" | purpose: "SQLite persisted costing & label scenarios per user"
  - id: "compare" | purpose: "Side-by-side substrate & ribbon cost comparison"

OPERATIONAL_MODALS:
  - name: "Pre-Flight Label Sheet" | purpose: "8-rule barcode/die-cut audit + 1-click Auto-Fix + batch quote table"
  - name: "Saved Label Projects"   | purpose: "Per-account Save / Load / Delete label specifications"

# Feature Toggle Delta for LabelSpec.Room:
# MODULE_3D_WEBGL_ADAPTIVE: OFF   (pure 2D CAD + Roll Imposition — lighter bundle!)
# MODULE_WEB_WORKER:        OFF   (fast deterministic math on main thread)
# MODULE_AGENT_REST_MCP:    ON    (allow ERP/Hermes agents to generate label SVGs via API)
# All other 9 modules:      ON
```
