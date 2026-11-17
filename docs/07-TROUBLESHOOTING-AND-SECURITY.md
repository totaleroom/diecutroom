# 07. Panduan Troubleshooting, Keamanan Nginx, Recovery Admin & Migrasi SQLite

Panduan operasional jangka panjang (*Day-2 Operations*) untuk **Pemilik VPS Debian** dan **AI Agent** dalam menangani insiden produksi, mengamankan endpoint autentikasi Nginx di VPS multi-aplikasi, memulihkan akun Admin yang terkunci, serta memindahkan data SQLite antar server VPS.

---

## 1. Recovery Akun Admin (Lupa Password atau Ganti Email Admin)

Akun Admin tidak memiliki fitur *forgot password* di UI demi keamanan. Apabila Anda lupa password Admin produksi atau ingin memindahkan hak Admin ke email baru **tanpa menghapus data pengguna & proyek di SQLite**, jalankan perintah recovery langsung di server VPS.

> **Mengapa menggunakan skrip Node.js?**  
> Backend (`server.ts`) menyimpan hash kata sandi dalam format `<16-byte salt hex>:<64-byte scrypt hex>`. Menggunakan `node:crypto` + `node:sqlite` bawaan Node.js v22 menjamin format hash 100% identik dengan sistem login tanpa tool tambahan.

### A. Reset Password Admin (Jalur Docker Compose)
```bash
cd /opt/diecut-room

docker compose exec -T \
  -e TARGET_EMAIL="totale.room@gmail.com" \
  -e NEW_ADMIN_PWD="PasswordBaruAdminYangKuat2026!" \
  diecut-room node --input-type=module -e '
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
const email = process.env.TARGET_EMAIL.trim().toLowerCase();
const newPwd = process.env.NEW_ADMIN_PWD;
if (!newPwd || newPwd.length < 6) throw new Error("Password minimal 6 karakter");
const salt = crypto.randomBytes(16).toString("hex");
const hash = `${salt}:${crypto.scryptSync(newPwd, salt, 64).toString("hex")}`;
const db = new DatabaseSync("/app/data/diecut.db");
const res = db.prepare("UPDATE users SET password_hash = ?, status = '\''active'\'', role = '\''admin'\'' WHERE email = ?").run(hash, email);
console.log("Updated Admin rows:", res.changes);
'
```

### B. Reset Password Admin (Jalur Debian Node.js v22 + PM2)
```bash
cd /opt/diecut-room
TARGET_EMAIL="totale.room@gmail.com" \
NEW_ADMIN_PWD="PasswordBaruAdminYangKuat2026!" \
SQLITE_PATH="/opt/diecut-room/data/diecut.db" \
node --input-type=module -e '
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
const email = process.env.TARGET_EMAIL.trim().toLowerCase();
const newPwd = process.env.NEW_ADMIN_PWD;
const salt = crypto.randomBytes(16).toString("hex");
const hash = `${salt}:${crypto.scryptSync(newPwd, salt, 64).toString("hex")}`;
const db = new DatabaseSync(process.env.SQLITE_PATH);
const res = db.prepare("UPDATE users SET password_hash = ?, status = '\''active'\'', role = '\''admin'\'' WHERE email = ?").run(hash, email);
console.log("Updated Admin rows:", res.changes);
'
```

### C. Mengganti Email Admin ke Alamat Baru
1. Perbarui `ADMIN_EMAIL` di `.env` agar konsisten untuk bootstrap masa depan.
2. Jalankan update email via Node.js v22 `node:sqlite` (berjalan di Debian tanpa perlu `sqlite3` CLI):
   ```bash
   cd /opt/diecut-room
   node --input-type=module -e '
   import { DatabaseSync } from "node:sqlite";
   const db = new DatabaseSync("./data/diecut.db");
   const res = db.prepare("UPDATE users SET email = ? WHERE email = ? AND role = '\''admin'\''")
     .run("adminbaru@domain.com", "totale.room@gmail.com");
   console.log("Updated email rows:", res.changes);
   '
   ```

---

## 2. Hardening Keamanan Nginx (Rate-Limit Auth & Multi-App Safe)

Karena VPS Debian sudah menampung aplikasi lain pada Nginx yang sama, aturan *rate-limiting* harus dipasang secara modular di file terpisah pada `/etc/nginx/conf.d/` (konteks `http {}`) dan hanya dipanggil di virtual-host `diecut-room`.

