# Panduan Lengkap Pengguna & Admin — DieCut.Room

Dokumen ini memandu seluruh alur penggunaan **DieCut.Room** dari gerbang autentikasi hingga ekspor CAD produksi, simulasi 3D SRP, optimalisasi Palletizer Pro 3D (termasuk Laporan Engineering PDF A4), audit struktural BCT Pro, hingga operasional Konsol Admin 4-tab.

> **Referensi Visual Lengkap Setiap Halaman & State:**  
> Lihat [`docs/VISUAL-STATE-CATALOG.md`](./VISUAL-STATE-CATALOG.md) untuk tangkapan layar asli Desktop (`1440×900`) dan Mobile (`390×844`) dari seluruh layar, sub-tab, modal, dan konsol admin.

---

## 1. Gerbang Akses Privat, Pemulihan Darurat & Verifikasi WhatsApp

Saat pertama kali membuka aplikasi, sistem menampilkan layar **AuthGate** bergaya *Halftone Offset-Sheet* (kartu putih matte bersudut tajam `2px` di atas kanvas matriks titik gelap interaktif).

### State yang Tersedia pada `AuthGate`
1. **Masuk (`Login`)**: Login menggunakan email & password terdaftar. Mendukung sesi ganda (*HttpOnly Partitioned Cookie* + *Bearer Token*) agar tetap stabil di browser modern maupun PWA.
2. **Daftar (`Register`)**: Isi *Nama*, *Perusahaan*, *Email*, dan *Password*. Akun baru otomatis berstatus **`pending`** sampai diaktifkan oleh Admin.
3. **Menunggu Persetujuan (`Pending Approval`) & Akun Nonaktif (`Account Disabled`)**: Menampilkan pesan status jelas beserta tombol **Hubungi Admin via WhatsApp** yang otomatis mengisi pesan dengan metadata akses lengkap:
   - Subdomain/Origin & URL akses lengkap
   - Referrer, ringkasan OS & browser
   - Mode tampilan (`Standalone PWA` vs `Web Browser`), resolusi layar, dan zona waktu
4. **Proteksi Brute-Force (`Account Lockout`)**: Percobaan login salah berulang akan mengunci akun sementara (`locked_until`) dan menampilkan banner peringatan waktu tunggu pada form login.
5. **Pemulihan Darurat Admin Tersembunyi (`Admin Recovery`)**:
   - Dipicu secara tersembunyi melalui pintasan **`Alt + Shift + R`** (atau **`Ctrl + Shift + Alt + A`**) maupun **mengetuk logo 5× dalam 2,5 detik**.
   - Menyediakan dua jalur pemulihan sandi Admin:
     - **SMTP Email OTP**: Mengirim kode OTP 6-digit ke email Admin (dilengkapi *cooldown* 60 detik bila SMTP sudah dikonfigurasi di Konsol Admin).
     - **Admin Recovery Key**: Reset password langsung menggunakan kunci pemulihan rahasia (`ADMIN_RECOVERY_KEY` atau kunci yang dirotasi di panel Admin).
   - Sebagai cadangan darurat tingkat server VPS, tersedia juga CLI `npm run admin:reset`.

---

## 2. Konsol Admin 4-Tab (`AdminUsersModal`)

Akun berstatus **`admin`** melihat tombol **Admin** pada bilah atas (juga dapat dibuka dengan pintasan `Ctrl + Shift + A` / `Cmd + Shift + A`). Konsol ini terdiri dari **4 tab utama**:

1. **Tab 1 — `Pengguna & Sesi`**:
   - Melihat statistik akun (`Active`, `Pending`, `Disabled`), metadata akses asal (`Origin`, `Device`, `Last IP`), jumlah proyek tersimpan, dan riwayat BCT per pengguna.
   - **Buat Akun Baru (`Create User`)**, **Edit Profil/Peran (`Edit User`)**, **Aktivasi Massal (`Bulk Approve Pending`)**, **Ubah Status (`Active/Disabled`)**, **Reset Password User**, **Cabut Sesi Paksa (`Revoke Sessions` via `token_version`)**, dan **Hapus User**.
