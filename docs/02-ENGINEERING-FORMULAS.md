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

### B. Faktor Koreksi Lainnya
1. **Kelembaban Relatif ($RH\%$)**:
   * $RH \le 50\% \rightarrow F_{\text{RH}} = 1.0$
   * $50\% < RH \le 75\% \rightarrow F_{\text{RH}} = 1 - (RH - 50) \cdot 0.012$
   * $RH > 75\% \rightarrow F_{\text{RH}} = \max(0.35,\; 0.70 - (RH - 75) \cdot 0.02)$
2. **Handling Risk**: $0.85$ bila berisiko benturan/drop kasar, selain itu $1.0$.
3. **Stabilitas Rasio Tinggi (`D`) terhadap $\sqrt{L \cdot W}$**:
   * $R = \frac{D}{\sqrt{L \cdot W}} \le 1.5 \rightarrow 1.0$
   * $1.5 < R \le 2.5 \rightarrow \max(0.75,\; 1 - (R - 1.5) \cdot 0.12)$
   * $R > 2.5 \rightarrow \max(0.65,\; 0.88 - (R - 2.5) \cdot 0.10)$
4. **Orientasi Flute Grain**:
   * **TAPPI Mode**: `1.0` untuk *Vertical (Load)*, dan penalti tekuk kolom **`0.55`** bila *Horizontal*.
   * **BCT Pro Legacy Mode**: Selalu mengasumsikan `1.0`.

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
*(Safety Factor default: `5:1` Industrial, dengan opsi `2.2:1`, `3:1`, `4:1`, `6:1`).*

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

