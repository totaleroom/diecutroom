# 01. Panduan Pengguna & Administrator — DieCut.Room

Dokumen ini menjelaskan seluruh alur kerja harian untuk **Pengguna Reguler (Packaging Engineer / Operator)** maupun **Administrator** di **DieCut.Room**.

---

## 1. Alur Akses Akun, Portal Halftone & Konfirmasi WhatsApp

**DieCut.Room** berjalan secara **privat** pada domain/subdomain VPS Anda. Pengunjung tanpa sesi login aktif akan diarahkan ke layar gerbang akses (*Auth Gate*) berdesain lembar cetak offset putih matte sudut tegas (`2px`) berbingkai dot halftone dan gradasi raster kanan atas di atas kanvas matriks interaktif gelap.

### A. Pendaftaran User Baru
1. Pada halaman login, pilih tab **Daftar**.
2. Isi **Nama lengkap**, **Tim / Perusahaan** (opsional), **Alamat email**, dan **Password** (minimal 6 karakter).
3. Klik **Ajukan Pendaftaran Akun**.
4. Akun baru otomatis tersimpan di database server dalam status **`Pending`** dan **belum dapat masuk** ke workspace hingga diaktifkan oleh Admin.
5. Layar otomatis menampilkan kartu **Menunggu Persetujuan Admin** dengan tombol hijau berlogo WhatsApp (**Kirim Konfirmasi ke WhatsApp Admin**).
6. Klik tombol tersebut untuk membuka chat WhatsApp ke **`+62 821-2508-6328`** berisi template pesan *"Halo Admin, saya ingin akses DieCut.Room..."* lengkap dengan data user serta **metadata asal akses** (subdomain/URL, referrer, perangkat/OS, browser, resolusi layar, mode PWA/browser, dan waktu lokal).

### B. Kebijakan Lupa Password (Tanpa Self-Service Reset)
* Demi menjaga kontrol akses privat, user biasa **tidak dapat** melakukan reset password sendiri melalui email.
* Pada tab **Masuk**, tersedia tombol **Lupa Password · Hubungi Admin WhatsApp**.
* Saat diklik, tombol menyertakan email yang diketik beserta metadata perangkat & URL asal akses langsung ke WhatsApp Admin (`+6282125086328`).
* Setelah memverifikasi identitas user via WhatsApp, Admin langsung mengetikkan password baru untuk akun tersebut di Panel Admin dan mengirimkannya kembali ke user.

### C. Pengoperasian Panel Admin (`Users`)
Saat login sebagai **Admin**, tombol **Users** muncul pada bar atas workspace (atau di menu `···` pada layar sempit):
* **Filter & Pencarian**: Saring berdasarkan status (`Semua`, `Pending`, `Aktif`, `Nonaktif`) atau cari berdasarkan nama, email, perusahaan, subdomain origin, maupun perangkat.
* **Inspeksi Provenance / Asal Akses**: Setiap baris user menampilkan `Origin` URL/subdomain, `Perangkat`, `IP` terakhir, tanggal daftar, waktu login terakhir, serta jumlah Proyek & Riwayat BCT yang disimpan.
* **Aktifkan / Nonaktifkan**:
  * Klik **Aktifkan** pada user berstatus `Pending` atau `Nonaktif` agar user bisa langsung login.
  * Klik **Nonaktifkan** untuk mencabut akses seketika; sesi aktif user tersebut otomatis ditolak pada pengecekan API berikutnya.
* **Set Password**: Klik **Set Password**, masukkan password baru (minimal 6 karakter), lalu klik **Simpan Password**.
* **Hapus Akun**: Klik **Hapus** lalu **Konfirmasi Hapus** untuk menghapus akun beserta seluruh riwayat BCT dan proyek tersimpannya di database secara permanen (sistem melindungi akun Admin yang sedang aktif agar tidak terhapus sendiri).

---

## 2. Navigasi Responsif Multi-Layar, Focus Mode & Mobile Landscape

**DieCut.Room** beradaptasi otomatis pada desktop lebar, laptop kompak, tablet, smartphone portrait, hingga smartphone landscape:

* **Auto-Minimize Berdasarkan Ukuran Layar**:
  * **Desktop (`>= 1280px`)**: Panel Spesifikasi/Pallet kiri dan panel BCT Pro kanan terbuka penuh berdampingan.
  * **Laptop Kompak (`1024–1279px`)**: Panel BCT Pro kanan otomatis diminimalkan menjadi laci (*overlay*) agar kanvas CAD tetap lega.
  * **Tablet & Smartphone (`< 1024px`)**: Kedua panel samping otomatis diminimalkan agar kanvas 2D/3D langsung memenuhi layar.
