# 03. Panduan Deploy VPS Debian, Subdomain DNS, Nginx, Docker & PWA

Panduan operasional lengkap untuk memindahkan dan menjalankan **DieCut.Room** di **VPS Debian pribadi** menggunakan **subdomain DNS Anda sendiri**, lengkap dengan SSL HTTPS, persistensi database SQLite, dukungan custom font, dan instalasi aplikasi **PWA** di desktop maupun smartphone.

---

## 1. Persiapan DNS Management (Subdomain)

Buka panel **DNS Management** domain Anda (Cloudflare, Niagahoster, Namecheap, Route53, dll.) dan tambahkan record berikut:

| Type | Name / Host | Value / Target | TTL | Catatan |
| :---: | :--- | :--- | :---: | :--- |
| `A` | `cad` *(contoh: `cad.domainanda.com`)* | `IP_PUBLIC_VPS_ANDA` | `Auto` / `300` | Pastikan mengarah langsung ke IPv4 VPS Debian Anda |

Verifikasi propagasi DNS sebelum memasang sertifikat SSL:
```bash
dig +short cad.domainanda.com
```
Pastikan output menampilkan IP publik VPS Anda. *(Jika memakai Cloudflare, sementara atur status proxy menjadi **DNS Only / Awan Abu-abu** saat menjalankan `certbot` pertama kali, lalu boleh aktifkan kembali mode **Full (Strict)** setelah SSL terpasang).*

---

## 2. Opsi Deploy A — Multi-Stage Docker Slim (Direkomendasikan bila Sisa Disk ≥ 3 GB)

`Dockerfile` memakai **2-stage build** di atas `node:22-alpine`: Stage 1 membangun bundel statis `./dist`, dan Stage 2 hanya menyertakan `express` + `dotenv` sehingga ukuran image akhir **~160 MB** dan pemakaian RAM runtime **~65–110 MB** (dibatasi keras `mem_limit: 256m`).

### Langkah 1: Clone / Salin Proyek ke VPS
```bash
sudo mkdir -p /opt/diecut-room
sudo chown -R "$USER":"$USER" /opt/diecut-room
git clone <GITHUB_REPO_URL> /opt/diecut-room
cd /opt/diecut-room
mkdir -p data
chmod 700 data
```

*(Opsional)* Jika Anda memiliki font berlisensi **Timeless Grotesk**, salin file `.woff2`-nya ke `public/fonts/` **sebelum** menjalankan build (lihat `public/fonts/README.md`).

### Langkah 2: Konfigurasi `.env`
Buat file `.env` dari `.env.example`:
```bash
cp .env.example .env
nano .env
```
Isi dengan nilai produksi yang aman:
```env
# Pin tag rilis image untuk memudahkan rollback deterministik
IMAGE_TAG=1.5.0

# Ubah HOST_PORT (mis. 3001) jika port 3000 sudah dipakai aplikasi lain di VPS Anda
HOST_PORT=3000
PORT=3000
NODE_ENV=production
SQLITE_PATH=/app/data/diecut.db

# Generate string acak 64 karakter hex dengan: openssl rand -hex 32
SESSION_SECRET=ganti_dengan_hasil_openssl_rand_hex_32

# Akun Administrator awal (dibuat otomatis saat boot pertama jika belum ada)
ADMIN_EMAIL=totale.room@gmail.com
ADMIN_INITIAL_PASSWORD=GantiDenganPasswordAdminYangKuat!

# Nomor WhatsApp Admin untuk verifikasi & reset password (diteruskan saat docker build)
VITE_WHATSAPP_ADMIN=6282125086328

TRUST_PROXY=true
```
Kunci izin `.env`:
```bash
chmod 600 .env
```

> [!IMPORTANT]
> Variabel `VITE_WHATSAPP_ADMIN` serta file font di `public/fonts/` dibaca pada saat `npm run build` / `docker compose build`. Jika Anda mengubahnya nanti, jalankan ulang rebuild container diikuti `docker builder prune -f`.

### Langkah 3: Build Tanpa Cache, Nyalakan Container & Bersihkan Cache Builder
```bash
docker compose build --no-cache
docker compose up -d
docker builder prune -f   # Aman: hanya membuang cache builder, tidak menyentuh container/volume lain!
```
Cek apakah container berjalan sehat (`healthy`), hemat RAM (`< 256 MB`), dan merespons pada `127.0.0.1:${HOST_PORT:-3000}`:
```bash
docker compose ps
docker stats --no-stream diecut-room
curl -sS http://127.0.0.1:3000/api/health   # ganti 3000 jika Anda mengubah HOST_PORT
```
Output yang diharapkan: `{"ok":true,"db":"sqlite",...}`.

> [!TIP]
> Untuk hardening rate-limit Nginx, pemulihan password Admin yang lupa, dan migrasi database SQLite antar VPS, lihat [`docs/07-TROUBLESHOOTING-AND-SECURITY.md`](./07-TROUBLESHOOTING-AND-SECURITY.md). Jika memakai AI Agent otomatis setelah `git pull`, ikuti [`docs/05-AI-AGENT-VPS-RUNBOOK.md`](./05-AI-AGENT-VPS-RUNBOOK.md).

---

## 3. Opsi Deploy B — Debian Node.js 22 + PM2 (Hemat Disk Maksimal Tanpa Image Docker)

Cocok bila sisa disk VPS sempit (`< 3 GB`) dan **Node.js v22 + PM2** sudah berjalan di host Debian.

> [!WARNING]
> Paket `nodejs` bawaan APT Debian 12 Bookworm masih versi **v18**, yang **tidak** mendukung `node:sqlite` maupun eksekusi TypeScript native. Pastikan `node -v` menunjukkan **`v22.x.x`+**.

