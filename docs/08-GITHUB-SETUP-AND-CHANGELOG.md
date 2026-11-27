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
- **Sidebar Kiri Terpadu Seamless, Footer Terkunci Seragam & Pemusatan Dimensi/Material di BCT Pro (`App.tsx`, `Sidebar.tsx`, `PalletizerWorkspace.tsx`, `BCTInspectorRail.tsx`, `useWorkspaceLayout.ts`, `Box3DViewer.tsx`, `index.css`)**:
  - **Kerangka Sidebar Kiri Terpadu & Lebar Seragam**: Menyatukan panel kiri pada tab `2D`, `3D Fit`, dan `Palletizer` ke dalam satu kerangka `<aside>` permanen berlebar identik (`332px/348px`, menyamai BCT Pro) dengan header `DieCut.Room`, switcher unit `mm/cm/in`, permukaan `--ground`, dan gaya tab `TactileSegmented shape="control"` seragam; konten `Palet | Armada` diproyeksikan via React Portal ke slot sidebar yang sama agar transisi antar tab mulus tanpa mereset konteks WebGL *keep-alive*.
  - **Footer Terkunci Seragam di Semua Tab**: Menempatkan baris `[Sidebar Kiri Terpadu + Kanvas Aktif]` di dalam `<main>` tepat di atas footer sehingga header atas dan footer bawah (`RSC 0201 · Blank · Made by Totale.Room`) selalu terkunci memanjang penuh di bawah sidebar kiri pada seluruh tab tanpa lompatan horizontal.
  - **Penghapusan Duplikasi Dimensi, Flute & Material**: Menghapus bagian *Dimensions / Product Fit* dan *Material & Construction* dari sidebar kiri (`Specs`), menggabungkan kontrol *Glue flap side & width* ke *Structural allowances*, serta memusatkan input **Direct ID (`L×W×H`)**, **Board color**, **Board grade (SW/DW)**, dan **Flute profile/grain** secara tunggal di panel kanan **BCT Pro**.
- **Optimasi Performa, Fluiditas & Navigasi Bolak-Balik Tab Prioritas #1–#5 (`PalletizerWorkspace.tsx`, `Box3DViewer.tsx`, `BoxPreview.tsx`, `palletizer.ts`, `palletizerVectorExport.ts`, `InteractiveMatrixCanvas.tsx`, `Sidebar.tsx`, `BCTInspectorRail.tsx`, `App.tsx`)**:
  - **Eliminasi Freeze Awal Palletizer**: Menghapus pemanggilan sinkron `computePerfectionistTuningReport` dari inisialisasi state `PalletizerWorkspace`; mount awal kini memakai cache LRU `evaluateAllPalletPatternsCached` + `buildSmartPalletAdvisorFromEvals` secara instan dan menjalankan seluruh sweep berat 100% di Web Worker (`palletizer.worker.ts`).
  - **Keep-Alive Tab `2D ↔ 3D Fit ↔ Palletizer`**: Menjaga tab yang sudah dibuka tetap hangat (`visitedTabs` + CSS `hidden`, direset saat logout) dengan prop `isActive` yang menjeda loop `requestAnimationFrame` dan menunda rebuild 3D saat tab disembunyikan, lalu langsung me-resize & me-render ulang 1 frame saat kembali.
  - **Shared LRU Cache & Deferred Vector Scene di 2D**: Mempersempit dependensi `syncedPalletEvaluation` di `BoxPreview` ke nilai primitif + cache LRU `evaluateAllPalletPatternsCached`, serta menjadwalkan `buildPalletVectorSceneCached` lewat `scheduleIdleWork` saat cache miss agar dieline 2D langsung tampil.
  - **Lazy-Loading Panel Awal & Matrix Canvas Ringan**: Memecah `Sidebar`, `BoxPreview`, dan `BCTInspectorRail` lewat `lazyWithRetry` disertai idle prefetch saat di `AuthGate`, serta menunda inisialisasi grid `InteractiveMatrixCanvas` 1 frame, membatasi DPR `<= 1.5`, dan menurunkan frame idle ke `~30fps` (tetap `60fps` saat interaksi pointer/ripple).
  - **Memoization Panel Samping**: Membungkus `Sidebar` dan `BCTInspectorRail` dengan `React.memo` serta menstabilkan callback lewat `useCallback` di `App.tsx` untuk mencegah re-render saat pindah tab.
