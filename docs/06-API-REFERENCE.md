# 06. Referensi REST API Lengkap (JSON & Kode Error)

Dokumen ini merupakan referensi kontrak **REST API** lengkap backend Express (`server.ts`) pada **DieCut.Room**, mencakup skema request/response JSON, mekanisme cookie sesi `diecut_session`, daftar kode error terstruktur, endpoint font runtime, dan contoh uji `curl`.

---

## 1. Informasi Umum & Mekanisme Sesi

- **Base URL**:
  - Lokal / Internal VPS: `http://127.0.0.1:<APP_PORT>`
  - Produksi HTTPS: `https://<SUBDOMAIN>`
- **Format Body**: `application/json` (batas maksimal payload `2mb`).
- **Cookie Sesi**: `diecut_session` (`HttpOnly`, berlaku `14 hari`, bertanda HMAC-SHA256 `base64url(payload).hmac`).
  - Pada permintaan HTTPS / di balik Nginx dengan `TRUST_PROXY=true`: `SameSite=None; Secure`.
  - Pada HTTP localhost: `SameSite=Lax`.
- **Otorisasi Bertingkat**:
  - **Public**: `GET /api/health`, `GET /api/fonts/available`, `GET /api/auth/me`, `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`.
  - **Active User (`role: 'user' | 'admin'`, `status: 'active'`)**: Endpoint `/api/history/*` dan `/api/projects/*`.
  - **Admin Only (`role: 'admin'`, `status: 'active'`)**: Seluruh endpoint `/api/admin/*`.

---

## 2. Endpoint Health & Utilitas Font

### `GET /api/health`
Memeriksa kesehatan proses Express dan koneksi database SQLite.

**Response `200 OK`**:
```json
{
  "ok": true,
  "db": "sqlite",
  "timestamp": "2026-11-16T08:00:00.000Z"
}
```

### `GET /api/fonts/available`
Memindai folder `public/fonts/` dan `dist/fonts/` untuk file font kustom berlisensi **Timeless Grotesk** (`.woff2` / `.woff`). Mengembalikan array kosong `[]` bila tidak ada font tambahan sehingga UI tetap berjalan pada fallback Neo-Grotesk (`Plus Jakarta Sans`) tanpa HTTP 404.

**Response `200 OK`** *(ketika file font tersedia)*:
```json
{
  "files": [
    { "url": "/fonts/TimelessGrotesk-Regular.woff2", "weight": "400", "format": "woff2" },
    { "url": "/fonts/TimelessGrotesk-Medium.woff2", "weight": "500", "format": "woff2" },
    { "url": "/fonts/TimelessGrotesk-SemiBold.woff2", "weight": "600", "format": "woff2" }
  ]
}
```

---

## 3. Endpoint Autentikasi (`/api/auth/*`)

### `GET /api/auth/me`
Memeriksa cookie sesi aktif dan status akun terkini di database SQLite.

**Response `200 OK`** (sesi valid dan user berstatus `active`):
```json
{
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Budi Kemasan",
    "email": "budi@kemasan.co.id",
    "company": "PT Kemasan Nusantara",
    "role": "user",
    "status": "active",
    "accessOrigin": "https://cad.domainanda.com",
    "accessPath": "/",
    "accessReferrer": "",
    "deviceSummary": "Linux · Chrome (Desktop)",
    "timezone": "Asia/Jakarta",
    "lastIp": "103.10.20.30",
    "createdAt": "2026-11-14T10:15:00.000Z",
    "lastLoginAt": "2026-11-16T07:30:00.000Z"
  }
}
```

**Response `401 Unauthorized`** (belum login / cookie tidak valid / akun sudah dihapus):
```json
{
  "user": null
}
```

**Response `403 Forbidden`** (cookie valid tetapi Admin baru saja menonaktifkan/mengubah status ke `pending`):
```json
{
  "code": "ACCOUNT_DISABLED",
  "user": {
    "name": "Budi Kemasan",
    "email": "budi@kemasan.co.id",
    "status": "disabled"
  }
}
```

---

### `POST /api/auth/register`
Mendaftarkan akun baru. Seluruh pendaftar mandiri otomatis mendapat `role: 'user'` dan `status: 'pending'` hingga diaktifkan oleh Admin.

**Request Body**:
```json
{
  "name": "Budi Kemasan",
  "email": "budi@kemasan.co.id",
  "company": "PT Kemasan Nusantara",
  "password": "PasswordKuat123",
  "clientMeta": {
    "origin": "https://cad.domainanda.com",
    "path": "/?ref=sales",
    "referrer": "https://domainanda.com",
    "deviceSummary": "Windows · Chrome (Desktop)",
    "timezone": "Asia/Jakarta"
  }
}
```

**Aturan Validasi**:
- `name`: wajib, minimal 2 karakter (dipotong maks 80).
- `email`: wajib, format email valid, otomatis disimpan huruf kecil.
- `company`: opsional, maks 100 karakter.
- `password`: wajib, minimal 6 karakter.

