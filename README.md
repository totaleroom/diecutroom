# DieCut.Room

<p align="left">
  <img src="https://img.shields.io/badge/React-19-149eca?style=flat-square&logo=react&logoColor=white" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-5.8-3178c6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Three.js-WebGL-000000?style=flat-square&logo=threedotjs&logoColor=white" alt="Three.js" />
  <img src="https://img.shields.io/badge/Node.js-22%2B%20SQLite-339933?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node 22 SQLite" />
  <img src="https://img.shields.io/badge/Express-4.21-404d59?style=flat-square&logo=express&logoColor=white" alt="Express" />
  <img src="https://img.shields.io/badge/PWA-Workbox-5a0fc8?style=flat-square&logo=pwa&logoColor=white" alt="PWA" />
  <img src="https://img.shields.io/badge/Debian%20Deploy-Docker%20%7C%20PM2%20%7C%20Nginx-a81d33?style=flat-square&logo=debian&logoColor=white" alt="Debian Deploy" />
</p>

**DieCut.Room** is a private, self-hosted **Structural Packaging CAD**, **Interactive 3D Fit & Shelf-Ready Packaging (SRP) Tear Simulator**, **Palletizer Pro 3D Optimizer**, and **Box Compression Test (BCT Pro / TAPPI-ISO) Engineering Platform**. It runs as a lightweight full-stack monolith (**React 19 + Vite + Three.js + Web Worker + PWA** served by **Express + embedded Node.js 22 SQLite**) engineered for single-subdomain deployment on **Debian VPS** behind Nginx + Certbot TLS.

---

## Table of Contents

