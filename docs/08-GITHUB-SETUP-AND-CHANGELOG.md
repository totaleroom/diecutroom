# 08. Panduan Setup GitHub (SSH / PAT), Push Bersih & Changelog Rilis

Panduan menyiapkan repositori GitHub pribadi/tim secara aman agar kode sumber **DieCut.Room** dapat didorong (*push*) dari mesin pengembangan dan ditarik (*pull*) secara otomatis oleh **AI Agent** di server VPS Debian produksi.

---

## 1. Checklist Keamanan Sebelum Push Pertama ke GitHub

Sebelum menjalankan `git push`, pastikan tidak ada kredensial sensitif, file database lokal, maupun artefak cache dev yang terunggah ke repositori:

```bash
# 1. Periksa status file yang siap di-commit
git status

# 2. Pastikan file sensitif & cache dev TIDAK terlacak oleh Git
git ls-files | grep -E '(^\.env|^data/|\.db|\.session_secret$|^dev-dist/|^\.tmp)' \
  && echo "BAHAYA: Hapus dari git index dengan git rm --cached!" \
  || echo "AMAN: Tidak ada secret, SQLite DB, atau cache dev yang terlacak."
```

Aturan `.gitignore` sudah dikonfigurasi untuk mengecualikan:
- `.env*` *(kecuali `!.env.example` sebagai template tanpa rahasia)*
- `data/`, `*.db`, `*.db-wal`, `*.db-shm`, `.session_secret`
- `node_modules/`, `dist/`, `dev-dist/`, `build/`, `*.log`, `*.tsbuildinfo`, `.tmp*`

---

## 2. Langkah Push Repositori ke GitHub (Dari Mesin Lokal)

### Opsi A — Menggunakan SSH Key (Direkomendasikan)
```bash
# 1. Inisialisasi git (jika belum ada .git)
git init
git branch -M main

# 2. Tambahkan remote GitHub Anda
git remote add origin git@github.com:<USERNAME_GITHUB>/<NAMA_REPO>.git

# 3. Verifikasi & Commit
git add .
git status
git commit -m "feat: DieCut.Room v1.5.0 production ready with Debian VPS runbook"

# 4. Push ke GitHub
git push -u origin main
```

### Opsi B — Menggunakan HTTPS + Personal Access Token (PAT)
Jika menggunakan repositori private via HTTPS, buat **Fine-grained Personal Access Token** di GitHub (`Settings → Developer settings → Personal access tokens`) dengan izin `Contents: Read & write`, lalu:
```bash
git remote add origin https://github.com/<USERNAME_GITHUB>/<NAMA_REPO>.git
git push -u origin main
# Masukkan username GitHub & paste token PAT pada prompt password
```

---

## 3. Setup Akses Pull Read-Only untuk AI Agent di VPS Debian (Deploy Key)

Untuk repositori GitHub **Private**, cara paling aman memberi izin AI Agent di VPS menarik (*pull*) pembaruan **tanpa** membuka akses tulis ke akun GitHub utama Anda adalah **SSH Deploy Key (Read-Only)**:

```bash
# Jalankan di VPS Debian sebagai user operasional (mis. debian / deployuser)
ssh-keygen -t ed25519 -C "vps-diecut-room-deploy-key" -f ~/.ssh/id_diecut_room_github -N ""
cat ~/.ssh/id_diecut_room_github.pub
```

1. Salin output kunci publik (`ssh-ed25519 ...`).
2. Buka GitHub repository Anda → **Settings** → **Deploy keys** → **Add deploy key**.
3. Tempel kunci publik, beri judul `VPS Debian DieCut.Room Production`, dan **biarkan kotak "Allow write access" tidak dicentang**.
4. Daftarkan konfigurasi SSH di VPS agar `git clone` dan `git pull` otomatis memakai kunci tersebut:
   ```bash
   cat >> ~/.ssh/config << 'EOF'
   Host github.com-diecut-room
     HostName github.com
     User git
     IdentityFile ~/.ssh/id_diecut_room_github
     IdentitiesOnly yes
   EOF
   chmod 600 ~/.ssh/config

   # Uji koneksi ke GitHub
   ssh -T git@github.com-diecut-room
   ```
