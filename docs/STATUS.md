---
verified_at_commit: working-tree-post-d6ae118
verified_at_date: 2026-11-24
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
  - `scripts/check-docs-drift.ts` (`npm run docs:check`) — detektor drift dokumentasi, indeks & katalog visual (7 cek) tanpa dependensi.
  - `scripts/capture-visual-snapshots.ts` (`npm run snapshots:capture`) — perekam 27 tangkapan layar asli Desktop (`1440×900`) & Mobile (`390×844`) via Chromium headless CDP ke `docs/visual-snapshots/`.

---

## 3. Visual Design System Anchor

- **Kontrak Visual Root**: [`DESIGN.md`](../DESIGN.md) *(otomatis dibaca oleh AI app builders: Vercel/v0, Lovable, Cursor, ADE Antigravity, Codex, Claude)*.
- **Katalog Visual Live (`Ground Truth`)**: [`docs/VISUAL-STATE-CATALOG.md`](./VISUAL-STATE-CATALOG.md) *(21 tangkapan layar asli Desktop `1440×900` + 6 Mobile `390×844` di `docs/visual-snapshots/`, direkam otomatis via `npm run snapshots:capture`)*.
- **Design Skill Kanonis**: `.agents/skills/tactile-design/SKILL.md` *(satu-satunya sumber skill; duplikasi lama `agent/skills/` telah dihapus)*.
- **Design Tokens**: `src/index.css` (**Precision Tactile Studio** — `--root-ink-12: #17191F`, `--root-ink-11: #474D58`, `--root-ink-10: #5C626E`, `--root-ink-6: #CDD2DB`, `--root-ink-3: #ECEEF1`, `--root-ink-2: #F4F5F7`, `--accent-9: #4F46E5`).
- **UI Primitives**: `src/components/tactile/TactileUI.tsx`.
- **Auth Portal**: `src/components/AuthGate.tsx`, `src/components/HalftoneSheetDecor.tsx`, `src/components/InteractiveMatrixCanvas.tsx` (kartu offset-sheet matte bersudut tajam `2px`).
- **Tipografi & Aset**:
  - Font opsional berlisensi: `public/fonts/TimelessGrotesk*.woff2` (fallback `Plus Jakarta Sans` + `JetBrains Mono`).
  - Logo produksi resmi: `public/assets/aistudio/Asset_2_5ca58983.svg` (Totale.Room, satu-satunya berkas produksi di folder tersebut setelah 26 lampiran diskusi lama dibersihkan).

---

## 4. Capability Ledger

