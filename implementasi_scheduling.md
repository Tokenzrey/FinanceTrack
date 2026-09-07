# Productivity Suite (Task · Note · Reminder) — Rencana Implementasi

> **For agentic workers:** REQUIRED SUB-SKILL: gunakan superpowers:subagent-driven-development (disarankan) atau superpowers:executing-plans untuk mengeksekusi plan ini task-per-task. Step memakai checkbox (`- [ ]`).

**Goal:** Menambah modul produktivitas — **Tugas**, **Catatan**, dan **Pengingat** — ke FinTrack, dikelola dari dashboard web maupun lewat command bot WhatsApp/Telegram, dengan pengingat berbasis waktu yang dikirim proaktif ke chat.

**Architecture:** Semua data hidup di Firestore di bawah `users/{uid}/` (tasks, notes, reminders), memakai pola berlapis yang sudah ada (tipe domain → repository → use-case → store → komponen). Bot memakai ulang infrastruktur yang sudah jadi: dispatcher `handleIncoming`, `admin-data.ts` (Admin SDK), pemetaan chat↔user (`bot_links`), `getUserTimezone`, parser argumen, dan jalur kirim keluar (`/send/message` GOWA / Telegram Bot API). Pengiriman pengingat memakai pola **Producer–Consumer**: proses Go yang selalu hidup (`go-whatsapp-web-multidevice`) berdetak tiap menit dan memanggil endpoint API Next.js (`POST /api/cron/reminders`); endpoint itu meng-*claim* pengingat jatuh tempo secara atomik lewat **Firestore transaction** (pengganti `FOR UPDATE SKIP LOCKED`), memformat pesan, dan mengirim lewat jalur bot yang sama.

**Tech Stack:** Next.js 14 (App Router, route handler `nodejs`), TypeScript, Firestore (client SDK di web, Firebase Admin SDK di jalur bot/cron), Vitest. Sisi heartbeat: Go (`go-whatsapp-web-multidevice`) — satu goroutine ticker. **Tanpa PostgreSQL, tanpa Redis, tanpa BullMQ/Asynq, tanpa worker persisten di sisi Next.js.**

**Spec:** §0–§4 di dokumen ini (PRD ringkas + rekonsiliasi stack). PRD asli menyebut PostgreSQL + Golang/Express + Redis + `SKIP LOCKED`; §0 menjelaskan kenapa itu diganti dan apa padanannya di stack FinTrack.

---

## Global Constraints

Berlaku untuk **setiap** task — tidak diulang per task.

- **Bahasa balasan bot & UI:** Bahasa Indonesia, format `id-ID`, Rupiah tidak relevan di modul ini. Identifier, komentar kode, pesan commit: Inggris. Sama seperti kode yang sudah ada.
- **Firestore, bukan Postgres.** Tidak ada DDL SQL, tidak ada `CREATE TABLE`, tidak ada `ENUM` Postgres. Status/prioritas adalah *string literal union* TypeScript yang divalidasi di kode.
- **Semua data user di bawah `users/{uid}/…`** — satu aturan keamanan `request.auth.uid == userId` mencakup seluruh pohon (`firestore.rules`). Dokumen internal yang hanya ditulis server (`reminders.status`, `reminders.attempts`, dll.) tetap di subtree user tapi ditandai read-only untuk client di rules (Task 1).
- **Serverless: tidak ada proses yang hidup terus di sisi Next.js.** Semua pemicu terjadwal datang dari luar (heartbeat Go). Endpoint cron harus **idempotent** dan aman dipanggil berkali-kali / bersamaan.
- **Zona waktu:** setiap `*At` disimpan sebagai `Timestamp` UTC. Waktu dinding lokal dihitung dari `users/{uid}/meta/profile.timezone` lewat `adminData.getUserTimezone(userId)` (sudah ada) dan `formatDateTime`/`dayKeyInTz` di `@/shared/lib/format` (sudah ada). Jangan pernah pakai `new Date().getHours()` untuk logika user.
- **Identitas bot sudah selesai.** Pemetaan chat↔user ada di koleksi root `bot_links` (`platform_externalId → userId`), dibaca lewat `adminData.findLinkByExternalId(platform, externalId)`. PRD §Sinkronisasi Identitas tidak perlu dibangun ulang; kode tautan 6-karakter, TTL 15 menit, sudah jalan.
- **Kirim keluar lewat jalur yang sudah ada.** WhatsApp: `POST {GOWA_BASE_URL}/send/message` dengan Basic Auth (lihat `src/app/api/bot/whatsapp/route.ts` `sendMessage`). Telegram: `POST https://api.telegram.org/bot<token>/sendMessage` (lihat `src/app/api/bot/telegram/route.ts`). Task 5 mengekstrak keduanya ke satu modul `src/shared/bot/outbound.ts` supaya cron dan webhook memakai kode yang sama.
- **Rahasia cron:** env `PRODUCTIVITY_CRON_SECRET` (server-only, **bukan** `NEXT_PUBLIC_`). Endpoint membandingkan `Authorization: Bearer <secret>` dengan `crypto.timingSafeEqual` (pola sama seperti verifikasi webhook Telegram).
- **Test runner:** `npx vitest run <path>`. Typecheck: `npx tsc --noEmit`. Lint: `npx next lint --dir src`. Sisi Go: `cd ../go-whatsapp-web-multidevice/src && go build ./... && go test ./...`.
- **TDD:** setiap step logika non-trivial punya test yang gagal dulu. Repo CRUD yang meniru repo lain boleh test tipis (satu happy-path + satu edge) — ikuti kepadatan test file tetangganya.
- **Semua path relatif ke `Finance-FE/`** kecuali diawali `go-whatsapp-web-multidevice/`.

---

## §0 Rekonsiliasi dengan PRD — apa yang berubah dan kenapa

PRD asli (`implementasi_scheduling.md` versi lama) ditulis untuk stack generik yang **tidak cocok** dengan FinTrack. Tabel ini memetakan setiap keputusan PRD ke padanannya di stack repo ini. Plan di bawah mengikuti kolom kanan.

| PRD asli | Kenapa tidak dipakai | Padanan di FinTrack |
|---|---|---|
| **PostgreSQL** + DDL + `CREATE TYPE … ENUM` | Repo pakai Firestore; tidak ada koneksi/instance SQL, tidak ada ORM | Koleksi Firestore `users/{uid}/{tasks,notes,reminders}`. "ENUM" = union tipe TS divalidasi di kode. `TEXT[]` tags → array Firestore |
| **Golang/Express backend terpisah** | FinTrack **adalah** Next.js; menambah service kedua = duplikasi auth, dua deploy, dua sumber kebenaran | Route handler Next.js di `src/app/api/…`. Logika di `src/shared/…` (pola berlapis yang ada) |
| **Redis + RabbitMQ + BullMQ/Asynq** | Tidak ada Redis di stack; Vercel serverless tidak boleh punya worker background persisten | Tidak ada message broker. Producer = heartbeat Go. Consumer = route handler yang dipanggil heartbeat. Antrean "in-flight" = kolom `status` di dokumen reminder |
| **Cron poller yang jalan terus di backend** | Fungsi serverless tidak hidup di antara request | **`go-whatsapp-web-multidevice`** (proses Go yang memang selalu hidup, dikendalikan user) menambah satu goroutine `time.Ticker` 60 dtk yang `POST` ke `/api/cron/reminders`. Ini jawaban user atas pertanyaan mekanisme cron |
| **`SELECT … FOR UPDATE SKIP LOCKED`** | Firestore tidak punya row lock / `SKIP LOCKED` | **Firestore `runTransaction`**: baca reminder, cek `status === 'pending'`, set `status = 'sending'`. Dua pemanggil bersamaan → salah satu transaksinya kalah & retry → melihat `status !== 'pending'` → lewati. Efek identik dengan `SKIP LOCKED` |
| `is_sent BOOLEAN` → saran `status VARCHAR` + `retry_count` | Sarannya benar; tinggal diadopsi | Field `status: 'pending' \| 'sending' \| 'sent' \| 'failed' \| 'cancelled'` + `attempts: number` + `nextAttemptAt?: Timestamp` sejak awal |
| Partial index `WHERE is_sent = FALSE` | Firestore tidak punya partial index; punya composite index | Composite index collection-group `reminders` di `firestore.indexes.json`: `(status ASC, remindAt ASC)` — query worker: `collectionGroup('reminders').where(status in ['pending','failed']).where(remindAt <= now)` |
| Editor rich-text penuh, papan Kanban, kalender bulanan + RRULE | Sebesar seluruh app keuangan; di luar MVP yang bisa rilis | **Ditunda** (§Deferred). MVP ini: Task (list + 3 kolom status sederhana), Note (editor Markdown yang **sudah ada** dipakai ulang dari receipt-scanner/reports), Reminder (waktu-tunggal + berulang harian/mingguan/hari-kerja) |
| `telegram_chat_id` / `whatsapp_number` di tabel `users` + alur "Link to Bot" | Sudah ada persis ini (`bot_links`, kode tautan, `/putuskan`) | Tidak dibangun ulang. `reminders.ownerId` = `userId` FinTrack; platform tujuan diambil dari `bot_links` saat kirim |

**PRD yang tetap dipakai apa adanya:** §1–§3 (visi, sasaran, daftar fitur & command), §4 (user flows), pola Producer–Consumer, ide `status` + `retry_count`, pemisahan Poller/Worker secara *logis* (di sini: heartbeat Go vs route handler).

---

## §1 Realita Platform — 5 hal yang mengubah desain

1. **Tidak ada proses Next.js yang hidup di antara request.** Setiap `/api/*` adalah fungsi dingin. Konsekuensi: pemicu terjadwal harus datang dari luar. Sumbernya = `go-whatsapp-web-multidevice`, satu-satunya komponen yang memang berjalan terus.
2. **Heartbeat bisa telat, dobel, atau bolong.** Ticker Go bisa terlewat saat GOWA restart; jaringan bisa retry POST. Endpoint cron **wajib** idempotent: claim-atomik + `status` guard membuat pengiriman dobel mustahil, dan reminder yang terlewat 1–2 menit tetap terkirim di detak berikutnya (query pakai `remindAt <= now`, bukan `remindAt == now`).
3. **Batas durasi fungsi.** `/api/cron/reminders` diset `maxDuration = 60`. Ia hanya boleh memproses sebatch kecil (default 25 reminder) per panggilan lalu berhenti; detak menit berikutnya melanjutkan sisanya. Jangan loop tak terbatas.
4. **Dua platform kirim keluar.** WhatsApp lewat GOWA REST (Basic Auth), Telegram lewat Bot API (token). `outbound.ts` (Task 5) menyembunyikan bedanya di balik `sendToUser(userId, text)` yang membaca `bot_links` untuk tahu platform + externalId.
5. **Zona waktu per user, bukan server.** Server Vercel = UTC. "Besok jam 3 sore" dan "rekap tiap pagi jam 7" harus dihitung di zona `profile.timezone`. Semua sudah tersedia: `getUserTimezone`, `formatDateTime`, `dayKeyInTz` (`Intl`-based, tanpa dependency).

---

## §2 Model Data (Firestore)

Semua di bawah `users/{uid}/`. Tidak ada tabel, tidak ada FK — relasi disimpan sebagai id string dan divalidasi di kode.

### `tasks/{taskId}`
```
{
  title: string,                       // wajib, 1..200 char
  notes: string | null,                // markdown pendek, <= 2000 char
  status: 'todo' | 'doing' | 'done',   // default 'todo'
  priority: 'low' | 'med' | 'high',    // default 'med'
  dueAt: Timestamp | null,             // UTC; jam dinding lokal user
  doneAt: Timestamp | null,
  source: 'web' | 'whatsapp' | 'telegram',
  createdAt: Timestamp, updatedAt: Timestamp
}
```

### `notes/{noteId}`
```
{
  title: string,           // wajib; kalau kosong diisi dari baris pertama content
  content: string,         // markdown, <= 20_000 char
  tags: string[],          // lower-case, unik, <= 12 tag, tiap tag <= 30 char
  source: 'web' | 'whatsapp' | 'telegram',
  createdAt: Timestamp, updatedAt: Timestamp
}
```

### `reminders/{reminderId}`
```
{
  ownerId: string,                     // = userId. Wajib: collectionGroup('reminders') mengembalikan dokumen lintas-user, worker butuh ini untuk sendToUser(ownerId, …) tanpa mem-parse ref.parent.parent.id
  kind: 'task' | 'standalone',
  taskId: string | null,               // set kalau kind === 'task'
  message: string,                     // teks yang dikirim ke chat, <= 500 char
  remindAt: Timestamp,                 // UTC — kapan harus dikirim
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'cancelled',
  attempts: number,                    // default 0
  nextAttemptAt: Timestamp | null,     // diisi saat 'failed' → backoff
  lastError: string | null,            // truncated <= 200 char
  sentAt: Timestamp | null,
  recurrence: {                        // null = pengingat sekali
    freq: 'daily' | 'weekly' | 'weekday',
    // 'weekly' needs weekday 0..6 (0 = Sunday, Date.getUTCDay convention), derived from the initial remindAt
    until: Timestamp | null            // null = tanpa akhir
  } | null,
  source: 'web' | 'whatsapp' | 'telegram' | 'auto',
  createdAt: Timestamp, updatedAt: Timestamp
}
```