5. AI Agent di VPS selanjutnya dapat menarik repositori dengan URL:
   `git clone git@github.com-diecut-room:<USERNAME_GITHUB>/<NAMA_REPO>.git /opt/diecut-room`

---

## 4. Alur Penandaan Rilis (`Git Tag`) Sebelum Deploy Update

Biasakan memberi tag rilis setiap perubahan siap produksi agar AI Agent di VPS mudah melakukan *rollback* ke versi stabil sebelumnya:

```bash
git tag -a v1.5.0 -m "Production release: DieCut.Room Responsive UX, Landscape 3D HUD & Debian VPS Ready"
git push origin v1.5.0
```

---

## 5. Changelog Rilis DieCut.Room

### `Unreleased (post-v1.5.0)` — Palletizer PDF Orthographic Report, Security/Admin Ops Suite, Hermes Agent & MCP, Agent-First Docs
- **Laporan Engineering PDF Palletizer A4 2 Halaman (`palletizerReportPdf.ts`, `PalletizerWorkspace.tsx`)**: Export PDF profesional dengan proyeksi **Orthographic 3D** bebas distorsi & tanpa terpotong pada 4 POV Normal (`Iso` sudut curam ~40°, `Top`, `Front`, `Side`), pewarnaan kontras orientasi `0°/180°` vs `90°/270°` bergaya TOPS Pro + outline tegas `#17191F`, garis dimensi vektor `L × W × T (mm)`, panel khusus **Heat-Map Iso & Top**, panduan susunan 2D Layer 1 & Layer 2 bernomor urut kiri-atas, audit BCT/stabilitas/operating conditions lengkap, serta header branding **DieCut.Room** + logo resmi **Totale.Room** bergaya **Precision Tactile Studio**.
- **Keamanan Auth, Recovery & 4-Tab Admin Console (`server.ts`, `AdminUsersModal.tsx`, `apiSession.ts`, `scripts/admin-reset.ts`)**: Dual sesi *HttpOnly Partitioned Cookie* + `Authorization: Bearer <token>`, perlindungan brute-force (`failed_login_count`, `locked_until`), invalidasi sesi (`token_version`), **Admin Recovery Key**, **SMTP Email OTP**, CLI `npm run admin:reset` (juga disertakan di Docker runner), 2 tabel SQLite baru (`system_meta`, `audit_logs`), serta Konsol Admin 4 tab (**Users + Bulk Approve**, **Health Radar**, **Audit Logs**, **Security/SMTP/Agent Key/SQLite & JSON Backups**).
- **Integrasi AI Agent Hermes REST & MCP (`server.ts`)**: Endpoint `/api/agent/skill`, `/api/agent/connect`, `/api/agent/calculate`, `/api/agent/dieline`, `/api/agent/dieline/download` (unduhan SVG/Clean CAD bertanda tangan), dan server JSON-RPC **MCP** (`/api/mcp`) yang diamankan via `X-Agent-Key` / Bearer key.
- **Unit `mm`/`cm`/`in` & Pemulihan Chunk Lazy (`App.tsx`, `lazyWithRetry.ts`)**: Dukungan penuh 3 satuan kerja dan pemulihan otomatis saat hash chunk berubah pasca-deploy PWA.
- **Dokumentasi Agent-First 3-Layer, Indeks Codebase & Drift Guard (`DESIGN.md`, `docs/STATUS.md`, `docs/CODEBASE_INDEX.md`, `scripts/generate-codebase-index.ts`, `scripts/check-docs-drift.ts`, `.agents/rules/project.md`, `.agents/environment.json`, `.github/workflows/docs-drift.yml`)**: Onboarding otomatis lintas AI Agent, generator indeks codebase zero-dependency (`npm run index:build`), dukungan Split-Deploy (`VITE_API_BASE_URL` + `CORS_ALLOWED_ORIGINS` + `vercel.json`), detektor drift 7-cek zero-dependency Node 22+ (`npm run docs:check`), GitHub Action *warning-only*, serta pembersihan folder duplikat `agent/skills/` & `bun.lock`.
- **Katalog Visual Live 27 State, Otomasi Capture & Paritas Panduan (`docs/VISUAL-STATE-CATALOG.md`, `docs/visual-snapshots/`, `scripts/capture-visual-snapshots.ts`, `docs/01-USER-GUIDE.md`)**: Perekaman otomatis 21 tangkapan layar asli Desktop (`1440×900`) + 6 Mobile Core (`390×844`) via Chromium headless CDP (`npm run snapshots:capture`) mencakup seluruh halaman, sub-tab (*Specs* 3 tab, *BCT Pro* 4 tab, *Admin Console* 4 tab), mode 3D (*SRP Tear*, *Palletizer Heat-Map*, *Inspect Layer*, *PDF Modal*), dan modal (*Pre-Flight*, *Projects*), dilengkapi Cek 7 *Visual Snapshot Integrity* pada `docs:check`, paritas penuh `docs/01-USER-GUIDE.md`, serta pembersihan 26 lampiran diskusi lama di `public/assets/aistudio/` (menyisakan hanya logo resmi **Totale.Room**).

