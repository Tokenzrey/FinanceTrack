# FinTrack — Pelacak Keuangan Pribadi

Aplikasi web pengelola keuangan pribadi untuk pengguna Indonesia. Anggaran bulanan
berbasis tiga pilar (Kebutuhan/Keinginan/Tabungan), pencatatan transaksi, scan struk
dengan AI, target tabungan, pelacak kekayaan bersih, sampai laporan siap ekspor — semua
dalam Rupiah, format `id-ID`, dan data tersimpan di akun Firebase + Google Drive
milikmu sendiri, bukan di server pihak ketiga mana pun.

> Dibangun dengan Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui,
> Firebase (Auth + Firestore), dan Google Drive sebagai penyimpanan file.

---

## Daftar Isi

- [Fitur](#fitur)
- [Tumpukan Teknologi](#tumpukan-teknologi)
- [Arsitektur & Struktur Folder](#arsitektur--struktur-folder)
- [Prasyarat](#prasyarat)
- [Instalasi & Konfigurasi](#instalasi--konfigurasi)
  - [1. Clone & install dependency](#1-clone--install-dependency)
  - [2. Buat proyek Firebase](#2-buat-proyek-firebase)
  - [3. Deploy Firestore rules & indexes](#3-deploy-firestore-rules--indexes)
  - [4. Siapkan Google Cloud OAuth (untuk Google Drive)](#4-siapkan-google-cloud-oauth-untuk-google-drive)
  - [5. Ambil API key Gemini (untuk scan struk AI)](#5-ambil-api-key-gemini-untuk-scan-struk-ai)
  - [6. Isi `.env.local`](#6-isi-envlocal)
  - [7. (Opsional) Siapkan Bot WhatsApp & Telegram](#7-opsional-siapkan-bot-whatsapp--telegram)
- [Menjalankan Aplikasi](#menjalankan-aplikasi)
- [Script yang Tersedia](#script-yang-tersedia)
- [Testing](#testing)
- [Deploy ke Produksi](#deploy-ke-produksi)
- [Keamanan & Privasi Data](#keamanan--privasi-data)
- [SEO](#seo)
- [PWA (Instal ke Layar Utama)](#pwa-instal-ke-layar-utama)
- [Status Pengembangan](#status-pengembangan)

---

## Fitur

### Autentikasi & Akun
- Masuk/daftar dengan email+kata sandi atau akun Google.
- Lupa kata sandi (tautan reset via email) dan ganti kata sandi langsung dari dalam
  aplikasi (Pengaturan → Akun), dengan verifikasi ulang identitas dulu.
- Ganti email akun (tautan konfirmasi dikirim ke email baru sebelum benar-benar aktif).
- **Google Drive tertaut sekali, tidak pernah minta izin lagi.** Saat daftar/masuk
  dengan Google, aplikasi otomatis menautkan akses Drive juga. Untuk akun
  email+kata sandi, tautkan sekali dari Pengaturan — sesudah itu scan struk, unggah
  lampiran, dan ekspor ke Drive berjalan tanpa jendela izin berulang, di perangkat
  atau tab mana pun, sampai kamu memutuskan tautannya sendiri.
- Wizard onboarding sekali jalan: nama, estimasi penghasilan bulanan, alokasi tiga
  pilar, dan pilih kategori awal dari template siap pakai.

### Dashboard
- Ringkasan bulan aktif: total pemasukan, anggaran terpakai, dana tersimpan, dan arus
  kas bersih.
- Kartu tiap pilar (Kebutuhan/Keinginan/Tabungan) dengan bar serapan anggaran.
- **Catat cepat** (quick entry) dari bar bawah atau tombol mengambang — tanpa buka form
  penuh untuk transaksi harian yang simpel.
- Widget **Market Pulse**: kurs emas (goldapi.io), BI Rate, inflasi, dan yield SBN
  ritel referensi, masing-masing dengan label tanggal "per YYYY-MM" agar tidak
  terlihat seperti angka hidup padahal manual.

### Transaksi
- Catat pemasukan/pengeluaran/transfer lengkap dengan kategori, sub-kategori, metode
  bayar, lokasi, tag, catatan, dan perasaan belanja (opsional: puas/oke/menyesal).
- Filter lengkap: kata kunci, jenis, pilar, metode bayar, perasaan, tag, rentang
  tanggal, dan rentang nominal.
- Pilih banyak transaksi sekaligus untuk hapus massal; hapus satuan bisa diurungkan
  (undo 5 detik).
- Duplikat transaksi yang sudah ada sebagai titik awal transaksi baru.
- **Numpad kustom** untuk input nominal — tombol besar 0–9/000/hapus, alternatif dari
  keyboard angka bawaan, cocok untuk satu tangan di ponsel.
- **Impor CSV**: unggah mutasi rekening/e-wallet/aplikasi lain lewat wizard 4 langkah
  (unggah → petakan kolom → pratinjau & validasi → impor). Delimiter dan header kolom
  bebas — dipetakan manual, bukan ditebak paksa. Baris yang jatuh di bulan yang sudah
  ditutup dilewati dan dilaporkan, bukan menggagalkan seluruh impor.
- Lampirkan foto struk ke transaksi (unggah manual atau hasil scan AI), tersimpan di
  Google Drive milikmu sendiri, dengan pratinjau ber-zoom dan pan di dalam aplikasi.

### Scan Struk dengan AI
- Foto atau unggah struk belanja — Gemini Vision membaca merchant, tanggal, item,
  subtotal, pajak, diskon, dan total secara otomatis, termasuk format harga ala
  Indonesia (pemisah ribuan titik).
- Setiap item otomatis dipetakan ke kategori keuanganmu, dan aplikasi **belajar dari
  koreksi manual** kamu untuk pemetaan yang makin akurat ke depannya.
- Mode ulasan sekaligus (satu transaksi gabungan) atau per-item (itemized).
- Jika AI gagal membaca, foto tetap tersimpan — tinggal isi manual atau coba lagi tanpa
  foto ulang.
- Riwayat semua struk yang pernah discan, dengan status (belum ditinjau/tersimpan/
  dibuang) dan skor keyakinan AI.

### Bot WhatsApp & Telegram
- Tautkan akun sekali dari Pengaturan (kode 6 karakter, berlaku 15 menit), lalu jalankan
  hampir seluruh aplikasi langsung dari chat — gratis, tanpa biaya tambahan.
- Kirim teks bahasa natural ("makan siang 35rb", "gaji masuk 5jt") — nominal, jenis
  (pemasukan/pengeluaran), dan kategori terdeteksi otomatis; kalau ragu, bot menawarkan
  pilihan kategori (tombol tap di Telegram, balas angka di WhatsApp) untuk dikonfirmasi.
- **Kirim foto struk** — dibaca dengan mesin AI yang sama dengan Scan Struk di web, lalu
  otomatis tersimpan ke folder Drive `FinTrack/Receipts` kalau akun Google Drive-mu
  sudah tertaut (kalau belum, transaksi tetap tercatat, hanya tanpa lampiran foto).
- **14 command** mencakup hampir semua domain aplikasi, bukan cuma catat transaksi:
  `/ringkasan`, `/saldo`, `/riwayat`, `/tahunan` (Anggaran &amp; Riwayat), `/target`,
  `/setor` (Target Tabungan — dua langkah: pilih target, lalu ketik nominal),
  `/kekayaan` (Kekayaan Bersih, dihitung dari aset &amp; liabilitas terkini — bukan
  snapshot basi), `/rutin` (Transaksi Rutin, dengan tombol "lewati bulan ini"),
  `/wishlist` (kelayakan beli lewat mesin yang sama dengan web), `/kategori`, `/batal`,
  `/putuskan`, `/help`. Setiap command murni memakai ulang logika/perhitungan yang sama
  dengan halaman web-nya (`buildMonthlySummary`, `buildYearSummary`, `calculateAffordability`,
  `pendingOccurrences`, dst.) — bukan disalin ulang, jadi tidak pernah menyimpang dari
  angka yang tampil di web.
- **Telegram**: menu command lengkap (ketik `/` untuk melihatnya), pesan terformat
  (tebal/kode/emoji status), dan tombol interaktif (inline keyboard) untuk konfirmasi
  kategori, target setoran, dan aksi "lewati" — tanpa perlu mengetik angka manual.
- Keyword baca polos lama (`ringkasan`, `sisa`, tanpa `/`) tetap didukung di kedua
  platform — tidak ada yang berhenti bekerja.
- Sengaja **tidak** membawa manajemen kategori/anggaran, tutup/buka bulan, reset data,
  atau apa pun yang butuh form/wizard/konfirmasi ketik-kata — itu tetap di web,
  by design (lihat §11 di `implementation_telegram_bot_pro.md`).
- Aturan bisnis yang sama persis dengan web ditegakkan di jalur bot: pilar selalu ikut
  kategori (tidak pernah ditebak dari kata-kata di pesan), bulan yang sudah ditutup
  menolak pencatatan baru, nominal nol/negatif ditolak.
- Setup lengkap (gratis, ~3 menit Telegram / ~15 menit WhatsApp): lihat langkah 7 di
  [Instalasi & Konfigurasi](#7-opsional-siapkan-bot-whatsapp--telegram) atau
  `implementation_bot_integration.md` / `implementation_telegram_bot_pro.md`.

### Transaksi Rutin (Recurring)
- Buat aturan tagihan/pemasukan berulang: harian, mingguan, bulanan, atau tahunan.
- Transaksi yang jatuh tempo dibuat otomatis (idempotent — tidak pernah dobel), dan
  otomatis melewati bulan yang sudah dikunci tanpa menggagalkan aturan lain.
- Lewati satu kejadian tertentu tanpa menghapus aturannya.

### Target Tabungan (Goals)
- Buat target dengan prioritas, tanggal target, dan kontribusi bulanan yang disarankan.
- Riwayat setiap setoran per target.
- Dua gaya visual — cincin progres atau "toples" cair — tinggal klik untuk ganti.
- **Slider proyeksi**: geser kontribusi bulanan dan lihat langsung kapan target
  tercapai, tanpa menyimpan apa pun sampai kamu terapkan.
- Saran otomatis "alokasikan sisa kas ke target prioritas tertinggi?" saat arus kas
  bulan ini positif.
- Confetti saat melewati ambang 25/50/75/100% target (bukan di setiap setoran).

### Wishlist & Mesin Kelayakan Beli
- Catat rencana belanja besar sebelum benar-benar membeli.
- **Mesin Kelayakan Otomatis** menghitung: persentase dari sisa anggaran bulan ini,
  dampaknya ke dana darurat, rasio cicilan terhadap penghasilan (DTI), dan biaya
  peluang (opportunity cost) 5 tahun jika uang itu diinvestasikan — lalu memberi
  rekomendasi: Aman Dibeli / Gunakan Tabungan / Tunda.
- Masa tunggu (cooling-off) sebelum boleh ditandai dibeli, dengan opsi perpanjang
  (tidak bisa dipersingkat) — mencegah belanja impulsif.
- Tandai "dibeli" otomatis membuat transaksi pengeluaran yang sesuai.

### Kekayaan Bersih (Net Worth)
- Kelola daftar aset (kas, tabungan, investasi, properti, kendaraan, lainnya) dan
  liabilitas (KPR, KTA, kartu kredit, cicilan kendaraan, lainnya).
- Snapshot kekayaan bersih tiap bulan, dengan grafik tren dari waktu ke waktu.

### Riwayat & Analitik
- Ringkasan tahunan, peta panas (heatmap) serapan anggaran per bulan, dan rincian tiap
  bulan yang punya data.
- Pola musiman per kategori ("Transportasi konsisten melonjak di Desember").
- **Perbandingan Bulan vs Bulan** dan **Tahun vs Tahun** — pilih dua periode, lihat
  selisih tiap kategori dan arah perubahannya.
- **Skor Efisiensi Anggaran** (gauge 0–100) yang menghukum boros *maupun* anggaran yang
  dibiarkan menganggur, bukan cuma "di bawah budget = aman".
- Grafik tren kategori sepanjang tahun.

### Laporan & Ekspor
- Laporan PDF bulanan (KPI, alokasi pilar, rincian kategori, 5 pengeluaran terbesar,
  progres target, catatan custom) dan tahunan (rekap 12 bulan + sorotan bulan
  terbaik/terberat).
- Ekspor CSV dan JSON.
- Simpan langsung ke folder `FinTrack/Exports` di Google Drive-mu, tanpa unduh manual.
- **Tautan laporan yang bisa dibagikan** — ringkasan baca-saja (angka agregat saja,
  tanpa transaksi mentah/deskripsi/lokasi) dienkode langsung ke URL. Tidak ada server
  atau database di baliknya; siapa pun dengan tautannya bisa melihat tanpa perlu masuk.

### Master Data
- Kelola kategori: nama, ikon, warna, pilar, persentase alokasi, tandai sebagai sinking
  fund atau rutin, urutkan dengan seret-lepas (drag & drop).
- Sub-kategori (item kategori) untuk rincian lebih detail.
- Template anggaran yang bisa dipakai ulang untuk setup pilar cepat.

### Pengaturan
- Tema terang/gelap/ikuti sistem.
- Notifikasi pengingat harian dan peringatan ambang anggaran (butuh izin notifikasi
  browser; hanya aktif selagi tab terbuka).
- **Tutup Bulan**: kunci transaksi, perubahan, dan penghapusan di bulan itu sungguhan —
  bisa dibuka kembali kapan saja.
- **Reset Data**: hapus transaksi & catatan keuangan untuk mulai dari awal — pilih
  bulan ini, bulan tertentu, atau seluruh data sekaligus. Kategori, template anggaran,
  dan akunmu tidak ikut terhapus. Butuh ketik kata konfirmasi sebelum benar-benar
  jalan.
- Status tautan Google Drive (tautkan/putuskan) dengan info akun yang tertaut.
- Status tautan bot WhatsApp & Telegram per platform (hubungkan/putuskan).
- Indikator privasi data: transparan soal apa yang tersimpan di Firestore, apa yang di
  Google Drive-mu sendiri, dan apa yang cuma di browser.

---

## Tumpukan Teknologi

| Bagian | Teknologi |
|---|---|
| Framework | Next.js 14 (App Router), TypeScript, React 18 |
| Styling & UI | Tailwind CSS, shadcn/ui (Radix UI primitives), Framer Motion, Lucide icons |
| State | Zustand |
| Formulir & validasi | React Hook Form + Zod |
| Autentikasi | Firebase Auth (email/password + Google) |
| Database | Firestore (real-time, per-user security rules) |
| Penyimpanan file | Google Drive REST API (folder `FinTrack/Receipts` & `FinTrack/Exports` milik user) |
| AI | Gemini Vision (`@google/genai`) untuk ekstraksi struk |
| Verifikasi token server | `jose` (verifikasi JWT langsung ke JWKS publik Google — **tanpa** Firebase Admin SDK/service account) |
| Grafik | Recharts + primitif SVG kustom (gauge, jar, heatmap) |
| PDF | `@react-pdf/renderer` |
| Drag & drop | `@dnd-kit` |
| Testing | Vitest + Testing Library |

---

## Arsitektur & Struktur Folder

Arsitektur berlapis: **tipe domain → interface repository → implementasi Firestore →
use-case (logika bisnis & validasi) → store Zustand → komponen React.** Use-case tidak
pernah memanggil Firestore langsung — selalu lewat `repositories`, supaya backend bisa
diganti tanpa menyentuh logika bisnis.

```
src/
├── app/                      # Next.js App Router
│   ├── (auth)/                # login, register, forgot-password, onboarding
│   ├── (main)/                 # semua halaman di balik AuthGuard (dashboard, transaksi, dst.)
│   ├── api/                   # route server: scan-receipt, market, auth/google-drive/*, bot/*
│   └── share/report/           # halaman publik tanpa auth — laporan yang dibagikan
├── modules/                  # satu folder per fitur/halaman (UI + komponen turunannya)
│   ├── dashboard/ transactions/ receipt-scanner/ recurring/ goals/
│   ├── wishlist/ net-worth/ history/ analytics/ reports/ master-data/ settings/
├── shared/
│   ├── bot/                   # inti bot WhatsApp/Telegram: parser, orkestrator, adapter media
│   ├── components/            # UI generik (shadcn primitives, layout, komponen finance)
│   ├── hooks/                 # mis. useGoogleDrive, useBotLink
│   ├── lib/                   # helper murni: format, csv, month-lock, budget-math, dst.
│   ├── repositories/          # interfaces/ + firestore/ (satu class per koleksi)
│   ├── stores/                # Zustand stores
│   ├── types/                 # tipe domain & DTO
│   └── use-cases/              # logika bisnis, satu file per aksi
└── middleware.ts              # header keamanan (CSP, dst.) — bukan auth guard
```

Firestore disusun per-pengguna: semua koleksi berada di bawah `users/{uid}/...`, dan
satu aturan keamanan (`request.auth.uid == userId`) mencakup seluruh pohon data —
lihat `firestore.rules`. Dua koleksi root tambahan, `bot_links` dan `bot_link_codes`,
menyimpan pemetaan chat bot ↔ pengguna (perlu dicari dari sisi chat, bukan dari sisi
pengguna, jadi tidak muat di pola `users/{uid}/...`) — keduanya deny-all untuk client,
hanya bisa diakses lewat Firebase Admin SDK di jalur bot.

---

## Prasyarat

- Node.js 18.18 atau lebih baru (disarankan 20 LTS)
- Akun Google (untuk Firebase Console dan Google Cloud Console)
- `npm`, `pnpm`, `yarn`, atau `bun` — contoh di bawah pakai `npm`

## Instalasi & Konfigurasi

### 1. Clone & install dependency

```bash
git clone <url-repo-ini>
cd Finance
npm install
```

### 2. Buat proyek Firebase

1. Buka [Firebase Console](https://console.firebase.google.com) → **Add project**.
2. Di proyek itu, buka **Build → Authentication → Sign-in method**, aktifkan
   **Email/Password** dan **Google**.
3. Buka **Build → Firestore Database → Create database** (mode production).
4. Buka **Project settings → Your apps → Add app → Web**, salin konfigurasi yang
   muncul (`apiKey`, `authDomain`, `projectId`, dst.) — dipakai di langkah 6.

### 3. Deploy Firestore rules & indexes

Repo ini sudah menyertakan `firestore.rules` dan `firestore.indexes.json`. Pakai
[Firebase CLI](https://firebase.google.com/docs/cli):

```bash
npm install -g firebase-tools
firebase login
firebase use --add            # pilih proyek yang baru dibuat
firebase deploy --only firestore:rules,firestore:indexes
```

### 4. Siapkan Google Cloud OAuth (untuk Google Drive)

Firebase dan Google Cloud berbagi proyek yang sama, jadi lanjut di
[Google Cloud Console](https://console.cloud.google.com) dengan proyek yang sama:

1. **APIs & Services → Library** → cari **Google Drive API** → *Enable*.
2. **APIs & Services → OAuth consent screen** → isi info dasar aplikasi, tambahkan
   scope `https://www.googleapis.com/auth/drive.file` (dan `email`/`profile`/`openid`
   yang biasanya sudah termasuk otomatis).
3. **APIs & Services → Credentials → Create credentials → OAuth client ID** → tipe
   **Web application**. Tambahkan origin JavaScript yang diotorisasi (mis.
   `http://localhost:3000` untuk pengembangan, plus domain produksi nanti).
4. Setelah dibuat, salin **Client ID** dan **Client secret** — dipakai di langkah 6.

Fitur yang butuh ini: unggah struk manual, scan AI, simpan laporan ke Drive, dan
tautan Google Drive di Pengaturan. Tanpa ini diisi, aplikasi tetap jalan normal —
fitur-fitur itu saja yang menampilkan pesan "belum dikonfigurasi", bukan error.

### 5. Ambil API key Gemini (untuk scan struk AI)

Buka [Google AI Studio](https://aistudio.google.com/app/apikey), buat API key baru.
Tanpa key ini, semua fitur lain tetap jalan — hanya scan struk AI yang nonaktif.

### 6. Isi `.env.local`

Salin `.env.example` menjadi `.env.local`, lalu isi:

```bash
cp .env.example .env.local
```

| Variabel | Wajib? | Keterangan |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | Opsional | Domain produksi (tanpa trailing slash) — dipakai `sitemap.xml`, `robots.txt`, dan tag OpenGraph/canonical. Tanpa ini, otomatis memakai URL deployment Vercel, lalu localhost |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Ya | Dari konfigurasi web app Firebase (langkah 2) |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Ya | idem |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Ya | idem |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Ya | idem |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Ya | idem |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Ya | idem |
| `GEMINI_API_KEY` | Opsional | Tanpa ini, scan struk AI nonaktif |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Opsional | Tanpa ini, semua fitur Google Drive nonaktif |
| `GOOGLE_CLIENT_SECRET` | Opsional* | **Wajib** kalau `NEXT_PUBLIC_GOOGLE_CLIENT_ID` diisi — server-only, jangan pernah beri prefix `NEXT_PUBLIC_` |
| `TOKEN_ENCRYPTION_KEY` | Opsional* | **Wajib** kalau pakai Google Drive — 64 karakter hex, generate dengan perintah di bawah |
| `GOLD_API_KEY` | Opsional | Widget harga emas di Market Pulse |
| `NEXT_PUBLIC_BI_RATE_OVERRIDE` dkk. | Opsional | Override manual nilai referensi Market Pulse (BI Rate/inflasi/SBN) — lihat komentar di `.env.example` |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` | Opsional | **Wajib** untuk bot Telegram — lihat langkah 7 |
| `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `META_APP_SECRET`, `META_VERIFY_TOKEN` | Opsional | **Wajib** untuk bot WhatsApp — lihat langkah 7 |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | Opsional | **Wajib** untuk bot WhatsApp/Telegram (Admin SDK) — lihat catatan arsitektur & langkah 7 di bawah |

Generate `TOKEN_ENCRYPTION_KEY` (dipakai mengenkripsi refresh token Drive di database,
bukan sekali pakai/tidak boleh dibagikan):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> **Catatan arsitektur:** untuk **seluruh alur lewat browser** (login, transaksi, scan
> struk, tautan Google Drive, dll.), aplikasi ini **tidak memakai Firebase Admin SDK** —
> token ID Firebase diverifikasi langsung di server terhadap kunci publik JWKS Google
> (`jose`), dan penautan Google Drive dilakukan lewat OAuth authorization-code flow yang
> menghasilkan refresh token, dienkripsi (AES-256-GCM) sebelum disimpan di Firestore
> lewat REST API dengan token milik pengguna sendiri sebagai kredensial. Kalau kamu
> tidak memakai fitur bot WhatsApp/Telegram, `FIREBASE_PRIVATE_KEY`/`FIREBASE_CLIENT_EMAIL`/
> `FIREBASE_PROJECT_ID` tidak dipakai dan aman dibiarkan kosong.
>
> Satu pengecualian sengaja: webhook bot (langkah 7) tidak punya sesi browser/token ID
> untuk dibawa, jadi jalur itu — dan **hanya** jalur itu — memakai Firebase Admin SDK
> (`src/shared/bot/admin-data.ts`) dengan service-account key sendiri. Semua jalur lain
> di aplikasi ini tidak berubah dan tetap seperti di atas.

---

### 7. (Opsional) Siapkan Bot WhatsApp & Telegram

Catat transaksi langsung dari chat — kirim teks ("makan siang 35rb") atau foto struk ke
bot yang sudah ditautkan lewat Pengaturan → Bot WhatsApp & Telegram. Sepenuhnya opsional
dan gratis (tanpa biaya tambahan apa pun); lewati langkah ini kalau tidak butuh.

Ringkasan (panduan lengkap ada di [`implementation_bot_integration.md`](implementation_bot_integration.md)):

1. **Telegram** (~3 menit): chat `@BotFather` → `/newbot` → salin token → isi
   `TELEGRAM_BOT_TOKEN` + `TELEGRAM_WEBHOOK_SECRET` (bebas, acak) → deploy → daftarkan
   webhook lewat `setWebhook` (lihat dokumen di atas untuk perintah `curl`-nya).
2. **WhatsApp** (~15 menit): [developers.facebook.com](https://developers.facebook.com) →
   buat app tipe Business → **Test Business Account** (tanpa verifikasi bisnis, gratis,
   maks. 5 nomor penerima) → tambah produk WhatsApp → salin **Phone Number ID** →
   buat **token System User permanen** (bukan token di halaman API Setup — itu
   kedaluwarsa < 24 jam) → salin **App Secret** → isi
   `WHATSAPP_ACCESS_TOKEN`/`WHATSAPP_PHONE_NUMBER_ID`/`META_APP_SECRET`/`META_VERIFY_TOKEN`
   → deploy → daftarkan webhook di dashboard Meta (Callback URL + Verify token, lalu
   subscribe ke field `messages`).
3. **Firebase Admin SDK**: Firebase Console → Project settings → Service accounts →
   Generate new private key → isi `FIREBASE_PROJECT_ID`/`FIREBASE_CLIENT_EMAIL`/
   `FIREBASE_PRIVATE_KEY` (simpan `\n` yang ter-escape apa adanya, jangan diubah jadi
   baris baru sungguhan). **Kalau kamu pernah membocorkan service-account key lama,
   generate yang baru dan cabut yang lama dari Firebase Console dulu.**
4. Isi semua variabel di atas juga di **Vercel → Project Settings → Environment
   Variables** (tidak satu pun boleh berawalan `NEXT_PUBLIC_`).
5. Dari FinanceTrack → Pengaturan → **Bot WhatsApp & Telegram** → Hubungkan → kirim kode
   yang muncul ke bot Telegram/WhatsApp-mu.

---

## Menjalankan Aplikasi

```bash
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000) — akan diarahkan ke `/login`.
Daftar akun baru untuk mulai (wizard onboarding otomatis muncul setelah daftar/masuk
pertama kali).

## Script yang Tersedia

| Perintah | Fungsi |
|---|---|
| `npm run dev` | Jalankan server pengembangan |
| `npm run build` | Build produksi |
| `npm run start` | Jalankan hasil build produksi (jalankan `build` dulu) |
| `npm run lint` | ESLint |
| `npm run typecheck` | Pemeriksaan tipe TypeScript tanpa emit |
| `npm run test` | Jalankan seluruh test sekali (Vitest) |
| `npm run test:watch` | Test dalam mode watch |
| `npm run format` | Rapikan format kode dengan Prettier |

## Testing

```bash
npm run test
```

Test mencakup logika bisnis murni di `use-cases` dan `lib` (perhitungan anggaran,
penguncian bulan, generate transaksi rutin, skor efisiensi, dll.) memakai Vitest +
Testing Library, dengan repository di-mock — tidak menyentuh Firestore sungguhan. Inti
bot (`src/shared/bot/*.test.ts`) dan webhook-nya (`src/app/api/bot/webhook-auth.test.ts`)
diuji dengan pola yang sama: Admin SDK, Gemini, dan Google Drive semua di-mock, jadi
test-nya tidak pernah memanggil layanan sungguhan atau butuh kredensial nyata.

## Deploy ke Produksi

Cara termudah: [Vercel](https://vercel.com) (pembuat Next.js) — repo ini sudah diuji
untuk itu: build produksi bersih (typecheck + lint + seluruh test + `next build`) baik
dengan env var lengkap maupun **kosong sama sekali** (build tidak pernah gagal hanya
karena env belum diisi — halaman yang butuh Firebase/Drive/Gemini cukup menampilkan
pesan "belum dikonfigurasi", bukan crash), satu `pnpm-lock.yaml` tanpa lockfile lain
yang bentrok (Vercel otomatis mendeteksi & memakai pnpm), dan tidak ada pemakaian
`next/image` ke domain luar yang butuh whitelist tambahan.

1. Push repo ini ke GitHub/GitLab/Bitbucket, import di Vercel — tidak perlu konfigurasi
   build khusus, Next.js 14 terdeteksi otomatis.
2. Di **Project Settings → Environment Variables**, isi seluruh variabel dari tabel di
   atas (nilai produksi, bukan yang lokal) — minimal enam variabel `NEXT_PUBLIC_FIREBASE_*`
   agar aplikasi bisa dipakai sama sekali; sisanya optional per fitur.
3. Tambahkan domain produksi (`https://nama-proyekmu.vercel.app` dan domain kustom
   kalau ada) ke **Authorized JavaScript origins** di kredensial OAuth Google Cloud
   (langkah 4 di atas), dan ke **Authorized domains** di Firebase Auth
   (Authentication → Settings) — tanpa ini, login Google dan tautan Drive akan ditolak
   di production walau berjalan normal di localhost.
4. Deploy. Firestore rules & indexes **tidak** ikut ter-deploy otomatis oleh Vercel —
   jalankan `firebase deploy --only firestore:rules,firestore:indexes` terpisah, sekali
   di awal dan tiap kali berubah.
5. **Periksa batas durasi function** di Project Settings → Functions untuk
   `/api/ai/scan-receipt` (di kode diset `maxDuration = 60` detik, karena scan struk
   memanggil Gemini dua kali dengan satu retry) — paket/pengaturan Vercel-mu perlu
   benar-benar mengizinkan durasi itu, kalau tidak permintaan scan yang lambat bisa
   terpotong sebelum selesai di production walau lancar di lokal. `/api/bot/telegram`
   dan `/api/bot/whatsapp` diset `maxDuration = 30` detik dengan alasan sama (foto struk
   lewat bot juga memanggil Gemini, lalu mengunggah ke Drive) — kalau pakai fitur bot,
   berlaku pertimbangan yang sama.

`package.json` sudah menyertakan `"packageManager"` (pin versi pnpm persis) dan
`"engines"` (rentang Node minimum) supaya instalasi di Vercel deterministik dan tidak
diam-diam memakai versi Node yang berbeda dari yang diuji.

## Keamanan & Privasi Data

- **Firestore (cloud):** transaksi, kategori, anggaran, target, dan seluruh data
  keuangan lain — dibatasi per akun lewat Firestore Security Rules, tak bisa dibaca
  akun lain.
- **Google Drive milikmu sendiri:** foto struk dan file ekspor tersimpan di folder
  "FinTrack" di akun Drive-mu — bukan di server aplikasi ini. Scope OAuth yang dipakai
  (`drive.file`) hanya memberi akses ke file yang dibuat aplikasi ini sendiri, tidak
  bisa membaca file lain di Drive-mu.
- **Browser (perangkat ini saja):** tema, status sidebar, cache offline Firestore —
  tidak pernah terkirim ke mana pun.
- Header keamanan (`Content-Security-Policy`, `X-Frame-Options`,
  `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`) dikirim di setiap
  respons lewat `middleware.ts`.
- Refresh token Google Drive dienkripsi (AES-256-GCM) sebelum disimpan — lihat
  `TOKEN_ENCRYPTION_KEY` di atas.
- **Bot WhatsApp/Telegram:** kode tautan sekali pakai, kedaluwarsa 15 menit, dikonsumsi
  di satu transaksi Firestore (tidak mungkin dipakai dua chat sekaligus). Setiap webhook
  diverifikasi sebelum diproses — Telegram lewat header rahasia
  (`X-Telegram-Bot-Api-Secret-Token`), WhatsApp lewat tanda tangan HMAC atas raw body
  (`X-Hub-Signature-256`, dibandingkan dengan `crypto.timingSafeEqual`). Koleksi
  `bot_links`/`bot_link_codes` dan dokumen internal (`meta/botLinks`, `meta/botPending`)
  ditolak untuk ditulis client secara langsung di `firestore.rules` — hanya bisa diubah
  lewat Firebase Admin SDK di jalur bot sendiri.

## SEO

Dibangun murni dengan tooling bawaan Next.js (App Router file conventions) — tidak ada
dependency tambahan:

| Bagian | Implementasi |
|---|---|
| `sitemap.xml` | `src/app/sitemap.ts` — hanya halaman publik yang benar-benar terindeks (`/login`, `/register`, `/about`, `/privacy`, `/terms`). Halaman `(main)/*` (butuh login), `/forgot-password`, `/onboarding`, dan `/share/report` (dinamis per-pengguna) sengaja tidak dimasukkan. |
| `robots.txt` | `src/app/robots.ts` — mengizinkan halaman publik, memblokir seluruh rute berbasis akun dan `/api/*` (tidak ada gunanya di-crawl tanpa sesi login). |
| Metadata per halaman | Judul, deskripsi, dan `alternates.canonical` unik di tiap halaman publik. `/login` dan `/register` dipecah jadi server page (metadata) + client view (form interaktif) karena Next.js tidak mengizinkan `export const metadata` dari Client Component. |
| OpenGraph & Twitter Card | `src/app/opengraph-image.tsx` — gambar share otomatis (`next/og`, tanpa aset gambar manual), dipakai semua halaman kecuali yang override sendiri. |
| Structured data | Skema `WebApplication` (JSON-LD) di halaman `/about` — hanya field yang benar-benar akurat, tanpa rating/organisasi palsu. |
| `noindex` selektif | `/share/report` (laporan yang dibagikan) ditandai `noindex` di metadata-nya sendiri — tautan itu sekali pakai per pengguna, tidak untuk muncul di hasil pencarian siapa pun. |
| `metadataBase` | `src/shared/lib/site.ts` — pakai `NEXT_PUBLIC_APP_URL`, jatuh ke URL deployment Vercel otomatis kalau belum diisi. |

Root `/` sendiri redirect langsung ke `/login` (bukan `/dashboard`) — pengguna yang
sudah masuk tetap otomatis diteruskan lagi ke dashboard dari halaman login, tapi
pengunjung baru/crawler mendarat di konten yang benar-benar bisa diindeks dalam satu
langkah, bukan memantul lewat shell halaman yang butuh login.

## PWA (Instal ke Layar Utama)

Aplikasi bisa dipasang ke layar utama ponsel/desktop (manifest + ikon sudah
disiapkan), tapi **belum punya service worker** — artinya belum bisa dipakai penuh
saat benar-benar offline. Ini keputusan sadar (lihat `KNOWN_ISSUES.md`), bukan bug.

## Status Pengembangan

Riwayat perbaikan, keputusan penundaan sadar, dan status verifikasi tiap fitur ada di
[`KNOWN_ISSUES.md`](./KNOWN_ISSUES.md). Rencana implementasi awal ada di
`implementation_init.md` dan `implementation_add_feature.md`.
