## Global Constraints

Berlaku untuk **setiap** task di bawah — tidak diulang per task.

- **Bahasa balasan:** Bahasa Indonesia. Identifier, komentar kode, dan pesan commit: Inggris. Sama seperti kode yang sudah ada.
- **Nominal tidak pernah datang dari model.** Setiap angka rupiah yang akhirnya ditulis ke Firestore wajib melewati `parseAmount()` dari `src/shared/bot/parse-amount.ts`. Model boleh mengembalikan *potongan teks*, tidak boleh mengembalikan *angka*.
- **Escape HTML wajib.** Setiap nilai dinamis (nama kategori, deskripsi, nama merchant hasil OCR) yang masuk template balasan harus lewat `escapeHtml()` di `replies.ts`.
- **Tidak ada dependency baru.** Zona waktu memakai `Intl.DateTimeFormat` bawaan, bukan `date-fns-tz`.
- **Firestore Admin SDK menolak `undefined`.** Pakai `stripUndefined()` yang sudah ada di `admin-data.ts` sebelum menulis.
- **Batas Firestore batch write = 500 operasi.** `MAX_DRAFT_LINES = 20` menjaga jauh di bawah batas.
- **Webhook wajib balas 200 di bawah 10 detik.** GOWA memutus koneksi di 10 detik (hardcoded, `webhook.go:40`) lalu mengulang 5×. Pola `claimInboundMessage()` + `waitUntil()` yang sudah terpasang di kedua route **tidak boleh dilepas**; semua kerja berat tetap di dalam `waitUntil`.
- **WhatsApp tidak punya tombol interaktif.** GOWA hanya mengekspos `/send/message`, `/send/image`, `/send/file`, `/send/video`, `/send/sticker`, `/send/contact`, `/send/link`, `/send/location`, `/send/audio`, `/send/poll`, `/send/presence`, `/send/chat-presence`. Tidak ada `InteractiveMessage`/`ButtonsMessage`/`ListMessage`. Setiap aksi yang di Telegram jadi tombol **wajib** punya padanan perintah ketik.
- **Test runner:** `npx vitest run <path>`. Typecheck: `npx tsc --noEmit`. Lint: `npx next lint --dir src`.
- **Semua path relatif ke `Finance-FE/`** kecuali diawali `go-whatsapp-web-multidevice/`.

---



## §4 Kontrak Tipe Kanonik

Semua task merujuk ke sini. Ditulis di Task 2; ditaruh lebih dulu supaya pelaksana task manapun tahu bentuk persisnya.

```ts
// src/shared/bot/types.ts

export type BotTxType = 'expense' | 'income' | 'transfer'

/** Satu calon transaksi di dalam kartu tinjauan. */
export interface DraftLine {
  /** Nomor 1-based yang dilihat user; dihitung ulang setiap ada baris dihapus. */
  n: number
  type: BotTxType
  amount: number
  description: string | null
  categoryId: string | null
  categoryName: string | null
  /** ISO 8601 UTC. Ditampilkan dalam zona waktu user. */
  dateIso: string
  /** Kandidat kategori bernomor untuk perintah `kat <n> <k>`. Maks 4. */
  options: { categoryId: string; name: string }[]
  /** Hanya untuk baris asal struk. */
  quantity?: number | null
}

export interface DraftBatch {
  pendingKind: 'transaction_batch'
  source: 'text' | 'receipt'
  /** SELALU rincian per item. `mode` hanya mengubah commit & render (§2 D2). */
  lines: DraftLine[]
  /** `single` hanya bermakna untuk `source: 'receipt'`. */
  mode: 'single' | 'itemized'
  merchant: string | null
  /** Total yang dibaca model dari struk — dibandingkan dengan jumlah baris. */
  receiptTotal: number | null
  receipt?: { gDriveFileId: string; gDriveWebViewLink: string }
  /** Peringatan dari ekstraksi, ditampilkan di kartu. */
  warnings: string[]
}

/** Satu segmen transaksi hasil bacaan Gemini atas pesan teks. */
export interface ParsedLine {
  type: BotTxType
  description: string | null
  /** Potongan teks PERSIS dari pesan asli yang memuat nominal. Di-reparse oleh
   *  `parseAmount` — tidak pernah dipercaya sebagai angka (§2 D1). */
  amountText: string
  categoryCandidates: string[]
  dateOffset: number
  confidence: number
}

export type ReviewCommand =
  | { kind: 'save' }
  | { kind: 'cancel' }
  | { kind: 'remove'; n: number }
  | { kind: 'set_category'; n: number; option: number }
  | { kind: 'set_amount'; n: number; amount: number }
  | { kind: 'set_description'; n: number; text: string }
  | { kind: 'set_date'; n: number; date: Date }
  | { kind: 'set_type'; n: number; type: BotTxType }
  | { kind: 'set_mode'; mode: 'single' | 'itemized' }
  /** Tombol "✏️ n" di Telegram: tampilkan menu edit untuk satu baris saja. */
  | { kind: 'focus'; n: number }
  | { kind: 'help' }
  | { kind: 'none' }
```

