# AGENTS.md — Instruksi Operasional untuk AI Agent di VPS (Debian Multi-App Ready)

Dokumen ini adalah kontrak kerja wajib bagi AI Agent mana pun yang menarik (*pull*) repositori **DieCut.Room** di server **VPS Debian** (atau distribusi Linux kompatibel) untuk melakukan audit awal, setup produksi, migrasi, atau pembaruan aplikasi (*update*).

> **Runbook Langkah-demi-Langkah & Checklist Lengkap:**  
> Baca dan eksekusi secara berurutan dokumen [`docs/05-AI-AGENT-VPS-RUNBOOK.md`](./docs/05-AI-AGENT-VPS-RUNBOOK.md) sebelum menjalankan perintah perubahan sistem apa pun.

---

## 1. Gambaran Sistem & Footprint Resource

- **Stack Aplikasi**: Full-stack monolith ringan — Frontend **React 19 + Vite + Three.js + Web Worker + PWA (`vite-plugin-pwa`)** dikompilasi ke `./dist/`, lalu dilayani oleh server **Express (`server.ts`)** di atas **Node.js v22+**.
- **Database & Auth**: **Embedded SQLite** bawaan Node.js v22 (`node:sqlite`, mode WAL) tanpa server database eksternal dan tanpa kompilasi native C++. Auth memakai *HTTP-only cookie* bertanda HMAC-SHA256 + `scrypt`.
- **Footprint Produksi Aktual** *(Dioptimalkan untuk VPS terbatas disk/RAM)*:
  - **Docker Multi-Stage Slim (`Dockerfile`)**: Stage 1 mem-build bundel `./dist`, Stage 2 hanya memasang `express` + `dotenv` di atas `node:22-alpine`. Ukuran image akhir **~160 MB**, batas memori container **`mem_limit: 256m`** (`NODE_OPTIONS=--max-old-space-size=192`), pemakaian RAM runtime **~65–110 MB RSS**.
  - **PM2 Host Sidecar (Node v22+)**: Pemakaian RAM **~60–95 MB RSS** (`--max-memory-restart 220M`), tanpa overhead lapisan image/cache Docker (ideal bila sisa disk sangat sempit `< 3 GB`).
- **Skrip Utama (`package.json`)**:
  - `npm ci --include=dev` → wajib dipakai jika `NODE_ENV=production` sudah terset di shell/env agar `vite`, `typescript`, dan `@tailwindcss/vite` ikut terpasang saat build.
  - `npm run lint` → menjalankan `tsc --noEmit` (wajib lulus sebelum start produksi).
  - `npm run build` → mem-build frontend + Service Worker PWA ke `./dist/`.
  - `NODE_ENV=production npm start` → menjalankan `node server.ts` (native TypeScript type-stripping Node v22+, tidak butuh transpilasi terpisah).
- **Variabel Build-Time vs Runtime**:
  - `VITE_WHATSAPP_ADMIN` dan file font berlisensi opsional di `public/fonts/` (`TimelessGrotesk*.woff2`) disisipkan saat **`npm run build` / `docker compose build`**. Jika diubah, wajib rebuild frontend.
  - `IMAGE_TAG`, `PORT`, `HOST_PORT`, `SQLITE_PATH`, `SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_INITIAL_PASSWORD`, `TRUST_PROXY` dibaca saat deploy/runtime server.

---

## 2. Aturan Wajib Coexistence VPS Debian (VPS Sudah Berisi Nginx, Container & Aplikasi Lain)

VPS Debian target **sudah menjalankan Nginx serta aplikasi/container lain**. AI Agent **DILARANG KERAS**:

1. **Menimpa atau menghapus konfigurasi Nginx milik aplikasi lain** (`/etc/nginx/sites-available/*`, `/etc/nginx/sites-enabled/*`, `/etc/nginx/conf.d/*`). Selalu buat file konfigurasi virtual-host baru khusus untuk subdomain DieCut.Room di `/etc/nginx/sites-available/diecut-room` lalu symlink ke `/etc/nginx/sites-enabled/diecut-room`. *(Catatan: pada Debian 13+ / Nginx `1.25.1+`, jika `nginx -t` memberi peringatan pada `listen 443 ssl http2;`, ubah ke `listen 443 ssl;` + `http2 on;`).*
2. **Menjalankan `nginx -s reload` atau `systemctl reload nginx` sebelum `sudo nginx -t` sukses dengan exit code 0**.
3. **Mengasumsikan port `3000` kosong**. Selalu audit port aktif (`ss -tulpn`, `docker ps`, `pm2 list`) terlebih dahulu. Jika port `3000` dipakai aplikasi lain:
   - Mode **Docker Compose**: set `HOST_PORT=3001` (atau port localhost bebas lain) pada `.env` — tidak perlu mengubah `docker-compose.yml`.
   - Mode **Node.js + PM2**: set `PORT=3001` pada `.env`.
   - Pada konfigurasi Nginx `proxy_pass`, selalu arahkan ke `http://127.0.0.1:<APP_PORT>` yang sesuai.