2. **Tab 2 — `Kesehatan & Prediksi` (*Health Radar*)**:
   - Menampilkan telemetri server secara langsung: penggunaan **RAM RSS vs batas memori**, ukuran file database **SQLite WAL**, *uptime* server, dan peringatan prediktif postur keamanan/kapasitas lengkap dengan tombol loncat cepat ke tab terkait.
3. **Tab 3 — `Log Audit`**:
   - Menampilkan linimasa terfilter seluruh peristiwa keamanan (*login*, *lockout*, perubahan status/password, rotasi kunci, *backup*) dengan label keparahan (`info`, `warn`, `critical`), aktor, target, dan IP klien.
4. **Tab 4 — `Keamanan & Backup`**:
   - **Ganti Password Admin** sendiri secara aman.
   - **Rotasi Admin Recovery Key** langsung dari UI.
   - **Konfigurasi & Uji SMTP Email OTP** (Host, Port, TLS, User, Pass, From + tombol kirim email uji).
   - **Manajemen Kunci Hermes Agent REST & MCP (`X-Agent-Key`)**: Menerbitkan, merotasi, atau mencabut kunci integrasi untuk `/api/agent/*` dan `/api/mcp`.
   - **Unduh Backup Database**: Ekspor salinan konsisten langsung berupa file **SQLite `.db`** (via `VACUUM INTO`) atau snapshot **JSON**.

---

## 3. Ruang Kerja Utama — Panel Specs (3 Tab) & 2D Die-Line CAD

Workspace utama menampilkan 3 zona adaptif: **Panel Specs** di kiri, **Kanvas 2D/3D/Palletizer** di tengah, dan **Panel BCT Pro** di kanan.

### Pengaturan Satuan & Tampilan Responsif
- **Switcher 3 Unit (`mm` / `cm` / `in`)**: Berada di header panel Specs; seluruh dimensi L×W×H dikonversi otomatis secara presisi sambil mempertahankan presisi internal CAD `1:1 mm`.
- **4-Tier Responsive Workspace**:
  - `Desktop (≥1280px)`: Tiga kolom terbuka penuh.
  - `Compact (1024–1279px)`: Panel BCT Pro otomatis diperkecil agar kanvas tetap lega.
  - `Tablet (768–1023px)` & `Mobile (<768px)`: Panel Specs/Pallet & BCT Pro tampil sebagai *slide-over drawer* melalui **Mobile Floating Thumb Dock** di sisi bawah.
  - **Focus Mode (`F` / `Esc`)**: Menyembunyikan panel samping & footer dalam 1 klik untuk area kerja layar penuh.

### 3 Sub-Tab Panel Specs (`Sidebar.tsx`)
1. **Tab `Structure`**:
   - Pilihan standar **FEFCO** (`0200 HSC`, `0201 RSC`, `0202 OSC`, `0203 FOL`, `0204 CSSC`).
   - Mode dimensi **`Direct ID`** (input langsung dimensi dalam dus) vs **`Product fit`** (input ukuran produk + preset clearance *Snug*, *Standard E-Commerce*, *Protective*, atau *Custom per-axis* untuk mencegah *headspace*).
   - Pemilihan warna permukaan (*Kraft Brown* vs *Bleached White*), konstruksi dinding (*Single Wall* `F/E/B/C/A` vs *Double Wall* `EB/BC/AB/AA`), posisi *Glue Joint* (*Left* vs *Right*).
2. **Tab `Pre-press`**:
   - Batas cetak (*Print bleed*, *Score safe zone*), arah gelombang flute (*Vertical Load* vs *Horizontal*), serta *Glue flap no-ink knockout zone*.
   - **Perforation & Cutouts (13 Pola SRP Supermarket)**: Switch aktif untuk 13 pola *Shelf-Ready Packaging* & pegangan logistik (*Angled Hood*, *Drop-Front PDQ*, *Twin-Zipper*, *Split-Tray*, *Stepped Shelf-Tray + U-Scoop*, *Tear Strip*, *Carry Handles*, dll.) dengan aturan **Solid Cut (Non-Dash)** vs **Perforation Rules** (`6/3`, `5/3`, `4/4 mm`, atau kustom `cut/tie`).
