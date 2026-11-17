# 04. Arsitektur Aplikasi, Skema SQLite & Dokumentasi Developer

Panduan teknis menyeluruh bagi pengembang untuk memelihara, mengaudit, atau memperluas fitur **DieCut.Room**.

---

## 1. Arsitektur Sistem & Aliran Data

```
┌───────────────────────────────────────────────────────────────────────────────────────┐
│                KLIEN (React 19 + Vite + PWA + Three.js + Web Worker)                  │
│                                                                                       │
│  App.tsx (Lazy routes + useWorkspaceLayout 4-tier + Focus Mode + Short-Landscape HUD) │
│   ├── AuthGate.tsx + HalftoneSheetDecor + InteractiveMatrixCanvas ──► WhatsApp CTA    │
│   ├── Sidebar.tsx ──────────────────► utils/dieline.ts (FEFCO 0200-0204 SVG)          │
│   ├── BoxPreview.tsx ───────────────► jsPDF + svg2pdf + JsBarcode (ITF-14)            │
│   ├── Box3DViewer.tsx ──────────────► Three.js + browserEngine.ts (Adaptive DPR/GPU)  │
│   ├── PalletizerWorkspace.tsx ──────► workers/palletizer.worker.ts + utils/palletizer │
│   ├── BCTInspectorRail.tsx ─────────► utils/engineering.ts (TAPPI vs BCT Pro)         │
│   ├── ProjectsModal.tsx & AdminUsersModal.tsx ──► Per-account Sync & User Governance  │
│   └── utils/fontLoader.ts ──────────► GET /api/fonts/available (Timeless Grotesk)     │
└───────────────────────────────────▲───────────────────────────────────┬───────────────┘
                                    │ Cookie HMAC HttpOnly              │ Fetch /api/*
                                    │ (JSON REST)                       ▼
┌───────────────────────────────────┴───────────────────────────────────────────────────┐
│                SERVER BACKEND (Node.js 22 + Express + httpServer — server.ts)         │
│                                                                                       │
│  ├── Immediate HTTP Bind (`http.createServer`) ──► Port siap <100ms                   │
│  ├── Dev Mode: Async Vite Middleware (ws:false saat DISABLE_HMR=true / NGINX_PORT)    │
│  ├── Prod Mode: express.static('dist') + 404 tegas aset hilang + no-cache HTML/SW     │
│  └── Persistence: node:sqlite DatabaseSync (WAL Mode)                                 │
│       ├── users         (Auth, role, status, metadata asal akses)                     │
│       ├── bct_history   (Snapshot BCT JSON terikat user_id)                           │
│       └── saved_projects(Full BoxConfig JSON terikat user_id)                         │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Skema Database SQLite (`data/diecut.db`)

Database diinisialisasi otomatis oleh `server.ts` menggunakan modul bawaan Node.js `node:sqlite` (`DatabaseSync`) dengan mode `PRAGMA journal_mode = WAL` dan `PRAGMA foreign_keys = ON`.

### Tabel `users`
| Kolom | Tipe | Keterangan |
| :--- | :--- | :--- |
| `id` | `TEXT PK` | UUID v4 pengguna |
| `name` | `TEXT` | Nama lengkap |
| `email` | `TEXT UNIQUE` | Email huruf kecil (unik) |
| `company` | `TEXT` | Nama tim/perusahaan (opsional) |
| `password_hash` | `TEXT` | Format `<16B salt hex>:<64B scrypt hex>` |
| `role` | `TEXT` | `'admin'` atau `'user'` |
| `status` | `TEXT` | `'pending'` (default daftar), `'active'`, atau `'disabled'` |
| `access_origin` | `TEXT` | Origin subdomain/host saat daftar atau login |
| `access_path` | `TEXT` | Path + query URL akses |
| `access_referrer` | `TEXT` | Referrer / asal navigasi |
| `device_summary` | `TEXT` | Ringkasan OS · Browser (Desktop/Mobile) |
| `timezone` | `TEXT` | Zona waktu IANA klien |
| `last_ip` | `TEXT` | Alamat IP klien (membaca `X-Forwarded-For` di balik Nginx) |
| `created_at` | `TEXT` | Timestamp ISO 8601 registrasi |
| `last_login_at` | `TEXT` | Timestamp ISO 8601 login aktif terakhir |

### Tabel `bct_history`
| Kolom | Tipe | Keterangan |
| :--- | :--- | :--- |
| `id` | `TEXT PK` | ID snapshot BCT |
| `user_id` | `TEXT FK` | Merujuk ke `users.id` (`ON DELETE CASCADE`) |
| `label` | `TEXT` | Nama skenario / produk |
| `payload_json` | `TEXT` | JSON lengkap `BctHistoryEntry` |
| `created_at` | `TEXT` | Timestamp penyimpanan |

### Tabel `saved_projects`
| Kolom | Tipe | Keterangan |
| :--- | :--- | :--- |
| `id` | `TEXT PK` | UUID proyek |
| `user_id` | `TEXT FK` | Merujuk ke `users.id` (`ON DELETE CASCADE`) |
| `name` | `TEXT` | Nama proyek tersimpan |
| `box_style` | `TEXT` | Kode FEFCO (`0201`, `0200`, dll.) |
| `dims_summary` | `TEXT` | Ringkasan ukuran (`LxWxD mm`) |
| `config_json` | `TEXT` | JSON lengkap `BoxConfig` |
| `updated_at` | `TEXT` | Timestamp pembaruan terakhir |

---

## 3. Kontrak REST API (`/api/*`)

### Utilitas & Font
* `GET /api/health` — Cek status server & SQLite (`{ ok: true, db: 'sqlite', timestamp }`).
* `GET /api/fonts/available` — Memindai `public/fonts/` dan `dist/fonts/` untuk file `TimelessGrotesk*.woff2`/`.woff` opsional dan mengembalikan `{ files: [...] }`.

### Autentikasi & Sesi (`cookie: diecut_session`)
* `GET /api/auth/me` — Mengembalikan profil user aktif (`200`), `401` jika belum login, atau `403` (`ACCOUNT_PENDING` / `ACCOUNT_DISABLED`) jika akun dinonaktifkan saat sesi masih ada.
* `POST /api/auth/register` — Mendaftarkan user baru dengan status awal `'pending'` dan mencatat `clientMeta`. Mengembalikan `201`.
* `POST /api/auth/login` — Memvalidasi password (`scrypt` + `timingSafeEqual`). Mengembalikan `403` untuk status `pending`/`disabled`, atau menyetel cookie HMAC `HttpOnly` untuk akun `active`.
* `POST /api/auth/logout` — Menghapus cookie sesi.

### Manajemen User (Khusus `role === 'admin'`)
* `GET /api/admin/users` — Mengambil seluruh user (tanpa `password_hash`) beserta hitungan `historyCount` & `projectCount`.
* `PATCH /api/admin/users/:id/status` — Mengubah status menjadi `'active'`, `'disabled'`, atau `'pending'` (memblokir perubahan diri sendiri).
* `PATCH /api/admin/users/:id/password` — Admin langsung mengatur password baru (`min 6 karakter`) untuk akun tertentu setelah konfirmasi WhatsApp.
* `DELETE /api/admin/users/:id` — Menghapus user dan data terkait secara permanen (memblokir hapus diri sendiri).

### Sinkronisasi Data Pengguna (User `active`)
* `GET /api/history`, `POST /api/history`, `DELETE /api/history/:id` — Mengelola riwayat skenario BCT per akun (disinkronkan pula ke cache `localStorage` bertanda `userId`).
* `GET /api/projects`, `POST /api/projects`, `DELETE /api/projects/:id` — Menyimpan, memuat, dan menghapus konfigurasi lengkap proyek dieline box.

---

## 4. Mekanisme Performa, Keamanan & PWA Routing

1. **Cookie Signing**: Token sesi berbentuk `base64url({ uid, exp }).hmacSha256` berumur 14 hari dengan secret dari `.env` (`SESSION_SECRET`) atau kunci acak persisten di `./data/.session_secret`.
2. **HTTPS & Proxy Compatibility**: Atribut cookie otomatis memakai `SameSite=None; Secure` saat terdeteksi HTTPS (`X-Forwarded-Proto: https` dari Nginx atau Cloud Run) dan `SameSite=Lax` di HTTP lokal.
3. **Mesin Adaptif WebGL/CPU (`src/utils/browserEngine.ts`)**:
   - Mendeteksi `WEBGL_debug_renderer_info`, jumlah core CPU, `deviceMemory`, pointer touch, dan software renderer (`SwiftShader`/`llvmpipe`).
   - Memetakan profil ke `ultra`, `balanced`, `eco`, atau `software`, lengkap dengan `createDynamicResolutionController` yang menurunkan/memulihkan rasio piksel Three.js secara otomatis sesuai biaya render per frame.
4. **PWA Workbox & Anti-White-Screen (`vite.config.ts`, `index.html`, `server.ts`)**:
   - `navigateFallback: null` dengan aturan `NetworkFirst` pada navigasi HTML, `CacheFirst` pada aset hash `/assets/*`, dan `NetworkOnly` pada `/api/*`.
   - `server.ts` mengembalikan `404` tegas (bukan HTML `index.html`) apabila berkas `.js`/`.css`/`.woff2` hash lama tidak ada di disk.
   - `index.html` menyertakan watchdog pemulihan startup yang otomatis membersihkan Service Worker/Cache lama jika modul entry gagal dimuat.
5. **Tipografi Runtime (`src/utils/fontLoader.ts`)**: Memanggil `/api/fonts/available` sekali saat startup untuk mendaftarkan `@font-face 'Timeless Grotesk'` hanya jika berkas `.woff2`/`.woff` tersedia di server, sehingga nol error 404 pada browser.

---

## 5. Panduan Ekstensi Fitur

* **Menambah Grade Kertas Baru**: Tambahkan entri baru pada `KRAFT_GRADES`, `WHITE_TOP_GRADES`, `TESTLINER_GRADES`, atau `MEDIUM_GRADES` di `src/types.ts` (lengkapi nilai `rct` dalam kgf/cm dan `gsm`).
* **Menambah Pola Perforasi / SRP Baru**:
  1. Daftarkan ID & deskripsi pada `PerforationType` dan `PERFORATION_OPTIONS` di `src/types.ts`.
  2. Tambahkan geometri jalur vektor 2D (`perfLines` + opsional `perfFoldLines`) pada `generateRSCDieline` di `src/utils/dieline.ts`.
  3. Tambahkan pemecahan sub-mesh panel & animasi sobek/buka (`tearAnimator`) pada `src/components/Box3DViewer.tsx`.
* **Verifikasi Build & Tipe**:
  ```bash
  npm run lint   # Memeriksa tsc --noEmit
  npm run build  # Memastikan bundle Vite & Workbox PWA SW terkompilasi bersih
  ```