**Aturan turunan:**
- `kind: 'task'` ⇒ `taskId` tidak null; `kind: 'standalone'` ⇒ `taskId` null. Divalidasi di `buildReminderDoc` (Task 4), bukan di Firestore.
- Reminder milik task: **satu** reminder aktif per `(taskId, offset)` — meng-set ulang `dueAt` task melakukan *upsert* (Task 9), bukan menumpuk.
- `recurrence` hanya untuk `kind: 'standalone'` di MVP (task berulang = §Deferred).

### Koleksi non-user
`cron_runs/{runId}` (root, Admin-SDK-only, deny-all client) — catatan tiap eksekusi cron untuk observasi: `{ endpoint, startedAt, claimed, sent, failed, durationMs }`. TTL policy Firestore di `startedAt` (14 hari).

### Composite indexes (`firestore.indexes.json`)
- `reminders`: query worker (`dueRemindersPage`, Task 4) memakai **collection group** — index `status ASC, remindAt ASC` cakupan `COLLECTION_GROUP`. Tidak perlu index per-user.
- `reminders` collection group: `status ASC, remindAt ASC`.
- `tasks`: `status ASC, dueAt ASC` dan `dueAt ASC` (query "tugas hari ini").
- `notes`: `updatedAt DESC` (list) — Firestore sudah otomatis untuk single-field; hanya composite yang perlu didaftarkan.

---

## §3 Arsitektur Pengiriman Pengingat (Producer–Consumer di stack ini)

```
┌─────────────────────────────┐        POST /api/cron/reminders
│ go-whatsapp-web-multidevice │  ───────────────────────────────►  ┌──────────────────────────┐
│  goroutine ticker 60s       │   Authorization: Bearer <secret>   │  Next.js route handler   │
│  (Producer / heartbeat)     │  ◄───────────────────────────────  │  (Consumer)              │
└─────────────────────────────┘        { claimed, sent, failed }   │                          │
                                                                   │ 1. verify secret         │
                                                                   │ 2. collectionGroup(      │
                                                                   │    'reminders')          │
                                                                   │    .where status in      │
                                                                   │      [pending,failed]    │
                                                                   │    .where remindAt<=now  │
                                                                   │    .orderBy remindAt      │
                                                                   │    .limit 25             │
                                                                   │ 3. per reminder:         │
                                                                   │    runTransaction:       │
                                                                   │      re-read; if status  │
                                                                   │      still claimable →   │
                                                                   │      set 'sending'       │
                                                                   │    (else skip — another  │
                                                                   │     run won it)          │
                                                                   │ 4. sendToUser(ownerId,   │
                                                                   │    message)  ── outbound │
                                                                   │ 5. success → 'sent';     │
                                                                   │    roll recurrence fwd   │
                                                                   │    fail → 'failed',      │
                                                                   │    attempts++,           │
                                                                   │    nextAttemptAt=backoff │
                                                                   │ 6. write cron_runs row   │
                                                                   └──────────────────────────┘
```

**Kenapa `runTransaction` = `SKIP LOCKED`:** langkah 3 membaca ulang dokumen di dalam transaksi. Kalau dua eksекusi cron menarik reminder yang sama di langkah 2, hanya satu transaksi yang commit; yang lain gagal dengan `ABORTED`, di-retry oleh SDK, membaca `status: 'sending'`, dan `return`-nya "skip". Tidak ada baris yang diproses dua kali. Tidak butuh lock eksplisit.

**Kenapa `status: 'sending'` (bukan langsung `'sent'`):** kalau `sendToUser` timeout/gagal setelah claim, reminder tersangkut di `'sending'`. Sebuah reminder di `'sending'` yang `updatedAt`-nya lebih tua dari 5 menit dianggap "sender mati di tengah jalan" dan dikembalikan ke `'pending'` di awal tiap cron run (`reapStuckSending`, Task 10). Ini menutup celah crash.

**Digest pagi:** endpoint kedua `/api/cron/daily-digest`, dipanggil heartbeat tiap 15 menit. Ia meng-query `users` yang `profile.timezone`-nya membuat waktu lokal *sekarang* jatuh di menit `[digestHour:00, digestHour:14]` **dan** belum menerima digest hari ini (`meta/productivityDigest.lastSentDayKey !== todayLocal`). Untuk tiap user: hitung tugas due hari ini + reminder hari ini, kirim satu pesan rekap, tandai `lastSentDayKey`.

---

## §4 File Structure

**Dibuat — web/shared:**

| File | Tanggung jawab |
|---|---|
| `src/shared/types/productivity.ts` | `Task`, `Note`, `Reminder`, `ReminderRecurrence`, DTO create/update, union status/priority/freq |
| `src/shared/lib/parse-when.ts` | Parser deterministik "kapan": `parseWhen(text, now, tz) → { at: Date, recurrence, timeWasImplicit } \| null` + `stripWhenTokens(text)`. Kata relatif ("besok", "lusa", "senin depan"), jam (`15:00`/`15.00`/`jam 3 sore`), durasi (`dalam 2 jam`), berulang (`tiap hari`, `tiap senin`, `tiap hari kerja`). Murni, tanpa I/O |
| `src/shared/lib/parse-when.test.ts` | |
| `src/shared/bot/outbound.ts` | `sendToUser(userId, text, opts?) → Promise<{ ok: boolean }>` — baca `bot_links`, kirim via GOWA REST (WA) atau Telegram Bot API. Dipakai cron + (opsional) webhook |
| `src/shared/bot/outbound.test.ts` | |
| `src/shared/bot/reminder-engine.ts` | Fungsi murni (tanpa SDK): `rollRecurrence(reminder, from) → Date \| null`, `backoffDelayMs(attempts) → number`, `reaperCutoff(now) → Date`, `MAX_ATTEMPTS`, `digestBody(tasks, reminders, tz, dayLabel) → string`. Dibuat di Task 10, dipakai lagi Task 11 |
| `src/shared/bot/reminder-engine.test.ts` | |
| `src/shared/bot/productivity-commands.ts` | Parser command bot: `/task add\|list\|done\|rm\|edit`, `/note`, `/note cari`, `/ingatkan`, `/agenda`, `/tunda` (snooze). `parseProductivityCommand(text, now, tz) → ProductivityCommand`. Murni |
| `src/shared/bot/productivity-commands.test.ts` | |
| `src/shared/bot/flow-productivity.ts` | Eksekusi command di atas terhadap `admin-data-productivity.ts` + `replies-productivity.ts`. `handleProductivityCommand(userId, cmd) → BotReply` |
| `src/shared/bot/flow-productivity.test.ts` | |
| `src/shared/bot/admin-data-productivity.ts` | Sisi Firestore Admin SDK untuk bot & cron: CRUD tasks/notes/reminders, `claimReminder`, `reapStuckSending`, `markReminderSent/Failed`, `dueRemindersPage`, `usersDueForDigest`, `recordCronRun` |
| `src/shared/bot/admin-data-productivity.test.ts` | |
| `src/shared/bot/replies-productivity.ts` | Semua teks balasan modul ini (task tersimpan, daftar tugas, agenda, pengingat diset, snooze, digest, error) |
| `src/shared/bot/replies-productivity.test.ts` | |
| `src/app/api/cron/reminders/route.ts` | Consumer pengingat (POST, `CRON_SECRET`, `maxDuration=60`) |
| `src/app/api/cron/reminders/route.test.ts` | |
| `src/app/api/cron/daily-digest/route.ts` | Rekap pagi per zona waktu (POST, `CRON_SECRET`, `maxDuration=60`) |
| `src/app/api/cron/daily-digest/route.test.ts` | |
| `src/shared/repositories/firestore/FirestoreTaskRepository.ts` | CRUD tasks sisi client (web) |
| `src/shared/repositories/firestore/FirestoreNoteRepository.ts` | CRUD notes sisi client |
| `src/shared/repositories/firestore/FirestoreReminderRepository.ts` | CRUD reminders sisi client (create standalone, list upcoming, cancel) |
| `src/shared/use-cases/planner/*.usecase.ts` | Logika bisnis web: `CreateTask`, `UpdateTaskStatus`, `SetTaskDue` (→ upsert reminder), `CreateNote`, `SearchNotes`, `CreateReminder`, `CancelReminder` |
| `src/shared/stores/planner.store.ts` | Zustand store untuk halaman web |
| `src/modules/planner/PlannerPage.tsx` + komponen | Halaman Tugas (list + 3 kolom status + quick-add + due picker) |
| `src/modules/notes/NotesPage.tsx` + komponen | Halaman Catatan (list + editor Markdown yang dipakai ulang + tag filter + cari) |
| `src/modules/planner/RemindersPanel.tsx` | Daftar pengingat mendatang + pengaturan (jam digest, lead time default) |
| `src/app/(main)/planner/page.tsx`, `.../notes/page.tsx` | Route Next.js |

**Diubah:**

| File | Perubahan |
|---|---|
| `src/shared/bot/core.ts` | `dispatchText`: sisipkan `parseProductivityCommand` **sebelum** `parseCommandArgs`/`matchReadCommand`; `handleIncoming`: cabang tap tombol `pr:*` (snooze/selesai dari notifikasi) |
| `src/shared/bot/types.ts` | Tambah `BotIntent` untuk read-command `/agenda`; tidak ada tipe uang |
| `src/shared/bot/replies.ts` | `help()` — tambah blok "🗓 Produktivitas" |
| `src/shared/bot/parse-intent.ts` | `READ_COMMANDS` — `/agenda`, `/tugas`, `/catatan` |
| `src/shared/repositories/index.ts` | Daftarkan `tasks`, `notes`, `reminders` |
| `src/shared/types/domain.ts` | (tidak diubah — tipe produktivitas terpisah di `productivity.ts` supaya modul ini bisa dilepas) |
| `firestore.rules` | Aturan untuk `tasks`/`notes`/`reminders` (client boleh CRUD miliknya; field `status`/`attempts`/`sentAt`/`nextAttemptAt`/`lastError` pada `reminders` read-only untuk client) + `cron_runs` root deny-all |
| `firestore.indexes.json` | Composite indexes dari §2 |
| `src/app/(main)/layout.tsx` / komponen nav | Menu "Tugas" & "Catatan" |
| `src/modules/settings/*` | Bagian "Pengingat & Produktivitas": jam rekap harian, lead time default |
| `.env.example` | `PRODUCTIVITY_CRON_SECRET` |
| `README.md` | Modul baru + env + endpoint cron + catatan heartbeat GOWA |
| `go-whatsapp-web-multidevice/src/config/settings.go` + `cmd/rest.go` (atau modul heartbeat baru) | Goroutine ticker → POST ke endpoint cron |
| `go-whatsapp-web-multidevice/src/.env` + `README`/`docs` | `PRODUCTIVITY_CRON_URL`, `PRODUCTIVITY_CRON_SECRET`, `PRODUCTIVITY_CRON_INTERVAL` |

---

## §5 Kontrak Tipe Kanonik

Ditulis di Task 1; ditaruh di sini supaya pelaksana task manapun tahu bentuk persisnya.

```ts
// src/shared/types/productivity.ts
import type { Timestamp } from 'firebase/firestore'

export type TaskStatus = 'todo' | 'doing' | 'done'
export type TaskPriority = 'low' | 'med' | 'high'
export type ReminderStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'cancelled'
export type ReminderFreq = 'daily' | 'weekly' | 'weekday'
export type EntrySource = 'web' | 'whatsapp' | 'telegram'

export interface Task {
  id: string
  title: string
  notes: string | null
  status: TaskStatus
  priority: TaskPriority
  dueAt: Timestamp | null
  doneAt: Timestamp | null
  source: EntrySource
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface Note {
  id: string
  title: string
  content: string
  tags: string[]
  source: EntrySource
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface ReminderRecurrence {
  freq: ReminderFreq
  /** 0..6 (0 = Sunday, Date.getUTCDay convention). Required for 'weekly', ignored otherwise. */
  weekday?: number
  until: Timestamp | null
}

export interface Reminder {
  id: string
  ownerId: string
  kind: 'task' | 'standalone'
  taskId: string | null
  message: string
  remindAt: Timestamp
  status: ReminderStatus
  attempts: number
  nextAttemptAt: Timestamp | null
  lastError: string | null
  sentAt: Timestamp | null
  recurrence: ReminderRecurrence | null
  source: EntrySource | 'auto'
  createdAt: Timestamp
  updatedAt: Timestamp
}

// ─── DTOs (input from web/bot; no server id/timestamps) ───
export interface CreateTaskDTO {
  title: string
  notes?: string
  priority?: TaskPriority
  dueAt?: Date | null
  source: EntrySource
}
export interface UpdateTaskDTO {
  title?: string
  notes?: string | null
  status?: TaskStatus
  priority?: TaskPriority
  dueAt?: Date | null
}
export interface CreateNoteDTO {
  title?: string
  content: string
  tags?: string[]
  source: EntrySource
}
export interface CreateReminderDTO {
  message: string
  remindAt: Date
  recurrence?: { freq: ReminderFreq; until?: Date | null } | null
  source: EntrySource | 'auto'   // 'auto' = a reminder the cron created (rolled recurrence, or a task's auto reminder)
}

/** Default lead time (minutes before `dueAt`) for a task's automatic reminder.
 *  User can override in Settings; stored at `users/{uid}/meta/plannerPrefs`. */
export interface PlannerPrefs {
  /** Minutes before the due time. `[0]` = "on time". Default `[0, 60]`. */
  taskLeadsMinutes: number[]
  /** Local hour (0..23) the morning digest is sent. Default 7. */
  digestHour: number
  /** Morning digest enabled. Default true. */
  digestEnabled: boolean
}
export const DEFAULT_PLANNER_PREFS: PlannerPrefs = {
  taskLeadsMinutes: [0, 60],
  digestHour: 7,
  digestEnabled: true,
}
```

