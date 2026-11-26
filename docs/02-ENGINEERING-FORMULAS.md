# 02. Referensi Matematika & Rumus Teknik BCT, ECT, Palletizer & Costing

Dokumen ini memaparkan secara transparan seluruh basis data material kertas, faktor konversi, rumus fisika kemasan bergelombang (*corrugated board*), perbedaan mode **TAPPI / ISO Calibrated** dan **BCT Pro Legacy**, serta logika optimasi **Palletizer Pro 3D** di dalam **DieCut.Room**.

---

## 1. Konstanta Dasar & Konversi Satuan

$$
1\text{ inch} = 25.4\text{ mm} \quad (\text{atau } 1\text{ mm} = 0.0393701\text{ in})
$$
$$
1\text{ kgf/cm} = 5.59974\text{ lbf/in}
$$
$$
1\text{ lbf} = 0.453592\text{ kgf}
$$
$$
K_{\text{McKee}} = 5.87
$$

---

## 2. Katalog Grade Kertas (RCT & GSM)

Nilai **Ring Crush Test (RCT)** dinyatakan dalam satuan $\text{kgf/cm}$ dan gramatur dalam $\text{g/m}^2$ (`GSM`). Pengguna dapat menimpa nilai RCT standar per lapisan dengan mengaktifkan **Custom RCT Override**.

### Linerboard (Kraft, White Top, Testliner)
| Kategori | Kode Grade | RCT ($\text{kgf/cm}$) | GSM ($\text{g/m}^2$) |
| :--- | :--- | :---: | :---: |
| **Kraft Liner** | `K110`, `K125`, `K140`, `K150` | `1.00`, `1.20`, `1.42`, `1.60` | `110`, `125`, `140`, `150` |
| **Kraft Liner** | `K175`, `K200`, `K220`, `K250`, `K275`, `K300` | `1.95`, `2.35`, `2.65`, `3.05`, `3.40`, `3.80` | `175`, `200`, `220`, `250`, `275`, `300` |
| **White Top Kraft** | `WKL140`, `WKL175`, `WKL200` | `1.35`, `1.85`, `2.25` | `140`, `175`, `200` |
| **Testliner** | `TL115`, `TL125`, `TL140`, `TL150`, `TL175`, `TL200` | `0.85`, `0.95`, `1.10`, `1.25`, `1.55`, `1.85` | `115`, `125`, `140`, `150`, `175`, `200` |

### Corrugating Medium & Semi-Chemical Fluting
| Kategori | Kode Grade | RCT ($\text{kgf/cm}$) | GSM ($\text{g/m}^2$) |
| :--- | :--- | :---: | :---: |
| **Standard Medium** | `M100`, `M110`, `M125`, `M140`, `M150`, `M165`, `M180`, `M200` | `0.68`, `0.78`, `0.95`, `1.15`, `1.35`, `1.50`, `1.65`, `1.85` | `100` s.d. `200` |
| **Semi-Chem Fluting** | `SC125`, `SC150`, `SC175` | `1.20`, `1.55`, `1.85` | `125`, `150`, `175` |

---

## 3. Spesifikasi Flute & Take-Up Factor (TUF)

| Flute | Jenis Dinding | Ketebalan Nominal $h$ (mm) | TUF TAPPI ($\text{TUF}_1 / \text{TUF}_2$) | Legacy TUF (`BCT Pro`) |
| :---: | :--- | :---: | :---: | :---: |
| `F` | Single Wall | `0.80` | `1.21` | `0.70` |
| `E` | Single Wall | `1.50` | `1.26` | `0.85` |
| `B` | Single Wall | `3.18` | `1.33` | `1.00` |
| `C` | Single Wall | `3.97` | `1.44` | `1.40` |
| `A` | Single Wall | `4.76` | `1.54` | `1.60` |
| `EB` | Double Wall | `4.50` | `1.26 / 1.33` | `2.10` |
| `BC` | Double Wall | `7.14` | `1.33 / 1.44` | `2.60` |
| `AB` | Double Wall | `7.94` | `1.54 / 1.33` | `2.80` |
| `AA` | Double Wall | `10.00` | `1.54 / 1.54` | `3.10` |

