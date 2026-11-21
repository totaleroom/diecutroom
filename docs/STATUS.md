---
verified_at_commit: working-tree-post-d6ae118
verified_at_date: 2026-11-20
app_version: 1.5.0
lint_and_build_status: VERIFIED (tsc --noEmit & vite build pass)
automated_tests: NOT PRESENT
---

# DieCut.Room — Certified Project Status (`Single Source of Truth`)

Dokumen ringkas ini adalah **jangkar kebenaran tunggal** untuk setiap AI Agent (ADE, Antigravity, Codex, Claude Code, Cursor, maupun VPS Ops Agent) dan kolaborator sebelum membaca dokumen panjang `docs/01`–`08`.

## 1. Truth Order & Fast First-Scan (< 5 detik)

Urutan prioritas jika terjadi perbedaan informasi:
1. **Kode sumber aktual di `HEAD`** (`server.ts`, `src/*`, `package.json`, `Dockerfile`)
2. **`git diff <verified_at_commit>..HEAD`** *(bila berada di dalam git clone)*
3. **`docs/STATUS.md`** *(dokumen ini)*
4. **`AGENTS.md`** & **`.agents/rules/project.md`**
5. **Referensi mendalam `docs/01`–`08` & `README.md`**

Jalankan perintah zero-dependency berikut (Node 22+, tidak butuh `node_modules`) untuk mendeteksi *drift* antara kode dan dokumentasi:
```bash
node scripts/check-docs-drift.ts
# atau via npm:
npm run docs:check
# mode ketat (exit code 1 bila ada drift):
npm run docs:check -- --strict
```

---

## 2. Codebase & Entrypoint Map

- **Backend & Static/Vite Host**: `server.ts` — Express 4 + `http.createServer` (instant port bind), embedded `node:sqlite` (`DatabaseSync`, WAL mode), Cookie HMAC-SHA256 + Bearer token auth, 43 endpoint `/api/*`, Hermes Agent REST (`/api/agent/*`), dan MCP (`/api/mcp`).
- **Frontend SPA Entry**: `index.html` (dengan SW boot-recovery watchdog) → `src/main.tsx` → `src/App.tsx` (lazy routes dengan `src/utils/lazyWithRetry.ts`, unit workspace `mm`/`cm`/`in`, 4-tier responsive layout via `src/hooks/useWorkspaceLayout.ts`).
- **2D CAD & BCT Engines**: `src/utils/dieline.ts` (FEFCO 0200–0204 + 13 SRP + GS1 ITF-14), `src/utils/engineering.ts` (TAPPI/ISO vs BCT Pro + 8 Pre-Flight rules + costing).
- **3D & Palletizer Engines**: `src/components/Box3DViewer.tsx` (Three.js Fold & SRP Tear), `src/components/PalletizerWorkspace.tsx` + `src/utils/palletizer.ts` + Web Worker `src/workers/palletizer.worker.ts` + `src/utils/palletizerReportPdf.ts` (Export Laporan Engineering PDF A4 2 Halaman Orthographic).
- **Session & Adaptive Utils**: `src/utils/apiSession.ts` (`authFetch` + Bearer token persistence), `src/utils/browserEngine.ts` (adaptive GPU/DPR), `src/utils/fontLoader.ts` (zero-404 `Timeless Grotesk` loader).
- **CLI Utilities (Node 22+ native TS)**:
  - `scripts/admin-reset.ts` (`npm run admin:reset`) — pemulihan darurat password/recovery key Admin langsung ke SQLite.
  - `scripts/generate-codebase-index.ts` (`npm run index:build`) — generator indeks simbol, rentang baris file besar, & peta 43 endpoint ke `docs/CODEBASE_INDEX.md`.
  - `scripts/check-docs-drift.ts` (`npm run docs:check`) — detektor drift dokumentasi & indeks tanpa dependensi.

---

## 3. Visual Design System Anchor