Tambahan pada `BotReply` yang sudah ada:

```ts
export interface BotReply {
  text: string
  html?: boolean
  keyboard?: BotKeyboardButton[][]
  /** Padanan ketik dari `keyboard`, HANYA dipakai adapter WhatsApp (yang tidak punya
   *  tombol sama sekali). Telegram mengabaikannya — usernya menekan tombol. */
  whatsappHints?: string[]
}
```

---



## §5 Target Tampilan Kartu Tinjauan

Referensi visual yang dituju Task 7. Kiri Telegram (HTML mentah), kanan hasil render WhatsApp.

**Telegram:**

```
🧾 <b>Tinjau 3 Transaksi</b> · <i>Indomaret Sudirman</i>
<blockquote>Min, 6 Sep 2026 · 14.32 WIB</blockquote>

<b>1.</b> 🔻 <b>Rp 35.000</b> · Makan &amp; Minum
    <i>Nasi goreng spesial</i> ×1

<b>2.</b> 🔻 <b>Rp 24.000</b> · ⚠️ <i>belum ada kategori</i>
    <i>Teh botol</i> ×2

<b>3.</b> 🔺 <b>Rp 5.000.000</b> · Gaji
    <i>gaji masuk</i>

────────────────
Pengeluaran  <code>Rp    59.000</code>
Pemasukan    <code>Rp 5.000.000</code>
Total struk  <code>Rp    59.000</code> ✅ cocok

⚠️ Gambar kurang jelas — periksa setiap angka sebelum menyimpan.

[✅ Simpan 3]  [🧩 Gabung jadi 1]
[✏️ 1] [✏️ 2] [✏️ 3]
[❌ Batal]
```

**WhatsApp (hasil `renderForWhatsApp`):**

```
🧾 *Tinjau 3 Transaksi* · _Indomaret Sudirman_
> Min, 6 Sep 2026 · 14.32 WIB

*1.* 🔻 *Rp 35.000* · Makan & Minum
    _Nasi goreng spesial_ ×1

*2.* 🔻 *Rp 24.000* · ⚠️ _belum ada kategori_
    _Teh botol_ ×2

*3.* 🔺 *Rp 5.000.000* · Gaji
    _gaji masuk_

────────────────
Pengeluaran  `Rp    59.000`
Pemasukan    `Rp 5.000.000`
Total struk  `Rp    59.000` ✅ cocok

⚠️ Gambar kurang jelas — periksa setiap angka sebelum menyimpan.

Balas untuk mengubah:
*ok* — simpan semua
*kat 2 1* — kategori baris 2 → pilihan 1
*nom 1 40rb* — ubah nominal baris 1
*ket 1 kopi susu* — ubah keterangan
*tgl 1 kemarin* — ubah tanggal
*hapus 2* — buang baris 2
*gabung* — jadikan 1 transaksi
*batal* — batalkan semua
```

---