### Gramatur Total Karton (`boardGsm`)
* **Single Wall (3-Lapis)**:
  $$\text{GSM}_{\text{SW}} = \text{GSM}_{L_1} + (\text{GSM}_{M_1} \times \text{TUF}_1) + \text{GSM}_{L_2}$$
* **Double Wall (5-Lapis)**:
  $$\text{GSM}_{\text{DW}} = \text{GSM}_{L_1} + (\text{GSM}_{M_1} \times \text{TUF}_1) + \text{GSM}_{L_{\text{center}}} + (\text{GSM}_{M_2} \times \text{TUF}_2) + \text{GSM}_{L_2}$$

---

## 4. Perbandingan Metode Estimasi ECT (Edge Crush Test)

Prioritas sumber ECT diurutkan sebagai:
1. **`ACTUAL_ECT`** — Menggunakan angka hasil uji lab (*Actual Lab ECT*) jika diaktifkan user.
2. **`STANDARD_ECT`** — Menggunakan tabel standar referensi pabrik terkalibrasi (10 kombinasi utama untuk mode Legacy; tabel diperluas mencakup E/A-Flute & komposisi Double Wall `BC`/`AB` untuk mode TAPPI).
3. **`ESTIMATED_ECT`** — Menghitung estimasi ECT secara analitik dari RCT masing-masing lapisan kertas:

* **Mode TAPPI / ISO Calibrated (`estimateTappiEctFromLayers`)**:
  Mengalikan Take-Up Factor hanya pada lapisan medium (gelombang) karena hanya kertas medium yang mengalami peregangan panjang akibat proses *fluting*:
  * Single Wall (3-ply):
    $$\text{ECT}_{\text{TAPPI}} = 0.88 \times \left(\text{RCT}_{L_1} + \text{RCT}_{L_2} + \text{TUF}_1 \cdot \text{RCT}_{M_1}\right)$$
  * Double Wall (5-ply):
    $$\text{ECT}_{\text{TAPPI}} = 0.85 \times \left(\text{RCT}_{L_1} + \text{RCT}_{L_c} + \text{RCT}_{L_2} + \text{TUF}_1 \cdot \text{RCT}_{M_1} + \text{TUF}_2 \cdot \text{RCT}_{M_2}\right)$$

* **Mode BCT Pro Legacy (`estimateLegacyBctProEct`)**:
  Mempertahankan rumus historis aplikasi pembanding untuk keperluan audit:
  $$\text{ECT}_{\text{Legacy}} = 0.65 \times \left((\text{RCT}_{L_1} + \text{RCT}_{L_2}) \cdot \text{TUF}_{\text{legacy}} + 0.5 \cdot \text{RCT}_{M_1}\right)$$

---

## 5. Persamaan McKee BCT (Box Compression Test)

Konversi satuan ke imperial dilakukan sebelum memasukkan rumus McKee klasik:

$$
\text{ECT}_{\text{lbf/in}} = \text{ECT}_{\text{kgf/cm}} \times 5.59974
$$
$$
h_{\text{in}} = h_{\text{mm}} \times 0.0393701
$$

Perbedaan **Perimeter $Z$** antara kedua mode:
* **Mode TAPPI / ISO**: Menggunakan **Outer Dimensions (OD)** perimeter garis skor:
  $$Z_{\text{OD}} = 2 \cdot (L_{\text{OD}} + W_{\text{OD}}) \times 0.0393701$$
* **Mode BCT Pro Legacy**: Menggunakan **Inner Dimensions (ID)** perimeter:
  $$Z_{\text{ID}} = 2 \cdot (L_{\text{ID}} + W_{\text{ID}}) \times 0.0393701$$

**BCT Teoritis (McKee Formula)**:
$$
\text{BCT}_{\text{est (lbf)}} = 5.87 \times \text{ECT}_{\text{lbf/in}} \times h_{\text{in}}^{0.508} \times Z_{\text{in}}^{0.492}
$$
$$
\text{BCT}_{\text{est (kgf)}} = \text{BCT}_{\text{est (lbf)}} \times 0.453592
$$

---

## 6. Simulasi Visual Print Coverage & Faktor Derating Lingkungan