- **Laporan Engineering PDF Palletizer A4 2 Halaman (`palletizerReportPdf.ts`, `PalletizerWorkspace.tsx`)**: Export PDF profesional dengan proyeksi **Orthographic 3D** bebas distorsi & tanpa terpotong pada 4 POV Normal (`Iso` sudut curam ~40°, `Top`, `Front`, `Side`), pewarnaan kontras orientasi `0°/180°` vs `90°/270°` bergaya TOPS Pro + outline tegas `#17191F`, garis dimensi vektor `L × W × T (mm)`, panel khusus **Heat-Map Iso & Top**, panduan susunan 2D Layer 1 & Layer 2 bernomor urut kiri-atas, audit BCT/stabilitas/operating conditions lengkap, serta header branding **DieCut.Room** + logo resmi **Totale.Room** bergaya **Precision Tactile Studio**.
- **Keamanan Auth, Recovery & 4-Tab Admin Console (`server.ts`, `AdminUsersModal.tsx`, `apiSession.ts`, `scripts/admin-reset.ts`)**: Dual sesi *HttpOnly Partitioned Cookie* + `Authorization: Bearer <token>`, perlindungan brute-force (`failed_login_count`, `locked_until`), invalidasi sesi (`token_version`), **Admin Recovery Key**, **SMTP Email OTP**, CLI `npm run admin:reset` (juga disertakan di Docker runner), 2 tabel SQLite baru (`system_meta`, `audit_logs`), serta Konsol Admin 4 tab (**Users + Bulk Approve**, **Health Radar**, **Audit Logs**, **Security/SMTP/Agent Key/SQLite & JSON Backups**).
- **Integrasi AI Agent Hermes REST & MCP (`server.ts`)**: Endpoint `/api/agent/skill`, `/api/agent/connect`, `/api/agent/calculate`, `/api/agent/dieline`, `/api/agent/dieline/download` (unduhan SVG/Clean CAD bertanda tangan), dan server JSON-RPC **MCP** (`/api/mcp`) yang diamankan via `X-Agent-Key` / Bearer key.
- **Unit `mm`/`cm`/`in` & Pemulihan Chunk Lazy (`App.tsx`, `lazyWithRetry.ts`)**: Dukungan penuh 3 satuan kerja dan pemulihan otomatis saat hash chunk berubah pasca-deploy PWA.
- **Dokumentasi Agent-First 3-Layer, Indeks Codebase & Drift Guard (`DESIGN.md`, `docs/STATUS.md`, `docs/CODEBASE_INDEX.md`, `scripts/generate-codebase-index.ts`, `scripts/check-docs-drift.ts`, `.agents/rules/project.md`, `.agents/environment.json`, `.github/workflows/docs-drift.yml`)**: Onboarding otomatis lintas AI Agent, generator indeks codebase zero-dependency (`npm run index:build`), dukungan Split-Deploy (`VITE_API_BASE_URL` + `CORS_ALLOWED_ORIGINS` + `vercel.json`), detektor drift 7-cek zero-dependency Node 22+ (`npm run docs:check`), GitHub Action *warning-only*, serta pembersihan folder duplikat `agent/skills/` & `bun.lock`.
- **Katalog Visual Live 27 State, Otomasi Capture & Paritas Panduan (`docs/VISUAL-STATE-CATALOG.md`, `docs/visual-snapshots/`, `scripts/capture-visual-snapshots.ts`, `docs/01-USER-GUIDE.md`)**: Perekaman otomatis 21 tangkapan layar asli Desktop (`1440×900`) + 6 Mobile Core (`390×844`) via Chromium headless CDP (`npm run snapshots:capture`) mencakup seluruh halaman, sub-tab (*Specs* 3 tab, *BCT Pro* 4 tab, *Admin Console* 4 tab), mode 3D (*SRP Tear*, *Palletizer Heat-Map*, *Inspect Layer*, *PDF Modal*), dan modal (*Pre-Flight*, *Projects*), dilengkapi Cek 7 *Visual Snapshot Integrity* pada `docs:check`, paritas penuh `docs/01-USER-GUIDE.md`, serta pembersihan 26 lampiran diskusi lama di `public/assets/aistudio/` (menyisakan hanya logo resmi **Totale.Room**).
- **Universal One-Shot Master Prompt Blueprint (`docs/09-ONE-SHOT-MASTER-PROMPT-TEMPLATE.md`)**: Cetak biru *one-shot prompt* berbahasa Inggris berstandar global dengan *placeholder* variabel (`{{PLACEHOLDERS}}`), 12 sakelar fitur modular (`[ON/OFF]`), kontrak desain *Precision Tactile Studio*, standar keamanan/SQLite/deploy VPS, *negative constraints* anti-slop, *Definition-of-Done* verifikasi, serta contoh pengisian aplikasi baru untuk membangun aplikasi lain lintas AI Builder (*AI Studio, Cursor, ADE, Codex, Claude*) dengan jumlah *follow-up prompt* minimal.
- **Kebijakan Zero-Overhang & Underhang Aman Palletizer (`palletizer.ts`, `PalletizerWorkspace.tsx`, `palletizerReportPdf.ts`, `types.ts`)**: Mengunci rentang margin tepi pada `-50` hingga `0 mm/sisi` (standar awal `-10 mm/sisi`) dengan 5 preset cepat (`0`, `-5`, `-10`, `-15`, `-25 mm`), penyesuaian zona efektif otomatis pada solver pola, *Case Pack*, dan *Perfectionist Tuning*, panduan visual 3D *Safe Inset Zone* di atas dek palet, diagnostik kontekstual (*flush/bulge* `< 5 mm` dan *underhang* lebar `> 25 mm` + cek *Slip Sheet*), badge HUD inset aktual, serta bingkai zona aman & metrik *Underhang* pada Laporan PDF A4 Orthographic.
- **Perataan Sisi Luar 3-Mode (`Perataan Sisi Luar`: `Auto` | `Rata Sisi` | `Rapat`) (`palletizer.ts`, `PalletizerWorkspace.tsx`, `palletizerReportPdf.ts`, `types.ts`)**: Menghilangkan sudut gantung tepi luar (*outer corner overhang*) pada pola campuran dengan mendorong dus rata ke 4 sisi terluar susunan (`applyPerimeterFlush`) sambil menjaga batas *Zero-Overhang*, evaluasi perbandingan otomatis `compact` vs `flush` (batas aman celah tengah `<= 60 mm`, peringatan *Tier Sheet* bila `> 50 mm`), kontrol 3-mode `TactileSegmented` + badge celah tengah di HUD 3D & Audit Stabilitas, serta anotasi vektor celah tengah (`mm`) pada denah 2D Layer 1/2 dan ringkasan spesifikasi Laporan PDF A4.
- **Export Vektor Kemasan Siap-Illustrator — PDF & SVG Line-Art Transparan (`palletizerVectorExport.ts`, `PalletizerWorkspace.tsx`)**: Tab khusus **Vektor Kemasan (AI-Ready)** di modal Export Palletizer yang menghasilkan vektor garis hitam murni (`#000000`, `fill="none"`) tanpa gambar raster dan tanpa fill putih penutup latar menggunakan mesin proyeksi **Top View** (Layer Ganjil & Genap dengan papan palet terpotong bersih di balik dus + panah chevron) serta **Isometrik 30°** dengan **Analytic Hidden-Line Removal (HLR)** dan deduplikasi garis pertemuan; mendukung 3 panel *shipping mark* lengkap (*Pallet Pattern*, *Hindarkan Kontak Langsung Dengan Lantai*, *Maximum Stacking*), toggle bingkai/teks dwibahasa, toggle panel Max Stacking, 3 preset ketebalan stroke (`0.45`/`0.65`/`0.90 mm`), pratinjau langsung latar Simulasi Kraft vs Putih, serta unduhan terpisah **Vector SVG** (terkelompok per `<g id>` untuk Layers Panel Illustrator) dan **Vector PDF** native path.
- **Parameter Armada & Kontainer Indonesia, Sinkronisasi Tinggi Palet, Denah 2D & PDF Hal 3 (`vehicleLoading.ts`, `VehicleLoadingBlueprint.tsx`, `PalletizerWorkspace.tsx`, `palletizerReportPdf.ts`, `types.ts`)**: Tab baru **Armada** di Palletizer Pro dengan 11 preset dimensi aktual Indonesia (`20' GP`, `40' GP`, `40' HC`, `20' Reefer`, `40' HC Reefer`, `CDE Box`, `CDD Box`, `CDD Long`, `Fuso Box`, `Tronton Box`, `Tronton Wingbox`) + `Custom` yang seluruh dimensi internal, bukaan pintu (*door header drop*), toleransi karoseri non-standar (`±mm`), dan *clearance forklift* (jarak dinding samping, antar-palet, pintu belakang, ruang angkat garpu, dan atap) dapat dikustomisasi; sinkronisasi otomatis batas tinggi tumpukan palet (`1 Tier`, `2 Tier` *Double-Stack*, atau `Auto`) terhadap balok atas pintu & *Red Load Line* Reefer; solver penataan 3 pola lantai (*lengthwise* / *crosswise* / *pinwheel mixed*) + batas payload berat + audit BCT *Double-Stack*; tampilan overlay **Denah Armada 2D (*Top View* & *Side View*)** tanpa memutus kanvas WebGL 3D; serta penambahan otomatis **Halaman 3 Laporan PDF Engineering** berisi denah vektor *Top* & *Side View*, KPI utilisasi, spesifikasi armada, dan audit clearance operasional.
- **Floor Loading (Muat Tanpa Palet), Pemilih Pola Ringkas 2×2, Header Export PDF Terpadu & Mobile Genie Sheet (`vehicleLoading.ts`, `VehicleLoadingBlueprint.tsx`, `PalletizerWorkspace.tsx`, `palletizerReportPdf.ts`, `MobileGenieSheet.tsx`, `App.tsx`, `BoxPreview.tsx`, `index.css`)**:
  - **Floor Loading & Perbandingan Kapasitas**: Toggle `Pakai Palet` vs `Floor Loading (Tanpa Palet)` di tab **Armada** dan overlay **Denah Armada 2D** beserta solver `solveFloorLoading` & `comparePalletVsFloor` (3 pola lantai dus langsung, batas atap/pintu/Reefer & payload, audit BCT lapisan terbawah, deteksi zona kosong belakang untuk peringatan *Dunnage/Airbag*, estimasi durasi muat manual vs *forklift*, perbandingan langsung `Δ dus` & `+Δ%`, serta integrasi penuh pada Halaman 3 Laporan PDF A4).
  - **Grid 2×2 Pola Susunan Ringkas**: Mengganti daftar 4 kartu tinggi pada tab `Palet` menjadi grid `2×2` ringkas (*Column*, *Interlock*, *Pinwheel*, *Split-Block*) yang langsung menampilkan jumlah dus/palet, lapisan, dan skor stabilitas, serta merapikan *Mode Optimasi* & tabel perbandingan TOPS ke dalam *disclosure* terlipat.
  - **Tombol Export Terpadu Tunggal di Header & Toolbar 2D Satu Baris Tipis (`App.tsx`, `BoxPreview.tsx`, `PalletizerWorkspace.tsx`)**: Menghapus seluruh duplikasi tombol *Export PDF* dan *Export SVG* pada toolbar 2D, kapsul kamera 3D Palletizer, dan tab *Audit* Palletizer lintas mobile, tablet, dan desktop, lalu menyatukannya ke satu tombol **Export** di header kanan atas (sebelah kiri `···`) dengan 4 opsi terkelompok (*Dieline CAD PDF 1:1 mm*, *Dieline CAD SVG 1:1 mm*, *Laporan Palletizer PDF A4*, dan *Vektor Kemasan AI PDF/SVG*). Toolbar kanvas 2D dirampingkan menjadi satu baris tetap (`40px`, `flex-nowrap` adaptif untuk *Zoom*, *Layers*, dan *Spec/CAD*) agar luas bidang gambar 2D jauh lebih lega.
  - **Mobile Genie-on-the-Lamp Sheet**: Pada mode mobile portrait, mengetuk tombol `Specs`/`Pallet` atau `BCT` di *Floating Thumb Dock* bawah kini memunculkan panel secara halus mengalir keluar dari tombol menuju posisi *center* layar (dengan animasi *retract* balik saat ditutup dan dukungan `prefers-reduced-motion`).