```ts
// src/shared/bot/productivity-commands.ts — bentuk hasil parse
export type ProductivityCommand =
  | { kind: 'task_add'; title: string; when: ParsedWhen | null; priority: TaskPriority | null }
  | { kind: 'task_list'; filter: 'today' | 'open' | 'all' }
  | { kind: 'task_done'; ref: number }        // nomor 1-based dari list terakhir
  | { kind: 'task_rm'; ref: number }
  | { kind: 'task_edit'; ref: number; patch: { title?: string; when?: ParsedWhen | null; priority?: TaskPriority } }
  | { kind: 'note_add'; text: string }
  | { kind: 'note_search'; keyword: string }
  | { kind: 'note_list' }
  | { kind: 'reminder_add'; message: string; when: ParsedWhen }
  | { kind: 'agenda' }
  | { kind: 'snooze'; ref: number | null; reminderId: string | null; minutes: number }   // `/tunda 15` → reminderId null (uses meta/plannerLastPush); tombol `pr:snooze:<id>:15` → reminderId set
  | { kind: 'mark_done_token'; reminderId: string }           // tombol `pr:done:<id>`
  | { kind: 'none' }

// src/shared/lib/parse-when.ts
export interface ParsedWhen {
  at: Date                        // instant absolut (UTC), sudah memperhitungkan tz
  recurrence: { freq: ReminderFreq; until: Date | null } | null
  /** true kalau input hanya menyebut tanggal tanpa jam → caller pakai jam default (mis. 09:00 lokal). */
  timeWasImplicit: boolean
}
export function parseWhen(text: string, now: Date, timeZone: string): ParsedWhen | null
```

---

## §6 Yang Ditunda (bukan bagian plan ini)

Ditulis eksplisit supaya reviewer tidak menganggapnya celah spec. Masing-masing jadi plan sendiri kalau diminta.

- **Kalender bulanan penuh + tampilan agenda mingguan + `/event`.** PRD §Modul Jadwal. MVP hanya `/agenda` (daftar tugas + reminder hari ini). Model data `events/{eventId}` tidak dibuat sekarang.
- **RRULE / pengulangan kompleks** (tiap Selasa & Kamis, tiap tanggal 1, "hari kerja ke-3 tiap bulan"). MVP: `daily` | `weekly` (satu hari) | `weekday` (Sen–Jum).
- **Task berulang** (`recurrence` pada `kind: 'task'`). MVP: recurrence hanya untuk reminder `standalone`.
- **Kanban drag-and-drop.** MVP: dropdown status 3 nilai per baris + filter.
- **Kolaborasi / task ditugaskan ke user lain.** Semua data milik satu `uid`.
- **Editor rich-text WYSIWYG.** MVP memakai ulang editor Markdown/`<textarea>` yang sudah dipakai modul lain.
- **Push notification browser untuk reminder.** `notifications.ts` yang ada tetap browser-only untuk pengingat harian ringan; pengingat modul ini keluar lewat chat bot, bukan Web Push.
- **Retry job persisten / dead-letter queue.** MVP: `attempts` + `nextAttemptAt` backoff, cap 5 percobaan, lalu `status: 'failed'` permanen + muncul di daftar "gagal kirim" di web. Tidak ada DLQ.

---

## §7 Tasks

Urutan wajib: 1 → 12 punya ketergantungan maju. Task 13–18 (UI web) bisa paralel setelah Task 1 + Task 4 selesai.

Setiap task diakhiri: `npx vitest run <file>` hijau, `npx tsc --noEmit` bersih, `npx next lint --dir src` bersih, lalu commit. Trailer commit: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

---

### Task 1: Tipe kanonik + aturan Firestore + index

**Files:**
- Create: `src/shared/types/productivity.ts`
- Modify: `firestore.rules` (tambah blok `tasks`/`notes`/`reminders` di dalam `match /users/{userId}`, tambah `match /cron_runs/{doc}` deny-all di root)
- Modify: `firestore.indexes.json` (tambah composite indexes dari §2)
- Modify: `.env.example` (tambah `PRODUCTIVITY_CRON_SECRET=`)
- Test: `src/shared/types/productivity.test.ts`

**Interfaces:**
- Produces: semua tipe & konstanta di §5 (`Task`, `Note`, `Reminder`, `ReminderRecurrence`, `TaskStatus`, `TaskPriority`, `ReminderStatus`, `ReminderFreq`, `EntrySource`, `CreateTaskDTO`, `UpdateTaskDTO`, `CreateNoteDTO`, `CreateReminderDTO`, `PlannerPrefs`, `DEFAULT_PLANNER_PREFS`).
- Produces: `isTaskStatus(v: unknown): v is TaskStatus`, `isTaskPriority`, `isReminderFreq`, `normalizeTags(raw: string[]): string[]` (lower-case, trim, buang kosong, dedupe, potong ke 12 tag / 30 char).

- [ ] **Step 1: Write the failing test**

```ts
// src/shared/types/productivity.test.ts
import { describe, it, expect } from 'vitest'
import { isTaskStatus, isReminderFreq, normalizeTags, DEFAULT_PLANNER_PREFS } from './productivity'

describe('productivity type guards', () => {
  it('isTaskStatus accepts the three literals only', () => {
    expect(isTaskStatus('todo')).toBe(true)
    expect(isTaskStatus('doing')).toBe(true)
    expect(isTaskStatus('done')).toBe(true)
    expect(isTaskStatus('DONE')).toBe(false)
    expect(isTaskStatus('')).toBe(false)
    expect(isTaskStatus(undefined)).toBe(false)
  })

  it('isReminderFreq accepts daily/weekly/weekday', () => {
    expect(isReminderFreq('weekday')).toBe(true)
    expect(isReminderFreq('monthly')).toBe(false)
  })

  it('normalizeTags lowercases, trims, dedupes, caps at 12', () => {
    expect(normalizeTags([' Kerja ', 'kerja', 'IDE'])).toEqual(['kerja', 'ide'])
    expect(normalizeTags(Array.from({ length: 20 }, (_, i) => `t${i}`))).toHaveLength(12)
    expect(normalizeTags(['', '   '])).toEqual([])
  })

  it('DEFAULT_PLANNER_PREFS has digestHour 7 and leads [0,60]', () => {
    expect(DEFAULT_PLANNER_PREFS.digestHour).toBe(7)
    expect(DEFAULT_PLANNER_PREFS.taskLeadsMinutes).toEqual([0, 60])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shared/types/productivity.test.ts`
Expected: FAIL — `Cannot find module './productivity'`.

- [ ] **Step 3: Write `src/shared/types/productivity.ts`**

Isi persis blok tipe di §5, ditambah:

```ts
export function isTaskStatus(v: unknown): v is TaskStatus {
  return v === 'todo' || v === 'doing' || v === 'done'
}
export function isTaskPriority(v: unknown): v is TaskPriority {
  return v === 'low' || v === 'med' || v === 'high'
}
export function isReminderFreq(v: unknown): v is ReminderFreq {
  return v === 'daily' || v === 'weekly' || v === 'weekday'
}
export function normalizeTags(raw: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of raw) {
    const clean = t.trim().toLowerCase().slice(0, 30)
    if (!clean || seen.has(clean)) continue
    seen.add(clean)
    out.push(clean)
    if (out.length === 12) break
  }
  return out
}
```

- [ ] **Step 4: Add Firestore rules**

Di `firestore.rules`, di dalam `match /users/{userId}` (yang sudah `allow read, write: if request.auth.uid == userId` untuk subtree umum), tambah blok eksplisit supaya field internal reminder tidak bisa dipalsukan client:

```
match /reminders/{reminderId} {
  allow read: if request.auth.uid == userId;
  allow create: if request.auth.uid == userId
                && request.resource.data.status == 'pending'
                && request.resource.data.attempts == 0
                && request.resource.data.ownerId == userId;
  // client may change message / remindAt / recurrence / cancel; MUST NOT touch machine fields
  allow update: if request.auth.uid == userId
                && !request.resource.data.diff(resource.data).affectedKeys()
                     .hasAny(['attempts', 'nextAttemptAt', 'lastError', 'sentAt', 'ownerId'])
                && (request.resource.data.status == resource.data.status
                    || request.resource.data.status == 'cancelled');
  allow delete: if request.auth.uid == userId;
}
match /tasks/{taskId} {
  allow read, write: if request.auth.uid == userId;
}
match /notes/{noteId} {
  allow read, write: if request.auth.uid == userId;
}
```

Di root (sejajar `match /bot_links/...` yang sudah deny-all client):

```
match /cron_runs/{runId} {
  allow read, write: if false;
}
```

- [ ] **Step 5: Add composite indexes**

Di `firestore.indexes.json`, `"indexes"` array, tambah:

```json
{
  "collectionGroup": "reminders",
  "queryScope": "COLLECTION_GROUP",
  "fields": [
    { "fieldPath": "status", "order": "ASCENDING" },
    { "fieldPath": "remindAt", "order": "ASCENDING" }
  ]
},
{
  "collectionGroup": "tasks",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "status", "order": "ASCENDING" },
    { "fieldPath": "dueAt", "order": "ASCENDING" }
  ]
}
```

- [ ] **Step 6: Add env placeholder**

`.env.example`: tambah baris `PRODUCTIVITY_CRON_SECRET=` dengan komentar `# shared secret; go-whatsapp-web-multidevice heartbeat sends it as "Authorization: Bearer <secret>"`.

- [ ] **Step 7: Run test + gates**

Run: `npx vitest run src/shared/types/productivity.test.ts` → PASS.
Run: `npx tsc --noEmit` → bersih. `npx next lint --dir src` → bersih.

- [ ] **Step 8: Commit**

```bash
git add src/shared/types/productivity.ts src/shared/types/productivity.test.ts firestore.rules firestore.indexes.json .env.example
git commit -m "feat(planner): canonical productivity types, firestore rules and indexes"
```

---

### Task 2: Ekspor helper tanggal dari `review-commands.ts`

Alasan: `parse-when.ts` (Task 3) butuh guard rentang tanggal yang sudah ada. Jangan tulis ulang — ekspor.

**Files:**
- Modify: `src/shared/bot/review-commands.ts` (ubah `function withClockOf` → `export function withClockOf`; `function parseDateWord` → `export function parseDateWord`)
- Test: `src/shared/bot/review-commands.test.ts` (file sudah ada — tambah 2 test yang meng-*import* helper yang baru diekspor)

**Interfaces:**
- Produces: `export function withClockOf(now: Date, year: number, month: number, day: number): Date | null` — sudah divalidasi rentang (mis. 31 Feb → `null`), mengembalikan `Date` di tengah malam UTC pada tanggal itu dengan komponen jam dari `now`.
- Produces: `export function parseDateWord(raw: string, now: Date): Date | null` — "kemarin", "kemarin lusa", `yyyy-mm-dd`, `d/m`, `d/m/yyyy` (relatif ke masa lalu; tidak menangani kata masa depan).

- [ ] **Step 1: Write the failing test**

```ts
// tambahkan di src/shared/bot/review-commands.test.ts
import { withClockOf, parseDateWord } from './review-commands'

describe('exported date helpers', () => {
  const now = new Date('2026-09-08T10:30:00.000Z')

  it('withClockOf rejects impossible dates', () => {
    expect(withClockOf(now, 2026, 1, 31)).toBeNull() // 31 Feb
    expect(withClockOf(now, 2026, 8, 8)).toBeInstanceOf(Date)
  })

  it('parseDateWord understands "kemarin"', () => {
    const d = parseDateWord('kemarin', now)
    expect(d?.getUTCDate()).toBe(7)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/shared/bot/review-commands.test.ts`
Expected: FAIL — `withClockOf` / `parseDateWord` bukan named export.

- [ ] **Step 3: Add `export` keyword**