### Langkah 1: Buat Zona Rate-Limit Khusus DieCut.Room
```bash
sudo tee /etc/nginx/conf.d/diecut-ratelimit.conf > /dev/null << 'EOF'
# Zona pembatas percobaan login/register: maks 10 req/menit per IP (+ burst 5)
limit_req_zone $binary_remote_addr zone=diecut_room_auth_limit:10m rate=10r/m;
limit_req_status 429;
EOF
```

### Langkah 2: Aktifkan di Virtual-Host `/etc/nginx/sites-available/diecut-room`
Di dalam blok `server { listen 443 ssl http2; server_name <SUBDOMAIN>; ... }` (template lengkap tersedia di `deploy/nginx-diecut.conf`):
```nginx
    # Batasi ukuran body upload agar sejalan dengan express.json({ limit: '2mb' })
    client_max_body_size 3m;

    # Header keamanan browser
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Proteksi Brute-Force pada Login & Spam Pendaftaran
    location ~ ^/api/auth/(login|register)$ {
        limit_req zone=diecut_room_auth_limit burst=5 nodelay;
        proxy_pass http://127.0.0.1:<APP_PORT>;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
```

### Langkah 3: Validasi Non-Destruktif
```bash
sudo nginx -t && sudo systemctl reload nginx
```
*(Uji bahwa melebihi 6 kali hit cepat ke `/api/auth/login` mengembalikan `HTTP 429` dan aplikasi lain di Nginx tetap normal).*

---

## 3. Matriks Troubleshooting Masalah Produksi (Debian & Multi-App)

| Gejala / Error | Akar Penyebab Paling Sering | Solusi Pasti |
| :--- | :--- | :--- |
| **`vite: not found` atau `tsc: not found` saat build Jalur PM2 di Debian** | `NODE_ENV=production` sudah terset di shell/env sebelum menjalankan `npm ci`, sehingga `devDependencies` dilewati. | Jalankan `npm ci --include=dev` sebelum `npm run lint && npm run build`. |
| **Error `Cannot find module 'node:sqlite'` atau SyntaxError TypeScript di Debian** | Paket `nodejs` bawaan APT Debian 12 Bookworm adalah v18 (`node:sqlite` & type-stripping native baru ada di Node v22 LTS). | Jalankan lewat **Jalur Docker Compose** (`node:22-alpine` bawaan image), atau upgrade host Debian ke **Node.js v22 LTS** via NodeSource. |
| **Error `sqlite3: command not found` saat backup di Debian minimal** | Paket CLI `sqlite3` belum terpasang di Debian. | Gunakan perintah `VACUUM INTO` berbasis `node --input-type=module` + `node:sqlite` (lihat `docs/03` & `docs/05`), atau jalankan `sudo apt-get install -y sqlite3`. |
| **Warning Nginx `the "listen ... http2" directive is deprecated`** | Debian 13+ atau Nginx `1.25.1+` memakai direktif `http2 on;` terpisah. | Ganti `listen 443 ssl http2;` menjadi `listen 443 ssl;` + `listen [::]:443 ssl;` lalu tambahkan baris `http2 on;` di dalam blok `server`. |
| **Disk VPS hampir penuh (`ENOSPC`) atau RAM membengkak saat build/run** | Build cache Docker lama menumpuk atau batas memori belum diaktifkan di VPS kecil. | 1. Gunakan `docker compose build --no-cache && docker compose up -d && docker builder prune -f` (image multi-stage hanya ~160 MB dengan `mem_limit: 256m`).<br>2. **DILARANG** menjalankan `docker system prune -a` bila ada container lain aktif.<br>3. Jika disk sangat mepet (`< 3 GB`), gunakan **Jalur PM2** (`npm prune --omit=dev` + `--max-memory-restart 220M`). |
| **Login berhasil (`200`), tapi setelah refresh kembali ke layar Login** | Cookie sesi berflag `SameSite=None; Secure` membutuhkan `X-Forwarded-Proto: https` dan `TRUST_PROXY=true`, atau akses via `http://` biasa. | 1. Pastikan mengakses lewat `https://<SUBDOMAIN>`.<br>2. Pastikan `TRUST_PROXY=true` di `.env`.<br>3. Cek Nginx memiliki `proxy_set_header X-Forwarded-Proto $scheme;`. |
| **Redirect Loop (`ERR_TOO_MANY_REDIRECTS`) atau Certbot gagal** | Domain memakai **Cloudflare Orange Cloud** dengan mode SSL **Flexible**. | Ubah mode SSL/TLS di Cloudflare menjadi **Full (Strict)**. Saat menjalankan `certbot` ulang, ubah sementara DNS Cloudflare ke **DNS Only (Grey Cloud)**. |
| **Bentrok Port `Bind for 127.0.0.1:3000 failed: port is already allocated`** | Port `3000` di VPS sudah dipakai aplikasi lain. | 1. Cek port kosong via `sudo ss -tulpn`.<br>2. Docker: set `HOST_PORT=3001` di `.env`, lalu `docker compose up -d`.<br>3. PM2: set `PORT=3001` di `.env`, lalu `pm2 restart diecut-room --update-env`.<br>4. Samakan `proxy_pass http://127.0.0.1:3001;` di Nginx. |
| **Error `SQLITE_READONLY` atau `attempt to write a readonly database`** | Folder `./data` dibuat dengan kepemilikan atau permission yang salah. | Jalankan `sudo chown -R $(id -u):$(id -g) /opt/diecut-room/data && chmod 700 /opt/diecut-room/data`. |
| **Layar putih atau UI lama muncul setelah update rilis baru** | 1. `VITE_WHATSAPP_ADMIN` atau file font ditanam saat *build time* (perlu rebuild).<br>2. Browser menyimpan cache `sw.js` / `index.html` lama. | 1. Jalankan `docker compose up -d --build` (atau `npm run build`).<br>2. Pastikan Nginx memberi `Cache-Control "no-cache, no-store, must-revalidate"` pada `/sw.js`, `/registerSW.js`, `/manifest.webmanifest`, dan `/index.html`.<br>3. Tunggu 6.5 detik agar watchdog pemulihan browser muncul atau lakukan Hard Reload. |
| **Request simpan proyek besar gagal (`413 Payload Too Large`)** | Default `client_max_body_size` Nginx adalah `1m` sedangkan limit backend Express `2mb`. | Tambahkan `client_max_body_size 3m;` pada blok `server` Nginx untuk subdomain DieCut.Room, lalu `sudo nginx -t && sudo systemctl reload nginx`. |