**Response `201 Created`**:
```json
{
  "status": "pending",
  "message": "Pendaftaran berhasil dicatat. Silakan konfirmasi ke Admin via WhatsApp untuk aktivasi akun.",
  "user": {
    "id": "8c1e2a90-...",
    "name": "Budi Kemasan",
    "email": "budi@kemasan.co.id",
    "company": "PT Kemasan Nusantara",
    "role": "user",
    "status": "pending",
    "accessOrigin": "https://cad.domainanda.com",
    "accessPath": "/?ref=sales",
    "accessReferrer": "https://domainanda.com",
    "deviceSummary": "Windows · Chrome (Desktop)",
    "timezone": "Asia/Jakarta",
    "lastIp": "103.10.20.30",
    "createdAt": "2026-11-16T08:02:00.000Z",
    "lastLoginAt": null
  }
}
```

**Response Error**:
- `400 Bad Request`: `{ "error": "Nama lengkap minimal 2 karakter." }` / `{ "error": "Format alamat email tidak valid." }` / `{ "error": "Password minimal 6 karakter." }`
- `409 Conflict`:
  - Jika masih `pending`: `{ "code": "ALREADY_PENDING", "error": "Email ini sudah terdaftar dan masih menunggu persetujuan Admin. Silakan konfirmasi via WhatsApp." }`
  - Jika `disabled`: `{ "code": "ALREADY_DISABLED", "error": "Akun dengan email ini sedang dinonaktifkan. Hubungi Admin melalui WhatsApp untuk aktivasi kembali." }`
  - Jika sudah `active`: `{ "error": "Email sudah terdaftar. Silakan masuk melalui tab Login." }`

---

### `POST /api/auth/login`
Mengautentikasi user. Akun `pending` atau `disabled` akan memicu pembaruan metadata asal akses lalu ditolak dengan `403`. Akun `active` menerima header `Set-Cookie: diecut_session=...`.

**Request Body**:
```json
{
  "email": "budi@kemasan.co.id",
  "password": "PasswordKuat123",
  "clientMeta": {
    "origin": "https://cad.domainanda.com",
    "path": "/",
    "referrer": "",
    "deviceSummary": "Windows · Chrome (Desktop)",
    "timezone": "Asia/Jakarta"
  }
}
```

**Response `200 OK`**: Mengembalikan `{ "user": { ... } }` + cookie `diecut_session`.

**Response Error**:
- `400 Bad Request`: `{ "error": "Email dan password wajib diisi." }`
- `401 Unauthorized`: `{ "error": "Email atau password salah." }`
- `403 Forbidden`:
  - Status `pending`: `{ "code": "ACCOUNT_PENDING", "error": "Akun Anda masih Pending dan menunggu persetujuan Admin.", "user": { "name": "...", "email": "...", "status": "pending" } }`
  - Status `disabled`: `{ "code": "ACCOUNT_DISABLED", "error": "Akun Anda sedang dinonaktifkan oleh Admin.", "user": { "name": "...", "email": "...", "status": "disabled" } }`

---

### `POST /api/auth/logout`
Menghapus cookie sesi dari browser.

**Response `200 OK`**:
```json
{
  "ok": true
}
```

---

## 4. Endpoint Manajemen User Admin (`/api/admin/users/*`)

Seluruh endpoint ini mewajibkan cookie sesi user dengan `role === 'admin'` dan `status === 'active'`. Jika tidak memenuhi syarat, server mengembalikan `401` (tanpa sesi) atau `403` (`{ "error": "Admin privileges required" }`).

### `GET /api/admin/users`
Mengambil daftar seluruh akun beserta metadata asal akses dan statistik data tersimpan (`historyCount`, `projectCount`). Urutan: `pending` di atas, disusul `active`, lalu `disabled`.

**Response `200 OK`**:
```json
{
  "users": [
    {
      "id": "8c1e2a90-...",
      "name": "Budi Kemasan",
      "email": "budi@kemasan.co.id",
      "company": "PT Kemasan Nusantara",
      "role": "user",
      "status": "pending",
      "accessOrigin": "https://cad.domainanda.com",
      "accessPath": "/",
      "accessReferrer": "",
      "deviceSummary": "Windows · Chrome (Desktop)",
      "timezone": "Asia/Jakarta",
      "lastIp": "103.10.20.30",
      "createdAt": "2026-11-16T08:02:00.000Z",
      "lastLoginAt": null,
      "historyCount": 0,
      "projectCount": 0
    }
  ]
}
```

---

### `PATCH /api/admin/users/:id/status`
Mengubah status akun menjadi `'pending'`, `'active'`, atau `'disabled'`. Admin dilindungi agar tidak dapat menonaktifkan akunnya sendiri.

**Request Body**:
```json
{
  "status": "active"
}
```

**Response `200 OK`**: Mengembalikan `{ "user": { ... } }`.
**Response Error**:
- `400 Bad Request`: Status bukan `pending`/`active`/`disabled`, atau mencoba menonaktifkan akun sendiri (`Admin tidak dapat menonaktifkan akun sendiri.`).
- `404 Not Found`: `{ "error": "User tidak ditemukan." }`

---

### `PATCH /api/admin/users/:id/password`
Admin langsung mengganti password akun tertentu setelah user melakukan konfirmasi via WhatsApp.

