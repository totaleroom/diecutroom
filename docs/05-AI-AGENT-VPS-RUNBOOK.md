# 05. Playbook & Checklist AI Agent — Deploy GitHub ke Live Production VPS Debian

Panduan operasional langkah-demi-langkah (*executable runbook*) bagi **AI Agent** dan **Pemilik VPS** untuk menarik repositori **DieCut.Room** dari GitHub dan menayangkannya hingga **Live Production** pada subdomain **VPS Debian** yang sudah menjalankan Nginx dan aplikasi lain di port `80/443`.

---

## Bagian 0 — Persiapan di Sisi Pemilik (Sebelum & Saat Push ke GitHub)

Pastikan langkah berikut selesai di mesin lokal/asal sebelum menyuruh AI Agent melakukan `git pull` di VPS Debian:

1. **Verifikasi Kebersihan Repository (`.gitignore`)**:
   Pastikan file berikut **TIDAK** ikut masuk ke commit Git:
   - `.env` / `.env.local` / `.env.production`
   - `data/` (`diecut.db`, `diecut.db-wal`, `diecut.db-shm`, `.session_secret`)
   - `node_modules/`, `dist/`, `dev-dist/`, dan berkas sementara `.tmp*`

   ```bash
   # Jalankan sebelum git commit / push untuk memastikan tidak ada file DB, .env, atau cache dev yang terlacak
   git status
   git ls-files | grep -E '(^\.env|^data/|\.db|\.session_secret$|^dev-dist/)' || echo "CLEAN: Tidak ada secret/DB/cache terlacak"
   ```
   *(Jika pernah terlacak sebelumnya, lepaskan dari index Git tanpa menghapus file lokal dengan `git rm --cached -r data dev-dist .env`).*

2. **Push ke GitHub**:
   ```bash
   git add .
   git commit -m "chore: production ready diecut-room for Debian VPS deploy"
   git push -u origin main
   ```

3. **Data yang Perlu Diberikan ke AI Agent VPS**:
   - URL repository GitHub (HTTPS/SSH) & branch (`main`)
   - Subdomain target yang sudah diarahkan ke IP VPS (contoh: `cad.domainanda.com`)
   - Email Admin (`totale.room@gmail.com`) dan **Password Admin Produksi** baru yang kuat
   - Nomor WhatsApp Admin (`6282125086328`, tanpa `+`)

---

## Bagian 1 — Audit VPS Debian & Deteksi Konflik (WAJIB Dilakukan Agent Pertama Kali)

> [!CAUTION]
> Karena VPS Debian sudah memiliki Nginx dan aplikasi lain pada port `80/443`, jalankan seluruh perintah audit di bawah ini **tanpa mengubah file konfigurasi sistem mana pun** untuk memetakan OS, port, Nginx, dan runtime yang tersedia.

```bash
# 1. Cek versi Debian, resource disk & RAM tersedia, serta IP publik VPS
cat /etc/os-release && uname -a && free -m && df -h /
curl -4 -s https://ifconfig.me && echo ""

# 2. Cek runtime yang tersedia (Docker vs Node.js v22 + PM2)
command -v docker && docker compose version || echo "DOCKER_NOT_FOUND"
command -v node && node -v || echo "NODE_NOT_FOUND"
command -v pm2 && pm2 -v || echo "PM2_NOT_FOUND"

# 3. Audit port localhost/publik yang sedang dipakai aplikasi lain
sudo ss -tulpn | grep -E ':(80|443|3000|3001|3002|3100|8080)\b' || echo "NO_CONFLICT_PORTS"

# 4. Audit container Docker & proses PM2 yang sudah berjalan
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Status}}" 2>/dev/null || true
pm2 list 2>/dev/null || true

# 5. Audit Nginx Debian yang sudah aktif (JANGAN UBAH config lain)
nginx -v 2>&1
ls -la /etc/nginx/sites-available/ /etc/nginx/sites-enabled/ /etc/nginx/conf.d/ 2>/dev/null || true
sudo nginx -T 2>/dev/null | grep -E '(server_name|listen |proxy_pass)'
```

### Aturan Penentuan Port, Kapasitas & Jalur Eksekusi Agent di Debian
1. **Audit Kapasitas Disk & RAM (STOP-GATE Resource)**:
   - Jika sisa disk `/` `< 1.5 GB` atau available RAM `< 350 MB` → **BERHENTI & lapor pemilik VPS** agar membersihkan disk atau menambah swap/zram terlebih dahulu.