3. **Tab `Title block`**:
   - Identitas gambar teknik (*Drawing title*, *Client*, *Part/SKU*, *Revision*), kode batang **GS1 ITF-14** (dengan validasi & *auto-fix* digit cek Modulo-10), serta catatan material untuk lembar produksi.

### Kanvas 2D Die-Line CAD (`BoxPreview.tsx`)
- Mendukung *pan & zoom* interaktif, *toggle* visibilitas layer (*Cut*, *Crease*, *Perforation*, *Bleed*, *Safe Zone*, *Glue Knockout*, *Dimensions*, *Product Fit*, *ITF-14*).
- Ekspor presisi **1:1 mm** ke **SVG** dan **PDF** (pilihan *Clean CAD* untuk mesin potong/plotter maupun *Spec Sheet* lengkap dengan *title block*).

---

## 4. Simulator 3D Fit & Interactive SRP Tear (`Box3DViewer.tsx`)

Beralih ke tab **`3D`** pada bilah atas untuk inspeksi struktural tiga dimensi:
- **Preset & Slider Lipat (`0–100%`)**: Tombol cepat **`Flat`**, **`Open`**, **`Closed`** serta slider ringkas `64px` untuk memantau lipatan flap, celah sudut, dan kesesuaian produk di dalam dus.
- **Mode `X-Ray`**: Mengaktifkan transparansi dinding karton agar celah produk (*cavity clearance*) terlihat jelas dari segala sisi.
- **Simulasi Sobekan SRP (`Peel` / `Reset`, `0–100%`)**: Aktif otomatis bila *Perforation & Cutouts* dihidupkan pada tab `Pre-press`, mensimulasikan proses pengelupasan/sobekan boks menjadi baki pajang ritel.
- **Kapsul Kamera POV & Short-Landscape HUD**: Kapsul kanan-atas (`Iso / Front / Top / Side`) dan bilah kontrol mengambang otomatis pada layar lanskap pendek (`height ≤ 500px`).
- **Pemulihan WebGL Otomatis**: Jika GPU browser memutus konteks WebGL (`webglcontextlost`), overlay pemulihan muncul sehingga viewport 3D bisa diaktifkan kembali tanpa kehilangan data desain.

---

## 5. Palletizer Pro 3D & Export Laporan PDF A4 (`PalletizerWorkspace.tsx`)

Beralih ke tab **`Pallet`** untuk optimasi pemuatan palet secara *real-time* (didukung *Web Worker* agar UI tetap mulus):

1. **Konfigurasi Palet & Case-Pack Solver**:
   - Preset standar palet (`ISO 1200×1000`, `EUR 1200×800`, `US 1219×1016`, atau `Custom`), batas tinggi & bobot maksimum, serta pemecah *Case-Pack*.
   - Evaluasi otomatis berbagai pola susunan (*Interlock*, *Column*, *Pinwheel*, *Split*, *Hybrid*) lengkap dengan skor efisiensi area, volume, dan stabilitas gesekan/kelembapan.
   - **Perfectionist Size Tuning & Board Advice**: Banner rekomendasi interaktif untuk penyesuaian milimeter dimensi dus atau kenaikan spesifikasi papan demi efisiensi palet & keselamatan BCT.
2. **Mode Inspeksi 3D**:
   - **Normal Stack View**: Visualisasi tumpukan lengkap dengan toggle tampilan *Kraft/White* dan *X-Ray*.
   - **Mode `Heat-Map` (*Lock Heat-Map*)**: Mewarnai setiap karton berdasarkan status penguncian antar-layer (Hijau = terkunci silang kuat, Kuning = kolom 1:1 / marginal, Merah = sudut menggantung / *fault line*), lengkap dengan penanda sudut tak tertopang dan **Mini-Blueprint Overlap Layer 1 vs Layer 2**.
   - **Slider `Inspect Layer` (`Lyr 1..N`)**: Mengisolasi tumpukan hingga layer tertentu untuk memeriksa penempatan dus per tingkat.