Di `src/shared/bot/review-commands.ts`: `function withClockOf` → `export function withClockOf`; `function parseDateWord` → `export function parseDateWord`. Tidak ada perubahan lain.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/shared/bot/review-commands.test.ts` → PASS (test lama tetap hijau).

- [ ] **Step 5: Commit**

```bash
git add src/shared/bot/review-commands.ts src/shared/bot/review-commands.test.ts
git commit -m "refactor(bot): export withClockOf and parseDateWord for reuse"
```

---

### Task 3: `parse-when.ts` — parser "kapan" deterministik

**Files:**
- Create: `src/shared/lib/parse-when.ts`
- Test: `src/shared/lib/parse-when.test.ts`

**Interfaces:**
- Consumes: `withClockOf`, `parseDateWord` dari `@/shared/bot/review-commands` (Task 2); `ReminderFreq` dari `@/shared/types/productivity` (Task 1).
- Produces: `parseWhen(text: string, now: Date, timeZone: string): ParsedWhen | null` (bentuk `ParsedWhen` di §5).
- Produces: `stripWhenTokens(text: string): string` — buang potongan "kapan" dari kalimat supaya sisanya jadi judul/pesan (mis. `"beli galon besok jam 3 sore"` → `"beli galon"`).

**Aturan parse (semua case-insensitive, input sudah `trim`):**
- Kata tanggal relatif masa depan: `hari ini` (hari ini), `besok`/`bsk` (+1), `lusa` (+2), `senin`..`minggu` / `senin depan` (hari-berikutnya-yang-cocok), plus apa pun yang dipahami `parseDateWord` (masa lalu → tetap dikembalikan; caller yang menolak kalau `< now`).
- Jam: `HH:MM`, `HH.MM`, `jam H`, `jam H pagi/siang/sore/malam` (pagi=+0, siang→12–14, sore→15–17, malam→19–21; `jam 3 sore` → 15:00), `H sore`. Kalau tidak ada jam → `timeWasImplicit = true`, `at` diset ke `09:00` lokal pada tanggal itu.
- Durasi: `dalam N menit|jam|hari`, `N menit lagi` → `at = now + durasi`, `timeWasImplicit = false`.
- Berulang: `tiap hari`/`setiap hari` → `{ freq: 'daily' }`; `tiap hari kerja` → `{ freq: 'weekday' }`; `tiap <hari>` → `{ freq: 'weekly', weekday }`. `at` = kemunculan berikutnya ≥ `now`.
- Konversi zona: waktu dinding lokal dihitung di `timeZone`, lalu dijadikan instant UTC. Pakai `Intl.DateTimeFormat` dengan `timeZone` untuk cari offset (pola `tzOffsetMs` yang sudah ada di `core.ts` — salin helper kecilnya ke sini, ~10 baris, jangan import dari `core.ts` yang berat).
- Tidak ada indikasi waktu apa pun → `return null`.

- [ ] **Step 1: Write the failing test**

```ts
// src/shared/lib/parse-when.test.ts
import { describe, it, expect } from 'vitest'
import { parseWhen, stripWhenTokens } from './parse-when'

const TZ = 'Asia/Jakarta' // UTC+7, tidak ada DST
const now = new Date('2026-09-08T02:00:00.000Z') // 09:00 WIB, Selasa

describe('parseWhen', () => {
  it('returns null when there is no time hint', () => {
    expect(parseWhen('beli galon', now, TZ)).toBeNull()
  })

  it('"besok jam 3 sore" → next day 15:00 WIB = 08:00 UTC, no recurrence', () => {
    const r = parseWhen('beli galon besok jam 3 sore', now, TZ)!
    expect(r.at.toISOString()).toBe('2026-09-09T08:00:00.000Z')
    expect(r.recurrence).toBeNull()
    expect(r.timeWasImplicit).toBe(false)
  })

  it('date word with no clock → 09:00 local and timeWasImplicit', () => {
    const r = parseWhen('lusa', now, TZ)!
    expect(r.at.toISOString()).toBe('2026-09-10T02:00:00.000Z') // 09:00 WIB
    expect(r.timeWasImplicit).toBe(true)
  })

  it('"dalam 2 jam" → now + 2h', () => {
    const r = parseWhen('rapat dalam 2 jam', now, TZ)!
    expect(r.at.toISOString()).toBe('2026-09-08T04:00:00.000Z')
  })

  it('"tiap hari jam 7 pagi" → daily recurrence, next occurrence today 07:00 WIB already passed → tomorrow', () => {
    const r = parseWhen('minum obat tiap hari jam 7 pagi', now, TZ)!
    expect(r.recurrence).toEqual({ freq: 'daily', until: null })
    expect(r.at.toISOString()).toBe('2026-09-09T00:00:00.000Z') // besok 07:00 WIB
  })

  it('"tiap hari kerja jam 8" from Tuesday → Wednesday 08:00', () => {
    const r = parseWhen('standup tiap hari kerja jam 8', now, TZ)!
    expect(r.recurrence).toEqual({ freq: 'weekday', until: null })
    expect(r.at.toISOString()).toBe('2026-09-09T01:00:00.000Z')
  })

  it('stripWhenTokens removes the temporal phrase', () => {
    expect(stripWhenTokens('beli galon besok jam 3 sore')).toBe('beli galon')
    expect(stripWhenTokens('minum obat tiap hari jam 7 pagi')).toBe('minum obat')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/shared/lib/parse-when.test.ts`
Expected: FAIL — module tidak ada.

- [ ] **Step 3: Implement `parse-when.ts`**

Struktur (isi penuh — bukan placeholder):

```ts
import type { ReminderFreq } from '@/shared/types/productivity'
import { withClockOf, parseDateWord } from '@/shared/bot/review-commands'

export interface ParsedWhen {
  at: Date
  recurrence: { freq: ReminderFreq; until: Date | null } | null
  timeWasImplicit: boolean
}

const DAYS = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu']
const RE_HHMM = /\b(\d{1,2})[:.](\d{2})\b/
const RE_JAM = /\bjam\s+(\d{1,2})(?:\s*(pagi|siang|sore|malam))?\b/
const RE_DUR = /\b(?:dalam\s+)?(\d{1,3})\s*(menit|jam|hari)(?:\s+lagi)?\b/

// offset lokal timeZone pada instant `at` (ms). Pola sama dg core.ts tzOffsetMs.
function tzOffsetMs(at: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
  const p = Object.fromEntries(dtf.formatToParts(at).map((x) => [x.type, x.value]))
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour === 24 ? 0 : +p.hour, +p.minute, +p.second)
  return asUTC - at.getTime()
}

// bikin instant UTC dari komponen waktu-dinding lokal
function localWallToUtc(y: number, mo: number, d: number, h: number, mi: number, timeZone: string): Date {
  const guess = new Date(Date.UTC(y, mo, d, h, mi, 0))
  const off = tzOffsetMs(guess, timeZone)
  return new Date(guess.getTime() - off)
}
```

Lalu `parseWhen`:
1. Cek `RE_DUR` → kalau cocok, `at = new Date(now.getTime() + n*unitMs)`, `recurrence = null` (kecuali ada "tiap"), `timeWasImplicit = false`. Return.
2. Deteksi recurrence: `/tiap|setiap/` + `hari kerja` → `weekday`; + `hari` → `daily`; + nama hari → `weekly` (`weekday` index).
3. Ekstrak jam: `RE_HHMM` → `[h, m]`; else `RE_JAM` → `h` disesuaikan bagian hari (`sore`/`malam` + `h<12` → `h += 12` untuk sore kalau `h<=8`, dst — tabel eksplisit); else `implicit → 09:00`.
4. Ekstrak tanggal dasar:
   - recurrence ada → cari kemunculan berikutnya ≥ `now` (loop maks 8 hari untuk `weekly`, 1–3 untuk `daily`/`weekday`).
   - `hari ini`/`besok`/`lusa`/nama hari → hitung tanggal.
   - else coba `parseDateWord(text, now)`.
   - tidak ada tanggal & tidak ada jam & tidak ada durasi → `return null`.
   - tidak ada tanggal tapi ADA jam → hari ini kalau jam belum lewat, else besok.
5. `at = localWallToUtc(...)` dari komponen lokal.
6. Return `{ at, recurrence, timeWasImplicit }`.

`stripWhenTokens`: hapus match `RE_HHMM`, `RE_JAM`, `RE_DUR`, `/\b(hari ini|besok|bsk|lusa|kemarin( lusa)?)\b/`, `/\b(tiap|setiap)\s+(hari kerja|hari|senin|selasa|rabu|kamis|jumat|sabtu|minggu)\b/`, `/\bjam\s+\d/`, nama hari berdiri sendiri, lalu `.replace(/\s{2,}/g, ' ').trim()`.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/shared/lib/parse-when.test.ts` → PASS (7 test).

- [ ] **Step 5: Gates + commit**

Run: `npx tsc --noEmit`, `npx next lint --dir src` → bersih.

```bash
git add src/shared/lib/parse-when.ts src/shared/lib/parse-when.test.ts
git commit -m "feat(planner): deterministic natural-language 'when' parser"
```

---

### Task 4: `admin-data-productivity.ts` — sisi Firestore Admin SDK

**Files:**
- Create: `src/shared/bot/admin-data-productivity.ts`
- Test: `src/shared/bot/admin-data-productivity.test.ts`

**Interfaces:**
- Consumes: `getDb()` / pola akses Admin SDK dari `@/shared/bot/admin-data` (pakai helper yang sama yang dipakai `createTransactionsBatch`); `stripUndefined` dari `admin-data`; tipe dari `@/shared/types/productivity`.
- Produces:
  ```ts
  createTask(userId: string, dto: CreateTaskDTO): Promise<Task>
  updateTask(userId: string, taskId: string, patch: UpdateTaskDTO): Promise<Task>
  listTasks(userId: string, filter: 'today' | 'open' | 'all', tz: string): Promise<Task[]>
  getTaskByIndex(userId: string, filter, tz, index1: number): Promise<Task | null> // 1-based, urutan sama dg listTasks
  createNote(userId: string, dto: CreateNoteDTO): Promise<Note>
  listNotes(userId: string, limit?: number): Promise<Note[]>
  searchNotes(userId: string, keyword: string, limit?: number): Promise<Note[]> // substring case-insensitive di title+content+tags, di memori
  createReminder(userId: string, dto: CreateReminderDTO, link: { kind: 'task'|'standalone'; taskId: string|null }): Promise<Reminder>
  upsertTaskReminder(userId: string, task: Task, leadsMinutes: number[]): Promise<void> // hapus reminder task lama yg masih pending, buat ulang dari dueAt
  cancelRemindersForTask(userId: string, taskId: string): Promise<void>
  // --- dipakai cron ---
  reapStuckSending(cutoff: Date): Promise<number> // status 'sending' & updatedAt < cutoff → 'pending'
  dueRemindersPage(now: Date, limit: number): Promise<Array<{ ref: FirebaseFirestore.DocumentReference; data: Reminder }>>
  claimReminder(ref: FirebaseFirestore.DocumentReference): Promise<Reminder | null> // runTransaction; null = kalah race / sudah tidak claimable
  markReminderSent(ref, next: { rolledAt: Date | null }): Promise<void>
  markReminderFailed(ref, err: string, nextAttemptAt: Date | null): Promise<void>
  usersDueForDigest(now: Date): Promise<Array<{ userId: string; tz: string; digestHour: number }>>
  markDigestSent(userId: string, dayKey: string): Promise<void>
  recordCronRun(row: { endpoint: string; startedAt: Date; claimed: number; sent: number; failed: number; durationMs: number }): Promise<void>
  getPlannerPrefs(userId: string): Promise<PlannerPrefs>
  ```

**Detail penting:**
- `claimReminder` = inti "SKIP LOCKED":
  ```ts
  export async function claimReminder(ref) {
    return getDb().runTransaction(async (tx) => {
      const snap = await tx.get(ref)
      if (!snap.exists) return null
      const r = snap.data() as Reminder
      if (r.status !== 'pending' && r.status !== 'failed') return null
      if (r.status === 'failed' && r.nextAttemptAt && r.nextAttemptAt.toMillis() > Date.now()) return null
      tx.update(ref, { status: 'sending', attempts: r.attempts + 1, updatedAt: Timestamp.now() })
      return { ...r, status: 'sending', attempts: r.attempts + 1 }
    })
  }
  ```
- `dueRemindersPage`: `getDb().collectionGroup('reminders').where('status', 'in', ['pending', 'failed']).where('remindAt', '<=', Timestamp.fromDate(now)).orderBy('remindAt', 'asc').limit(limit)`. (Butuh index dari Task 1.)
- `upsertTaskReminder`: query `reminders` where `kind == 'task' && taskId == task.id && status == 'pending'` → hapus batch → untuk tiap `lead` di `leadsMinutes` yang menghasilkan `remindAt > now`, buat reminder baru `message` = `⏰ Tugas: <title> — jatuh tempo <formatDateTime(dueAt)>`.
- `searchNotes`: Firestore tidak punya full-text. Ambil `listNotes(userId, 200)`, filter di memori. Cukup untuk skala personal. `ponytail: linear scan, ganti ke Algolia/Typesense kalau > ~1000 notes/user`.
- Semua penulisan lewat `stripUndefined(...)` sebelum `.set()`/`.update()` (Admin SDK tolak `undefined`).
- `usersDueForDigest`: baca `users` (collection) — ambil `meta/plannerPrefs` per user via `collectionGroup('plannerPrefs')`? Tidak: iterasi `users` terlalu mahal. Sebagai gantinya, simpan daftar opt-in di satu dokumen root `bot_meta/digestRoster` = `{ [userId]: { tz, digestHour } }`, di-*update* saat user ubah pref digest di Settings (Task 17). Cron baca satu dokumen itu, filter yang menit lokalnya `== digestHour:00..14` dan `lastSentDayKey != todayLocal` (baca `meta/productivityDigest`).

- [ ] **Step 1: Failing test — CRUD task**

```ts
// src/shared/bot/admin-data-productivity.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
// pola mock Firestore Admin sama dengan admin-data.test.ts yang sudah ada — pakai in-memory fake.
import { createTask, listTasks, claimReminder } from './admin-data-productivity'

// ... setup fake getDb() seperti di admin-data.test.ts ...

describe('createTask', () => {
  it('defaults status=todo priority=med and stamps timestamps', async () => {
    const t = await createTask('u1', { title: 'Review PRD', source: 'whatsapp' })
    expect(t.status).toBe('todo')
    expect(t.priority).toBe('med')
    expect(t.title).toBe('Review PRD')
    expect(t.createdAt).toBeTruthy()
  })
})

describe('claimReminder', () => {
  it('second claim on an already-sending reminder returns null', async () => {
    // seed reminder status=pending, run claim twice against same ref
    const first = await claimReminder(ref)
    const second = await claimReminder(ref)
    expect(first?.status).toBe('sending')
    expect(second).toBeNull()
  })
})
```

- [ ] **Step 2: Run → FAIL** (`npx vitest run src/shared/bot/admin-data-productivity.test.ts`).

- [ ] **Step 3: Implement** semua fungsi di blok Interfaces. Ikuti gaya `admin-data.ts` (import `getDb`, `FieldValue`, `Timestamp`, `stripUndefined`). ~250 baris.

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Gates + commit**

```bash
git add src/shared/bot/admin-data-productivity.ts src/shared/bot/admin-data-productivity.test.ts
git commit -m "feat(planner): Admin SDK data layer for tasks, notes and reminders"
```

---

### Task 5: `outbound.ts` — kirim pesan ke user lewat platform yang tertaut

**Files:**
- Create: `src/shared/bot/outbound.ts`
- Test: `src/shared/bot/outbound.test.ts`
- Modify: `src/app/api/bot/whatsapp/route.ts` (ganti `sendMessage` internal → panggil `sendWhatsApp` dari `outbound.ts`), `src/app/api/bot/telegram/route.ts` (sama). *Hanya* refactor titik kirim; tidak ubah perilaku.

**Interfaces:**
- Consumes: `findLinkByExternalId` + kebalikannya. Butuh **lookup user → link**: tambah `getLinksForUser(userId): Promise<Array<{ platform: 'whatsapp'|'telegram'; externalId: string }>>` di `admin-data.ts` (query `bot_links` where `userId == uid`). Satu user bisa tertaut ke dua platform → kirim ke semua, atau ke `preferredPlatform` dari `meta/botPrefs` kalau ada.
- Produces:
  ```ts
  sendWhatsApp(externalId: string, text: string): Promise<{ ok: boolean; error?: string }>
  sendTelegram(externalId: string, text: string, opts?: { buttons?: InlineButton[] }): Promise<{ ok: boolean; error?: string }>
  sendToUser(userId: string, text: string, opts?: { buttons?: InlineButton[] }): Promise<{ ok: boolean; sent: number; error?: string }>
  type InlineButton = { text: string; token: string } // token → callback_data (Telegram) / diabaikan (WA, tombol jadi teks "Balas: <token>")
  ```
- `sendWhatsApp`: `POST ${process.env.GOWA_BASE_URL}/send/message`, header `Authorization: Basic ${btoa(GOWA_BASIC_AUTH)}`, body `{ phone: externalId, message: text }`. Timeout 10s via `AbortSignal.timeout(10_000)`. (Pola persis `sendMessage` yang ada sekarang.)
- `sendTelegram`: `POST https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, body `{ chat_id, text, parse_mode: 'HTML', reply_markup? }`.
- `sendToUser`: resolve link(s) → kirim → return `{ ok: sent > 0, sent }`. Kalau user tidak tertaut → `{ ok: false, sent: 0, error: 'not_linked' }`.

- [ ] **Step 1: Failing test**

```ts
// src/shared/bot/outbound.test.ts
import { describe, it, expect, vi } from 'vitest'
import { sendToUser } from './outbound'

vi.mock('./admin-data', () => ({
  getLinksForUser: vi.fn(async (uid: string) =>
    uid === 'linked' ? [{ platform: 'telegram', externalId: '555' }] : []),
  getBotPrefs: vi.fn(async () => ({})),
}))

describe('sendToUser', () => {
  it('returns not_linked when the user has no bot link', async () => {
    const r = await sendToUser('nobody', 'hai')
    expect(r).toEqual({ ok: false, sent: 0, error: 'not_linked' })
  })

  it('posts to Telegram sendMessage for a linked user', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }))
    const r = await sendToUser('linked', 'halo')
    expect(r.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/sendMessage'),
      expect.objectContaining({ method: 'POST' }))
  })
})
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `outbound.ts`** + tambah `getLinksForUser` di `admin-data.ts` (+1 test kecil di `admin-data.test.ts`).

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Refactor kedua webhook route** untuk pakai `sendWhatsApp`/`sendTelegram`. Jalankan suite bot lama (`npx vitest run src/app/api/bot`) → tetap hijau. Ini bukti refactor tidak mengubah perilaku.