| Domain | Status | Referensi Modul Utama |
| :--- | :--- | :--- |
| **2D Dieline CAD (FEFCO 0200–0204, 1:1 mm SVG/PDF, ITF-14) & Single-Row Slim Toolbar** | `IMPLEMENTED` | `src/utils/dieline.ts`, `src/components/BoxPreview.tsx` — toolbar 2D satu baris tipis adaptif (`40px`, *Zoom*, *Layers*, *Spec sheet / Clean CAD*) bebas wrap di semua layar untuk memaksimalkan luas kanvas 2D |
| **13 SRP Supermarket Patterns (Dash / Non-Dash Rules)** | `IMPLEMENTED` | `src/types.ts`, `src/utils/dieline.ts`, `src/components/Sidebar.tsx` |
| **3D Fit & Interactive SRP Tear Simulator (0–100%)** | `IMPLEMENTED` | `src/components/Box3DViewer.tsx`, `src/utils/browserEngine.ts` — kamera default isometrik *zoom-out* yang lega agar seluruh box terlihat utuh sejak awal |
| **Palletizer Pro 3D + Off-Thread Web Worker Solver, Zero-Overhang, Flush Perimeter, Compact 2×2 Pattern Picker & Weight-Driven Heat-Map** | `IMPLEMENTED` | `src/components/PalletizerWorkspace.tsx`, `src/utils/palletizer.ts`, `src/workers/palletizer.worker.ts` — 2 tab terfokus (**Palet** & **Armada**, tab *Case* & *X-Ray* dihapus), input tersinkronisasi **Berat Nett Produk (default `1.0 kg`)** yang langsung menggerakkan beban tumpukan, warna **3D Heat-Map** berbasis rasio stres tekan, dan **2–3 kandidat material bertahap anti-overspec** (`Paling Pas`, `Seimbang`, `Cadangan`), strip tag status (*Inset*, *Celah*, *AMAN/OVERLOAD*) di luar tepat di atas kartu HUD bebas terpotong, kamera default isometrik *zoom-out*, kunci Zero-Overhang (`-50` s.d. `0 mm/sisi`), Perataan Sisi Luar 3-Mode (`Auto`/`Rata Sisi`/`Rapat`), serta Grid `2×2` Pola Susunan ringkas |
| **Export Laporan Engineering PDF Palletizer (A4 2–3 Halaman Orthographic) & Unified Header Export (PDF & SVG)** | `IMPLEMENTED` | `src/utils/palletizerReportPdf.ts`, `src/components/PalletizerWorkspace.tsx`, `src/App.tsx` — satu pintu tombol **Export** di header kanan atas (sebelah kiri `···`, tanpa duplikasi di 2D/Palletizer lintas perangkat) dengan popover 4 pilihan terkelompok (*Dieline CAD PDF 1:1 mm*, *Dieline CAD SVG 1:1 mm*, *Laporan Palletizer A4*, *Vektor Kemasan AI*), 4 POV Orthographic (`Iso`, `Top`, `Front`, `Side`), bingkai zona aman *Underhang Inset* & anotasi celah tengah (`mm`), panel Heat-Map Iso/Top, branding DieCut.Room + Totale.Room, serta **Halaman 3 otomatis** denah armada/kontainer vektor 2D (*Pakai Palet* maupun *Floor Loading* + perbandingan kapasitas) |
| **Simulasi Armada, Kontainer Indonesia & Floor Loading (Palet vs Tanpa Palet)** | `IMPLEMENTED` | `src/utils/vehicleLoading.ts`, `src/components/VehicleLoadingBlueprint.tsx`, `src/components/PalletizerWorkspace.tsx`, `src/types.ts` — 11 preset aktual Indonesia (`20'/40' GP`, `40' HC`, `20'/40' HC Reefer`, `CDE/CDD/CDD Long/Fuso/Tronton Box & Wingbox`) + `Custom`, toggle **Pakai Palet vs Floor Loading (Tanpa Palet)** lengkap dengan kartu perbandingan kapasitas (`Δ dus`, `Δ%`, utilisasi volume, durasi muat *forklift* vs manual), sinkronisasi otomatis `maxStackHeightMm` (`1 Tier`/`2 Tier`/`Auto`) terhadap *door-header* & *Red Load Line*, audit BCT lapisan bawah & *Dunnage/Airbag*, serta denah interaktif 2D *Top* & *Side View* |
| **Export Vektor Kemasan Siap-Illustrator (PDF & SVG Line-Art Transparan)** | `IMPLEMENTED` | `src/utils/palletizerVectorExport.ts`, `src/components/PalletizerWorkspace.tsx` — proyeksi *Top View* (Layer Ganjil/Genap + papan palet terpotong rapi) & *Isometrik 30°* dengan *Analytic Hidden-Line Removal (HLR)* transparan (`fill="none"`, `#000000`), deduplikasi garis pertemuan, 3 panel *shipping mark* (*Pallet Pattern*, *Do Not Place on Floor*, *Max Stacking*), toggle bingkai/teks & stroke, pratinjau simulasi kraft, serta unduh Vector PDF & SVG bergrup layer AI |
| **BCT TAPPI/ISO Engine (Kalibrasi Iklim & Distribusi Indonesia) + 8 Pre-Flight Auto-Fix** | `IMPLEMENTED` | `src/utils/engineering.ts`, `src/components/BCTInspectorRail.tsx`, `src/components/EngineeringSheet.tsx` — mesin tunggal **TAPPI / ISO Calibrated** (BCT Pro Legacy & Sheet Batch Costing dihapus), default operasional Indonesia (`75% RH` kurva non-linear FBA/BMKG `50–95%`, `SF 4:1`, `Handling Risk ×0.82`), input tersinkronisasi **Berat Nett Produk** (`default 1.0 kg`), dan 8 aturan Pre-Flight Auto-Fix |
| **3-Unit Workspace (`mm`, `cm`, `in`), 4-Tier Responsive, Focus Mode & Mobile Genie Sheet** | `IMPLEMENTED` | `src/App.tsx`, `src/hooks/useWorkspaceLayout.ts`, `src/components/MobileGenieSheet.tsx`, `src/index.css` — animasi *Genie-on-the-Lamp* pada mode mobile portrait yang memunculkan panel `Specs`/`Pallet` dan `BCT` mengalir dari tombol *Floating Thumb Dock* ke posisi *center* layar (dengan *reverse retract* & dukungan `prefers-reduced-motion`) |
| **Auth Dual Cookie (`Partitioned` HttpOnly) + Bearer Token + Lockout** | `IMPLEMENTED` | `server.ts`, `src/utils/apiSession.ts`, `src/components/AuthGate.tsx` |
| **Admin Recovery Key + SMTP Email OTP + CLI Emergency Reset** | `IMPLEMENTED` | `server.ts`, `scripts/admin-reset.ts`, `src/components/AuthGate.tsx` |
| **4-Tab Admin Console (Users, Health Radar, Audit Logs, Security/SMTP/Agent/Backups)** | `IMPLEMENTED` | `src/components/AdminUsersModal.tsx`, `server.ts` |
| **Hermes Agent REST API (`/api/agent/*`) & MCP Server (`/api/mcp`)** | `IMPLEMENTED` | `server.ts` (calculate, dieline 2D SVG/Clean CAD, signed download, JSON-RPC MCP) |
| **PWA Workbox + Chunk Load Error Recovery** | `IMPLEMENTED` | `vite.config.ts`, `index.html`, `src/utils/lazyWithRetry.ts` |
| **Split-Deploy & Astro Hub Subdomain Readiness (`VITE_API_BASE_URL` + CORS Allowlist)** | `IMPLEMENTED` | `src/utils/apiSession.ts`, `src/utils/fontLoader.ts`, `src/components/AuthGate.tsx`, `server.ts`, `vercel.json` |
| **Automated Codebase Index, Visual Catalog, Master Prompt & Docs Drift Guard** | `IMPLEMENTED` | `DESIGN.md`, `docs/VISUAL-STATE-CATALOG.md`, `docs/09-ONE-SHOT-MASTER-PROMPT-TEMPLATE.md`, `docs/CODEBASE_INDEX.md`, `scripts/generate-codebase-index.ts`, `scripts/capture-visual-snapshots.ts`, `scripts/check-docs-drift.ts`, `.github/workflows/docs-drift.yml` |
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
- `dev` (`tsx server.ts`) · `build` (`vite build`) · `start` (`node server.ts`) · `preview` (`vite preview`) · `clean` (`rm -rf dist server.js`) · `lint` (`tsc --noEmit`) · `admin:reset` (`node scripts/admin-reset.ts`) · `docs:check` (`node scripts/check-docs-drift.ts`) · `index:build` (`node scripts/generate-codebase-index.ts`) · `snapshots:capture` (`node scripts/capture-visual-snapshots.ts`)

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