### A. Print Coverage Berbobot Luas Panel
Simulasi interaktif 4 panel ($L_1, W_1, L_2, W_2$) menghitung rata-rata cakupan tinta tertimbang terhadap panjang keliling box:
$$
C_{\text{weighted}} = \frac{c_{L_1} \cdot L + c_{W_1} \cdot W + c_{L_2} \cdot L + c_{W_2} \cdot W}{2(L + W)}
$$
Semakin banyak warna dan cakupan tinta (*ink crush* pada roll flexo), faktor reduksi kekuatan cetak dihitung sebagai:
$$
F_{\text{print}} = \max\left(0.65,\; 1 - \left(\frac{C_{\text{weighted}}}{100} \cdot 0.18 + \min(\text{colors}, 6) \cdot 0.015\right)\right)
$$

### B. Faktor Koreksi Lingkungan & Operasional (Kalibrasi Iklim Tropis Indonesia — BMKG / FBA / TAPPI T402)
1. **Kelembaban Relatif ($RH\%$, Kurva Non-Linear FBA/Kellicutt — Default `75% RH`)**:
   Interpolasi piecewise-linear berdasarkan tabel retensi serat selulosa FBA/Kellicutt yang dikalibrasi untuk musim & gudang non-AC Indonesia:
   * `50% RH` (Lab TAPPI / AC) → **`1.00`** (`100%`)
   * `60% RH` (Gudang Kering / Kemarau) → **`0.90`** (`90%`)
   * `65% RH` → **`0.85`** (`85%`)
   * `70% RH` (Transisi) → **`0.78`** (`78%`)
   * `75% RH` *(Default Gudang Industri Non-AC Indonesia)* → **`0.71`** (`71%`)
   * `80% RH` (Pesisir / Awal Musim Hujan) → **`0.62`** (`62%`)
   * `85% RH` (Musim Hujan / Pelabuhan) → **`0.52`** (`52%`)
   * `90% RH` (Hujan Ekstrem / Kontainer Laut) → **`0.42`** (`42%`)
   * `95% RH` (Kondensasi / Cold-Chain Basah) → **`0.33`** (`33%`)
2. **Handling Risk (Default `Aktif` untuk distribusi campuran Indonesia)**:
   * `Aktif`: **`0.82`** (`-18%` bongkar-muat manual / LTL / jalan bergetar)
   * `Nonaktif`: **`1.00`** (gudang modern *full-forklift & palletized*)
3. **Stabilitas Rasio Tinggi (`D`) terhadap $\sqrt{L \cdot W}$**:
   * $R = \frac{D}{\sqrt{L \cdot W}} \le 1.5 \rightarrow 1.0$
   * $1.5 < R \le 2.5 \rightarrow \max(0.75,\; 1 - (R - 1.5) \cdot 0.12)$
   * $R > 2.5 \rightarrow \max(0.65,\; 0.88 - (R - 2.5) \cdot 0.10)$
4. **Orientasi Flute Grain (TAPPI / ISO Engine Tunggal)**:
   * `1.0` untuk *Vertical (Load)*, dan penalti tekuk kolom **`0.55`** bila *Horizontal*.

### C. BCT Efektif & Beban Tumpuk Aman Maksimum
$$
F_{\text{total}} = F_{\text{print}} \times F_{\text{RH}} \times F_{\text{handling}} \times F_{\text{stability}} \times F_{\text{grain}}
$$
$$
\text{BCT}_{\text{corrected}} = \text{BCT}_{\text{est}} \times F_{\text{total}}
$$
$$
\text{Max Safe Stacking Load} = \frac{\text{BCT}_{\text{corrected}}}{\text{Safety Factor}}
$$
*(Safety Factor default: **`4:1` Gudang & Distribusi Indonesia**, dengan pilihan `3:1` Gudang AC / Jangka Pendek, `5:1` Ekspedisi LTL / Antar Pulau, dan `6:1` Musim Hujan / Kontainer Laut).*