- [ ] **Step 6: Gates + commit**

```bash
git add src/shared/bot/outbound.ts src/shared/bot/outbound.test.ts src/shared/bot/admin-data.ts src/shared/bot/admin-data.test.ts src/app/api/bot/whatsapp/route.ts src/app/api/bot/telegram/route.ts
git commit -m "feat(bot): shared outbound module for sending messages to a linked user"
```

---

### Task 6: `productivity-commands.ts` — parser command bot

**Files:**
- Create: `src/shared/bot/productivity-commands.ts`
- Test: `src/shared/bot/productivity-commands.test.ts`

**Interfaces:**
- Consumes: `parseWhen`, `stripWhenTokens` (Task 3); `TaskPriority` (Task 1).
- Produces: `parseProductivityCommand(text: string, now: Date, timeZone: string): ProductivityCommand` (union di §5).
- Produces: `PRODUCTIVITY_TOKEN_PREFIX = 'pr:'`; `parseProductivityToken(raw: string): ProductivityCommand` (`pr:done:<id>` → `mark_done_token`; `pr:snooze:<id>:<min>` → `snooze`).

**Grammar (prefix `/` opsional; alias ID + EN):**
| Input | Hasil |
|---|---|
| `/task Review PRD besok jam 3 sore !high` / `/tugas ...` | `task_add` (title via `stripWhenTokens`, `when`, `priority` dari `!high`/`!p1`) |
| `/task` / `/tugas` (tanpa arg) | `task_list` filter `open` |
| `/task hari ini` / `/agenda` | `task_list` filter `today` / `agenda` |
| `/done 3` / `/selesai 3` / `/task done 3` | `task_done` ref 3 |
| `/hapus 3` (dalam konteks task) / `/task rm 3` | `task_rm` |
| `/note Ide: pakai webhook GOWA buat cron` / `/catat ...` | `note_add` |
| `/note cari webhook` / `/catatan cari ...` | `note_search` |
| `/note` / `/catatan` | `note_list` |
| `/ingatkan bayar listrik besok jam 9` / `/reminder ...` | `reminder_add` (butuh `when` non-null; kalau `parseWhen` → null, hasil `none`) |
| `/tunda 15` / `/snooze 15` | `snooze` ref null, 15 menit |

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from 'vitest'
import { parseProductivityCommand, parseProductivityToken } from './productivity-commands'

const TZ = 'Asia/Jakarta'
const now = new Date('2026-09-08T02:00:00.000Z')

describe('parseProductivityCommand', () => {
  it('/task with title + when + priority', () => {
    const c = parseProductivityCommand('/task Review PRD besok jam 3 sore !high', now, TZ)
    expect(c.kind).toBe('task_add')
    if (c.kind !== 'task_add') return
    expect(c.title).toBe('Review PRD')
    expect(c.priority).toBe('high')
    expect(c.when?.at.toISOString()).toBe('2026-09-09T08:00:00.000Z')
  })

  it('bare /tugas → task_list open', () => {
    expect(parseProductivityCommand('/tugas', now, TZ)).toEqual({ kind: 'task_list', filter: 'open' })
  })

  it('/selesai 3 → task_done ref 3', () => {
    expect(parseProductivityCommand('/selesai 3', now, TZ)).toEqual({ kind: 'task_done', ref: 3 })
  })

  it('/note cari webhook → note_search', () => {
    expect(parseProductivityCommand('/note cari webhook', now, TZ)).toEqual({ kind: 'note_search', keyword: 'webhook' })
  })

  it('/catat free text → note_add', () => {
    expect(parseProductivityCommand('/catat pakai ticker go buat cron', now, TZ))
      .toEqual({ kind: 'note_add', text: 'pakai ticker go buat cron' })
  })

  it('/ingatkan without a parseable time → none', () => {
    expect(parseProductivityCommand('/ingatkan sesuatu', now, TZ)).toEqual({ kind: 'none' })
  })

  it('not a productivity command → none', () => {
    expect(parseProductivityCommand('kopi 25rb', now, TZ)).toEqual({ kind: 'none' })
  })
})

describe('parseProductivityToken', () => {
  it('pr:snooze:<id>:15', () => {
    expect(parseProductivityToken('pr:snooze:abc123:15'))
      .toEqual({ kind: 'snooze', ref: null, reminderId: 'abc123', minutes: 15 })
  })
  it('pr:done:<id>', () => {
    expect(parseProductivityToken('pr:done:abc123'))
      .toEqual({ kind: 'mark_done_token', reminderId: 'abc123' })
  })
})
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement.** Normalisasi: buang leading `/`, ambil kata pertama sebagai verb, cocokkan ke tabel alias (`Map<string, ...>`). `!high|!hi|!p1` → high, `!low|!p3` → low, else med. Sisanya: `task_add` title = `stripWhenTokens(rest).replace(/!\w+/, '').trim()`.

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Gates + commit**

```bash
git add src/shared/bot/productivity-commands.ts src/shared/bot/productivity-commands.test.ts
git commit -m "feat(bot): productivity command parser"
```

---

### Task 7: `replies-productivity.ts` — teks balasan

**Files:**
- Create: `src/shared/bot/replies-productivity.ts`
- Test: `src/shared/bot/replies-productivity.test.ts`

**Interfaces:**
- Consumes: `BotReply` dari `@/shared/bot/types`; `formatDateTime`, `formatDayLong` dari `@/shared/lib/format`; `Task`, `Note`, `Reminder`.
- Produces (semua balik `BotReply`, Bahasa Indonesia, styling WA/Telegram — `*tebal*` untuk WA di `types.ts` sudah ada konvensinya):
  ```ts
  taskCreated(t: Task, tz: string, reminderAt: Date | null): BotReply
  taskList(items: Task[], filter, tz: string): BotReply     // bernomor 1..n, ikon status, tanda prioritas
  taskDone(t: Task): BotReply
  taskRemoved(title: string): BotReply
  taskRefNotFound(ref: number): BotReply
  noteSaved(n: Note): BotReply
  noteSearchResult(keyword: string, items: Note[]): BotReply
  noteList(items: Note[]): BotReply
  reminderSet(r: Reminder, tz: string): BotReply
  reminderNeedsTime(): BotReply                              // "Kapan mau diingatkan? contoh: /ingatkan bayar listrik besok jam 9"
  agenda(tasks: Task[], reminders: Reminder[], tz: string, dayLabel: string): BotReply
  snoozed(r: Reminder, tz: string): BotReply
  digest(userName: string | null, tasks: Task[], reminders: Reminder[], tz: string): BotReply
  reminderPush(r: Reminder, tz: string): { text: string; buttons: { text: string; token: string }[] }
  planFallbackError(): BotReply
  ```
- `reminderPush` buttons: `[{ text: '✅ Selesai', token: 'pr:done:' + r.id }, { text: '😴 +15 mnt', token: 'pr:snooze:' + r.id + ':15' }, { text: '😴 +1 jam', token: 'pr:snooze:' + r.id + ':60' }]`.

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from 'vitest'
import { taskList, reminderPush, agenda } from './replies-productivity'

const TZ = 'Asia/Jakarta'

it('taskList numbers items and marks priority', () => {
  const r = taskList(
    [{ id: 'a', title: 'Review PRD', status: 'todo', priority: 'high', dueAt: null } as any],
    'open', TZ)
  expect(r.text).toMatch(/1\..*Review PRD/)
  expect(r.text).toMatch(/‼️|🔴|!/)
})

it('reminderPush returns three action buttons with pr: tokens', () => {
  const { buttons } = reminderPush({ id: 'x1', message: '⏰ bayar listrik' } as any, TZ)
  expect(buttons.map((b) => b.token)).toEqual(['pr:done:x1', 'pr:snooze:x1:15', 'pr:snooze:x1:60'])
})

it('agenda shows an empty-state line when nothing is due', () => {
  const r = agenda([], [], TZ, 'Selasa, 8 September 2026')
  expect(r.text).toMatch(/tidak ada|kosong|santai/i)
})
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement.** Perhatikan styling: judul tebal, list pakai `1.` `2.`, ikon `⬜`/`🔧`/`✅` untuk status, `🔴`/`🟡`/`⚪` prioritas, waktu via `formatDateTime(dueAt, tz)`. Empty-state ramah ("Agenda kamu kosong hari ini — santai dulu ☕").
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit**