### `v1.5.0` — Responsive Multi-Viewport Workspace, 3D Landscape HUD, Server Startup Fix & Debian VPS Ready
- **Ergonomi Multi-Layar & Focus Mode (`useWorkspaceLayout`)**: Deteksi otomatis 4 tingkat layar (`desktop >=1280px`, `compact 1024–1279px` auto-minimize BCT rail, `tablet 768–1023px`, `mobile <768px`), tombol tutup langsung di header panel, pegangan cepat di tepi layar, header adaptif dengan menu overflow `···`, Mobile Floating Thumb Dock (`Specs/Pallet | BCT | Fokus`), dan **Focus Mode 1-klik** (`F`/`Esc`).
- **Perbaikan Simulasi 3D & Mobile Landscape**: Memindahkan kapsul preset kamera POV (`Iso/Front/Top/Side/↺`) ke sudut kanan atas kanvas agar bebas tabrakan dengan kontrol `Flat/Open/Closed`; slider Fold/Tear ringkas `64px` dengan batas CSS `@layer components` agar tidak menembus border pada layar portrait sempit; serta **Short-Landscape Floating Bar** (`height <= 500px`) pada mode 3D Fit dan Palletizer.
- **Ketahanan Boot & Dev Server (`server.ts`, `vite.config.ts`, `index.html`)**: HTTP server mengikat port `3000` secara instan sembari menginisialisasi Vite di latar belakang, menonaktifkan listener WebSocket Vite `24678` (`ws: false`) saat `DISABLE_HMR=true` / `NGINX_PORT` aktif, penolakan `404` tegas aset hash yang hilang, serta watchdog pemulihan Service Worker pada `index.html`.
- **Standardisasi `diecut-room` & Optimasi VPS Debian Hemat Resource**: Penyeragaman seluruh manifes deploy ke `diecut-room`, **Multi-Stage Docker Slim (`~160 MB`)** yang hanya memasang `express` + `dotenv` di stage akhir, pin `IMAGE_TAG`, batas memori `mem_limit: 256m` (`NODE_OPTIONS=--max-old-space-size=192`), `docker builder prune -f` aman multi-container, fallback **PM2 Node v22** (`npm prune --omit=dev`, `--max-memory-restart 220M`), `npm ci --include=dev`, backup `node:sqlite` `VACUUM INTO`, serta pembersihan `dev-dist/` dari `.gitignore`/`.dockerignore`.

### `v1.4.0` — Palletizer Pro 3D, Auto-Adaptive GPU Engine, Halftone AuthGate & Timeless Grotesk
- **Palletizer Pro 3D & Web Worker (`PalletizerWorkspace`, `palletizer.worker.ts`)**: Simulator tumpukan palet 3D (`EUR/ISO/US/Custom`) dengan *Case-Pack Solver*, evaluasi pola (*Interlock*, *Column*, *Pinwheel*, *Split*, *Hybrid*), fisika gesek/kelembaban/burst, serta saran dimensi kotak (*Perfectionist Tuning*) secara *off-thread*.
- **Mesin Kualitas Adaptif (`browserEngine.ts`) & Lazy Loading**: Deteksi tier perangkat (`ultra`, `balanced`, `eco`, `software WebGL`), *dynamic resolution controller* berbasis frame-time, serta lazy-loading modul 3D/Modal agar startup tetap ringan di perangkat terbatas.
- **Portal Login Halftone Offset-Sheet (`AuthGate`, `HalftoneSheetDecor`, `InteractiveMatrixCanvas`)**: Pembaruan identitas ke **DieCut.Room** dengan kartu putih matte bersudut tegas (`2px`), bingkai halftone dot, aksen gradasi raster kanan atas, serta latar matriks dot interaktif.
- **Integrasi Font Timeless Grotesk (`fontLoader.ts`, `/api/fonts/available`)**: Pemindaian otomatis berkas `.woff2`/`.woff` opsional di `public/fonts/` tanpa error 404 ketika kosong.