2. **Pilih Port Internal Bebas (`APP_PORT`)**:
   - Gunakan `3000` **hanya jika** tidak ada proses/container/proxy Nginx/PM2 yang memakai port `3000`.
   - Jika `3000` sudah terpakai, pilih port bebas terdekat (misal `3001`, `3002`, atau `3100`) dan verifikasi port tersebut benar-benar kosong di `ss -tulpn`.
3. **Pilih Runtime Otomatis Sesuai Disk & Tooling**:
   - **Jalur A (Multi-Stage Docker Compose Slim — Prioritas bila sisa disk ≥ 3.0 GB & Docker tersedia)**: Image akhir **~160 MB**, batas RAM **`mem_limit: 256m`** (`NODE_OPTIONS=--max-old-space-size=192`), RAM runtime ~65–110 MB, terisolasi penuh dari service host dan container lain (`docker builder prune -f` wajib dijalankan selesai build).
   - **Jalur B (Node.js v22+ & PM2 Host Sidecar — Prioritas bila sisa disk < 3.0 GB atau tanpa Docker)**: Wajib `node -v >= 22.x` (jika `< 22`, konfirmasi user untuk Docker atau NodeSource v22). Memakai `--max-memory-restart 220M` + `npm prune --omit=dev` sehingga hemat disk maksimal tanpa layer image Docker.

---

## Bagian 2 — Clone / Pull Repository & Setup DNS

### 2.1 Pull Repository ke Direktori Produksi
Direktori standar produksi: `/opt/diecut-room` (sesuaikan jika user menentukan lokasi lain).

```bash
# Clone pertama kali (ganti URL repo GitHub user; untuk repo private gunakan SSH deploy key atau PAT)
sudo mkdir -p /opt/diecut-room
sudo chown -R "$USER":"$USER" /opt/diecut-room
git clone <GITHUB_REPO_URL> /opt/diecut-room
cd /opt/diecut-room
```

*(Opsional)* Jika ada file font berlisensi **Timeless Grotesk** (`.woff2`), letakkan di `/opt/diecut-room/public/fonts/` sebelum build.  
*(Jika direktori sudah ada dari clone sebelumnya, gunakan langkah update aman di **Bagian 6.4**).*

### 2.2 Verifikasi DNS Subdomain (STOP-GATE)
Sebelum membuat sertifikat SSL atau menukar Nginx, pastikan DNS A-Record subdomain sudah mengarah ke IP publik VPS:

```bash
SUBDOMAIN="cad.domainanda.com"
dig +short "$SUBDOMAIN"
```

- **Lanjut** jika IP hasil `dig` sama dengan IP publik VPS (atau IP Cloudflare jika memakai Cloudflare Proxy).
- **BERHENTI & lapor user** jika `dig` kosong (`NXDOMAIN`) atau mengarah ke IP server lain.

---

## Bagian 3 — Konfigurasi `.env` Produksi & Rahasia Keamanan

Buat file `.env` dari `.env.example` dan pastikan izin filenya hanya dapat dibaca pemilik (`chmod 600`):

```bash
cd /opt/diecut-room
cp -n .env.example .env
mkdir -p data
chmod 700 data
```

Generate `SESSION_SECRET` acak 64 karakter hex:
```bash
openssl rand -hex 32
```

Isi `/opt/diecut-room/.env` dengan parameter terverifikasi berikut (sesuaikan `<APP_PORT>` dari hasil audit Bagian 1):

```env
# Pin tag rilis image Docker (mis. sesuai tag Git / versi rilis untuk rollback instan)
IMAGE_TAG=1.5.0

# Port di host VPS untuk Docker Compose (ubah jika 3000 sudah dipakai aplikasi lain)
HOST_PORT=<APP_PORT>

# Untuk Jalur A (Docker): tetap 3000 (dipetakan via 127.0.0.1:HOST_PORT:3000).
# Untuk Jalur B (PM2 langsung di Debian): ubah PORT menjadi <APP_PORT>.
PORT=3000
NODE_ENV=production

# Path database SQLite:
# Jalur A (Docker): /app/data/diecut.db
# Jalur B (PM2): /opt/diecut-room/data/diecut.db
SQLITE_PATH=/app/data/diecut.db

# Wajib diisi string acak 64 hex dari `openssl rand -hex 32`
SESSION_SECRET=<HASIL_OPENSSL_RAND_HEX_32>

# Akun Admin awal (hanya dibuat pada boot pertama jika belum ada user role 'admin')
ADMIN_EMAIL=totale.room@gmail.com
ADMIN_INITIAL_PASSWORD=<PASSWORD_ADMIN_KUAT_DARI_USER>

# Nomor WhatsApp tujuan verifikasi & reset password (ditanam ke bundle saat build)
VITE_WHATSAPP_ADMIN=6282125086328

# Wajib true karena berjalan di belakang Nginx HTTPS Reverse Proxy
TRUST_PROXY=true
```