```bash
git add src/shared/bot/replies-productivity.ts src/shared/bot/replies-productivity.test.ts
git commit -m "feat(bot): productivity reply copy"
```

---

### Task 8: `flow-productivity.ts` — eksekusi command

**Files:**
- Create: `src/shared/bot/flow-productivity.ts`
- Test: `src/shared/bot/flow-productivity.test.ts`

**Interfaces:**
- Consumes: `ProductivityCommand` (Task 6); `admin-data-productivity` (Task 4); `replies-productivity` (Task 7); `getUserTimezone`, `getPlannerPrefs`; `getScanHints`-style "last list" cache — reminder butuh ingatan "list terakhir" untuk resolve `ref` nomor. Simpan di `users/{uid}/meta/plannerLastList` = `{ ids: string[], filter, at }` (client-deny di rules — sudah tercakup pola `meta/*` yang ada; tambah ke daftar deny kalau perlu). `getTaskByIndex` (Task 4) baca dokumen ini.
- Produces: `handleProductivityCommand(userId: string, cmd: ProductivityCommand): Promise<BotReply>`.

**Perilaku per kind:**
- `task_add`: `createTask` → kalau `when` ada, `createReminder(kind:'standalone'... )`? Tidak — task punya `dueAt`; set `updateTask(dueAt)` lalu `upsertTaskReminder(userId, task, prefs.taskLeadsMinutes)`. Balas `taskCreated(task, tz, firstReminderAt)`.
- `task_list` / `agenda`: `listTasks` → simpan `plannerLastList` → `taskList`/`agenda` (agenda juga tarik `dueRemindersPage`-scoped-to-user? tidak — query `reminders` where `remindAt` di rentang hari ini via helper baru `listRemindersForDay`).
- `task_done`: `getTaskByIndex` → `updateTask(status:'done', doneAt:now)` → `cancelRemindersForTask` → `taskDone`. Ref tak ketemu → `taskRefNotFound`.
- `task_rm`: `getTaskByIndex` → delete → `cancelRemindersForTask` → `taskRemoved`.
- `note_add`: `createNote({ content: text, source })` (title dari baris pertama) → `noteSaved`.
- `note_search`: `searchNotes` → `noteSearchResult`.
- `reminder_add`: `createReminder(kind:'standalone', message, remindAt: when.at, recurrence: when.recurrence)` → `reminderSet`.
- `snooze` (dari `/tunda N`): butuh "reminder terakhir yang dikirim ke user ini". Simpan `users/{uid}/meta/plannerLastPush = { reminderId, at }` saat cron kirim (Task 10). `snooze` tanpa ref → baca dokumen itu → `createReminder` baru `remindAt = now + N menit`, `message` sama. Balas `snoozed`.
- `mark_done_token`: reminder → kalau `kind==='task'` → tandai task done; else tandai reminder `sent` + balas konfirmasi.
- `none`: **jangan** balas di sini — return sentinel supaya `dispatchText` lanjut ke handler lain (lihat Task 9). Bentuk: `handleProductivityCommand` return `null` untuk `none`, tipe jadi `Promise<BotReply | null>`.

- [ ] **Step 1: Failing test** (mock `admin-data-productivity`)

```ts
import { describe, it, expect, vi } from 'vitest'
import { handleProductivityCommand } from './flow-productivity'

vi.mock('./admin-data-productivity', () => ({
  createTask: vi.fn(async () => ({ id: 't1', title: 'Review PRD', status: 'todo', priority: 'high', dueAt: null })),
  updateTask: vi.fn(async (_u, _id, patch) => ({ id: 't1', title: 'Review PRD', status: 'todo', priority: 'high', dueAt: patch.dueAt })),
  upsertTaskReminder: vi.fn(async () => {}),
  getPlannerPrefs: vi.fn(async () => ({ taskLeadsMinutes: [0, 60], digestHour: 7, digestEnabled: true })),
}))
vi.mock('./admin-data', () => ({ getUserTimezone: vi.fn(async () => 'Asia/Jakarta') }))

it('task_add creates a task and schedules its reminder', async () => {
  const when = { at: new Date('2026-09-09T08:00:00Z'), recurrence: null, timeWasImplicit: false }
  const reply = await handleProductivityCommand('u1', { kind: 'task_add', title: 'Review PRD', when, priority: 'high' })
  expect(reply?.text).toMatch(/Review PRD/)
  const mod = await import('./admin-data-productivity')
  expect(mod.upsertTaskReminder).toHaveBeenCalled()
})

it('none → returns null so the dispatcher can fall through', async () => {
  expect(await handleProductivityCommand('u1', { kind: 'none' })).toBeNull()
})
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** semua cabang.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit**

```bash
git add src/shared/bot/flow-productivity.ts src/shared/bot/flow-productivity.test.ts
git commit -m "feat(bot): execute productivity commands against the data layer"
```

---

### Task 9: Sambung ke `core.ts` `dispatchText` + token `pr:*`

**Files:**
- Modify: `src/shared/bot/core.ts` (`dispatchText`, `handleIncoming` token branch)
- Modify: `src/shared/bot/parse-intent.ts` (`READ_COMMANDS` — daftarkan `/agenda`, `/tugas`, `/catatan` supaya tidak nyasar ke `handleTextTransaction`)
- Modify: `src/shared/bot/replies.ts` (`help()` — blok "🗓 Produktivitas")
- Test: `src/shared/bot/core.test.ts` (tambah case)

**Interfaces:**
- Consumes: `parseProductivityCommand`, `parseProductivityToken`, `PRODUCTIVITY_TOKEN_PREFIX` (Task 6); `handleProductivityCommand` (Task 8); `getUserTimezone`.

**Perubahan `dispatchText` (urutan baru — sisip sebelum `parseCommandArgs`):**
```ts
async function dispatchText(userId: string, text: string): Promise<BotReply> {
  const trimmed = text.trim()
  if (!trimmed) return replies.unknownMessage()
  if (trimmed.startsWith('rv:')) return replies.reviewExpired()
  if (trimmed.startsWith(PRODUCTIVITY_TOKEN_PREFIX)) {
    return handleProductivityCommand(userId, parseProductivityToken(trimmed))
      .then((r) => r ?? replies.reviewExpired())
  }

  const prefsCommand = parsePrefsCommand(trimmed)
  if (prefsCommand.kind !== 'none') { /* unchanged */ }

  const tz = await getUserTimezone(userId)
  const planCmd = parseProductivityCommand(trimmed, new Date(), tz)
  if (planCmd.kind !== 'none') {
    const answer = await handleProductivityCommand(userId, planCmd)
    if (answer) return answer
  }

  const parsed = parseCommandArgs(trimmed)
  // ... rest unchanged ...
}
```

**Token di `handleIncoming`:** sejajar `unlink:*` / `skip_recurring:*` — kalau body diawali `pr:`, route ke `dispatchText` (yang sudah menangani via cabang di atas) atau langsung `handleProductivityCommand`. Cukup lewat `dispatchText`.

- [ ] **Step 1: Failing test**

```ts
// src/shared/bot/core.test.ts — tambahan
it('routes /tugas to the productivity flow, not the transaction parser', async () => {
  // mock handleProductivityCommand to a sentinel reply
  const reply = await handleIncoming({ platform: 'telegram', externalId: '5', text: '/tugas' } as any)
  expect(reply.text).toMatch(/tugas/i)
  // assert parseTransactionBatch was NOT called
})

it('pr:done:<id> token is handled without hitting the transaction path', async () => {
  const reply = await handleIncoming({ platform: 'telegram', externalId: '5', text: 'pr:done:abc' } as any)
  expect(reply.text).toBeTruthy()
})
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Wire** the branch; add `help()` block; add read-commands.
- [ ] **Step 4: Run** full bot suite `npx vitest run src/shared/bot` → semua hijau (regressions caught here).
- [ ] **Step 5: Gates + commit**

```bash
git add src/shared/bot/core.ts src/shared/bot/parse-intent.ts src/shared/bot/replies.ts src/shared/bot/core.test.ts
git commit -m "feat(bot): dispatch productivity commands and pr: action tokens"
```

---

### Task 10: `POST /api/cron/reminders` — consumer pengingat

**Files:**
- Create: `src/app/api/cron/reminders/route.ts`
- Test: `src/app/api/cron/reminders/route.test.ts`

**Interfaces:**
- Creates: `src/shared/bot/reminder-engine.ts` (fungsi murni — dipakai lagi oleh Task 11). Dibuat di task ini, bukan lebih awal, karena Task 10 adalah konsumen pertamanya.
- Creates: `src/shared/bot/cron-auth.ts` — `authorizeCron(req: Request): boolean` (bandingkan `Authorization: Bearer <secret>` dg `process.env.PRODUCTIVITY_CRON_SECRET` via `crypto.timingSafeEqual`, length-guard dulu). Dipakai lagi oleh Task 11.
- Consumes: `admin-data-productivity` (`reapStuckSending`, `dueRemindersPage`, `claimReminder`, `markReminderSent`, `markReminderFailed`, `recordCronRun`, `createReminder` untuk roll recurrence); `sendToUser` (Task 5).
- Produces: route handler. `export const runtime = 'nodejs'`, `export const maxDuration = 60`, `export const dynamic = 'force-dynamic'`.

**`reminder-engine.ts` (dibuat di task ini):**
```ts
import type { Reminder } from '@/shared/types/productivity'

const DAY_MS = 86_400_000
export function reaperCutoff(now: Date): Date { return new Date(now.getTime() - 5 * 60_000) }
export function backoffDelayMs(attempts: number): number {
  return Math.min(30 * 60_000, 60_000 * 2 ** Math.max(0, attempts - 1)) // 1m,2m,4m,8m,16m,cap 30m
}
export const MAX_ATTEMPTS = 5
/** kemunculan berikutnya setelah `from`, atau null kalau lewat `until` / tidak berulang */
export function rollRecurrence(r: Pick<Reminder,'recurrence'|'remindAt'>, from: Date): Date | null {
  if (!r.recurrence) return null
  const base = r.remindAt.toDate()
  let next = new Date(base)
  for (let i = 0; i < 400; i++) {
    if (r.recurrence.freq === 'daily') next = new Date(next.getTime() + DAY_MS)
    else if (r.recurrence.freq === 'weekday') {
      do { next = new Date(next.getTime() + DAY_MS) } while (next.getUTCDay() === 0 || next.getUTCDay() === 6)
    } else { // weekly
      next = new Date(next.getTime() + 7 * DAY_MS)
    }
    if (next > from) break
  }
  if (r.recurrence.until && next > r.recurrence.until.toDate()) return null
  return next
}
```
*(Catatan `weekday`/`weekly` pakai `getUTCDay`; karena `remindAt` sudah UTC-instant dari waktu-dinding lokal, pergeseran DST tidak berlaku untuk `Asia/Jakarta` — zona target repo. `ponytail: UTC-day arithmetic, tambah tz-aware roll kalau nanti dukung zona ber-DST`.)*

**Alur handler:**
```ts
export async function POST(req: Request) {
  if (!authorizeCron(req)) return new Response('unauthorized', { status: 401 })
  const started = Date.now(); const now = new Date()
  const reaped = await reapStuckSending(reaperCutoff(now))
  const due = await dueRemindersPage(now, 25)
  let sent = 0, failed = 0
  for (const { ref } of due) {
    const claimed = await claimReminder(ref)
    if (!claimed) continue
    const res = await sendToUser(claimed.ownerId, claimed.message, /* buttons from replies-productivity.reminderPush */)
    if (res.ok) {
      const next = rollRecurrence(claimed, now)
      await markReminderSent(ref, { rolledAt: next })
      if (next) await createReminder(claimed.ownerId, { message: claimed.message, remindAt: next, recurrence: toDto(claimed.recurrence), source: 'auto' }, { kind: claimed.kind, taskId: claimed.taskId })
      // simpan meta/plannerLastPush utk /tunda
      sent++
    } else {
      const attempts = claimed.attempts
      const giveUp = attempts >= MAX_ATTEMPTS
      await markReminderFailed(ref, res.error ?? 'send failed', giveUp ? null : new Date(now.getTime() + backoffDelayMs(attempts)))
      failed++
    }
  }
  await recordCronRun({ endpoint: 'reminders', startedAt: now, claimed: due.length, sent, failed, durationMs: Date.now() - started })
  return Response.json({ ok: true, reaped, claimed: due.length, sent, failed })
}
```

`src/shared/bot/cron-auth.ts`:
```ts
import crypto from 'node:crypto'
export function authorizeCron(req: Request): boolean {
  const secret = process.env.PRODUCTIVITY_CRON_SECRET ?? ''
  const got = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!secret || got.length !== secret.length) return false
  return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(secret))
}
```
Handler memakai `if (!authorizeCron(req)) return new Response('unauthorized', { status: 401 })`.

- [ ] **Step 1: Failing test — `reminder-engine`**