### `v1.3.0` — AI Agent VPS Operations, Security Hardening & Complete Docs
- **Operasional AI Agent di VPS (`AGENTS.md`, `docs/05-AI-AGENT-VPS-RUNBOOK.md`)**: Kontrak instruksi root + runbook lengkap untuk environment VPS yang sudah memiliki Nginx & aplikasi lain (audit port, `HOST_PORT` fleksibel di Docker Compose, aturan larangan timpa situs lain, uji smoke-test end-to-end, backup SQLite harian, update & rollback).
- **Hardening, Recovery & API Reference (`docs/06`, `docs/07`, `deploy/nginx-diecut.conf`)**: Zona rate-limit Nginx pada `/api/auth/login` & `/api/auth/register`, header keamanan HTTP, batas payload `3m`, prosedur pemulihan password/email Admin via `node:sqlite` + `scrypt`, matriks troubleshooting produksi, serta panduan migrasi database antar VPS.

### `v1.2.0` — Private Auth Gate, WhatsApp Origin Metadata, SQLite Sync & PWA
- **Server Express + Embedded SQLite (`server.ts`)**: Autentikasi cookie bertanda HMAC-SHA256 + `scrypt` hashing menggunakan `node:sqlite` (mode WAL) tanpa ketergantungan DB eksternal.
- **Persetujuan Admin & Kontrol User**: Registrasi mandiri otomatis berstatus `Pending`; Konsol Admin (`AdminUsersModal`) untuk aktivasi, nonaktifkan, ketik password baru langsung, inspeksi asal akses/IP, dan hapus akun.
- **Kontak WhatsApp Bermetadata (`+6282125086328`)**: Tombol logo WhatsApp pada Login, Pending, dan Lupa Password menyertakan subdomain/URL, referrer, perangkat, resolusi, mode PWA/Browser, dan zona waktu.
- **Sinkronisasi Per Akun & PWA (`vite-plugin-pwa`)**: Proyek dieline (`ProjectsModal`) dan riwayat skenario BCT tersinkron ke SQLite per `user_id`, dilengkapi installability PWA (Desktop/Android/iOS) dan indikator status offline.

### `v1.1.0` — 13 Pola Perforasi SRP Supermarket, Dash/Non-Dash & Simulasi 3D Tear
- **Pola SRP & Rule Styles**: Menambahkan 13 preset SRP Supermarket (*Angled Hood*, *Drop-Front PDQ*, *Twin-Zipper*, *Split-Tray*, *Stepped Shelf-Tray + U-Scoop*, dll.) dengan kontrol *Solid Cut (Non-Dash)* vs *Perf Rule* (`6/3`, `5/3`, `4/4 mm`, `Custom`).
- **3D Interactive Tear Simulation & Clearance HUD**: Slider `Tear / Open SRP (0–100%)` di Three.js beserta panel *SRP & Cavity Clearance* dan *Rule 8 SRP Pre-Flight Audit*.

### `v1.0.0` — Fondasi 2D CAD FEFCO (0200–0204) & Kalkulator BCT Pro / TAPPI-ISO
- **Drafting 2D Presisi Skala 1:1 mm**: Generasi vektor SVG/PDF *Clean CAD* & *Spec Sheet*, lapisan Pre-Press (*Print Bleed*, *Score Safe Zone*, *Glue Knockout*, *Flute Grain*), serta barcode **GS1 ITF-14** dengan auto-fix check digit.
- **Engineering BCT Engine**: Katalog kertas Single Wall & Double Wall s.d. K300/White Top/Testliner/Semi-Chem, simulasi *Print Coverage* per panel, derating kelembaban/handling/stabilitas, perbandingan *TAPPI/ISO Calibrated* vs *BCT Pro Legacy*, dan estimasi biaya batch.