* **Tombol Minimalkan Langsung & Handle Tepi**: Setiap header panel kiri/kanan dilengkapi tombol tutup/minimalkan langsung (`PanelLeftClose` / `PanelRightClose`), ditambah pegangan cepat mengambang di tepi kiri/kanan saat panel tertutup.
* **Focus Mode 1-Klik (`F` / `Esc`)**: Klik tombol **Fokus** (atau tekan tombol `F` pada keyboard) untuk menyembunyikan seluruh panel dan bar header agar kanvas 2D/3D maksimal. Tekan `Esc` atau klik **Keluar Fokus** di pojok kanan atas untuk kembali.
* **Mobile Portrait & Header Adaptif (`···`)**: Pada smartphone portrait, aksi sekunder (*Proyek*, *Users*, *Install PWA*, *Logout*) diringkas ke menu `···`, sementara di bagian bawah muncul **Mobile Floating Thumb Dock** (`Specs / Pallet | BCT | Fokus`).
* **Smartphone Landscape Pendek (`tinggi <= 500px`)**: Dock mengambang tengah disembunyikan otomatis agar tidak menutupi objek 3D; tombol kontrol dipindah ke header dan panel bawah 3D/Palletizer berubah menjadi **bar mengambang super tipis 1 baris**.

---

## 3. Alur Kerja 2D Dieline CAD (Sidebar Kiri)

### Tab `Structure`
1. **Box Style (FEFCO)**:
   * `0201 (RSC)`: Regular Slotted Container — flap atas dan bawah bertemu di tengah (`W/2`).
   * `0200 (HSC)`: Half Slotted Container — kotak terbuka di atas (hanya flap bawah).
   * `0202 (OSC)`: Overlap Slotted Container — flap luar bertumpuk sejauh `Flap overlap (mm)`.
   * `0203 (FOL)`: Full Overlap Slotted — flap luar selebar penuh `W` untuk kekuatan tumpuk maksimum.
   * `0204 (CSSC)`: Center Special Slotted Container — flap dalam (`L/2`) dan luar (`W/2`) bertemu rata tanpa celah tengah.
2. **Dimension Mode (`Product fit` vs `Box ID`)**:
   * Mode **Product fit** menghitung Dimensi Dalam (`ID`) otomatis dari ukuran produk ditambah toleransi preset (`Snug +2/+2/+0.5 mm`, `Standard +4/+4/+2 mm`, `Protective +12/+12/+10 mm`, atau `Custom`).
   * Tombol cepat **Snap 0.5mm Headspace** langsung mengatur clearance tinggi menjadi `0.5 mm` untuk meminimalkan guncangan vertikal produk.
3. **Corrugated Board & Wall**:
   * Pilih `Single Wall` (`F`, `E`, `B`, `C`, `A`) atau `Double Wall` (`EB`, `BC`, `AB`, `AA`). Ketebalan flute otomatis tersinkron dengan kalkulator BCT Pro di sidebar kanan.
4. **Advanced CAD Rules**:
   * Atur `Glue flap`, `Slot gap`, `Flap gap`, kompensasi sudut `Fishtail`, serta opsi pengurangan kedalaman efektif akibat ketebalan lipatan flap dalam (`Compensate inner flap depth`).

### Tab `Features`
1. **Pre-Press Print Boundaries**:
   * Atur `Print bleed` (`0–15 mm`), `Score safe zone` (`2–25 mm`), arah gelombang kertas (**Vertical (Load)** vs **Horizontal**), serta zona bebas tinta pada glue flap (`Glue flap no-ink zone`).
2. **Perforation & Cutouts (13 Template + Dash / Non-Dash)**:
   * **Kategori SRP Supermarket**: *SRP Angled Hood Tear*, *Drop-Front PDQ Tray* (dengan crease engsel merah pada bibir retainer bawah), *Twin-Zipper Front Window*, *Split-Tray Twin-Pack*.
   * **Kategori Shelf-Tray & Scoop**: *Stepped Shelf-Tray + U-Scoop*, *Front Display Window*, *U-Scoop Retail Picker*, *Lower Tray Wrap-Around*.
   * **Kategori Logistics & Vent**: *Horizontal Tear Strip*, *Courier Zipper Rule*, *Thumb Hole Punch*, *Side Carry Handles*, *Airflow Ventilation Slots*.
   * **Rule Style (Dash / Non-Dash)**: `Solid Cut (Non-Dash)` (`0/0 mm`), `Fine Perf (6/3 mm)`, `Standard SRP (5/3 mm)`, `Heavy Duty (4/4 mm)`, atau `Custom (Cut / Tie mm)`.
3. **GS1 ITF-14 Barcode**:
   * Validasi panjang 14 digit dan **check digit Modulo-10** otomatis + tombol koreksi (`Auto-fix`), serta pemilihan panel (`L1`, `W1`, `L2`, `W2`).