```ts
// src/shared/bot/reminder-engine.test.ts
import { describe, it, expect } from 'vitest'
import { backoffDelayMs, rollRecurrence, reaperCutoff, MAX_ATTEMPTS } from './reminder-engine'

it('backoff doubles and caps at 30m', () => {
  expect(backoffDelayMs(1)).toBe(60_000)
  expect(backoffDelayMs(3)).toBe(240_000)
  expect(backoffDelayMs(20)).toBe(1_800_000)
})
it('rollRecurrence daily lands on the next occurrence after `from`', () => {
  const r = { recurrence: { freq: 'daily', until: null } as any,
    remindAt: { toDate: () => new Date('2026-09-08T00:00:00Z') } as any }
  const next = rollRecurrence(r, new Date('2026-09-09T10:00:00Z'))
  expect(next?.toISOString()).toBe('2026-09-10T00:00:00.000Z')
})
it('rollRecurrence returns null past `until`', () => {
  const r = { recurrence: { freq: 'daily', until: { toDate: () => new Date('2026-09-08T12:00:00Z') } } as any,
    remindAt: { toDate: () => new Date('2026-09-08T00:00:00Z') } as any }
  expect(rollRecurrence(r, new Date('2026-09-09T00:00:00Z'))).toBeNull()
})
it('non-recurring → null', () => {
  expect(rollRecurrence({ recurrence: null, remindAt: { toDate: () => new Date() } as any }, new Date())).toBeNull()
})
```

- [ ] **Step 2: Run → FAIL.** Implement `reminder-engine.ts`. Run → PASS.

- [ ] **Step 3: Failing test — route auth + claim/send**

```ts
// src/app/api/cron/reminders/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const env = { PRODUCTIVITY_CRON_SECRET: 's3cr3t-of-correct-length-000000' }
beforeEach(() => { Object.assign(process.env, env) })

vi.mock('@/shared/bot/admin-data-productivity', () => ({
  reapStuckSending: vi.fn(async () => 0),
  dueRemindersPage: vi.fn(async () => [{ ref: { id: 'r1' }, data: {} }]),
  claimReminder: vi.fn(async () => ({ id: 'r1', ownerId: 'u1', message: 'hai', attempts: 1, recurrence: null, kind: 'standalone', taskId: null })),
  markReminderSent: vi.fn(async () => {}),
  markReminderFailed: vi.fn(async () => {}),
  createReminder: vi.fn(async () => ({})),
  recordCronRun: vi.fn(async () => {}),
}))
vi.mock('@/shared/bot/outbound', () => ({ sendToUser: vi.fn(async () => ({ ok: true, sent: 1 })) }))

import { POST } from './route'

it('401 without the bearer secret', async () => {
  const res = await POST(new Request('http://x/api/cron/reminders', { method: 'POST' }))
  expect(res.status).toBe(401)
})

it('claims and sends a due reminder with the secret', async () => {
  const res = await POST(new Request('http://x/api/cron/reminders', {
    method: 'POST', headers: { authorization: `Bearer ${env.PRODUCTIVITY_CRON_SECRET}` } }))
  const body = await res.json()
  expect(body).toMatchObject({ ok: true, sent: 1, failed: 0 })
})

it('a failed send marks the reminder failed with a backoff', async () => {
  const { sendToUser } = await import('@/shared/bot/outbound')
  ;(sendToUser as any).mockResolvedValueOnce({ ok: false, sent: 0, error: 'gowa 500' })
  const res = await POST(new Request('http://x/api/cron/reminders', {
    method: 'POST', headers: { authorization: `Bearer ${env.PRODUCTIVITY_CRON_SECRET}` } }))
  const { markReminderFailed } = await import('@/shared/bot/admin-data-productivity')
  expect(markReminderFailed).toHaveBeenCalled()
  expect((await res.json()).failed).toBe(1)
})
```

- [ ] **Step 4: Run → FAIL. Implement `route.ts`. Run → PASS.**
- [ ] **Step 5: Gates + commit**

```bash
git add src/shared/bot/reminder-engine.ts src/shared/bot/reminder-engine.test.ts src/shared/bot/cron-auth.ts src/app/api/cron/reminders/route.ts src/app/api/cron/reminders/route.test.ts
git commit -m "feat(cron): reminder consumer endpoint with atomic claim and retry backoff"
```

---

### Task 11: `POST /api/cron/daily-digest` — rekap pagi

**Files:**
- Create: `src/app/api/cron/daily-digest/route.ts`
- Test: `src/app/api/cron/daily-digest/route.test.ts`
- Modify: `src/shared/bot/reminder-engine.ts` (+`digestBody`)

**Interfaces:**
- Consumes: `usersDueForDigest`, `markDigestSent`, `listTasks`, `listRemindersForDay`, `recordCronRun` (Task 4); `sendToUser` (Task 5); `dayKeyInTz`, `formatDayLong` (`@/shared/lib/format`).
- Consumes: `authorizeCron` dari `@/shared/bot/cron-auth` (dibuat di Task 10).
- Produces in engine: `digestBody(tasks: Task[], reminders: Reminder[], tz: string, dayLabel: string): string`.

**Alur:** `usersDueForDigest(now)` → untuk tiap `{ userId, tz }`: `dayKey = dayKeyInTz(now, tz)`; `listTasks(userId, 'today', tz)` + `listRemindersForDay(userId, now, tz)`; kalau dua-duanya kosong **dan** user set "skip kalau kosong" → lewati; else `sendToUser(userId, digestBody(...))` → `markDigestSent(userId, dayKey)`. Batasi 50 user per panggilan; heartbeat 15-menit-an akan menyapu sisanya di jendela `digestHour:00–14`.

- [ ] **Step 1: Failing test — `digestBody`**

```ts
import { digestBody } from './reminder-engine'
it('digestBody summarises counts and lists titles', () => {
  const body = digestBody(
    [{ title: 'Review PRD', dueAt: null } as any, { title: 'Kirim invoice', dueAt: null } as any],
    [{ message: 'Rapat tim', remindAt: { toDate: () => new Date('2026-09-08T07:00:00Z') } } as any],
    'Asia/Jakarta', 'Selasa, 8 September 2026')
  expect(body).toMatch(/2 tugas/)
  expect(body).toMatch(/1 pengingat/)
  expect(body).toMatch(/Review PRD/)
})
```

- [ ] **Step 2: Run → FAIL. Implement. Run → PASS.**

- [ ] **Step 3: Failing test — route** (mirror Task 10: 401 tanpa secret; kirim digest + `markDigestSent` dipanggil; user yang `lastSentDayKey == today` dilewati).

- [ ] **Step 4: Run → FAIL. Implement `route.ts` (`runtime='nodejs'`, `maxDuration=60`). Run → PASS.**

- [ ] **Step 5: Gates + commit**

```bash
git add src/shared/bot/reminder-engine.ts src/shared/bot/reminder-engine.test.ts src/app/api/cron/daily-digest/route.ts src/app/api/cron/daily-digest/route.test.ts
git commit -m "feat(cron): morning digest endpoint"
```

---

### Task 12: Heartbeat ticker di `go-whatsapp-web-multidevice`

**Files (repo `go-whatsapp-web-multidevice/`):**
- Create: `src/pkg/heartbeat/heartbeat.go`
- Modify: titik startup REST (`src/cmd/rest.go` — tempat `app.Listen(...)` dipanggil; jalankan `go heartbeat.Start(ctx, cfg)` sebelum listen). Konfirmasi nama file/fungsi persisnya saat eksekusi (`grep -rn "app.Listen\|fiber.New" src/cmd`).
- Modify: `src/config/settings.go` (tambah 3 setting) + `.env` + `docs`/`README`.
- Test: `src/pkg/heartbeat/heartbeat_test.go`

**Interfaces:**
- `func Start(ctx context.Context, cfg Config)` — non-blocking; spawn goroutine `time.NewTicker(cfg.Interval)`; tiap tick `POST cfg.RemindersURL` lalu `POST cfg.DigestURL` (digest tiap tick ke-15 saja — hitung modulo, atau ticker kedua 15×interval), header `Authorization: Bearer <cfg.Secret>`, timeout 30s, body kosong. Log hasil di level debug; error tidak fatal (heartbeat tidak boleh matikan gateway).
- `Config{ RemindersURL, DigestURL, Secret string; Interval time.Duration; Enabled bool }` dari env:
  - `PRODUCTIVITY_CRON_URL` (base, mis. `https://<vercel-app>/api/cron`) → `RemindersURL = base + "/reminders"`, `DigestURL = base + "/daily-digest"`.
  - `PRODUCTIVITY_CRON_SECRET`.
  - `PRODUCTIVITY_CRON_INTERVAL` (default `60s`).
  - kosong `PRODUCTIVITY_CRON_URL` → `Enabled = false`, `Start` langsung `return` (fitur opt-in).

- [ ] **Step 1: Failing test**

```go
// src/pkg/heartbeat/heartbeat_test.go
package heartbeat

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

func TestTickerPostsWithBearer(t *testing.T) {
	var hits int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer test-secret" {
			t.Errorf("missing bearer, got %q", r.Header.Get("Authorization"))
		}
		atomic.AddInt32(&hits, 1)
		w.WriteHeader(200)
	}))
	defer srv.Close()

	ctx, cancel := context.WithCancel(context.Background())
	Start(ctx, Config{
		RemindersURL: srv.URL, DigestURL: srv.URL,
		Secret: "test-secret", Interval: 20 * time.Millisecond, Enabled: true,
	})
	time.Sleep(75 * time.Millisecond)
	cancel()
	if atomic.LoadInt32(&hits) < 2 {
		t.Fatalf("expected >=2 hits, got %d", hits)
	}
}

func TestDisabledDoesNothing(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	Start(ctx, Config{Enabled: false}) // must not panic, must not dial
}
```

- [ ] **Step 2: Run → FAIL** (`cd src && go test ./pkg/heartbeat/`).
- [ ] **Step 3: Implement `heartbeat.go`.** `Start` returns immediately; goroutine selects on `ctx.Done()` + `ticker.C`. Use `http.Client{Timeout: 30*time.Second}`. Digest cadence: counter `n++`, call digest when `n%15==0`.
- [ ] **Step 4: Run → PASS.** `go build ./...` clean.
- [ ] **Step 5: Wire into REST startup** + add settings + `.env` keys + doc line. `go build ./...`.
- [ ] **Step 6: Commit** (in the Go repo)

```bash
git add src/pkg/heartbeat/ src/cmd/rest.go src/config/settings.go
git commit -m "feat: productivity cron heartbeat posting to Finance-FE reminder endpoints"
```

---

### Task 13: Repository Firestore sisi web (client SDK)

**Files:**
- Create: `src/shared/repositories/firestore/FirestoreTaskRepository.ts`, `FirestoreNoteRepository.ts`, `FirestoreReminderRepository.ts`
- Modify: `src/shared/repositories/index.ts` (registrasi)
- Test: `src/shared/repositories/firestore/FirestoreTaskRepository.test.ts` (+ note, + reminder)

**Interfaces:**
- Ikuti persis pola repo Firestore yang sudah ada (mis. `FirestoreTransactionRepository`) — konstruktor terima `db` + `userId`, method balik domain type, konversi `Timestamp`.
- `TaskRepository`: `create(dto)`, `update(id, patch)`, `remove(id)`, `list(filter)`, `watch(cb)` (onSnapshot untuk realtime di web — PRD Skenario 1).
- `NoteRepository`: `create`, `update`, `remove`, `list`, `watch`.
- `ReminderRepository`: `create` (standalone only dari web), `listUpcoming`, `cancel(id)` (set `status:'cancelled'`), `watch`.
- Client **tidak** menulis `attempts`/`status` selain `cancelled` (rules Task 1 menegakkan).

- [ ] **Step 1: Failing test** (pakai `@firebase/rules-unit-testing` kalau sudah ada di devDeps; kalau tidak, mock `firebase/firestore` seperti test repo lain).

```ts
it('create() writes status=todo and returns the new id', async () => {
  const repo = new FirestoreTaskRepository(fakeDb, 'u1')
  const t = await repo.create({ title: 'Tulis laporan', source: 'web' })
  expect(t.status).toBe('todo')
  expect(t.id).toBeTruthy()
})
```