Kunci izin `.env`:
```bash
chmod 600 /opt/diecut-room/.env
```

> [!IMPORTANT]
> **Perhatian `PORT`, `SQLITE_PATH`, dan `npm ci` antara Jalur A & Jalur B**:
> - Pada **Jalur A (Docker)**: `docker-compose.yml` memetakan `"127.0.0.1:${HOST_PORT:-3000}:3000"` dan me-override `PORT=3000` serta `SQLITE_PATH=/app/data/diecut.db` ke volume `./data:/app/data`.
> - Pada **Jalur B (Node/PM2)**: Server berjalan langsung di host Debian, jadi set `PORT=<APP_PORT>` dan `SQLITE_PATH=/opt/diecut-room/data/diecut.db` di `.env`! Selain itu, selalu gunakan **`npm ci --include=dev`** sebelum build agar `vite` & `tsc` tetap terpasang walau `NODE_ENV=production` aktif.

---

## Bagian 4 — Build & Jalankan Aplikasi (Pilih Sesuai Hasil Audit Debian)

### Jalur A — Multi-Stage Docker Compose Slim (Direkomendasikan bila Sisa Disk ≥ 3.0 GB)

`Dockerfile` menggunakan 2-stage build (`node:22-alpine`), menghasilkan image akhir **~160 MB** dengan **`mem_limit: 256m`** dan `NODE_OPTIONS=--max-old-space-size=192`.

1. Build tanpa cache agar hemat disk jangka panjang, jalankan container `diecut-room`, lalu bersihkan builder cache (aman — tidak menyentuh container atau volume lain):
   ```bash
   cd /opt/diecut-room
   docker compose build --no-cache
   docker compose up -d
   docker builder prune -f
   ```
2. Periksa status healthcheck, pemakaian RAM/disk, dan log startup (`DieCut.Room server listening on http://0.0.0.0:3000 (production)`):
   ```bash
   docker compose ps
   docker stats --no-stream diecut-room
   docker compose logs --tail=50 diecut-room
   df -h /
   ```
3. Uji health endpoint & font scanner pada port host (`<APP_PORT>`):
   ```bash
   curl -sS -f "http://127.0.0.1:${APP_PORT}/api/health" && echo ""
   curl -sS -f "http://127.0.0.1:${APP_PORT}/api/fonts/available" && echo ""
   ```
   Harus mengembalikan JSON: `{"ok":true,"db":"sqlite","timestamp":"..."}`.

---

### Jalur B — Debian Node.js v22+ & PM2 Host Sidecar (Hemat Disk Maksimal bila Sisa Disk < 3.0 GB)

1. Verifikasi versi Node wajib `>= 22.0.0`:
   ```bash
   node -v
   ```
2. Install dependensi (`--include=dev` agar tool build Vite/TypeScript terpasang), cek TypeScript, build `./dist`, lalu pangkas kembali `devDependencies` dan cache npm agar hemat disk:
   ```bash
   cd /opt/diecut-room
   npm ci --include=dev
   npm run lint
   npm run build
   npm prune --omit=dev && npm cache clean --force
   ```
3. Pastikan `.env` memakai `PORT=<APP_PORT>` dan `SQLITE_PATH=/opt/diecut-room/data/diecut.db`.
4. Jalankan melalui PM2 dengan nama proses unik `diecut-room` dan batas restart memori `220M` tanpa mengganggu proses PM2 lain:
   ```bash
   NODE_ENV=production pm2 start server.ts --name diecut-room --interpreter node --max-memory-restart 220M
   pm2 save
   ```
   *(Jika PM2 belum terset startup otomatis saat reboot Debian, jalankan `pm2 startup systemd` sekali dan eksekusi perintah outputnya).*