4. **Menggunakan paket `nodejs` bawaan APT Debian 11/12 (`v12`/`v18`) untuk Jalur PM2**. `node:sqlite` dan TypeScript native baru tersedia di **Node.js v22+**. Jika VPS Debian hanya memiliki Node `< v22`, pilih **Jalur A (Docker Compose `node:22-alpine`)** atau pasang Node.js v22 LTS dari NodeSource setelah konfirmasi user.
5. **Menjalankan perintah pembersihan global Docker** seperti `docker system prune -a`, `docker volume prune`, atau `docker compose down -v` karena dapat menghancurkan data/container/volume aplikasi lain (`postgres`, `whatsapp gateway`, `mcp`, dll.). Untuk membersihkan sisa cache build setelah deploy, gunakan **hanya** `docker builder prune -f`!
6. **Menghapus atau menimpa `./data/diecut.db` maupun `./data/.session_secret`** saat proses update (`git pull`). Selalu buat backup konsisten (via `node:sqlite` `VACUUM INTO` atau `sqlite3 .backup`) sebelum rebuild.
7. **Mengekspos port internal aplikasi ke publik** (`0.0.0.0` di firewall UFW). Port internal hanya boleh diakses via `127.0.0.1:<APP_PORT>` dan dilayani ke luar lewat Nginx HTTPS (`443`).

---

## 3. Matriks Keputusan Runtime (Audit Otomatis Disk, RAM & Tooling VPS Debian)

Setelah mengaudit VPS pada Tahap 1 di Runbook (`df -h /`, `free -m`, `docker`, `node -v`, `pm2`, `ss -tulpn`):

| Kondisi VPS Debian Saat Audit | Jalur yang Harus Dipilih Agent | Catatan Resource |
| :--- | :--- | :--- |
| Tersedia `docker` & `docker compose` (`v2+`) **DAN** sisa disk `/` **`>= 3.0 GB`** | **Jalur A — Multi-Stage Docker Compose (Prioritas)** (`docker compose build --no-cache && docker compose up -d && docker builder prune -f`) | Image akhir ~160 MB, pin tag `IMAGE_TAG`, `mem_limit: 256m`, isolasi penuh dari service host. |
| Sisa disk `/` **`< 3.0 GB`** atau tidak ada Docker, **DAN** host memakai **Node.js v22+ & PM2** | **Jalur B — Node.js v22+ & PM2 Host Sidecar** (`npm ci --include=dev && npm run lint && npm run build && npm prune --omit=dev && pm2 start ...`) | Hemat disk (tanpa lapisan image/cache Docker), RAM ~60–95 MB, `--max-memory-restart 220M`. |
| Sisa disk `/` `< 1.5 GB` atau available RAM `< 350 MB` | **STOP-GATE**: Laporkan ke pemilik VPS sebelum build agar membersihkan disk / menambah zram/swap dulu. | Hindari OOM / `ENOSPC` di tengah proses build. |
| Tidak ada Docker dan Node.js host Debian `< v22` | Tawarkan & pasang **Docker Engine + Compose** atau **Node.js v22 LTS (NodeSource)** — minta konfirmasi user. | Wajib konfirmasi sebelum mengubah runtime global. |

---

## 4. Stop-Gates (Kapan Agent Harus Berhenti & Meminta Konfirmasi User)

Berhenti segera dan tanyakan kepada pemilik VPS apabila menemukan salah satu kondisi berikut:
- Sisa disk `/` `< 1.5 GB` atau available RAM `< 350 MB` saat build akan dijalankan.
- Belum diberikan **nama subdomain final** (misal `cad.domainanda.com`) atau password awal Admin produksi (`ADMIN_INITIAL_PASSWORD`).
- Hasil `dig +short <subdomain>` belum mengarah ke IP publik VPS ini.
- Domain menggunakan **Cloudflare Proxy (Orange Cloud)** dan mode SSL Cloudflare belum diketahui (`Flexible` akan menyebabkan redirect loop atau gagal HTTP-01 Certbot).
- Tidak ada Docker maupun Node.js `>= v22` terpasang dan perubahan paket global VPS membutuhkan persetujuan pemilik.
- Ditemukan konflik sertifikat TLS atau reverse-proxy non-standar di port `80/443`.

---

## 5. Bukti Wajib Sebelum Menyatakan "LIVE PRODUCTION"

AI Agent **tidak boleh** menyatakan deployment selesai hanya karena `docker compose up` atau `pm2 start` berjalan. Agent wajib menyelesaikan seluruh checklist pada [`docs/05-AI-AGENT-VPS-RUNBOOK.md`](./docs/05-AI-AGENT-VPS-RUNBOOK.md) Bagian 7 dan melampirkan ringkasan output verifikasi:
1. `GET http://127.0.0.1:<APP_PORT>/api/health` → `200 OK` (`{"ok":true,"db":"sqlite"}`)
2. Pemakaian resource pasca-boot terverifikasi hemat: container RAM `< 256 MB` (`docker stats --no-stream diecut-room` / `pm2 list`), sisa disk `/` pasca-cleanup aman (`df -h /`)
3. `sudo nginx -t` → `syntax is ok` & `test is successful`
4. `curl -I https://<subdomain>/` → `HTTP/2 200` dengan sertifikat SSL valid
5. `curl -I https://<subdomain>/sw.js` → mengandung `Cache-Control: no-cache`
6. Smoke test Auth end-to-end: login Admin sukses + pendaftaran user uji berstatus `pending` terblokir `403 ACCOUNT_PENDING` + bersihkan user uji kembali
7. Jadwal/uji backup `./data/diecut.db` terverifikasi ke `/opt/backups/diecut-room/` dan seluruh site Nginx serta container lama di VPS tetap merespons normal