- **Kontrak Visual Root**: [`DESIGN.md`](../DESIGN.md) *(otomatis dibaca oleh AI app builders: Vercel/v0, Lovable, Cursor, ADE Antigravity, Codex, Claude)*.
- **Design Skill Kanonis**: `.agents/skills/tactile-design/SKILL.md` *(satu-satunya sumber skill; duplikasi lama `agent/skills/` telah dihapus)*.
- **Design Tokens**: `src/index.css` (**Precision Tactile Studio** — `--root-ink-12: #17191F`, `--root-ink-11: #474D58`, `--root-ink-10: #5C626E`, `--root-ink-6: #CDD2DB`, `--root-ink-3: #ECEEF1`, `--root-ink-2: #F4F5F7`, `--accent-9: #4F46E5`).
- **UI Primitives**: `src/components/tactile/TactileUI.tsx`.
- **Auth Portal**: `src/components/AuthGate.tsx`, `src/components/HalftoneSheetDecor.tsx`, `src/components/InteractiveMatrixCanvas.tsx` (kartu offset-sheet matte bersudut tajam `2px`).
- **Tipografi & Aset**:
  - Font opsional berlisensi: `public/fonts/TimelessGrotesk*.woff2` (fallback `Plus Jakarta Sans` + `JetBrains Mono`).
  - Logo produksi resmi: `public/assets/aistudio/Asset_2_5ca58983.svg` (Totale.Room, dirender di header kanan laporan PDF Palletizer). Lampiran PDF/PNG lain di `public/assets/aistudio/` adalah referensi diskusi/audit, bukan aset runtime aplikasi.

---

## 4. Capability Ledger

| Domain | Status | Referensi Modul Utama |
| :--- | :--- | :--- |
| **2D Dieline CAD (FEFCO 0200–0204, 1:1 mm SVG/PDF, ITF-14)** | `IMPLEMENTED` | `src/utils/dieline.ts`, `src/components/BoxPreview.tsx` |
| **13 SRP Supermarket Patterns (Dash / Non-Dash Rules)** | `IMPLEMENTED` | `src/types.ts`, `src/utils/dieline.ts`, `src/components/Sidebar.tsx` |
| **3D Fit & Interactive SRP Tear Simulator (0–100%)** | `IMPLEMENTED` | `src/components/Box3DViewer.tsx`, `src/utils/browserEngine.ts` |
| **Palletizer Pro 3D + Off-Thread Web Worker Solver** | `IMPLEMENTED` | `src/components/PalletizerWorkspace.tsx`, `src/utils/palletizer.ts`, `src/workers/palletizer.worker.ts` |
| **Export Laporan Engineering PDF Palletizer (A4 2 Halaman Orthographic)** | `IMPLEMENTED` | `src/utils/palletizerReportPdf.ts`, `src/components/PalletizerWorkspace.tsx` — 4 POV Orthographic (`Iso`, `Top`, `Front`, `Side`), warna kontras orientasi `0°/90°`, dimensi vektor `L×W×T`, panel Heat-Map Iso/Top, panduan 2D Layer 1 & Layer 2 bernomor, branding DieCut.Room + Totale.Room |
| **BCT Pro & TAPPI/ISO Dual Engine + 8 Pre-Flight Auto-Fix** | `IMPLEMENTED` | `src/utils/engineering.ts`, `src/components/BCTInspectorRail.tsx`, `src/components/EngineeringSheet.tsx` |
| **3-Unit Workspace (`mm`, `cm`, `in`) & 4-Tier Responsive + Focus Mode** | `IMPLEMENTED` | `src/App.tsx`, `src/hooks/useWorkspaceLayout.ts` |
| **Auth Dual Cookie (`Partitioned` HttpOnly) + Bearer Token + Lockout** | `IMPLEMENTED` | `server.ts`, `src/utils/apiSession.ts`, `src/components/AuthGate.tsx` |
| **Admin Recovery Key + SMTP Email OTP + CLI Emergency Reset** | `IMPLEMENTED` | `server.ts`, `scripts/admin-reset.ts`, `src/components/AuthGate.tsx` |
| **4-Tab Admin Console (Users, Health Radar, Audit Logs, Security/SMTP/Agent/Backups)** | `IMPLEMENTED` | `src/components/AdminUsersModal.tsx`, `server.ts` |
| **Hermes Agent REST API (`/api/agent/*`) & MCP Server (`/api/mcp`)** | `IMPLEMENTED` | `server.ts` (calculate, dieline 2D SVG/Clean CAD, signed download, JSON-RPC MCP) |
| **PWA Workbox + Chunk Load Error Recovery** | `IMPLEMENTED` | `vite.config.ts`, `index.html`, `src/utils/lazyWithRetry.ts` |
| **Split-Deploy & Astro Hub Subdomain Readiness (`VITE_API_BASE_URL` + CORS Allowlist)** | `IMPLEMENTED` | `src/utils/apiSession.ts`, `src/utils/fontLoader.ts`, `src/components/AuthGate.tsx`, `server.ts`, `vercel.json` |
| **Automated Codebase Index & Docs Drift Guard** | `IMPLEMENTED` | `DESIGN.md`, `docs/CODEBASE_INDEX.md`, `scripts/generate-codebase-index.ts`, `scripts/check-docs-drift.ts`, `.github/workflows/docs-drift.yml` |
| **Automated Unit / E2E Test Suite (`npm test`)** | `NOT PRESENT` | Tidak ada test runner di `package.json`; verifikasi via `npm run lint`, `npm run build`, & `npm run docs:check -- --strict` |