```bash
# 1. Jika belum v22+, pasang Node.js v22 LTS (NodeSource untuk Debian)
node -v || (curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs)

# 2. Install dependensi (wajib --include=dev agar vite & tsc terpasang), build produksi, lalu pangkas devDependencies
cd /opt/diecut-room
mkdir -p data && chmod 700 data
cp .env.example .env && chmod 600 .env
# Edit .env: set PORT=3000 (atau 3001 jika sibuk), NODE_ENV=production, SQLITE_PATH=/opt/diecut-room/data/diecut.db

npm ci --include=dev
npm run lint
npm run build
npm prune --omit=dev && npm cache clean --force

# 3. Jalankan persisten via PM2 dengan batas restart memori aman 220M
NODE_ENV=production pm2 start server.ts --name diecut-room --interpreter node --max-memory-restart 220M
pm2 save
```

---

## 4. Konfigurasi Nginx Debian (`sites-available`) & HTTPS SSL (Certbot)

PWA (*Progressive Web App*) **mewajibkan koneksi HTTPS** agar *Service Worker*, penyimpanan offline, dan tombol **Install App** berfungsi di browser modern, sekaligus memastikan cookie login aman (`Secure`).

### Langkah 1: Pasang Nginx & Certbot di Debian
```bash
sudo apt-get update
sudo apt-get install -y nginx certbot python3-certbot-nginx
```

### Langkah 2: Buat Virtual-Host Baru `/etc/nginx/sites-available/diecut-room`
**Jangan mengubah file situs aplikasi lain.** Buat konfigurasi baru khusus untuk subdomain Anda:
```bash
sudo tee /etc/nginx/sites-available/diecut-room << 'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name cad.domainanda.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/diecut-room /etc/nginx/sites-enabled/diecut-room
sudo nginx -t && sudo systemctl reload nginx
```
*(Ganti `3000` dengan `HOST_PORT`/`PORT` pilihan Anda jika port `3000` terpakai aplikasi lain).*

### Langkah 3: Terbitkan Sertifikat SSL Gratis (Let's Encrypt)
```bash
sudo certbot --nginx -d cad.domainanda.com
```
Setelah SSL aktif, perbarui blok `server { listen 443 ssl ... }` menggunakan aturan lengkap di `deploy/nginx-diecut.conf` (termasuk header `Cache-Control: no-cache, no-store, must-revalidate` untuk `/sw.js`, `/registerSW.js`, `/manifest.webmanifest`, dan `/index.html`, serta `client_max_body_size 3m;` dan `gzip on`). Validasi sebelum reload:
```bash
sudo nginx -t && sudo systemctl reload nginx
```
*(Catatan Debian 13+ / Nginx `1.25.1+`: jika muncul warning `listen ... http2 is deprecated`, ubah ke `listen 443 ssl;` + `listen [::]:443 ssl;` + `http2 on;`).*

### Langkah 4: Firewall UFW
Pastikan hanya port SSH (`22`), HTTP (`80`), dan HTTPS (`443`) yang terbuka ke publik; port `3000` (atau port internal pilihan Anda) tetap tertutup hanya di `127.0.0.1`:
```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

---

## 5. Cara Install PWA (Desktop, Android & iOS)

Setelah subdomain Anda aktif melalui HTTPS (`https://cad.domainanda.com`):
* **Windows / macOS (Chrome / Edge)**: Klik tombol **Install App** pada header kanan atas DieCut.Room (atau ikon install di bilah alamat browser). Aplikasi terbuka di jendela standalone layaknya software CAD desktop.
* **Android (Chrome)**: Buka URL subdomain, ketuk **Install App** atau menu browser **Add to Home screen**.
* **iPhone / iPad (Safari)**: Ketuk tombol **Install iOS** di header untuk panduan 2 langkah (*Share* → *Add to Home Screen*).
* **Catatan Offline Mode**: Aset UI, kalkulator 2D/3D CAD, dan cache riwayat BCT terakhir tetap berfungsi saat jaringan terputus (*Offline Mode*), sedangkan verifikasi login/registrasi/Admin tetap membutuhkan koneksi ke VPS demi keamanan kontrol akses.

---

## 6. Backup & Restore Database SQLite (Debian)

Seluruh akun pengguna, password hash, metadata asal akses, proyek dieline tersimpan, dan riwayat BCT tersimpan di `./data/diecut.db`.

### Opsi A — Menggunakan Node.js v22 Built-in (`node:sqlite`, Tanpa Paket Tambahan)
Berjalan konsisten meski paket `sqlite3` CLI belum terpasang di Debian minimal (gunakan di dalam container Docker atau langsung di host Node 22):
```bash
sudo mkdir -p /opt/backups/diecut-room
node --input-type=module -e '
import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync("/opt/diecut-room/data/diecut.db");
db.exec("VACUUM INTO '\''/opt/backups/diecut-room/diecut-" + new Date().toISOString().slice(0, 10) + ".db'\''");
'
```

### Opsi B — Menggunakan `sqlite3` CLI (Bila Terpasang via `apt install sqlite3`)
```bash
sqlite3 /opt/diecut-room/data/diecut.db ".backup '/opt/backups/diecut-room/diecut-$(date +%F).db'"
```
Atau cukup salin seluruh folder `./data` (`diecut.db`, `diecut.db-wal`, `diecut.db-shm`, dan `.session_secret`) setelah menghentikan sementara container/PM2 (`docker compose stop` / `pm2 stop diecut-room`).