5. Cek log, RAM proses, & uji health endpoint:
   ```bash
   pm2 status diecut-room
   pm2 logs diecut-room --lines 30 --nostream
   curl -sS -f "http://127.0.0.1:${APP_PORT}/api/health" && echo ""
   ```

---

## Bagian 5 — Konfigurasi Nginx Debian (`sites-available`) & SSL HTTPS (Certbot)

> [!WARNING]
> **Jangan pernah mengedit atau menimpa konfigurasi situs aplikasi lain.** Buat file baru `/etc/nginx/sites-available/diecut-room` khusus untuk `server_name <SUBDOMAIN>;`.

### 5.1 Siapkan Virtual-Host HTTP Awal (untuk Verifikasi Certbot HTTP-01)

Ganti `<SUBDOMAIN>` dan `<APP_PORT>` sesuai lingkungan aktual:

```bash
sudo tee /etc/nginx/sites-available/diecut-room > /dev/null << 'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name <SUBDOMAIN>;

    location / {
        proxy_pass http://127.0.0.1:<APP_PORT>;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF
```

Aktifkan symlink **hanya setelah `nginx -t` berhasil**:
```bash
sudo ln -sf /etc/nginx/sites-available/diecut-room /etc/nginx/sites-enabled/diecut-room
sudo nginx -t && sudo systemctl reload nginx
```

### 5.2 Pasang Sertifikat SSL Let's Encrypt (Certbot)

> **Catatan Cloudflare:** Jika subdomain memakai **Cloudflare Orange Cloud (Proxied)**, pastikan DNS sementara berstatus **DNS Only (Grey Cloud)** saat menjalankan `certbot --nginx` pertama kali, atau gunakan Cloudflare Origin Certificate bila memakai mode **Full (Strict)**.

```bash
sudo certbot --nginx -d <SUBDOMAIN> --non-interactive --agree-tos -m totale.room@gmail.com --redirect
```

*(Jika `certbot` gagal karena challenge terhalang proxy/firewall, **BERHENTI** dan lapor user dengan pesan error certbot tanpa menghapus config Nginx situs lain).*

### 5.3 Terapkan Aturan Produksi PWA (`no-cache` Service Worker & Gzip)

Setelah Certbot menulis blok `listen 443 ssl`, pastikan blok `443` untuk `<SUBDOMAIN>` memiliki batas payload `client_max_body_size 3m;`, kompresi `gzip`, serta header `no-cache` untuk `/sw.js`, `/registerSW.js`, `/manifest.webmanifest`, dan `/index.html` (mengikuti template `deploy/nginx-diecut.conf`):

```nginx
    client_max_body_size 3m;
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml image/svg+xml;
    gzip_min_length 1024;

    location ~* ^/(sw\.js|registerSW\.js|manifest\.webmanifest|index\.html)$ {
        proxy_pass http://127.0.0.1:<APP_PORT>;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }
```

Validasi dan terapkan *(bila di Debian 13+ / Nginx 1.25.1+ muncul peringatan `listen ... http2 is deprecated`, ubah baris Certbot ke `listen 443 ssl;` + `http2 on;`)*:
```bash
sudo nginx -t && sudo systemctl reload nginx
```

> **Opsional namun Direkomendasikan (Hardening Brute-Force Auth):**  
> Untuk membatasi percobaan login/register (`HTTP 429`) dan menambahkan header keamanan HTTP, lihat [`docs/07-TROUBLESHOOTING-AND-SECURITY.md`](./07-TROUBLESHOOTING-AND-SECURITY.md) Bagian 2. Jika menemui kendala teknis, mereset akun Admin terkunci, atau butuh detail payload API, rujuk Bagian 1 & 3 di dokumen tersebut serta [`docs/06-API-REFERENCE.md`](./06-API-REFERENCE.md).

### 5.4 Verifikasi Firewall (UFW)
Pastikan port `80` dan `443` terbuka, sedangkan `<APP_PORT>` **TIDAK** dibuka ke publik di UFW:
```bash
sudo ufw status
```

---

## Bagian 6 — Uji Produksi End-to-End, Backup Otomatis & Prosedur Update/Rollback

### 6.1 Smoke Test Produksi via HTTPS Subdomain (Non-Destruktif)
Jalankan pengujian HTTP terhadap subdomain produksi yang sudah live (`https://<SUBDOMAIN>`):