---

## 5. SQLite Schema, Scripts & Runtime Environment Summary

### Tabel SQLite (`data/diecut.db`, mode WAL, `node:sqlite`)
1. `users` — akun, peran, status, metadata asal akses, plus kolom migrasi keamanan: `token_version`, `failed_login_count`, `locked_until`
2. `bct_history` — riwayat skenario BCT per `user_id` (`ON DELETE CASCADE`)
3. `saved_projects` — konfigurasi lengkap `BoxConfig` per `user_id` (`ON DELETE CASCADE`)
4. `system_meta` — konfigurasi persisten admin (`recovery_key_hash`, `smtp_config`, `agent_api_key_hash`, dll.)
5. `audit_logs` — jejak audit login, lockout, perubahan status/password, backup, dan rotasi kunci

### Skrip `package.json`
- `dev` (`tsx server.ts`) · `build` (`vite build`) · `start` (`node server.ts`) · `preview` (`vite preview`) · `clean` (`rm -rf dist server.js`) · `lint` (`tsc --noEmit`) · `admin:reset` (`node scripts/admin-reset.ts`) · `docs:check` (`node scripts/check-docs-drift.ts`) · `index:build` (`node scripts/generate-codebase-index.ts`)

### Variabel Environment Runtime & Build
- **Core Runtime**: `PORT`, `SQLITE_PATH`, `SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_INITIAL_PASSWORD`, `ADMIN_RECOVERY_KEY`, `TRUST_PROXY`, `MEMORY_LIMIT_MB`, `CORS_ALLOWED_ORIGINS` *(opsional, khusus Split-Deploy)*
- **Opsional SMTP Email OTP**: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- **Build-Time & Docker Compose**: `VITE_WHATSAPP_ADMIN`, `VITE_API_BASE_URL` *(opsional, khusus Split-Deploy Vercel+VPS)*, `IMAGE_TAG`, `HOST_PORT`

---

## 6. Known Gaps & Platform Notes

- **Integrasi Landing Page Utama Astro (Totale.Room Suite)**: DieCut.Room dirancang berjalan pada **subdomain tersendiri** (mis. `https://diecut.totaleroom.com`) yang ditautkan dari Landing Page Astro utama (`https://totaleroom.com`), bukan di-proxy pada subpath `/diecut`, agar Service Worker PWA, cookie sesi, dan siklus rilis tetap terisolasi bersih.
- **`automated_tests: NOT PRESENT`**: Belum ada suite unit/integration test otomatis; gunakan `npm run lint`, `npm run build`, dan `npm run docs:check -- --strict`.
- **`metadata.json` (Google AI Studio Platform File)**: Nama lama (`DieCut.Studio`) dan kapabilitas di `metadata.json` sengaja dipertahankan untuk kompatibilitas runtime Google AI Studio — jangan diubah tanpa alasan eksplisit dari pemilik proyek.
- **`package-lock.json` Cross-Platform Optional Deps**: Jika `npm ci --include=dev` gagal pada platform Linux x64 tertentu akibat optional deps (`@esbuild/*`, `lightningcss-*`, `@rollup/rollup-*`), jalankan `npm install --include=dev --no-audit --no-fund` (seperti di `.agents/environment.json`) atau regenerasi `package-lock.json` pada lingkungan dengan akses npm registry penuh.

---

## 7. Post-Commit Maintenance Protocol

Setiap kali commit mengubah struktur modul, route `/api/*`, tabel/kolom SQLite, variabel `process.env`, skrip `package.json`, `Dockerfile`, atau fitur utama:
1. Jalankan `npm run index:build` untuk menyegarkan `docs/CODEBASE_INDEX.md`.
2. Perbarui `docs/STATUS.md` (termasuk `verified_at_commit` & `verified_at_date` saat commit ke Git) dan dokumen terdampak (`docs/06-API-REFERENCE.md`, `docs/04-DEVELOPER-ARCHITECTURE.md`, `.env.example`).
3. Jalankan `npm run docs:check -- --strict` dan pastikan keluar dengan status `0`.
4. Jalankan `npm run lint && npm run build` pada lingkungan dengan `node_modules` sebelum rilis produksi.