---

## 4. Migrasi Lengkap Database SQLite & Proyek Antar VPS

Jika Anda memindahkan **DieCut.Room** ke VPS baru tanpa ingin user mendaftar ulang atau kehilangan proyek & riwayat BCT:

### Langkah 1: Backup Konsisten di VPS Lama
Mode **WAL** (`Write-Ahead Logging`) menggunakan 3 file (`diecut.db`, `diecut.db-wal`, `diecut.db-shm`). Jangan pernah hanya menyalin `diecut.db` saat server aktif tanpa `VACUUM INTO` atau `.backup`!

```bash
# Jalankan di VPS LAMA (kompatibel Node 22 tanpa butuh sqlite3 CLI)
mkdir -p /opt/backups/migration
node --input-type=module -e '
import { DatabaseSync } from "node:sqlite";
new DatabaseSync("/opt/diecut-room/data/diecut.db").exec("VACUUM INTO '\''/opt/backups/migration/diecut-migrate.db'\''");
const check = new DatabaseSync("/opt/backups/migration/diecut-migrate.db").prepare("PRAGMA integrity_check;").get();
console.log(check);
'
```

### Langkah 2: Salin Database, Secret Sesi & `.env` ke VPS Baru
Menyalin `.session_secret` dan nilai `SESSION_SECRET` yang sama menjaga agar user yang sudah login tetap terautentikasi mulus setelah DNS berpindah.

```bash
# Transfer aman melalui SCP dari VPS LAMA ke VPS BARU
scp /opt/backups/migration/diecut-migrate.db user@IP_VPS_BARU:/opt/diecut-room/data/diecut.db
scp /opt/diecut-room/.env user@IP_VPS_BARU:/opt/diecut-room/.env
scp /opt/diecut-room/data/.session_secret user@IP_VPS_BARU:/opt/diecut-room/data/.session_secret 2>/dev/null || true
```

### Langkah 3: Verifikasi di VPS Baru
```bash
# Jalankan di VPS BARU
cd /opt/diecut-room
chmod 700 data
chmod 600 .env data/diecut.db data/.session_secret 2>/dev/null || true
node --input-type=module -e '
import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync("data/diecut.db");
console.log(db.prepare("SELECT (SELECT COUNT(*) FROM users) AS total_users, (SELECT COUNT(*) FROM saved_projects) AS total_projects").get());
'
docker compose up -d --build   # atau npm ci --include=dev && npm run build && pm2 start ...
```

Pindahkan A-Record subdomain DNS ke IP VPS Baru, pasang SSL Certbot, lalu jalankan checklist **Bagian 7** pada `docs/05-AI-AGENT-VPS-RUNBOOK.md`.