- **Kalibrasi Operasional Indonesia, Rekomendasi Material Anti-Overspec Berbasis Berat Produk & Perampingan UI (`engineering.ts`, `palletizer.ts`, `PalletizerWorkspace.tsx`, `BCTInspectorRail.tsx`, `EngineeringSheet.tsx`, `Sidebar.tsx`, `Box3DViewer.tsx`, `App.tsx`)**:
  - **Kalibrasi Iklim & Distribusi Indonesia (BMKG + FBA/Kellicutt)**: Kurva kelembaban non-linear baru `50–95% RH` (`75% RH = 0.71`, `80% = 0.62`, `85% = 0.52`, `90% = 0.42`, `95% = 0.33`), faktor *Handling Risk* Indonesia `-18%` (`×0.82` default aktif), *Safety Factor* default `4:1` (`3:1`/`4:1`/`5:1`/`6:1`), dan teks konteks iklim/gudang langsung di bawah slider RH.
  - **Input Berat Nett Produk Tersinkronisasi (`default 1.0 kg`) + Heat-Map Berbasis Beban + 2–3 Kandidat Material Anti-Overspec**: Menghapus tab `Case` di Palletizer dan memindahkan input `Berat Nett Produk / Dus (kg)` ke panel `Specs` dan tab `Palet`. Berat produk kini langsung menentukan warna **3D Heat-Map** (rasio tekanan per lapisan terhadap BCT izin) serta menyusun **2–3 kandidat material bertahap** (`Paling Pas`, `Seimbang`, `Cadangan`) mulai dari spesifikasi paling hemat yang tetap aman agar terhindar dari *overspec* dengan tombol 1-klik `Pakai`.
  - **Perampingan UI & Framing Kamera 3D**: Memindahkan strip tag status (*Inset*, *Celah*, *AMAN/OVERLOAD*) keluar tepat di atas kartu HUD Palletizer agar tidak pernah terpotong dan kartu lebih ringkas; menjauhkan posisi kamera default isometrik (~35% lebih *zoom-out*) di 3D Fit & Palletizer; serta menghapus fitur *X-Ray*, *BCT Pro Legacy*, dan *Sheet Utilization & Batch Cost*.