```bash
DOMAIN="https://<SUBDOMAIN>"

# 1. Uji HTML utama & HTTP->HTTPS redirect
curl -sS -I "http://<SUBDOMAIN>/" | grep -iE '(HTTP/|location:)'
curl -sS -I "${DOMAIN}/" | grep -iE '(HTTP/|cache-control)'

# 2. Uji Health & Font API lewat HTTPS reverse proxy
curl -sS -f "${DOMAIN}/api/health" && echo ""
curl -sS -f "${DOMAIN}/api/fonts/available" && echo ""

# 3. Uji PWA Manifest & Service Worker (harus 200 OK & Cache-Control no-cache)
curl -sS -I "${DOMAIN}/manifest.webmanifest" | grep -iE '(HTTP/|content-type|cache-control)'
curl -sS -I "${DOMAIN}/sw.js" | grep -iE '(HTTP/|cache-control)'

# 4. Pastikan /api/admin/users terkunci 401 tanpa cookie sesi
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${DOMAIN}/api/admin/users")
echo "Unauthenticated /api/admin/users -> HTTP $STATUS (wajib 401)"
```

### 6.2 Uji Alur Autentikasi Admin & Pending User
Agent dapat memverifikasi login Admin menggunakan kredensial dari `.env`, sekaligus menguji registrasi dummy berstatus `pending` lalu menghapusnya kembali:
```bash
COOKIE_JAR=$(mktemp)
curl -sS -f -c "$COOKIE_JAR" -X POST "${DOMAIN}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_INITIAL_PASSWORD}\"}" | head -c 300
echo ""
curl -sS -f -b "$COOKIE_JAR" "${DOMAIN}/api/admin/users" | head -c 300
echo ""
rm -f "$COOKIE_JAR"
```
*Pastikan Cookie Jar sementara dan akun uji (jika dibuat) langsung dibersihkan setelah verifikasi.*

### 6.3 Pasang Jadwal Backup Harian SQLite (Mendukung Debian Tanpa `sqlite3` CLI)
Siapkan folder backup terpisah `/opt/backups/diecut-room`:

```bash
sudo mkdir -p /opt/backups/diecut-room
sudo chown -R "$USER":"$USER" /opt/backups/diecut-room
```

- **Jika `node` v22 tersedia langsung di host Debian (Jalur PM2)** — gunakan `node:sqlite` `VACUUM INTO` tanpa butuh `apt install sqlite3`:
  ```bash
  node --input-type=module -e '
  import { DatabaseSync } from "node:sqlite";
  const db = new DatabaseSync("/opt/diecut-room/data/diecut.db");
  db.exec("VACUUM INTO '\''/opt/backups/diecut-room/diecut-initial.db'\''");
  '
  ls -lh /opt/backups/diecut-room/diecut-initial.db
  ```
- **Jika memakai Jalur Docker Compose dan `sqlite3` CLI tidak ada di host Debian** — jalankan backup via container `diecut-room` (pakai `node` bawaan container) atau pasang `sudo apt-get install -y sqlite3`:
  ```bash
  # Alternatif tanpa install sqlite3 di host Debian (via container node:22-alpine):
  docker compose exec -T diecut-room node --input-type=module -e '
  import { DatabaseSync } from "node:sqlite";
  const db = new DatabaseSync("/app/data/diecut.db");
  db.exec("VACUUM INTO '\''/app/data/backup-tmp.db'\''");
  ' && mv /opt/diecut-room/data/backup-tmp.db /opt/backups/diecut-room/diecut-initial.db
  ```

Tambahkan cron job harian jam `02:30` (retensi 14 hari):
- Bila `sqlite3` tersedia di host (`command -v sqlite3`):
  ```bash
  (crontab -l 2>/dev/null | grep -v 'diecut-room'; echo "30 2 * * * sqlite3 /opt/diecut-room/data/diecut.db \".backup '/opt/backups/diecut-room/diecut-\$(date +\%F).db'\" && find /opt/backups/diecut-room -name 'diecut-*.db' -mtime +14 -delete") | crontab -
  ```