### D. Berat Nett Produk & Rekomendasi Material Bertahap (Anti-Overspec)
* Setiap box memiliki input tersinkronisasi **`Berat Nett Produk / Dus (kg)`** dengan nilai default **`1.0 kg`** bila dikosongkan.
* Berat kotor dus otomatis dihitung sebagai `Gross = Nett + Tare Karton (netBoxAreaSqm × boardGsm / 1000)` dan langsung menggerakkan beban lapisan bawah, intensitas warna **3D Heat-Map Palletizer**, kapasitas armada, serta katalog **2–3 kandidat material bertahap** (`Paling Pas`, `Seimbang`, `Cadangan`) yang memilih resep kertas paling ringan dan hemat tanpa *overspec* yang tetap lolos beban tumpukan pada RH, Handling, dan SF aktif.

---

## 7. Audit Pre-Flight & Biaya Produksi

* **8 Aturan Pre-Flight**:
  1. Rasio tinggi-lebar dan kecukupan *Product Clearance* (mendeteksi interferensi atau headspace berlebih $>6\text{ mm}$).
  2. Kecukupan dimensi minimum glue flap & panjang flap lipat.
  3. Kompensasi kedalaman flap dalam terhadap ketebalan flute (`Flute B/C/BC` dll.).
  4. Arah serabut flute vertikal vs horizontal.
  5. Validitas 14 digit & check digit Modulo-10 GS1 **ITF-14**.
  6. Gangguan tinta pada area glue flap (*Glue Knockout Zone*) & margin aman garis lipat (*Score Safe Zone*).
  7. Ketahanan *Safe Stacking Load* pada lingkungan lembab/cetak pekat.
  8. **Rule 8 — Integritas SRP & Perforasi**: Peringatan konflik apabila pola tray SRP berpasangan dengan flute horizontal, atau apabila pola tear-hood SRP menggunakan *Solid Cut* (`0 mm` tie nick).
* **Blank Waste & Batch Costing**:
  Menghitung luas kotor lembaran (*Gross Blank Area*), pengurangan potongan slot atas/bawah serta sudut miring glue flap (*Net Box Area*), persentase *Scrap Waste %*, biaya per unit box ($\text{Gross Area m}^2 \times \text{Harga per m}^2$), dan tier diskon volume (`100`, `500`, `1.000`, `5.000`, `10.000 pcs`).

---

## 8. Optimasi Case-Pack & Fisika Stabilitas Palletizer Pro

* **Case-Pack Solver (`computeCasePackSolutions`)**:
  Memfaktorisasi jumlah unit per karton ($N = n_x \times n_y \times n_z$), mengevaluasi orientasi produk primer (persegi panjang maupun silinder, opsional *upright-only*), lalu menambahkan kelonggaran dinding mengembung (*bulge*), ketebalan sekat (*divider*), dan bantalan lapisan (*layer pad*) untuk menghitung `ID` dan `OD` Master Carton serta efisiensi pemakaian papan karton.
* **Evaluasi Pola & Stabilitas Palet (`evaluateAllPalletPatterns`)**:
  Menguji susunan *Interlock*, *Column*, *Pinwheel*, dan *Split-Block* terhadap zona efektif palet (**Kebijakan Zero-Overhang & Underhang Aman**), tare palet (`22 kg`), koefisien gesek permukaan karton, estimasi ketahanan burst (`Burst kPa`), retensi BCT antar-lapis (*bottom-layer load vs Max Safe Stacking Load*), serta penyelarasan garis patahan (*fault-line interlocking*) antar lapisan ganjil-genap.
* **Kebijakan Zero-Overhang & Margin Underhang (`normalizePalletEdgeMarginMm`, `computeEffectivePalletDims`)**:
  - Rentang margin tepi (`allowedOverhangMm`) dikunci pada **`-50 mm` hingga `0 mm` per sisi** (bawaan **`-10 mm/sisi`**), menghilangkan *overhang* positif agar tidak terjadi senggolan antar-palet, benturan rak/kontainer, maupun penurunan BCT 30–40%.
  - Zona efektif muat dihitung sebagai $L_{\text{eff}} = \max(300,\ L_{\text{palet}} + 2m)$ dan $W_{\text{eff}} = \max(300,\ W_{\text{palet}} + 2m)$ dengan $m \in [-50, 0]\ \text{mm}$, sedangkan persentase efisiensi area/kubik tetap dihitung secara jujur terhadap luas palet fisik penuh.
  - **Diagnostik Inset Aktual (`underhangL`, `underhangW`, `edgeStatus`)**:
    - `optimal` (`5–25 mm/sisi`): Aman dari senggolan tepi & menyediakan ruang toleransi *sidewall bulge* karton.
    - `flush-risk` (`< 5 mm/sisi`): Peringatan mepet tepi — *bulge* 5–15 mm saat ditumpuk/lembap berisiko mendorong dus melewati tepi dek.
    - `excessive-underhang` (`> 25 mm/sisi`): Peringatan celah papan dek (menyarankan *Bottom Slip Sheet*), potensi robek *stretch wrap* di sudut kayu, serta saran *Auto-Tuning ±20 mm*.
    - `overhang` (`> 0.5 mm`): Hanya muncul bila ukuran tunggal 1 dus melebihi dimensi fisik dek palet.