3. **Export Laporan Engineering PDF A4 (2 Halaman Orthographic)**:
   - Klik **`Export PDF`** untuk membuka modal pengaturan ekspor dan mengunduh dokumen A4 2 halaman bergaya **Precision Tactile Studio** dengan header kiri **`DIBUAT OLEH APLIKASI DIECUT.ROOM`** dan logo resmi **Totale.Room** di sisi kanan:
     - **Halaman 1**: Ringkasan spesifikasi proyek, konfigurasi palet, metrik kapasitas/bobot/efisiensi, dan tabel *Case-Pack*.
     - **Halaman 2**: **4 POV Orthographic Normal** (`Iso` sudut curam ~40°, `Top` penuh tanpa terpotong, `Front`, `Side`) dengan pewarnaan kontras orientasi `0°` vs `90°` + outline tegas + dimensi vektor `L × W × T`, panel **Heat-Map (Iso & Top)**, serta panduan 2D **Layer 1 & Layer 2** bernomor untuk operator gudang.

---

## 6. Panel BCT Pro & Audit Struktural (`BCTInspectorRail.tsx` — 4 Sub-Tab)

Panel kanan mengevaluasi kekuatan tekan boks (*Box Compression Test*) secara langsung terhadap spesifikasi papan saat ini, dengan switcher satuan **`kgf` / `lbf`**:

1. **Tab `Calc` (Kalkulator BCT)**:
   - Pemilih mesin rumus **`TAPPI / ISO Calibrated`** vs **`BCT Pro Legacy`**.
   - Pemilihan komposisi kertas 3-ply / 5-ply (hingga **K300**, *White Top Kraft*, *Testliner*, *Semi-Chem* medium), *custom RCT override*, simulasi penurunan akibat persentase cetak tinta per panel (*Print Coverage*), serta 5 faktor koreksi lingkungan (*kelembapan*, *durasi penyimpanan*, *pola tumpuk*, *handling*, *overhang*).
   - Menampilkan nilai BCT akhir, *Safe Stacking Load*, dan status keamanan (`AMAN` / `MARGINAL` / `KRITIS`).
2. **Tab `Audit` (Diagnostik & Board Upgrade Advisor)**:
   - Menjelaskan faktor penurun kekuatan terbesar dan menawarkan rekomendasi naik grade papan 1-klik bila status BCT belum memenuhi target tumpukan.
3. **Tab `Hist` (Riwayat Skenario Tersimpan)**:
   - Menyimpan, membandingkan, dan memuat kembali snapshot perhitungan BCT per akun yang tersinkronisasi di database SQLite server (`/api/history`).
4. **Tab `Cmp` (Perbandingan Multi-Grade)**:
   - Membandingkan performa BCT, ketebalan, dan estimasi bobot lintas kombinasi flute dan grade kertas secara berdampingan.

---

## 7. Modal Operasional — Pre-Flight Engineering Sheet & Saved Projects

1. **Pre-Flight Engineering Sheet (`EngineeringSheet.tsx`)**:
   - Dibuka melalui tombol **`Pre-Flight`** di bilah atas.
   - Menjalankan **8 aturan audit produksi CAD** (clearance produk, rasio flap, validitas ITF-14, zona bebas tinta glue flap, aturan Rule 8 SRP, keselamatan BCT, dll.), menyediakan tombol **1-Klik Auto-Fix**, serta rincian estimasi luas blanko, limbah potong (*waste*), dan kalkulasi biaya batch (*costing*).
2. **Saved Box Projects (`ProjectsModal.tsx`)**:
   - Dibuka melalui tombol **`Projects`** di bilah atas.
   - Menyimpan seluruh konfigurasi `BoxConfig` ke akun masing-masing di server (`/api/projects`), memuat kembali proyek lintas perangkat, menghapus proyek lama, atau menampilkan *empty state* bersih saat belum ada proyek tersimpan.
