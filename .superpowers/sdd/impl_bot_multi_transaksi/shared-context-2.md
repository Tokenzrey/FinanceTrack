## §10 Anggaran Kuota & Peta Model

### 10.1 Limit nyata akun ini

Diambil dari dashboard AI Studio milik user (28 hari terakhir). Ini bukan tebakan — angka inilah yang mendikte seluruh desain di bawah.

| Model | RPM | TPM | **RPD** | Vision | `responseSchema` | Dipakai untuk |
|---|---|---|---|---|---|---|
| `gemini-3.8-flash` | 5 | 250K | **20** | ✅ | ✅ | Vision |
| `gemini-3.7-flash` | 5 | 250K | **20** | ✅ | ✅ | Vision |
| `gemini-3.6-flash` | 5 | 250K | **20** | ✅ | ✅ | Vision |
| `gemini-3.5-flash` | 5 | 250K | **20** | ✅ | ✅ | Vision |
| `gemini-3-flash` | 5 | 250K | **20** | ✅ | ✅ | Vision |
| `gemini-2.5-flash` | 5 | 250K | **20** | ✅ | ✅ | Vision |
| `gemini-3.5-flash-lite` | **15** | 250K | **500** | ✅ | ✅ | **Teks (utama)** |
| `gemini-3.1-flash-lite` | **15** | 250K | **500** | ✅ | ✅ | **Teks (utama)** |
| `gemini-2.5-flash-lite` | 10 | 250K | 20 | ✅ | ✅ | Teks (cadangan) |
| `gemini-embedding-1` | 100 | 30K | 1.000 | — | — | Cadangan (§10.5) |
| `gemini-embedding-2` | 100 | 30K | 1.000 | — | — | Cadangan (§10.5) |

**Kapasitas harian yang tersedia:**

| Jenis kerja | Kolam model | Kapasitas/hari |
|---|---|---|
| Baca struk (vision) | 6 model flash × 20 | **120 panggilan** |
| Parse teks | 2 flash-lite × 500 + 1 × 20 | **1.020 panggilan** |
| Cadangan embedding | 2 × 1.000 | 2.000 panggilan |

### 10.2 Kenapa desain lama salah

Task 5 (revisi 1) memakai rantai `gemini-3.5-flash → gemini-2.5-flash → gemini-flash-latest`. Semuanya berada di kolam **20 RPD**, dan `parse-batch.ts` memakai model yang sama untuk teks. Konsekuensinya:

- Kuota teks dan kuota vision saling memakan kolam yang sama.
- Rantai selalu dimulai dari model yang sama, jadi model pertama habis duluan setiap hari sementara lima model lain menganggur. Dashboard membuktikannya: `gemini-3.5-flash` **24/20 (terlampaui)** sementara `gemini-3.7-flash` baru **1/20**.
- Satu foto struk = 2 panggilan (ekstraksi + pemetaan). Dengan 20 RPD, **10 struk sehari** sudah habis.

### 10.3 Penugasan setelah revisi

| Kerja | Tier | Alasan |
|---|---|---|
| Ekstraksi struk (butuh gambar) | `vision` | Hanya tier ini yang menerima `inlineData` gambar |
| Pemetaan item → kategori | `text` | Murni teks. Dulu ikut tier vision dan memboroskan kuota termahal |
| Parse multi-transaksi dari chat | `text` | Murni teks, dan lite **lebih rendah latensinya** — ikut menjawab R13 |
| Klasifikasi kategori | **tanpa model** | Hint lokal (§11 L0). Baru naik ke `text` kalau gagal |

Pemetaan item dipindah dari vision ke text saja sudah **menggandakan** kapasitas baca struk: 120 struk/hari, bukan 60.

### 10.4 Model yang sengaja TIDAK dipakai

| Model | Kuota | Kenapa tidak |
|---|---|---|
| Gemma 4 26B / 31B | 30 RPM, **14.4K RPD** | Kuotanya menggiurkan, tapi **tidak mendukung `responseSchema`**. Tanpa structured output, JSON harus diparse dari teks bebas dan gagalnya senyap. Untuk data uang, tidak sepadan. TPM-nya juga cuma 16K — satu prompt kategori panjang sudah mendekati batas |
| Gemini 2.5 Pro, 3.1 Pro, 2 Flash, 2 Flash Lite | **0 / 0 / 0** | Tidak tersedia di tier akun ini |
| Nano Banana, Veo, Lyria, Computer Use, Deep Research | **0 / 0 / 0** | Tidak tersedia, dan tidak ada kebutuhannya |
| Gemini 2.5/3.1 Flash TTS | 3 RPM, **10 RPD** | Balasan suara tidak diminta, dan 10/hari terlalu kecil untuk jadi jalur utama |
| Live API / Transcribe | 3 RPM, 25 RPD | Tidak ada input suara di alur bot ini |
| Gemini Robotics ER 2 | 5 RPM, 20 RPD | Model spesialis spasial; tidak lebih baik dari flash untuk struk, dan kuotanya sama |

### 10.5 Tier embedding — dirancang, belum dibangun

`gemini-embedding-1/2` memberi 2.000 panggilan/hari pada 100 RPM — jauh lebih longgar dari flash-lite dan latensinya jauh lebih rendah. Pakainya: embed nama kategori sekali (di-cache), embed pesan user, ambil cosine similarity tertinggi sebagai kandidat kategori.

**Belum dibangun** karena L0 (hint lokal, nol panggilan) ditambah 1.020 panggilan flash-lite sudah jauh melebihi pemakaian nyata satu rumah tangga. Membangun cache vektor + cosine sekarang berarti menambah komponen yang belum ada bukti dibutuhkan.