- [ ] **Step 2–4:** FAIL → implement 3 repos → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/shared/repositories/firestore/Firestore{Task,Note,Reminder}Repository.ts src/shared/repositories/firestore/*.test.ts src/shared/repositories/index.ts
git commit -m "feat(planner): firestore repositories for tasks, notes and reminders"
```

---

### Task 14: Use-cases web (`src/shared/use-cases/planner/`)

**Files:**
- Create: `CreateTask.usecase.ts`, `UpdateTaskStatus.usecase.ts`, `SetTaskDue.usecase.ts`, `CreateNote.usecase.ts`, `SearchNotes.usecase.ts`, `CreateReminder.usecase.ts`, `CancelReminder.usecase.ts` + `.test.ts` masing-masing
- Follow existing use-case pattern (mis. folder `use-cases/transactions/`).

**Interfaces:**
- `SetTaskDue`: update task `dueAt` **dan** panggil repo reminder untuk upsert reminder task (mirror `upsertTaskReminder` bot-side, tapi client SDK). Karena client tak boleh set field mesin, reminder dibuat dengan `status:'pending', attempts:0` (diizinkan rules).
- `SearchNotes`: client-side filter atas `list()` (sama alasan dg bot-side).
- Validasi input pakai Zod (sudah dependency): `title` 1–200, `content` ≤ 20k, dst.

- [ ] **Step 1–4 per use-case:** failing test (validasi + happy path) → implement → pass. Contoh:

```ts
it('CreateTask rejects an empty title', async () => {
  await expect(new CreateTask(repo).exec({ title: '  ', source: 'web' }))
    .rejects.toThrow(/judul|title/i)
})
it('SetTaskDue upserts a reminder at due minus default lead', async () => {
  await new SetTaskDue(taskRepo, reminderRepo).exec('t1', new Date('2026-09-10T08:00:00Z'), [60])
  expect(reminderRepo.create).toHaveBeenCalledWith(expect.objectContaining({
    remindAt: new Date('2026-09-10T07:00:00Z') }))
})
```

- [ ] **Step 5: Commit**

```bash
git add src/shared/use-cases/planner/
git commit -m "feat(planner): web use-cases for tasks, notes and reminders"
```

---

### Task 15: Store + halaman Tugas

**Files:**
- Create: `src/shared/stores/planner.store.ts` (Zustand — `tasks`, `loading`, `subscribe()`, actions)
- Create: `src/modules/planner/PlannerPage.tsx`, `TaskRow.tsx`, `QuickAddBar.tsx`, `TaskDueDialog.tsx`
- Create: `src/app/(main)/planner/page.tsx`
- Modify: nav (`src/app/(main)/layout.tsx` atau komponen sidebar) — menu "Tugas"
- Test: `src/modules/planner/PlannerPage.test.tsx` (Testing Library — render, quick-add memanggil use-case, ganti status)

**Interfaces:**
- `QuickAddBar`: satu input; on submit → `parseWhen` (reuse!) untuk nangkap "besok jam 3" di teks web juga → `CreateTask` + optional `SetTaskDue`.
- 3 kolom / filter chip: `todo` · `doing` · `done`. Dropdown status per baris → `UpdateTaskStatus`.
- Realtime: `planner.store` subscribe via `repo.watch` → PRD Skenario 1 ("muncul real-time di web").

- [ ] **Step 1: Failing test**

```tsx
it('typing a task and submitting calls CreateTask', async () => {
  render(<PlannerPage />)
  await userEvent.type(screen.getByPlaceholderText(/tambah tugas/i), 'Review PRD besok jam 3 sore{enter}')
  expect(createTaskSpy).toHaveBeenCalledWith(expect.objectContaining({ title: 'Review PRD' }))
})
```

- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Gates + commit**

```bash
git add src/shared/stores/planner.store.ts src/modules/planner/ "src/app/(main)/planner/" src/app/\(main\)/layout.tsx
git commit -m "feat(planner): tasks page with quick-add and realtime updates"
```

---

### Task 16: Halaman Catatan

**Files:**
- Create: `src/modules/notes/NotesPage.tsx`, `NoteEditor.tsx` (reuse editor Markdown yang sudah dipakai di modul lain — cek `src/modules/**` untuk `textarea`+preview yang ada; jangan tambah lib), `NoteList.tsx`, `TagFilter.tsx`, `NoteSearchBar.tsx`
- Create: `src/app/(main)/notes/page.tsx`
- Modify: nav — menu "Catatan"
- Test: `src/modules/notes/NotesPage.test.tsx`

**Interfaces:**
- `NoteSearchBar` → `SearchNotes` use-case (debounce 250ms).
- `TagFilter` → filter client-side atas store.
- Simpan on blur / Ctrl+S → `CreateNote` / update.

- [ ] **Step 1: Failing test** (render list, ketik di search → daftar menyusut).
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/modules/notes/ "src/app/(main)/notes/"
git commit -m "feat(notes): notes page with markdown editor, tags and search"
```

---

### Task 17: Panel Pengingat + integrasi Settings

**Files:**
- Create: `src/modules/planner/RemindersPanel.tsx` (daftar pengingat mendatang + tombol batal + daftar "gagal terkirim" untuk `status:'failed'`)
- Modify: `src/modules/settings/` — bagian "Pengingat & Produktivitas": `digestHour` (select 0–23), `digestEnabled` (switch), `taskLeadsMinutes` (multi-select preset: tepat waktu / 15m / 1j / 1h). Simpan ke `users/{uid}/meta/plannerPrefs` **dan** update `bot_meta/digestRoster` (lihat Task 4 catatan) — lewat use-case `UpdatePlannerPrefs`.
- Modify: `firestore.rules` — `meta/plannerPrefs` boleh ditulis client (default subtree `users/{uid}` sudah mengizinkan; hanya pastikan tidak masuk daftar deny). `bot_meta/digestRoster` deny-all client → update roster harus lewat route handler kecil `POST /api/planner/prefs` (Admin SDK, auth via session JWT `jose` seperti route lain). Tambah task step untuk endpoint ini.
- Test: `RemindersPanel.test.tsx`, `settings` test tambahan, `route.test.ts` untuk `/api/planner/prefs`.

**Interfaces:**
- `POST /api/planner/prefs` body `{ digestHour, digestEnabled, taskLeadsMinutes }` → verifikasi JWT → tulis `meta/plannerPrefs` + upsert/hapus entri `bot_meta/digestRoster[uid]`. `runtime='nodejs'`.

- [ ] **Step 1: Failing test — route**

```ts
it('rejects an unauthenticated prefs update', async () => {
  const res = await POST(new Request('http://x/api/planner/prefs', { method: 'POST', body: '{}' }))
  expect(res.status).toBe(401)
})
it('persists prefs and updates the digest roster', async () => {
  const res = await POST(authed({ digestHour: 6, digestEnabled: true, taskLeadsMinutes: [0, 60] }))
  expect(res.status).toBe(200)
  expect(setPlannerPrefs).toHaveBeenCalled()
  expect(upsertDigestRoster).toHaveBeenCalledWith('u1', expect.objectContaining({ digestHour: 6 }))
})
```

- [ ] **Step 2–4:** FAIL → implement route + panel + settings UI → PASS.
- [ ] **Step 5: Gates + commit**

```bash
git add src/modules/planner/RemindersPanel.tsx src/modules/settings/ "src/app/api/planner/prefs/" firestore.rules
git commit -m "feat(planner): reminders panel and productivity settings"
```

---

### Task 18: Dokumentasi + `.env` + review akhir

**Files:**
- Modify: `README.md` (Finance-FE) — bagian baru "Productivity Suite (Tugas · Catatan · Pengingat)": modul, koleksi Firestore, endpoint `POST /api/cron/reminders` + `POST /api/cron/daily-digest` + `POST /api/planner/prefs`, env `PRODUCTIVITY_CRON_SECRET`, dan catatan bahwa **heartbeat dijalankan oleh `go-whatsapp-web-multidevice`** (bukan Vercel Cron), dengan env `PRODUCTIVITY_CRON_URL` / `PRODUCTIVITY_CRON_SECRET` / `PRODUCTIVITY_CRON_INTERVAL` di sisi Go.
- Modify: `go-whatsapp-web-multidevice/README.md` atau `docs/` — subsection "Productivity cron heartbeat" + 3 env.
- Modify: `.env.example` (Finance-FE) — pastikan `PRODUCTIVITY_CRON_SECRET` ada + komentar.
- Verify: daftar command bot di `replies.ts` `help()` cocok dengan yang di-parse `productivity-commands.ts`.

- [ ] **Step 1:** Update `README.md` Finance-FE.
- [ ] **Step 2:** Update Go repo docs.
- [ ] **Step 3:** Grep sanity: `grep -rn "TODO\|FIXME\|placeholder" src/shared/bot/*productivity* src/app/api/cron` → kosong.
- [ ] **Step 4: Full gates**

Run: `npx vitest run` (seluruh suite hijau), `npx tsc --noEmit`, `npx next lint --dir src`.
Go: `cd ../go-whatsapp-web-multidevice/src && go build ./... && go test ./...`.

- [ ] **Step 5: Commit**

```bash
git add README.md .env.example
git commit -m "docs: document the productivity suite and its cron heartbeat"
```

---

## §8 Self-Review

**1. Spec coverage** (PRD lama → task):

| Kebutuhan PRD | Task |
|---|---|
| Identity mapping Web↔Bot | Sudah ada (`bot_links`) — §0, Global Constraints. Tidak ada task (memang tidak perlu) |
| CRUD Task di web | Task 13, 14, 15 |
| CRUD Task via bot (`/task add`, `/task done`, list) | Task 6, 8, 9 |
| Catatan cepat + cari via bot (`/note`, `/note search`) | Task 6, 8, 9 |
| Catatan di web + tag | Task 13, 14, 16 |
| Pengingat berbasis waktu → dikirim ke chat | Task 4, 5, 10, 12 |
| Konfirmasi setelah buat (PRD Skenario 1) | `taskCreated` reply — Task 7, 8 |
| Real-time muncul di web (PRD Skenario 1) | `repo.watch` / store subscribe — Task 13, 15 |
| Cron deteksi jatuh tempo → webhook → bot kirim (PRD Skenario 2) | Task 10 (consumer) + Task 12 (heartbeat Go) |
| Producer–Consumer, `status`, `retry_count` | Task 4 (`status` enum + `attempts` + `nextAttemptAt`), Task 10 (`claimReminder` = SKIP LOCKED, `backoffDelayMs`) |
| Retry mechanism | Task 10 (`MAX_ATTEMPTS`, backoff, `failed` terminal + tampil di web Task 17) |
| Snooze | Task 6, 8 (`/tunda`, token `pr:snooze`) |
| Rekap harian ("3 tugas dan 2 jadwal hari ini") | Task 11 |
| Prioritas tugas | tipe `TaskPriority` Task 1, parse `!high` Task 6, tampil Task 7/15 |
| Notifikasi kontekstual bergaya WA/Telegram | Task 7 (styling), Task 5 (HTML parse_mode / tombol inline) |
| Hapus auto-reply default | Sudah dikerjakan di branch bot sebelumnya (`WHATSAPP_AUTO_REPLY=""`) — di luar scope ini |
| Kalender / `/event` / RRULE penuh | §6 Ditunda — eksplisit bukan celah |

**2. Placeholder scan:** tidak ada "TBD/implement later". Setiap step kode punya blok kode nyata atau aturan eksplisit (Task 3 langkah 3 = daftar aturan parse terperinci, bukan "parse the date"). Task 12 titik startup Go ditandai "konfirmasi `grep` saat eksekusi" — itu instruksi konkret, bukan placeholder, karena nomor baris file pihak ketiga tak bisa dipastikan dari sini.

**3. Konsistensi tipe:**
- `ReminderStatus` = `'pending' | 'sending' | 'sent' | 'failed' | 'cancelled'` dipakai konsisten: `claimReminder` set `'sending'`, `markReminderSent` → `'sent'`, `markReminderFailed` → `'failed'`, rules izinkan client hanya `'cancelled'`.
- `ParsedWhen` bentuknya sama di §5, Task 3, Task 6 (`when: ParsedWhen | null`), Task 8 (dipakai bikin `remindAt: when.at`).
- `ProductivityCommand` union: setiap `kind` yang di-parse Task 6 punya cabang di Task 8 `handleProductivityCommand`. `kind:'none'` → `null` (bukan `BotReply`) — tipe retur `Promise<BotReply | null>` konsisten di Task 8 & Task 9.
- `sendToUser` retur `{ ok; sent; error? }` — dipakai sama di Task 10 (`res.ok`) & Task 11.
- `rollRecurrence` terima `Pick<Reminder,'recurrence'|'remindAt'>`, retur `Date | null` — Task 10 pakai `next` sebagai `Date | null` konsisten.
- `EntrySource` = `'web'|'whatsapp'|'telegram'`; `Reminder.source` menambah `'auto'` (reminder hasil roll recurrence & reminder task otomatis) — didefinisikan di §5, dipakai Task 10 (`source:'auto'`).
- Env var: `PRODUCTIVITY_CRON_SECRET` (dua repo), `PRODUCTIVITY_CRON_URL`, `PRODUCTIVITY_CRON_INTERVAL` (Go only) — nama identik di Task 1, 10, 11, 12, 18.

**4. Urutan & dependency:** `reminder-engine.ts` dan `cron-auth.ts` dua-duanya dibuat di Task 10 (konsumen pertamanya); Task 11 tinggal `import`. Task 17 (`/api/planner/prefs`) juga `import` `authorizeCron` yang sama? Tidak — route itu pakai auth sesi JWT (`jose`), bukan secret cron; tidak ada ketergantungan ke Task 10. Task 13–18 (web UI) hanya butuh Task 1 + Task 4 selesai — bisa jalan paralel dengan Task 5–12.

**5. Ketaatan Global Constraints:** tanpa dependency baru (editor Markdown reuse, tidak ada lib cron/queue), Bahasa Indonesia untuk semua `replies-productivity` + UI, Firestore `runTransaction` bukan SQL lock, `stripUndefined` di semua tulisan Admin SDK, `timingSafeEqual` untuk secret cron, `runtime='nodejs'` + `maxDuration` di route handler, zona waktu selalu lewat `getUserTimezone`.