- **Sinkronisasi Slider Layer Real-Time, Kalibrasi Heat-Map Gradasi Persentase & Redesign Card Corrected BCT (`PalletizerWorkspace.tsx`, `BCTInspectorRail.tsx`)**:
  - **1 Kontrol Layer Real-Time Tersinkronisasi**: Menyatukan slider *Jumlah Layer* di panel `Palet` dan HUD bawah ke satu sumber kebenaran `manualLayerCount` (menghapus state *visual cutaway* `inspectLayer` yang terpisah) dengan evaluasi pola instan tanpa jeda + tombol reset `Auto` sehingga jumlah dus, tinggi tumpukan, berat kotor, status BCT, dan 3D stack selalu 100% sinkron.
  - **Kalibrasi Heat-Map 3D Bergradasi Persentase Beban Tekan**: Memisahkan pewarnaan Heat-Map dari bias status ikatan (`lockStatus`) agar tumpukan 1 layer selalu `0%` Hijau (tidak lagi merah keliru) dan menurunkan layer langsung mendinginkan warna dari Merah → Oranye → Kuning → Hijau secara kontinu, dilengkapi bilah skala gradasi & rincian persentase beban per layer (`L1 (Bawah)..LN (Atas)`).
  - **Card Corrected BCT Ramah Orang Awam**: Mengganti tabel faktor retensi yang membingungkan (`Print 86% · RH 71%`) dengan rincian pengurangan minus (`Kelembaban -29%`, `Handling -18%`, `Tinta Cetak -14%`), bilah sisa kekuatan (`Sisa X% · Raw → BCT Efektif`), dan status estimasi batas tumpuk aman (`Aman s/d ~N layer`) berbasis berat produk nett.
