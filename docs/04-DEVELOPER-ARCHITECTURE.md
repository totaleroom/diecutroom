# 04. Arsitektur Aplikasi, Skema SQLite & Dokumentasi Developer

Panduan teknis menyeluruh bagi pengembang untuk memelihara, mengaudit, atau memperluas fitur **DieCut.Room**.  
> **Single Source of Truth Terkini**: Selalu verifikasi status fitur dan drift terbaru melalui [`docs/STATUS.md`](./STATUS.md) dan `npm run docs:check`.

---

## 1. Arsitektur Sistem & Aliran Data

```
┌───────────────────────────────────────────────────────────────────────────────────────┐
│                KLIEN (React 19 + Vite + PWA + Three.js + Web Worker)                  │
│                                                                                       │
│  App.tsx (lazyWithRetry + 3-Unit mm/cm/in + useWorkspaceLayout 4-tier + Focus Mode)   │
│   ├── AuthGate.tsx + HalftoneSheetDecor + InteractiveMatrixCanvas ──► Recovery / WA   │
│   ├── Sidebar.tsx ──────────────────► utils/dieline.ts (FEFCO 0200-0204 SVG)          │
│   ├── BoxPreview.tsx ───────────────► jsPDF + svg2pdf + JsBarcode (ITF-14)            │
│   ├── Box3DViewer.tsx ──────────────► Three.js + browserEngine.ts (Adaptive DPR/GPU)  │
│   ├── PalletizerWorkspace.tsx ──────► workers/palletizer.worker.ts + utils/palletizer │
│   │                                   + utils/palletizerReportPdf.ts (A4 2-Page PDF)  │
│   ├── BCTInspectorRail.tsx ─────────► utils/engineering.ts (TAPPI vs BCT Pro)         │
│   ├── ProjectsModal & AdminUsersModal (4 Tabs: Users/Radar/Audit/Security & Backups)  │
│   └── utils/apiSession.ts (authFetch + Bearer) & utils/fontLoader.ts                  │
└───────────────────────────────────▲───────────────────────────────────┬───────────────┘
                                    │ Dual Cookie HMAC + Bearer         │ Fetch /api/*
                                    │ (JSON REST + MCP)                 ▼
┌───────────────────────────────────┴───────────────────────────────────────────────────┐
│                SERVER BACKEND (Node.js 22 + Express + httpServer — server.ts)         │
│                                                                                       │
│  ├── Immediate HTTP Bind (`http.createServer`) ──► Port siap <100ms                   │
│  ├── Dev Mode: Async Vite Middleware (ws:false saat DISABLE_HMR=true / NGINX_PORT)    │
│  ├── Prod Mode: express.static('dist') + 404 tegas aset hilang + no-cache HTML/SW     │
│  ├── Agent & MCP Layer: /api/agent/* (Hermes REST) + /api/mcp (JSON-RPC)              │
│  └── Persistence: node:sqlite DatabaseSync (WAL Mode — 5 Tabel)                       │
│       ├── users          (Auth, role, status, token_version, lockout, metadata asal)  │
│       ├── bct_history    (Snapshot BCT JSON terikat user_id)                          │
│       ├── saved_projects (Full BoxConfig JSON terikat user_id)                        │
│       ├── system_meta    (Hash recovery key, konfigurasi SMTP, hash Agent API key)    │
│       └── audit_logs     (Jejak audit auth, keamanan, admin ops, dan backup)          │
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
| `token_version` | `INTEGER` | Versi token sesi (`DEFAULT 1`); dinaikkan saat *revoke sessions* / reset password |
| `failed_login_count` | `INTEGER` | Hitungan gagal login berturut-turut (`DEFAULT 0`) untuk perlindungan brute-force |
| `locked_until` | `TEXT` | Timestamp ISO 8601 batas penguncian akun sementara (`NULL` jika normal) |

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

### Tabel `system_meta`
| Kolom | Tipe | Keterangan |
| :--- | :--- | :--- |
| `key` | `TEXT PK` | Kunci konfigurasi sistem (`admin_recovery_key_hash`, `smtp_config`, `agent_api_key_hash`, dll.) |
| `value` | `TEXT` | Nilai serialisasi JSON atau hash `scrypt` |
| `updated_at` | `TEXT` | Timestamp pembaruan terakhir |

### Tabel `audit_logs`
| Kolom | Tipe | Keterangan |
| :--- | :--- | :--- |
| `id` | `TEXT PK` | UUID v4 entri audit |
| `event_type` | `TEXT` | Jenis kejadian (`LOGIN_SUCCESS`, `LOGIN_LOCKED`, `USER_APPROVED`, `BACKUP_EXPORT`, dll.) |
| `severity` | `TEXT` | Tingkat keparahan (`info`, `warn`, `critical`) |
| `actor_email` | `TEXT` | Email pelaku aksi |
| `target_email` | `TEXT` | Email akun sasaran (jika ada) |
| `detail` | `TEXT` | Deskripsi ringkas aksi |
| `ip_address` | `TEXT` | Alamat IP klien |
| `origin` | `TEXT` | Origin/host permintaan |
| `created_at` | `TEXT` | Timestamp ISO 8601 |

---

## 3. Ringkasan Kontrak REST API & MCP (`/api/*`)

Daftar lengkap 43 endpoint beserta skema JSON & kode error dipelihara di [`docs/06-API-REFERENCE.md`](./06-API-REFERENCE.md):
* **Utilitas & Font**: `GET /api/health`, `GET /api/fonts/available`.
* **Autentikasi & Recovery**: `/api/auth/me`, `/register`, `/login`, `/logout`, `/recovery-options`, `/admin-recover`, `/admin-recover/request-otp`, `/admin-recover/verify-otp`.
* **Admin Users & Governance (`role === 'admin'`)**: `/api/admin/users` (list/create/edit/delete), `bulk-approve`, `status`, `password`, `revoke-sessions`.
* **Admin Security, Observability & Backup**: `/api/admin/security/*` (`change-password`, `rotate-recovery-key`, `smtp`, `smtp-test`, `agent-key`), `health-radar`, `audit-logs`, `backup/sqlite`, `backup/json`.
* **Hermes Agent REST & MCP (`X-Agent-Key` / Bearer)**: `/api/agent/skill`, `/api/agent/connect`, `/api/agent/calculate`, `/api/agent/dieline`, `/api/agent/dieline/download`, `/api/mcp`.
* **Sinkronisasi Data Pengguna (`active`)**: `/api/history` (`GET/POST/DELETE`), `/api/projects` (`GET/POST/DELETE`).

---

## 4. Mekanisme Performa, Keamanan, PDF Orthographic & PWA Routing

1. **Dual Auth (`src/utils/apiSession.ts` + `server.ts`)**: Token sesi berbentuk `base64url({ uid, ver, exp }).hmacSha256` berumur 14 hari dengan validasi `token_version`. Dikirim melalui **HttpOnly `Partitioned` Cookie** (`SameSite=None; Secure` di HTTPS / `SameSite=Lax` di HTTP lokal) **dan** fallback `Authorization: Bearer <token>` agar tetap stabil di dalam iframe sandbox maupun browser ketat.
2. **Pemulihan Chunk Lazy (`src/utils/lazyWithRetry.ts`)**: Membungkus `React.lazy(...)` agar jika browser memuat hash chunk lama setelah deploy PWA baru, sistem melakukan 1x reload bersih otomatis tanpa layar putih.
3. **Mesin Adaptif WebGL/CPU (`src/utils/browserEngine.ts`)**:
   - Mendeteksi `WEBGL_debug_renderer_info`, jumlah core CPU, `deviceMemory`, pointer touch, dan software renderer (`SwiftShader`/`llvmpipe`).
   - Memetakan profil ke `ultra`, `balanced`, `eco`, atau `software`, lengkap dengan `createDynamicResolutionController` yang menurunkan/memulihkan rasio piksel Three.js secara otomatis sesuai biaya render per frame.
4. **Laporan Engineering PDF Palletizer Orthographic (`src/utils/palletizerReportPdf.ts` + `PalletizerWorkspace.tsx`)**:
   - Merender 4 sudut pandang Normal (`Iso` elevasi curam ~40°, `Top`, `Front`, `Side`) dan 2 sudut pandang Heat-Map (`Iso`, `Top`) menggunakan `THREE.OrthographicCamera` yang disesuaikan otomatis ke `Box3` tumpukan tanpa distorsi perspektif maupun potongan tepi.
   - Memproyeksikan titik sudut UV (`isoAnchors`, `topAnchors`) untuk menggambar anotasi dimensi vektor `L × W × T (mm)`, kode warna orientasi `0°/90°` + outline tegas, panduan 2D Layer 1 & Layer 2, serta meraster logo resmi Totale.Room (`/assets/aistudio/Asset_2_5ca58983.svg`) ke header bergaya Precision Tactile Studio.
5. **PWA Workbox & Anti-White-Screen (`vite.config.ts`, `index.html`, `server.ts`)**:
   - `navigateFallback: null` dengan aturan `NetworkFirst` pada navigasi HTML, `CacheFirst` pada aset hash `/assets/*`, dan `NetworkOnly` pada `/api/*`.
   - `server.ts` mengembalikan `404` tegas (bukan HTML `index.html`) apabila berkas `.js`/`.css`/`.woff2` hash lama tidak ada di disk.
   - `index.html` menyertakan watchdog pemulihan startup yang otomatis membersihkan Service Worker/Cache lama jika modul entry gagal dimuat.
6. **Tipografi Runtime (`src/utils/fontLoader.ts`)**: Memanggil `/api/fonts/available` sekali saat startup untuk mendaftarkan `@font-face 'Timeless Grotesk'` hanya jika berkas `.woff2`/`.woff` tersedia di server, sehingga nol error 404 pada browser.

---

## 5. Panduan Ekstensi Fitur & Verifikasi

* **Menambah Grade Kertas Baru**: Tambahkan entri baru pada `KRAFT_GRADES`, `WHITE_TOP_GRADES`, `TESTLINER_GRADES`, atau `MEDIUM_GRADES` di `src/types.ts` (lengkapi nilai `rct` dalam kgf/cm dan `gsm`).
* **Menambah Pola Perforasi / SRP Baru**:
  1. Daftarkan ID & deskripsi pada `PerforationType` dan `PERFORATION_OPTIONS` di `src/types.ts`.
  2. Tambahkan geometri jalur vektor 2D (`perfLines` + opsional `perfFoldLines`) pada `generateRSCDieline` di `src/utils/dieline.ts`.
  3. Tambahkan pemecahan sub-mesh panel & animasi sobek/buka (`tearAnimator`) pada `src/components/Box3DViewer.tsx`.
* **Verifikasi Build, Tipe & Drift Dokumentasi**:
  ```bash
  npm run lint                   # Memeriksa tsc --noEmit
  npm run build                  # Memastikan bundle Vite & Workbox PWA SW terkompilasi bersih
  npm run docs:check -- --strict # Memastikan nol drift antara server.ts, SQLite, .env.example & docs
  ```