* **Perataan Sisi Luar 3-Mode (`Perataan Sisi Luar` / Flush Perimeter: `auto`, `flush`, `compact`)**:
  - Menghilangkan sudut gantung tepi luar (*outer overhanging corner*) pada pola campuran (mis. blok 2×3 + strip 2 dus) dengan mendorong dus di tiap strip/band agar rata dengan 4 sisi terluar susunan (`applyPerimeterFlush`) sambil mempertahankan 100% batas zona efektif *Zero-Overhang* dan jumlah dus/layer.
  - **Mode `auto` (Bawaan)**: Membandingkan kandidat `compact` vs `flush` untuk setiap pola; mengaktifkan `flush` secara otomatis hanya apabila celah tengah hasil perataan (`maxInternalGapMm`) `<= 60 mm`, jumlah *cleavage fault* tidak memburuk, dan dukungan sudut/interlock meningkat atau sama.
  - **Mode `flush` (`Rata Sisi`)**: Selalu meratakan 4 sisi luar palet untuk memaksimalkan kekokohan sudut luar dan meminimalkan sudut gantung.
  - **Mode `compact` (`Rapat`)**: Menyusun seluruh dus rapat tanpa celah internal.
  - **Pengukuran & Guardrail Celah Tengah (`measureInternalGaps`)**: Mendeteksi serta menggabungkan saluran celah internal `>= 4 mm` (`oddInternalGaps`, `evenInternalGaps`); memberi peringatan *inward-shift / chimney void* ketika `maxInternalGapMm > 50 mm` dengan rekomendasi *Tier Sheet* antar-layer atau peralihan ke mode `Rapat`.

---

## 9. Parameter Armada, Kontainer Indonesia & Clearance Forklift (`src/utils/vehicleLoading.ts`)