- **2D Artwork Studio — Vektor Pallet Flap Panel 3, Strip Anti-Counterfeit Plakban & Kanvas Kustom Interaktif (`Artwork2DPanel.tsx`, `BoxPreview.tsx`, `types.ts`, `App.tsx`)**:
  - **Vektor Pallet Pattern AI Live di Flap Atas Panel 3 (`L2`)**: Merender langsung vektor garis transparan 3-panel (*Pallet Pattern Layer 1,3/2,4*, *Do Not Place Directly on the Floor*, *Maximum Stacking N Layer*) ke atas flap penutup panjang panel 3 di kanvas 2D yang otomatis tersinkron dengan pola & jumlah layer Palletizer, dapat digeser di dalam flap, serta mendukung kustomisasi skala, tebal garis, bingkai, teks, dan warna tinta.
  - **Strip Anti-Counterfeit Area Plakban (`L1` & `L2` Atas-Bawah)**: Menambahkan teks keamanan berulang + garis warna pembatas yang terkunci matematis di dalam zona aman lebar plakban (`36/48/60/72 mm`) lengkap dengan panduan garis putus-putus plakban saat mengedit, opsi toggle per flap, serta rotasi `180°` otomatis pada flap bawah.
  - **Kanvas Kustom Interaktif (`Shape` & `Teks Bebas`) + Export Multi-Layer 1:1 mm**: Pengguna dapat menambah *Garis Panjang*, *Blok Penuh*, *Kotak Frame*, dan *Teks Bebas* multi-baris, menggeser (*drag*) & mengubah ukuran (*6-handle resize*) langsung di kanvas SVG, *1-click snap* ke panel (`L1/W1/L2/W2/Flap`), mengatur warna/opasitas/rotasi/Z-order/kunci, dan mengekspornya sebagai 3 grup layer Illustrator terpisah (`LAYER_ARTWORK_ANTICOUFEIT`, `LAYER_ARTWORK_PALLET_MARKS`, `LAYER_ARTWORK_CUSTOM`) dalam file SVG & PDF skala 1:1 mm.




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