**Pemicu untuk membangunnya:** kalau ledger `bot_meta/geminiHealth` menunjukkan tier `text` menembus 400 panggilan/hari secara konsisten. Waktu itu tiba, sisipkan sebagai tier `L1.5` di antara L0 dan L1 — antarmuka router (§Task 12) sudah menyediakan tempatnya.

### 10.6 Verifikasi id model — WAJIB sebelum Task 12

Nama di dashboard adalah nama tampilan; id API bisa berbeda (`gemini-3.5-flash` vs `gemini-3.5-flash-001`). Jangan menebak — daftarnya diambil dari API.

Buat `scripts/list-gemini-models.mjs`:

```js
#!/usr/bin/env node
/**
 * Prints the model ids this API key can actually call, with the methods each supports.
 * The AI Studio dashboard shows display names; the API wants ids. Run this once and
 * paste the real ids into src/shared/lib/gemini-router.ts.
 *
 *   GEMINI_API_KEY=... node scripts/list-gemini-models.mjs
 */
const key = process.env.GEMINI_API_KEY
if (!key) {
  console.error('GEMINI_API_KEY is not set.')
  process.exit(1)
}

const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}&pageSize=200`)
const body = await res.json()
if (!res.ok) {
  console.error(JSON.stringify(body, null, 2))
  process.exit(1)
}

const rows = (body.models ?? [])
  .filter((m) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
  .map((m) => ({
    id: m.name.replace(/^models\//, ''),
    input: m.inputTokenLimit,
    output: m.outputTokenLimit,
  }))
  .sort((a, b) => a.id.localeCompare(b.id))

console.table(rows)
console.log(`\n${rows.length} models support generateContent.`)
```

Jalankan sekali, lalu isi `ROSTER` di Task 12 dengan id yang benar-benar muncul. Kalau sebuah id di plan ini tidak ada di keluarannya, **buang dari roster** — memanggil id yang tidak ada menghasilkan 404 yang akan dihitung router sebagai kegagalan model.

---



## §11 Kaskade Latensi

Setiap pesan turun dari lapisan termurah. Lapisan pertama yang bisa menjawab, menjawab.

| Lapisan | Apa yang dikerjakan | Panggilan model | Latensi khas |
|---|---|---|---|
| **L0** | `matchReadCommand`, `parseAmount`, hint kategori lokal, deteksi tipe & tanggal, cache hasil | **0** | **< 400 ms** |
| **L1** | `parseTransactionBatch` di tier `text` (flash-lite) | 1 | 1–3 dtk |
| **L1.5** | *(cadangan, §10.5)* embedding similarity | 1 (murah) | < 500 ms |
| **L2** | `extractReceipt` di tier `vision` | 1 | 6–20 dtk |
| **L3** | Pemetaan item → kategori di tier `text`, **dilewati** bila hint lokal sudah menutup semua item | 0–1 | 1–3 dtk |

**Yang membuat L0 sering menang:** setiap konfirmasi di kartu tinjauan menulis `CategoryHint` (Task 14). Setelah beberapa hari, "kopi", "bensin", "indomaret" sudah dikenal — jadi `kopi 20rb` tercatat **tanpa satu pun panggilan model**, dalam waktu di bawah setengah detik, dan tetap akurat karena kategorinya berasal dari pilihan user sendiri, bukan tebakan model.

**Anggaran wall-clock target:**

| Skenario | Sebelum | Sesudah |
|---|---|---|
| Teks yang sudah dikenal (`kopi 20rb`) | 2–4 dtk (1 panggilan Gemini) | **< 0,4 dtk** (0 panggilan) |
| Teks baru | 2–4 dtk | 1–3 dtk (flash-lite) |
| Struk baru | 12–30 dtk, senyap | Placeholder < 1 dtk, kartu 7–20 dtk |
| Struk yang sama dikirim ulang | 12–30 dtk | **< 1 dtk** (cache hash) |

---



## §12 Kontrak Tipe Tambahan

```ts
// src/shared/bot/types.ts — tambahan Revisi 2

/** Verbosity dan ambang yang bisa diatur user lewat /mode dan /atur. */
export interface BotPrefs {
  /** `ringkas` memangkas blok insight, rincian per kategori, dan footer. */
  verbosity: 'ringkas' | 'detail'
  /** Ambang auto-accept jalur cepat teks. 100 = selalu tinjau dulu. */
  autoAcceptConfidence: number
  /** Paksa kartu tinjauan bahkan untuk satu transaksi yang sangat yakin. */
  alwaysReview: boolean
  /** Tampilkan baris insight di /ringkasan dan /saldo. */
  showInsights: boolean
  /** Id kategori yang selalu muncul paling atas di daftar pilihan. */
  quickCategories: string[]
}

export const DEFAULT_BOT_PREFS: BotPrefs = {
  verbosity: 'detail',
  autoAcceptConfidence: 60,
  alwaysReview: false,
  showInsights: true,
  quickCategories: [],
}
```

```ts
// src/shared/lib/gemini-router.ts

export type GeminiTask = 'vision' | 'text'

export interface ModelSpec {
  id: string
  /** Requests per day on this account's free tier. Drives proactive rotation. */
  rpd: number
  /** Requests per minute. A model used too recently is skipped, not waited on. */
  rpm: number
}

/** Per-model state in the shared ledger at `bot_meta/geminiHealth`. */
export interface ModelHealth {
  used: number
  lastUsedAt: number
  /** Epoch ms; a 503 parks the model briefly instead of burning the whole day. */
  cooldownUntil: number
}
```

```ts
// src/shared/bot/local-resolver.ts

export interface LocalMatch {
  categoryId: string
  categoryName: string
  /** 0-100, comparable with the model's own confidence scale. */
  confidence: number
  reason: 'hint' | 'category-name' | 'merchant'
}
```

---