Simulasi muat armada mencocokkan dimensi palet aktual (termasuk tinggi dek kayu & tumpukan dus) terhadap 11 preset kendaraan & kontainer di Indonesia (**ISO 20' GP**, **40' GP**, **40' HC**, **20' Reefer**, **40' HC Reefer**, **CDE Box**, **CDD Box**, **CDD Long**, **Fuso Box**, **Tronton Box**, **Tronton Wingbox**) maupun dimensi kustom (*Karoseri Non-Standar*).

### A. Amplop Dimensi Efektif & Toleransi Karoseri Non-Standar
Untuk mengantisipasi variasi dinding bergelombang, rel pengaman, atau ketidakstandaran karoseri truk boks Indonesia (`±50–150 mm`), dimensi bersih yang dipakai perhitungan muat dikurangi toleransi karoseri (`nonStandardToleranceMm`, bawaan `0 mm` untuk kontainer ISO dan `20–30 mm` untuk truk karoseri):
$$L_{\text{eff}} = L_{\text{int}} - 2 \cdot T_{\text{karoseri}} - C_{\text{rear}}$$
$$W_{\text{eff}} = \min(W_{\text{int}}, W_{\text{door}}) - 2 \cdot T_{\text{karoseri}} - 2 \cdot C_{\text{side}}$$
* $C_{\text{side}}$: Jarak aman dinding samping per sisi (`sideWallClearanceMm`, standar `30 mm` untuk *rear-door* kontainer ISO agar garpu *forklift* tidak menggesek dinding; `40 mm` untuk *Reefer* demi sirkulasi udara dingin; `25 mm` untuk *Wingbox* buka samping).
* $C_{\text{rear}}$: Ruang manuver pintu belakang (`rearDoorClearanceMm`, bawaan `80–100 mm`).
* $C_{\text{gap}}$: Celah antar-palet (`palletGapMm`, bawaan `20–25 mm`) agar palet tidak menyangkut saat ditarik/didorong *forklift* atau *hand pallet*.

### B. Bottleneck Tinggi Vertikal & Sinkronisasi Otomatis Tinggi Palet (1 Tier vs 2 Tier)
Tinggi maksimum tumpukan palet (`maxStackHeightMm`) disinkronkan secara otomatis terhadap batas terketat dari 3 hambatan vertikal:
1. **Hambatan Pintu Belakang (*Door Header Drop*)** — pada kontainer ISO (`20' GP`/`40' GP`), balok atas pintu lebih rendah `~115 mm` dari atap internal (`2275 mm` vs `2390 mm`); palet yang diangkat *forklift* (`forkliftLiftClearanceMm`, bawaan `100 mm`) wajib melewati bukaan pintu ini:
   $$H_{\text{door\_limit}} = H_{\text{door}} - T_{\text{karoseri}} - C_{\text{lift}}$$
2. **Batas Atap Internal**:
   $$H_{\text{roof\_limit}} = H_{\text{int}} - T_{\text{karoseri}} - C_{\text{roof}}$$
3. **Batas Garis Merah Reefer (*Red Load Line*)** — wajib menyisakan saluran udara dingin (*T-bar floor* ke langit-langit evaporator):
   $$H_{\text{reefer\_limit}} = H_{\text{red\_line}} - C_{\text{roof}}$$

Sehingga batas vertikal total yang tersedia di dalam armada adalah:
$$H_{\text{avail}} = \min(H_{\text{door\_limit}},\; H_{\text{roof\_limit}},\; H_{\text{reefer\_limit}})$$

Batas tinggi per palet (`maxStackHeightMm`) bergantung pada jumlah tingkat tumpukan palet (`1 Tier` vs `2 Tier` *Double-Stack*):
* **Mode 1 Tier**:
  $$H_{\text{pallet\_max, 1}} = H_{\text{avail}}$$
* **Mode 2 Tier (*Double-Stack*)**: kedua palet harus melewati tinggi pintu/atap sambil memperhitungkan jarak angkat *forklift* saat memasukkan palet tingkat atas (`C_{\text{tier2}} = \max(C_{\text{lift}}, 80\text{ mm})`):
  $$H_{\text{pallet\_max, 2}} = \left\lfloor \frac{\min(H_{\text{roof\_limit}}, H_{\text{reefer\_limit}}) - C_{\text{tier2}}}{2} \right\rfloor \quad \text{dibatasi juga oleh}\; H_{\text{door\_limit}}$$
* **Mode `Auto`**: memilih **2 Tier** secara otomatis apabila tinggi 1 palet 2-tier masih mampu memuat minimal 2 layer dus (`H_{\text{pallet\_max, 2}} \ge H_{\text{deck}} + 2 \cdot H_{\text{box}}`) serta kapasitas muatan lebih tinggi; jika tidak, kembali ke **1 Tier**.

### C. Strategi Denah Lantai (3 Pola & Batas Berat Muatan)
Solver mengevaluasi tiga strategi penataan lantai di dalam `(L_eff, W_eff)`:
1. **`lengthwise`**: Semua palet berorientasi panjang `L_p` sejajar panjang kontainer (`0°`).
2. **`crosswise`**: Semua palet berorientasi lebar `W_p` sejajar panjang kontainer (`90°`).
3. **`mixed` (*Pinwheel / Kombinasi*)**: Mengevaluasi **Side-by-Side Pinwheel** (1 kolom `L_p` + 1 kolom `W_p` berdampingan — krusial untuk palet ISO2 `1200×1000 mm` di kontainer lebar `2350 mm` karena `1200 + 1000 + gap = 2220 mm` pas masuk, meningkatkan kapasitas `20' GP` dari `8–9` menjadi `10 palet` dan `40' GP/HC` menjadi `20–21 palet`) serta **Tail-Split Mixed** (barisan utama + barisan sisa belakang berorientasi 90°).

Kapasitas aktual palet yang dimuat juga dibatasi oleh **Payload Maksimum Armada (`maxPayloadKg`)**:
$$N_{\text{loaded}} = \min\left(N_{\text{floor}} \times N_{\text{tiers}},\; \left\lfloor \frac{W_{\text{payload\_max}}}{W_{\text{pallet\_gross}}} \right\rfloor\right)$$

### D. Audit BCT Tumpukan Ganda (*Double-Stack* 2 Tier)
Saat mode `2 Tier` aktif, lapisan dus terbawah pada **Palet Bawah (Tier 1)** menopang seluruh berat dus di atasnya ditambah **seluruh berat kotor Palet Atas (Tier 2)** (termasuk bobot kayu palet `palletWeightKg`):
$$W_{\text{double\_stack\_bottom}} = \frac{(N_{\text{layers}} - 1) \cdot N_{\text{per\_layer}} \cdot W_{\text{case}} + W_{\text{pallet\_gross}}}{N_{\text{per\_layer}}}$$
Nilai `SF_double_stack = BCT_effective / W_double_stack_bottom` diaudit terhadap standar `SF >= 1.5` (kritis jika `< 1.0`, peringatan *slip-sheet* / *divider board* jika `< 1.5`). Pada kontainer **Reefer**, sistem juga memberi peringatan operasional batas beban poros *forklift* pada lantai aluminium *T-bar* (`<= 5.460 kg`).

### E. Floor Loading (*Muat Tanpa Palet / Loose-Load*) & Perbandingan Kapasitas
Selain mode `palletized`, solver mendukung mode `floor-loading` (`solveFloorLoading` & `comparePalletVsFloor`) di mana dus dimuat langsung di atas lantai kontainer/truk tanpa alas palet:
1. **Dimensi Efektif & Batas Tinggi**:
   * Celah dinding per sisi jauh lebih rapat dibanding ruang manuver *forklift* (`floorWallClearanceMm`, bawaan `15 mm/sisi`), sehingga $W_{\text{floor}} = W_{\text{int}} - 2 T_{\text{karoseri}} - 2 C_{\text{wall}}$ dan $L_{\text{floor}} = L_{\text{int}} - 2 T_{\text{karoseri}} - C_{\text{rear\_floor}}$.
   * Tanpa beban angkat garpu *forklift*, tinggi muat bersih dibatasi oleh atap internal (`H_int - T_karoseri - C_roof`), bukaan pintu belakang (`H_door - T_karoseri - 20 mm`), atau **Red Load Line** pada Reefer (`H_red_line - C_roof`).
2. **Penataan Lantai & Batas Muatan**:
   * Solver mengevaluasi 3 strategi lantai pada dimensi luar dus `(L_box, W_box)`: `lengthwise` (`0°`), `crosswise` (`90°`), dan `mixed` (*tail-split* baris belakang berotasi `90°`), lalu membatasi jumlah dus total terhadap **Max Payload Armada**:
     $$N_{\text{floor\_cases}} = \min\left(N_{\text{per\_layer}} \times \left\lfloor \frac{H_{\text{avail}}}{H_{\text{box}}} \right\rfloor,\; \left\lfloor \frac{W_{\text{payload\_max}}}{W_{\text{case}}} \right\rfloor\right)$$
3. **Audit BCT Lapisan Dasar, Dunnage & Durasi Muat Manual**:
   * Beban pada lapisan dus paling bawah (*bottom layer*) dihitung sebagai $W_{\text{bottom}} = (N_{\text{layers}} - 1) \cdot W_{\text{case}}$, diaudit terhadap `BCT_effective` (kritis jika `SF < 1.0`, waspada jika `SF < 1.5`).
   * Apabila sisa ruang kosong di depan pintu belakang (`rearVoidMm`) `>= 140 mm`, sistem memunculkan peringatan **Dunnage / Airbag / Lashing Bar** untuk mencegah longsoran dus selama transit.
   * Perbandingan langsung terhadap mode **Pakai Palet** menampilkan selisih dus (`Δ dus` & `+Δ%`), selisih utilisasi volume (`Δ%`), serta perbandingan estimasi durasi muat (*forklift* `~2–4 menit/palet` vs *hand-ball* manual `~4–6 dus/menit` per tim 2–3 orang).