- [Core Capabilities](#-core-capabilities)
- [System & Infrastructure Architecture](#-system--infrastructure-architecture)
- [Codebase Architecture & Module Map](#-codebase-architecture--module-map)
- [End-to-End Engineering & CAD Pipeline](#-end-to-end-engineering--cad-pipeline)
- [Private Auth, Halftone Portal & WhatsApp Metadata Flow](#-private-auth-halftone-portal--whatsapp-metadata-flow)
- [Database Schema (Embedded SQLite WAL)](#-database-schema-embedded-sqlite-wal)
- [Environment Configuration: Moving from Preview to Debian VPS](#-environment-configuration-moving-from-preview-to-debian-vps)
- [Quick Start & Debian VPS Deployment](#-quick-start--debian-vps-deployment)
- [Typography Drop-In (Timeless Grotesk) & PWA Resilience](#-typography-drop-in-timeless-grotesk--pwa-resilience)
- [Complete Documentation Index](#-complete-documentation-index)

---

## Core Capabilities

| Domain | Capabilities |
| :--- | :--- |
| **Halftone Auth Portal, Recovery & 4-Tab Admin Console** | Sharp-cornered matte offset-sheet login portal (`2px` radius) framed by perimeter halftone dots over an interactive dark matrix canvas. Uses dual **HttpOnly `Partitioned` Cookie + `Authorization: Bearer`** HMAC-SHA256 sessions with brute-force lockout (`failed_login_count`, `locked_until`), session revocation (`token_version`), hidden **Admin Recovery Key**, **SMTP Email OTP**, and CLI emergency reset (`npm run admin:reset`). Includes a **4-tab Admin Console** (**Users & Bulk Approve**, **Health Radar**, **Audit Logs**, and **Security / SMTP / Agent Key / SQLite & JSON Backups**). |
| **WhatsApp Verification + Metadata** | Login, Pending, and Disabled screens expose a **WhatsApp Admin CTA** (`+6282125086328`) pre-filled with origin subdomain, full URL, referrer, OS/browser summary, display mode (`Standalone PWA` vs `Web Browser`), screen size, and timezone. |
| **2D Dieline CAD (FEFCO 0200–0204)** | Generates true-scale **1:1 mm** vector dielines for `0201 (RSC)`, `0200 (HSC)`, `0202 (OSC)`, `0203 (FOL)`, and `0204 (CSSC)` with `mm` / `cm` / `in` 3-unit workspace, `Product Fit` anti-headspace presets, pre-press layers (*Bleed*, *Score Safe Zone*, *Glue Knockout*, *Flute Grain*), and GS1 **ITF-14** barcode with Modulo-10 auto-fix. |
| **13 SRP Patterns & Dash/Non-Dash Rules** | Includes 13 retail & logistics patterns (*Angled Hood*, *Drop-Front PDQ*, *Twin-Zipper*, *Split-Tray*, *Stepped Shelf-Tray + U-Scoop*, *Tear Strip*, *Carry Handles*, etc.) with **Solid Cut (Non-Dash)** vs **Perforation Rules** (`6/3`, `5/3`, `4/4 mm`, or custom `cut/tie`). |
| **3D Fit & Interactive SRP Tear Simulation** | Real-time Three.js WebGL simulator with `0–100%` box folding, X-Ray cavity clearance, top-right **POV Camera Capsule** (`Iso / Front / Top / Side`), top-left **SRP & Cavity Clearance HUD**, and `0–100%` interactive **Tear / Open SRP** opening animation. |
| **Palletizer Pro 3D & 2-Page A4 Orthographic PDF Report** | Interactive 3D pallet stacking simulator (`ISO`, `EUR`, `US`, `Custom`) with **Case-Pack Solver**, pattern evaluation (*Interlock*, *Column*, *Pinwheel*, *Split*, *Hybrid*), friction/humidity load-retention physics, **Perfectionist Size Tuning**, non-blocking **Web Worker** optimization, and **2-Page A4 Engineering PDF Export** featuring **4 Orthographic POVs** (`Iso` ~40° steep pitch, `Top`, `Front`, `Side`), TOPS-style `0°/90°` orientation contrast colors, vector `L × W × T` dimension overlays, dedicated **Heat-Map Iso/Top** panel, numbered 2D Layer 1 & Layer 2 operator guides, and **DieCut.Room / Totale.Room** Precision Tactile Studio branding. |
| **BCT Pro & TAPPI/ISO Audit Engine** | Single-Wall (`F/E/B/C/A`) and Double-Wall (`EB/BC/AB/AA`) compositions up to **K300**, **White Top Kraft**, **Testliner**, and **Semi-Chem** fluting; custom RCT overrides; per-panel ink **Print Coverage Simulator**; environmental derating; side-by-side **TAPPI vs. BCT Pro** comparison; 8 Pre-Flight rules with 1-click Auto-Fix; and batch costing. |
| **Hermes Agent REST API & MCP Server** | Built-in AI Agent integration via `X-Agent-Key` / Bearer key supporting `/api/agent/skill`, `/api/agent/connect`, `/api/agent/calculate`, `/api/agent/dieline` (2D SVG / Clean CAD generation with signed `/api/agent/dieline/download`), and JSON-RPC **MCP** at `/api/mcp`. |
| **Multi-Viewport Ergonomics & Auto-Adaptive GPU** | 4-tier responsive workspace (`desktop ≥1280px`, `compact 1024–1279px`, `tablet 768–1023px`, `mobile <768px`) with auto-minimize panels, header close buttons, edge quick handles, **1-Click Focus Mode (`F`/`Esc`)**, Mobile Floating Thumb Dock, **Short-Landscape Floating HUD** (`height ≤ 500px`), `64px` compact sliders, lazy-loaded heavy views with chunk-error recovery (`lazyWithRetry.ts`), and automatic GPU/CPU quality tiers (`ultra / balanced / eco / software`) with dynamic pixel-ratio scaling. |
| **Cross-Device Sync & Resilient PWA** | Saved dieline projects (`/api/projects`) and BCT snapshots (`/api/history`) sync per account in VPS SQLite (`data/diecut.db`) with Workbox `NetworkFirst` navigation, strict `/api/*` `NetworkOnly` isolation, self-healing boot watchdog, and optional runtime **Timeless Grotesk** font discovery (`/api/fonts/available`). |

---

## System & Infrastructure Architecture

**DieCut.Room** is engineered to coexist cleanly on a **Debian VPS** that already hosts other websites or reverse-proxied apps on ports `80/443`.

```mermaid
flowchart TD
    subgraph Client["Client Devices (Desktop / Tablet / Android / iOS)"]
        Browser["Web Browser / Installed PWA<br/>(React 19 + Three.js + Web Worker + Workbox SW)"]
    end

    subgraph Edge["Debian VPS Edge Layer (Public Port 80 / 443)"]
        Nginx["Nginx Reverse Proxy + Certbot TLS<br/>• /etc/nginx/sites-available/diecut-room<br/>• Auth Rate-Limit (/api/auth/login|register)<br/>• no-cache headers for sw.js, manifest & index.html"]
    end

    subgraph Runtime["Isolated App Runtime (Localhost 127.0.0.1:HOST_PORT / PORT)"]
        Express["Express Server (Node.js 22+ — server.ts)<br/>• Immediate HTTP Bind + Async Vite Dev Init<br/>• HMAC-SHA256 HttpOnly Cookie Auth (scrypt)<br/>• REST API (/api/auth, /api/admin, /api/history, /api/projects, /api/fonts)<br/>• Dev: Vite Middleware (ws:false when HMR off) | Prod: Static dist/"]
    end

    subgraph Storage["Persistent Storage Volume (./data)"]
        SQLite[("Embedded SQLite (WAL Mode)<br/>data/diecut.db<br/>• users<br/>• bct_history<br/>• saved_projects")]
        Secret[".session_secret<br/>(Fallback HMAC Key if env unset)"]
    end

    Browser -->|"HTTPS / TLS 1.3"| Nginx
    Nginx -->|"HTTP Proxy 127.0.0.1:APP_PORT<br/>X-Forwarded-Proto: https"| Express
    Express <-->|"node:sqlite DatabaseSync"| SQLite
    Express --- Secret
```

### Key Runtime Characteristics
- **Zero External DB Server**: Uses Node.js 22+ built-in `node:sqlite` (`DatabaseSync`) with `PRAGMA journal_mode = WAL` and `PRAGMA foreign_keys = ON`—no PostgreSQL/MySQL container or native C++ `node-gyp` compilation required.
- **Native TypeScript Execution**: Runs `node server.ts` directly in production via Node 22+ type stripping without a separate backend transpile step.
- **Fast Startup & Proxy-Aware Port Binding**: Binds `http.createServer` immediately for instant health-check readiness while initializing Vite dev middleware asynchronously (`ws: false` when HMR is disabled), and honors `NGINX_PORT`, `.env` `PORT`, or Docker `HOST_PORT` cleanly.

---

## Codebase Architecture & Module Map

| Layer | File | Responsibility |
| :--- | :--- | :--- |
| **Backend Server** | [`server.ts`](./server.ts) | Express + `http.createServer`, 5-table SQLite WAL bootstrap & initial Admin seeding, `scrypt` hashing, dual `Partitioned` Cookie + Bearer auth, Admin Recovery Key + SMTP OTP, 4-tab Admin & backup endpoints, Hermes Agent REST (`/api/agent/*`), MCP (`/api/mcp`), `/api/fonts/available`, Vite dev middleware, and hardened production `dist/` static server. |
| **Domain Contracts** | [`src/types.ts`](./src/types.ts) | Canonical TypeScript interfaces for `BoxConfig`, FEFCO dimensions, 13 `PerforationOption` presets, `KRAFT/WHITE_TOP/TESTLINER/MEDIUM` specs, Palletizer types, `EngineeringAnalysis`, `AuthUser`, and `SavedBoxProject`. |
| **App Orchestrator** | [`src/App.tsx`](./src/App.tsx) | Session bootstrap (`/api/auth/me` via `src/utils/apiSession.ts`), `AuthGate` guard, resilient lazy-loaded routes (`src/utils/lazyWithRetry.ts`), 3-unit workspace state (`mm`/`cm`/`in`), adaptive header + overflow menu, Mobile Thumb Dock, Focus Mode banner, and pre-flight drawer. |
| **Responsive Layout Hook** | [`src/hooks/useWorkspaceLayout.ts`](./src/hooks/useWorkspaceLayout.ts) | 4-tier responsive breakpoint detection (`desktop/compact/tablet/mobile`), `isShortLandscape` detection (`height ≤ 500 && width ≥ 560`), auto-minimize transitions, overlay mutual exclusion, and `F`/`Esc` shortcuts. |
| **Session, GPU & Fonts** | [`src/utils/apiSession.ts`](./src/utils/apiSession.ts)<br/>[`src/utils/lazyWithRetry.ts`](./src/utils/lazyWithRetry.ts)<br/>[`src/utils/browserEngine.ts`](./src/utils/browserEngine.ts)<br/>[`src/utils/fontLoader.ts`](./src/utils/fontLoader.ts) | Dual cookie/Bearer `authFetch` session helper, stale-chunk retry recovery, WebGL/CPU tier profiler (`ultra/balanced/eco/software`), dynamic DPR controller, and zero-404 runtime loader for licensed `Timeless Grotesk` `.woff2` files. |
| **2D Geometry Engine** | [`src/utils/dieline.ts`](./src/utils/dieline.ts) | Parametric CAD generator (`generateRSCDieline`) computing cut, crease, perforation, perforation-fold, bleed, score safe zone, glue knockout polygon, flute grain indicator, product fit rectangles, and GS1 ITF-14 coordinates. |
| **Engineering, Palletizer & PDF Report** | [`src/utils/engineering.ts`](./src/utils/engineering.ts)<br/>[`src/utils/palletizer.ts`](./src/utils/palletizer.ts)<br/>[`src/workers/palletizer.worker.ts`](./src/workers/palletizer.worker.ts)<br/>[`src/utils/palletizerReportPdf.ts`](./src/utils/palletizerReportPdf.ts) | Dual-engine BCT calculator (`TAPPI / ISO Calibrated` vs `BCT Pro Legacy`), panel ink crush, 8 Pre-Flight rules, blank waste/costing, Case-Pack solver, pallet physics optimization, off-thread Web Worker advisor, and 2-page A4 Orthographic Palletizer PDF report generator. |
| **2D CAD & 3D Simulators** | [`src/components/BoxPreview.tsx`](./src/components/BoxPreview.tsx)<br/>[`src/components/Box3DViewer.tsx`](./src/components/Box3DViewer.tsx)<br/>[`src/components/PalletizerWorkspace.tsx`](./src/components/PalletizerWorkspace.tsx) | Interactive zoom/pan SVG viewport + `1:1 mm` SVG/PDF export, Three.js Box Fit & `0–100%` SRP Tear viewer (top-right POV capsule + compact `64px` sliders + short-landscape floating bar), and interactive 3D Palletizer workspace with Orthographic PDF capture. |
| **Config & Inspection UI** | [`src/components/Sidebar.tsx`](./src/components/Sidebar.tsx)<br/>[`src/components/BCTInspectorRail.tsx`](./src/components/BCTInspectorRail.tsx)<br/>[`src/components/EngineeringSheet.tsx`](./src/components/EngineeringSheet.tsx) | Collapsible left structural/pre-press/SRP configurator, right BCT inspector (`Calc`, `Audit`, `History`, `Compare`), and 8-rule Pre-Flight audit modal with 1-click Auto-Fix. |
| **Auth, Halftone & Admin UI** | [`src/components/AuthGate.tsx`](./src/components/AuthGate.tsx)<br/>[`src/components/HalftoneSheetDecor.tsx`](./src/components/HalftoneSheetDecor.tsx)<br/>[`src/components/InteractiveMatrixCanvas.tsx`](./src/components/InteractiveMatrixCanvas.tsx)<br/>[`src/components/AdminUsersModal.tsx`](./src/components/AdminUsersModal.tsx)<br/>[`src/components/ProjectsModal.tsx`](./src/components/ProjectsModal.tsx) | Halftone offset-sheet Login/Register/Pending/Disabled + hidden Recovery Key/OTP portal over interactive dot matrix canvas, 4-tab Admin Console, and per-account saved projects manager. |
| **CLI, Drift Guard & Deploy** | [`scripts/admin-reset.ts`](./scripts/admin-reset.ts)<br/>[`scripts/check-docs-drift.ts`](./scripts/check-docs-drift.ts)<br/>[`Dockerfile`](./Dockerfile), [`docker-compose.yml`](./docker-compose.yml), [`deploy/nginx-diecut.conf`](./deploy/nginx-diecut.conf) | Node 22+ emergency admin reset CLI, zero-dependency documentation drift detector (`npm run docs:check`), multi-stage Docker Slim build (`~160 MB`), and Debian Nginx TLS/PWA virtual-host template. |

---

## End-to-End Engineering & CAD Pipeline

```mermaid
flowchart LR
    subgraph Input["1. Parametric Inputs (BoxConfig)"]
        Dims["Dimensions & Fit<br/>(Product Fit vs Box ID)"]
        Struct["FEFCO 0200–0204<br/>Flute Wall + Grain"]
        Perf["13 SRP Patterns<br/>Dash / Non-Dash Rule"]
        Paper["3-Ply / 5-Ply Paper<br/>& Ink Coverage"]
    end

    subgraph Engines["2. Real-Time Computation Engines"]
        CAD["Dieline Vector Engine<br/>(1:1 mm SVG Geometry)"]
        BCT["BCT / TAPPI-ISO Engine<br/>(McKee + Derating + Cost)"]
        Sim3D["Three.js 3D Engine<br/>(Fold + Clearance + Tear)"]
        Pallet["Palletizer Pro 3D + Worker<br/>(Case-Pack + Stack Physics)"]
    end

    subgraph Audit["3. Pre-Flight Quality Gate"]
        Rules["8 Production Rules<br/>(Clearance, Flap, ITF-14,<br/>Glue Zone, Rule 8 SRP)"]
    end

    subgraph Output["4. Deliverables & Persistence"]
        Export["SVG / PDF Export<br/>Clean CAD vs Spec Sheet"]
        Sync["Per-Account VPS Sync<br/>Saved Projects & BCT History"]
    end

    Dims & Struct & Perf --> CAD & Sim3D
    Dims & Struct & Perf & Paper --> BCT
    Dims & BCT --> Pallet
    CAD & BCT --> Rules
    CAD --> Export
    BCT & Dims & Struct & Perf --> Sync
```

---

## Private Auth, Halftone Portal & WhatsApp Metadata Flow

```mermaid
sequenceDiagram
    autonumber
    actor User as Packaging Engineer / User
    participant UI as Halftone AuthGate UI
    participant WA as WhatsApp Admin (+6282125086328)
    participant API as Express + SQLite (server.ts)
    actor Admin as Admin (Users Console)

    User->>UI: Submit Register (Name, Email, Company, Password)
    UI->>UI: collectAccessMetadata() [Origin, URL, Device, PWA/Browser, TZ]
    UI->>API: POST /api/auth/register (+ clientMeta)
    API-->>UI: 201 Created { status: "pending" }
    Note over User,API: Login attempts return 403 ACCOUNT_PENDING until Admin activates

    User->>WA: Click WhatsApp CTA (carries Origin + Account Metadata)
    Admin->>API: Login & GET /api/admin/users
    API-->>Admin: User list with Access Origin, Device, IP & Saved Counts
    Admin->>API: PATCH /api/admin/users/:id/status { status: "active" }
    API-->>Admin: 200 OK

    opt Forgot Password (No Self-Service Reset)
        User->>WA: Click "Lupa Password · Hubungi Admin WhatsApp"
        Admin->>API: PATCH /api/admin/users/:id/password { password: "..." }
    end

    User->>API: POST /api/auth/login
    API-->>User: 200 OK + Set-Cookie: diecut_session (HttpOnly HMAC)
    User->>API: GET/POST /api/projects & /api/history (Synced across devices)
```

---

## Database Schema (Embedded SQLite WAL)

All persistent application state lives inside a single WAL-mode SQLite file (`data/diecut.db`) initialized automatically on server boot.

```mermaid
erDiagram
    USERS ||--o{ BCT_HISTORY : "owns (ON DELETE CASCADE)"
    USERS ||--o{ SAVED_PROJECTS : "owns (ON DELETE CASCADE)"

    USERS {
        string id PK "UUID v4"
        string name
        string email UK "Lowercase unique"
        string company
        string password_hash "16B salt hex : 64B scrypt hex"
        string role "admin | user"
        string status "pending | active | disabled"
        int token_version "Session revocation counter"
        int failed_login_count "Brute-force counter"
        string locked_until "ISO 8601 nullable lockout"
        string access_origin "Subdomain / origin URL"
        string access_path "Path + query string"
        string access_referrer
        string device_summary "OS · Browser"
        string timezone "IANA timezone"
        string last_ip "X-Forwarded-For aware"
        string created_at "ISO 8601"
        string last_login_at "ISO 8601 nullable"
    }

    BCT_HISTORY {
        string id PK "Entry ID"
        string user_id FK "References users.id"
        string label "Scenario / product label"
        string payload_json "Serialized BctHistoryEntry"
        string created_at "ISO 8601"
    }

    SAVED_PROJECTS {
        string id PK "UUID v4"
        string user_id FK "References users.id"
        string name "Project name"
        string box_style "FEFCO code (0200-0204)"
        string dims_summary "LxWxD mm"
        string config_json "Serialized BoxConfig"
        string updated_at "ISO 8601"
    }

    SYSTEM_META {
        string key PK "Config key (recovery/smtp/agent_key)"
        string value "Serialized value or hash"
        string updated_at "ISO 8601"
    }

    AUDIT_LOGS {
        string id PK "UUID v4"
        string event_type "Auth/Admin/Security event"
        string severity "info | warn | critical"
        string actor_email "Initiating account"
        string target_email "Affected account"
        string detail "Structured description"
        string ip_address "Client IP"
        string origin "Request origin"
        string created_at "ISO 8601"
    }
```

---

## Environment Configuration: Moving from Preview to Debian VPS

When moving out of Preview onto your **Debian VPS**, configuration varies between **Docker Compose** and **Node.js 22 + PM2**, and whether port `3000` is already used by another app.

### 1. Variable Comparison Matrix (Preview vs. Debian Docker vs. Debian PM2)

| Variable | Preview | VPS — Multi-Stage Docker Slim (~160 MB) | VPS — Debian Node.js v22 + PM2 | Behavior & Notes |
| :--- | :--- | :--- | :--- | :--- |
| **`IMAGE_TAG`** | *Unused* | `1.5.0` *(pinned release tag)* | *Not used* | Pins Docker image tag (`diecut-room:${IMAGE_TAG}`) for deterministic tag-based rollback. |
| **`HOST_PORT`** | `3000` *(unused)* | `3000` *(or `3001` if `3000` is busy)* | *Not used* | Docker Compose binds `127.0.0.1:${HOST_PORT}:3000` on the Debian host. |
| **`PORT`** | Auto-resolved (`3000`) | `3000` *(fixed inside container)* | `3000` *(or `3001` if `3000` is busy)* | Express listen port. Keep `3000` inside Docker; change `PORT` directly in PM2 mode. |
| **`NODE_ENV`** | `development` | `production` | `production` | Serves optimized `dist/` bundle + PWA Service Worker instead of Vite dev middleware. |
| **`SQLITE_PATH`** | `./data/diecut.db` | **`/app/data/diecut.db`** | **`/opt/diecut-room/data/diecut.db`** | In Docker, host `./data` mounts to `/app/data`, so `SQLITE_PATH` **must** use `/app/data/...`. |
| **`SESSION_SECRET`** | Dev test secret | Fresh `openssl rand -hex 32` | Fresh `openssl rand -hex 32` | **Never reuse** preview secrets in production. Signs `diecut_session` HMAC cookies. |
| **`ADMIN_EMAIL`** | `totale.room@gmail.com` | Your Admin email | Your Admin email | Seeded once on first boot if no `'admin'` row exists yet. |
| **`ADMIN_INITIAL_PASSWORD`** | `DieCutAdmin2026!` | Strong unique production password | Strong unique production password | Used **only** when creating the initial Admin row on a fresh DB. |
| **`VITE_WHATSAPP_ADMIN`** | `6282125086328` | `6282125086328` *(no `+`)* | `6282125086328` *(no `+`)* | **Build-time variable**: baked into JS during `docker compose build` / `npm run build`. |
| **`TRUST_PROXY`** | `true` | `true` | `true` | Required so Express trusts Nginx's `X-Forwarded-Proto: https` & `X-Forwarded-For` headers. |

---

### 2. Production `.env` Templates (`/opt/diecut-room/.env`)

Generate a cryptographic secret on your Debian VPS:
```bash
openssl rand -hex 32
```

#### Option A — Debian Multi-Stage Docker Compose (`/opt/diecut-room/.env`)
```env
IMAGE_TAG=1.5.0
HOST_PORT=3000
PORT=3000
NODE_ENV=production
SQLITE_PATH=/app/data/diecut.db
SESSION_SECRET=replace_with_64_char_hex_from_openssl_rand
ADMIN_EMAIL=totale.room@gmail.com
ADMIN_INITIAL_PASSWORD=ReplaceWithStrongProdAdminPassword!
VITE_WHATSAPP_ADMIN=6282125086328
TRUST_PROXY=true
```

#### Option B — Debian Node.js v22 + PM2 (`/opt/diecut-room/.env`)
```env
PORT=3000
NODE_ENV=production
SQLITE_PATH=/opt/diecut-room/data/diecut.db
SESSION_SECRET=replace_with_64_char_hex_from_openssl_rand
ADMIN_EMAIL=totale.room@gmail.com
ADMIN_INITIAL_PASSWORD=ReplaceWithStrongProdAdminPassword!
VITE_WHATSAPP_ADMIN=6282125086328
TRUST_PROXY=true
```

> [!IMPORTANT]
> **Debian Bare-Metal (`NODE_ENV=production`) & Footprint Notes**:
> - In production (`NODE_ENV=production`), `server.ts` only loads `express`, `dotenv`, and built-in `node:sqlite`. The **Multi-Stage `Dockerfile`** separates frontend compilation (`builder`) from runtime (`runner`), yielding an **~160 MB** image with a **256 MB container memory limit** (`NODE_OPTIONS=--max-old-space-size=192`) and **~65–110 MB RSS** runtime usage.
> - On bare-metal PM2, always run `npm ci --include=dev` before `npm run lint && npm run build`, then optionally `npm prune --omit=dev && npm cache clean --force` to save disk. Debian 12 Bookworm's default APT `nodejs` is v18 (too old for `node:sqlite`); use **Docker Compose** or **Node.js v22 LTS** via NodeSource.

---

## Quick Start & Debian VPS Deployment

### Local Development
Requires **Node.js v22+** (`node:sqlite` and native `.ts` execution are built-in).

```bash
npm install
cp .env.example .env
npm run dev
```

Verify types, production build, codebase index, and documentation parity:
```bash
npm run lint                   # tsc --noEmit
npm run build                  # Vite + Workbox PWA bundle -> ./dist
npm run index:build            # Regenerate docs/CODEBASE_INDEX.md (zero-dep)
npm run docs:check -- --strict # Zero-dependency Node 22+ docs & index drift audit
npm run admin:reset -- --help  # Emergency Admin password / recovery key CLI
```

### Multi-App Ecosystem (Astro Landing Hub → DieCut.Room Subdomain)
When linking **DieCut.Room** from a main **Astro** landing page (`https://totaleroom.com`), deploy it on its own subdomain (`https://diecut.totaleroom.com`) rather than a subpath (`/diecut`) so PWA Service Workers, cookies, and releases stay cleanly isolated:
- **Path A — Monolith VPS (Recommended, zero AI credits)**: Run `Dockerfile` Slim (`~160 MB`) or PM2 on your Debian VPS behind Nginx TLS (`VITE_API_BASE_URL` empty, same-origin).
- **Path B — Split Deploy (Optional Vercel Frontend + VPS Backend)**: Deploy the Vite SPA to Vercel (`vercel.json`) with `VITE_API_BASE_URL=https://api-diecut.totaleroom.com`, and set `CORS_ALLOWED_ORIGINS=https://diecut.totaleroom.com` on your Debian VPS `server.ts`.

### Debian VPS Production Deployment (Summary)
1. **DNS**: Point an `A` record for your subdomain (e.g., `diecut.totaleroom.com`) to your Debian VPS public IPv4.
2. **Audit Existing VPS Services & Disk/RAM**: Check free disk/RAM (`df -h / && free -m`), occupied ports (`ss -tulpn`), and active Nginx sites (`/etc/nginx/sites-enabled/`) so existing apps/containers remain untouched.
3. **Configure `.env`**: Clone repo to `/opt/diecut-room`, create `.env` using Option A or B (`chmod 600 .env`), and ensure `data/` exists (`chmod 700 data`).
4. **Boot Runtime**:
   - **Docker Slim (Recommended when free disk ≥ 3 GB)**: `docker compose build --no-cache && docker compose up -d && docker builder prune -f`
   - **Node 22 + PM2 (Minimal disk)**: `npm ci --include=dev && npm run lint && npm run build && npm prune --omit=dev && NODE_ENV=production pm2 start server.ts --name diecut-room --interpreter node --max-memory-restart 220M`
5. **Debian Nginx (`sites-available`) + Certbot HTTPS**: Add `/etc/nginx/sites-available/diecut-room` from [`deploy/nginx-diecut.conf`](./deploy/nginx-diecut.conf), symlink to `sites-enabled/`, run `sudo nginx -t && sudo systemctl reload nginx`, and issue TLS via `sudo certbot --nginx -d diecut.totaleroom.com`.

> **Opening this repo with an AI Coding Agent (ADE / Antigravity / Cursor / Codex / Claude / Vercel / Lovable)?**  
> Read [`DESIGN.md`](./DESIGN.md), [`docs/STATUS.md`](./docs/STATUS.md), and [`docs/CODEBASE_INDEX.md`](./docs/CODEBASE_INDEX.md) first to save tokens/credits and preserve exact visual fidelity.

---

## Typography Drop-In (Timeless Grotesk) & PWA Resilience

- **Timeless Grotesk Drop-In (`public/fonts/`)**: Place licensed `TimelessGrotesk.woff2` (or weight files `-Regular.woff2`, `-Medium.woff2`, `-SemiBold.woff2`, `-Bold.woff2`) inside [`public/fonts/`](./public/fonts/README.md) **before** `npm run build` / `docker compose build`. At runtime, `GET /api/fonts/available` discovers present files with zero 404 console errors when empty, falling back cleanly to `Plus Jakarta Sans` and `JetBrains Mono`.
- **Resilient Workbox PWA ([`vite.config.ts`](./vite.config.ts) + [`index.html`](./index.html) + [`src/utils/lazyWithRetry.ts`](./src/utils/lazyWithRetry.ts))**:
  - Uses `NetworkFirst` for HTML navigations (`navigateFallback: null`), `CacheFirst` for immutable `/assets/*` bundles, and strict `NetworkOnly` for `/api/*`.
  - Production Express serves explicit `404` on missing `/assets/*` or `/fonts/*` files (never returning HTML masquerading as JS/CSS), paired with an `index.html` boot-recovery watchdog and `lazyWithRetry.ts` dynamic-import reload guard.
  - Nginx serves `/sw.js`, `/registerSW.js`, `/manifest.webmanifest`, and `/index.html` with `Cache-Control: no-cache, no-store, must-revalidate`.

---

## Complete Documentation Index

Detailed operational guides, engineering derivations, API contracts, and runbooks are maintained inside the repository (written in Indonesian for team & VPS operations):

| Document | Scope |
| :--- | :--- |
| **[`DESIGN.md`](./DESIGN.md)** | **Product Visual Contract**: Exact Precision Tactile Studio color tokens, typography, radii, Halftone Offset-Sheet Auth portal, 4-tier responsive rules, and PDF branding for all AI builders. |
| **[`docs/STATUS.md`](./docs/STATUS.md)** | **Certified Single Source of Truth**: `verified_at_commit`, Capability Ledger (`IMPLEMENTED` vs `NOT PRESENT`), entrypoint map, visual design anchor, 5-table SQLite & env summary, and Known Gaps. |
| **[`docs/CODEBASE_INDEX.md`](./docs/CODEBASE_INDEX.md)** | **Auto-Generated Credit-Saver Index**: Deterministic map of all modules, exported symbols, large-file line anchors, and all 43 Express `/api/*` route line numbers (`npm run index:build`). |
| **[`AGENTS.md`](./AGENTS.md)** | Universal AI Agent & Debian VPS contract: First-Scan protocol, Truth Order, cross-builder credit-saving rules, Astro Hub subdomain topology, multi-app VPS coexistence rules, and Go-Live proof. |
| **[`docs/01-USER-GUIDE.md`](./docs/01-USER-GUIDE.md)** | End-to-end User & Admin handbook: Halftone Login Gate, WhatsApp metadata, Admin Console, 2D FEFCO CAD, 13 SRP presets, 3D Fit & Tear simulator, Palletizer Pro 3D, Responsive Focus Mode/Landscape HUD, SVG/PDF export, and BCT Pro. |
| **[`docs/02-ENGINEERING-FORMULAS.md`](./docs/02-ENGINEERING-FORMULAS.md)** | Paper grade catalog (up to K300/White Top/Semi-Chem), TUF tables, TAPPI/ISO vs. BCT Pro ECT & McKee equations, panel ink crush math, 8 Pre-Flight rules, Palletizer case-pack/stability physics, and costing formulas. |
| **[`docs/03-VPS-SUBDOMAIN-DEPLOYMENT.md`](./docs/03-VPS-SUBDOMAIN-DEPLOYMENT.md)** | Manual Debian VPS setup: DNS `A` record, Docker Compose vs. PM2 (`npm ci --include=dev`), Debian Nginx `sites-available` + Certbot SSL, UFW firewall, PWA install, custom font drop-in, and SQLite backups (`sqlite3` & Node `VACUUM INTO`). |
| **[`docs/04-DEVELOPER-ARCHITECTURE.md`](./docs/04-DEVELOPER-ARCHITECTURE.md)** | Developer internals: system data flow, adaptive WebGL engine, `apiSession.ts` + `lazyWithRetry.ts`, 5-table SQLite WAL schemas, dual Cookie+Bearer auth, Workbox routing, and feature extension guides. |
| **[`docs/05-AI-AGENT-VPS-RUNBOOK.md`](./docs/05-AI-AGENT-VPS-RUNBOOK.md)** | Executable AI Agent runbook for Debian VPS after `git pull`: conflict audit, Node/Docker selection, `.env` & port isolation, Nginx `sites-available` + SSL setup, `curl` E2E smoke tests, backup cron, `git pull` update/rollback, and Go-Live checklist. |
| **[`docs/06-API-REFERENCE.md`](./docs/06-API-REFERENCE.md)** | Complete REST & MCP API contract (all 43 `/api/*` routes: health, fonts, auth, recovery key/OTP, 4-tab admin ops, backups, Hermes Agent REST, MCP, history, and projects) with JSON payloads and error codes. |
| **[`docs/07-TROUBLESHOOTING-AND-SECURITY.md`](./docs/07-TROUBLESHOOTING-AND-SECURITY.md)** | Day-2 operations: Admin recovery (`admin:reset` / `node:sqlite` + `scrypt`), Nginx rate-limiting (`limit_req`), Debian & production error matrix, and cross-VPS SQLite migration. |
| **[`docs/08-GITHUB-SETUP-AND-CHANGELOG.md`](./docs/08-GITHUB-SETUP-AND-CHANGELOG.md)** | GitHub push hygiene, read-only SSH Deploy Key setup for private repos, release tagging, and complete version changelog (`v1.0.0` – `Unreleased post-v1.5.0`). |