- Atau bila host tidak memakai `sqlite3` dan menjalankan Docker Compose:
  ```bash
  (crontab -l 2>/dev/null | grep -v 'diecut-room'; echo "30 2 * * * cd /opt/diecut-room && docker compose exec -T diecut-room node --input-type=module -e 'import { DatabaseSync } from \"node:sqlite\"; const d = new DatabaseSync(\"/app/data/diecut.db\"); d.exec(\"VACUUM INTO \\x27/app/data/cron-backup.db\\x27\");' && mv /opt/diecut-room/data/cron-backup.db \"/opt/backups/diecut-room/diecut-\$(date +\%F).db\" && find /opt/backups/diecut-room -name 'diecut-*.db' -mtime +14 -delete") | crontab -
  ```

### 6.4 Prosedur Update Aman (`git pull` dari GitHub)
Setiap kali ada commit baru di GitHub, AI Agent **WAJIB** menjalankan urutan ini agar `./data/diecut.db` dan `.env` tidak rusak:

```bash
cd /opt/diecut-room

# 1. Backup SQLite sebelum pull & rebuild (pilih sqlite3 atau node/docker sesuai environment)
if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 ./data/diecut.db ".backup '/opt/backups/diecut-room/pre-update-$(date +%F-%H%M).db'"
elif docker ps --format '{{.Names}}' | grep -q '^diecut-room$'; then
  docker compose exec -T diecut-room node --input-type=module -e 'import { DatabaseSync } from "node:sqlite"; new DatabaseSync("/app/data/diecut.db").exec("VACUUM INTO '\''/app/data/pre-update.db'\''");'
  mv ./data/pre-update.db "/opt/backups/diecut-room/pre-update-$(date +%F-%H%M).db"
else
  node --input-type=module -e "import { DatabaseSync } from 'node:sqlite'; new DatabaseSync('./data/diecut.db').exec(\"VACUUM INTO '/opt/backups/diecut-room/pre-update-\" + new Date().toISOString().slice(0,16).replace(/[:T]/g,'-') + \".db'\");"
fi

# 2. Catat commit SHA saat ini (untuk rollback bila gagal)
git rev-parse HEAD > /tmp/diecut-prev-commit

# 3. Tarik update dari GitHub tanpa menyentuh ./data dan .env
git fetch origin main --tags
git pull --ff-only origin main

# 4A. Jika Jalur Docker (perbarui IMAGE_TAG di .env bila naik rilis, lalu build bersih + prune builder):
docker compose build --no-cache
docker compose up -d
docker builder prune -f

# 4B. Jika Jalur Node + PM2:
# npm ci --include=dev && npm run lint && npm run build && npm prune --omit=dev && pm2 reload diecut-room

# 5. Verifikasi health & footprint RAM setelah update
curl -sS -f "http://127.0.0.1:${APP_PORT}/api/health"
curl -sS -f "https://<SUBDOMAIN>/api/health"
```

### 6.5 Prosedur Rollback Darurat
Jika update gagal compile atau service crash setelah `git pull`:
```bash
cd /opt/diecut-room
PREV_SHA=$(cat /tmp/diecut-prev-commit)
git checkout "$PREV_SHA"
# Jalankan ulang Jalur 4A (atau ganti IMAGE_TAG di .env ke tag stabil sebelumnya lalu `docker compose up -d`) atau Jalur 4B (npm ci --include=dev && npm run build && npm prune --omit=dev && pm2 reload diecut-room)
# Jika DB perlu dipulihkan, hentikan service terlebih dahulu lalu salin file backup ke ./data/diecut.db
```

---

## Bagian 7 — Checklist Wajib Verifikasi Live Production & Format Laporan Agent

AI Agent **wajib memeriksa dan mencentang seluruh item** berikut sebelum menyatakan deployment selesai kepada pemilik VPS:

### A. Keamanan Git & Isolasi VPS Multi-App
- [ ] `.env`, `dev-dist/`, dan `./data/` (`diecut.db`, `.session_secret`) tidak terlacak di Git (`git status` bersih).
- [ ] Port internal `<APP_PORT>` terverifikasi bebas sebelum start; tidak bentrok dengan aplikasi atau container lain (`uteke`, `gowa`, dll.).
- [ ] Tidak ada file konfigurasi Nginx maupun volume/image container aplikasi lain yang diubah atau dihapus (`docker builder prune -f` dipakai, bukan global prune).
- [ ] Situs lain dan container lain yang sudah berjalan di VPS tetap sehat & merespons normal.