**Request Body**:
```json
{
  "password": "PasswordBaruDariAdmin99"
}
```

**Response `200 OK`**:
```json
{
  "ok": true
}
```
**Response Error**:
- `400 Bad Request`: `{ "error": "Password baru minimal 6 karakter." }`
- `404 Not Found`: `{ "error": "User tidak ditemukan." }`

---

### `DELETE /api/admin/users/:id`
Menghapus akun secara permanen beserta seluruh baris di `bct_history` dan `saved_projects` milik user tersebut (`ON DELETE CASCADE`).

**Response `200 OK`**:
```json
{
  "ok": true
}
```
**Response Error**:
- `400 Bad Request`: `{ "error": "Admin tidak dapat menghapus akun sendiri." }`
- `404 Not Found`: `{ "error": "User tidak ditemukan." }`

---

## 5. Endpoint Sinkronisasi Data Pengguna (`/api/history` & `/api/projects`)

### `GET /api/history`
Mengambil maksimal `100` riwayat skenario BCT terbaru milik user yang sedang login.
**Response `200 OK`**: `{ "entries": [ /* array BctHistoryEntry */ ] }`

### `POST /api/history`
Menyimpan atau memperbarui (*upsert* berdasar `entry.id`) satu entri riwayat BCT milik user aktif.
**Request Body**:
```json
{
  "entry": {
    "id": "bct-1731650000",
    "createdAt": "2026-11-16T08:10:00.000Z",
    "label": "Karton Susu UHT 24x250ml",
    "boxStyle": "0201",
    "dimensions": { "length": 360, "width": 240, "depth": 180 },
    "fluteId": "B",
    "fluteThickness": 3.18,
    "boardGrade": "single-wall",
    "fluteDirection": "vertical",
    "materials": { "top": "K150", "medium": "M125", "bottom": "K150" },
    "conditions": { "printCoverage": 25, "numberOfColors": 2, "relativeHumidity": 55, "handlingRisk": false, "useActualEct": false, "actualEctKgfCm": null },
    "safetyFactor": 5,
    "results": { "ectKgfCm": 4.2, "ectSource": "STANDARD_ECT", "bctEstimateKgf": 245.5, "correctedBctKgf": 218.2, "maxStackingLoadKgf": 43.6, "combinedFactor": 0.8888 }
  }
}
```
**Response `201 Created`**: `{ "ok": true, "entry": { ... } }`

### `DELETE /api/history/:id`
Menghapus satu riwayat BCT milik user aktif. Mengembalikan `{ "ok": true }`.

---

### `GET /api/projects`
Mengambil maksimal `100` proyek dieline box tersimpan milik user aktif (`ORDER BY updated_at DESC`).
**Response `200 OK`**:
```json
{
  "projects": [
    {
      "id": "9f23a012-...",
      "name": "SRP Pouch Minuman 400x300x250",
      "boxStyle": "0201",
      "dimsSummary": "400x300x250 mm",
      "config": { /* BoxConfig lengkap */ },
      "updatedAt": "2026-11-16T08:15:00.000Z"
    }
  ]
}
```

### `POST /api/projects`
Membuat baru atau menimpa (*upsert* bila `id` disertakan) proyek dieline box milik user aktif.

**Request Body**:
```json
{
  "name": "SRP Pouch Minuman 400x300x250",
  "config": {
    "boxStyle": "0201",
    "dimensions": { "length": 400, "width": 300, "depth": 250 }
  }
}
```
**Aturan Validasi**: `name` tidak kosong (maks 100 karakter), serta `config.dimensions` dan `config.boxStyle` wajib ada.
**Response `201 Created`**: `{ "project": { "id": "...", "name": "...", "boxStyle": "0201", "dimsSummary": "400x300x250 mm", "config": { ... }, "updatedAt": "..." } }`

### `DELETE /api/projects/:id`
Menghapus proyek tersimpan milik user aktif. Mengembalikan `{ "ok": true }`.

---

## 6. Contoh Pengujian Cepat via `curl`

```bash
DOMAIN="https://cad.domainanda.com"
JAR="/tmp/diecut-cookies.txt"

# 1. Login sebagai Admin & simpan cookie
curl -sS -c "$JAR" -X POST "${DOMAIN}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"totale.room@gmail.com","password":"PasswordAdminAnda"}'

# 2. Cek profil sesi saat ini
curl -sS -b "$JAR" "${DOMAIN}/api/auth/me"

# 3. Cek ketersediaan font opsional
curl -sS "${DOMAIN}/api/fonts/available"

# 4. Lihat daftar user (khusus Admin)
curl -sS -b "$JAR" "${DOMAIN}/api/admin/users"

# 5. Aktifkan user tertentu
curl -sS -b "$JAR" -X PATCH "${DOMAIN}/api/admin/users/<USER_ID>/status" \
  -H "Content-Type: application/json" \
  -d '{"status":"active"}'

# 6. Logout & hapus file cookie sementara
curl -sS -b "$JAR" -X POST "${DOMAIN}/api/auth/logout"
rm -f "$JAR"
```