### Tab `Metadata`
* Mengisi kolom Title Block produksi: *Product Name*, *Substance* (sinkron dua arah dengan komposisi lapisan di BCT Pro), *Ink Colors* & *Color Codes*, *Operator*, *QA Signee*, *Date*, dan *Notes*.

---

## 4. Simulasi 3D Fit & Sobek Perforasi SRP

Masuk melalui tab mode **3D** di header atas:
* **Kapsul Preset Kamera POV (Pojok Kanan Atas Kanvas)**: Tombol cepat `Iso`, `Front`, `Top`, `Side`, dan `Reset (↺)` dengan transisi kamera teredam halus (berhenti otomatis bila user menyeret orbit secara manual), terpisah bersih dari kontrol lipatan bawah.
* **Panel Pojok Kiri Atas (*SRP & Cavity Clearance*)**:
  * Menampilkan `Box inner (ID)`, kelonggaran sisi (`Side clearance L/W`), `Top headspace`, serta persentase pengisian volume (`Volume fill %`).
  * **Simulasi Tear / Open SRP (`0–100%`)**: Muncul otomatis saat *Perforation & Cutouts* aktif. Geser slider ringkas (`64px` aman batas kartu di mobile vertikal) atau klik **Peel / Open SRP** untuk melihat animasi 3D nyata sesuai jenis template.
* **Dock Bawah (Tombol `H` untuk sembunyikan/tampilkan)**:
  * **Fold (`0–100%`)** dengan slider ringkas `64px` anti-tembus border dan preset `Flat`, `Open`, `Closed` untuk memutar lipatan seluruh panel dinding serta flap atas/bawah.
  * **X-Ray fit** untuk transparansi karton guna memeriksa batas dalam produk dan volume headspace.
  * Pada layar smartphone landscape pendek, dock otomatis menyusut menjadi **bar mengambang super tipis** agar ruang pandang 3D tetap lega.

---

## 5. Palletizer Pro 3D & Smart Advisor

Masuk melalui tab mode **Palletizer** di header atas untuk menyusun Master Carton di atas palet secara real-time:
* **Konfigurasi Palet & Case-Pack**: Pilih standar palet (`EUR 1200×800`, `ISO 1200×1000`, `US GMA 48×40 in`, atau `Custom`), tinggi susun maksimum, serta **Case-Pack Solver** yang menghitung kombinasi optimal jumlah produk per karton beserta ketebalan sekat (*divider*) dan *bulge allowance*.
* **Evaluasi Pola Tumpukan & Fisika Stabilitas**: Bandingkan pola *Interlock*, *Column Stack*, *Pinwheel*, *Split*, dan *Hybrid* lengkap dengan metrik efisiensi area/volume, pergeseran gesek permukaan karton, ketahanan kelembaban gudang, dan saran dimensi kotak (**Perfectionist Size Tuning**).
* **Kontrol 3D Terpadu**: Dilengkapi kapsul POV kamera sudut kanan atas, overlay visibilitas (*Fault lines*, *X-Ray*, *Labels*), serta mode bar tipis di smartphone landscape.

---

## 6. Ekspor Dieline 2D, Proyek Tersimpan & BCT Pro

* **Toolbar Workspace 2D**: Zoom/Fit + geser kanvas (*Pan*) dan toggle layer (*Dimensions*, *Product Fit*, *ITF-14 Barcode*, *Title Block*, *Grid*, *Print Bleed*, *Score Safe Zone*, *Glue Knockout*, *Flute Grain*).
* **Mode Ekspor SVG / PDF (`1:1 mm`)**:
  * `Spec Sheet`: Ekspor gambar teknik lengkap Title Block, legenda garis, dimensi, barcode, dan overlay pre-press.
  * `Clean CAD`: Ekspor **hanya** layer vektor produksi (`LAYER_CUT`, `LAYER_CREASE`, `LAYER_PERFORATION`, plus `LAYER_BARCODE` jika aktif) skala tepat **1:1 mm** untuk **Adobe Illustrator**, **CorelDRAW**, atau plotter/die-cutter.
* **Proyek Tersimpan (`Proyek` di Header)**: Simpan seluruh konfigurasi ukuran, FEFCO, perforasi, pre-press, dan komposisi kertas BCT Anda ke SQLite VPS, lalu muat kembali dari perangkat lain.
* **BCT Pro Sidebar Kanan & Pre-Flight (`Pre-flight` / `Stack kgf`)**: Pilih metode `TAPPI / ISO` vs `BCT Pro Legacy`, simulasi *Print Coverage* per panel, simpan riwayat ke VPS, dan jalankan **8 aturan audit produksi** lengkap dengan **1-Click Auto-Fix**.