### B. DNS & Keamanan Environment
- [ ] `dig +short <SUBDOMAIN>` mengarah ke IP VPS Debian (atau proxy Cloudflare yang valid).
- [ ] `.env` berizin `chmod 600` dan `SESSION_SECRET` diisi string acak 64 hex unik (bukan placeholder contoh).
- [ ] `ADMIN_EMAIL` dan `ADMIN_INITIAL_PASSWORD` sudah disetel kuat, bukan nilai default contoh.
- [ ] `VITE_WHATSAPP_ADMIN=6282125086328` sudah aktif dan ikut masuk ke proses build frontend.
- [ ] `TRUST_PROXY=true` aktif agar cookie sesi `Secure` bekerja di belakang Nginx HTTPS.

### C. Build, Runtime, RAM & Disk Health
- [ ] Build produksi (`docker compose build --no-cache` + `docker builder prune -f`, atau `npm ci --include=dev && npm run lint && npm run build && npm prune --omit=dev`) sukses tanpa error.
- [ ] Service berjalan stabil (`docker compose ps` = `Up (healthy)` / `pm2 status` = `online`) dan auto-restart aktif (`unless-stopped` / `pm2 save`).
- [ ] Penggunaan RAM runtime `< 256 MB` (`docker stats --no-stream diecut-room` / `pm2 list`) dan sisa disk `/` (`df -h /`) masih aman.
- [ ] `curl -sS http://127.0.0.1:<APP_PORT>/api/health` mengembalikan `{"ok":true,"db":"sqlite",...}`.

### D. Nginx Reverse Proxy Debian, SSL & PWA
- [ ] `sudo nginx -t` lolos bersih (`syntax is ok`, `test is successful`).
- [ ] Akses `http://<SUBDOMAIN>` otomatis redirect `301` ke `https://<SUBDOMAIN>`.
- [ ] Sertifikat HTTPS valid dan tidak kedaluwarsa (`curl -I https://<SUBDOMAIN>` mengembalikan `200`).
- [ ] `/sw.js`, `/registerSW.js`, `/manifest.webmanifest`, dan `/index.html` mengembalikan `200` dengan header `Cache-Control: no-cache`.
- [ ] Firewall UFW tidak membuka `<APP_PORT>` ke internet publik.

### E. Fungsional Auth, WhatsApp Metadata, SQLite & Backup
- [ ] Login Admin awal (`ADMIN_EMAIL`) berhasil masuk dan membuka tab/modal Manajemen Users.
- [ ] Endpoint `/api/admin/users` mengembalikan `401` bagi pengunjung tanpa login.
- [ ] Akun baru yang mendaftar via form Register berstatus `pending` dan tidak bisa masuk ke workspace sebelum disetujui Admin.
- [ ] Tombol logo WhatsApp pada halaman Login / Pending mengarah ke `https://wa.me/6282125086328` dengan payload asal subdomain.
- [ ] Backup SQLite pertama sukses di `/opt/backups/diecut-room/` dan cron backup harian aktif.

---

### Format Laporan Akhir Agent ke Pemilik VPS

Setelah seluruh checklist di atas tercentang, AI Agent harus menutup laporannya dengan ringkasan fakta berikut:

```markdown
## Status Deployment DieCut.Room: LIVE PRODUCTION
- **OS & Nginx VPS**: Debian (<versi>) — Virtual-host `/etc/nginx/sites-available/diecut-room`
- **URL Produksi**: https://<SUBDOMAIN>
- **Runtime Dipilih**: <Docker Compose (diecut-room) | Node.js v22 + PM2 (diecut-room)>
- **Port Internal (Localhost)**: 127.0.0.1:<APP_PORT>
- **Lokasi Database SQLite**: <path_diecut.db>
- **Status SSL HTTPS**: Aktif via <Certbot Let's Encrypt | Cloudflare> (Exp: <tanggal>)
- **Status PWA (`sw.js`, `manifest`, `index.html`)**: HTTP 200, `Cache-Control: no-cache` terverifikasi
- **Status Situs Nginx Lain**: Tidak tersentuh & terverifikasi tetap berjalan normal
- **Admin Awal**: <ADMIN_EMAIL> (terverifikasi dapat login; segera ganti/simpan password dengan aman)
- **Backup SQLite**: Teruji & dijadwalkan harian jam 02:30 ke `/opt/backups/diecut-room/`
```
