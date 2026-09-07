## Task 11: Perintah Baru, Matikan Auto-Reply, Dokumentasi

R1 (perluasan fitur), R11 (hapus auto-reply), plus penutup dokumentasi.

**Files:**
- Modify: `src/shared/bot/parse-intent.ts` (`READ_COMMANDS`, `BotIntent`)
- Modify: `src/shared/bot/types.ts` (`BotIntent` baru)
- Modify: `src/shared/bot/core.ts` (`handleReadCommand`)
- Modify: `src/shared/bot/admin-data.ts` (`searchTransactions`, `getTransactionsBetween`)
- Modify: `src/shared/bot/replies.ts` (balasan perintah baru)
- Test: `src/shared/bot/core.test.ts`, `src/shared/bot/parse-intent.test.ts`
- Modify: `go-whatsapp-web-multidevice/src/.env`
- Modify: `BOT_SETUP_CHECKLIST.md`, `context.md` (kedua repo)

**Interfaces:**
- Produces: intent baru `today_summary`, `week_summary`, `search`, `undo`, `stats`
- Produces: `adminData.getTransactionsBetween(userId, from: Date, to: Date): Promise<Transaction[]>`, `adminData.searchTransactions(userId, keyword: string, limit?: number): Promise<Transaction[]>`

- [ ] **Step 1: Tulis test yang gagal**

Tambahkan ke `src/shared/bot/parse-intent.test.ts`:

```ts
describe('matchReadCommand — new commands', () => {
  it('matches the new read commands in both slash and bare form', () => {
    expect(matchReadCommand('/hariini')).toBe('today_summary')
    expect(matchReadCommand('hari ini')).toBe('today_summary')
    expect(matchReadCommand('/minggu')).toBe('week_summary')
    expect(matchReadCommand('/statistik')).toBe('stats')
    expect(matchReadCommand('/undo')).toBe('undo')
  })

  it('does not treat /cari as a bare read command — it carries an argument', () => {
    expect(matchReadCommand('/cari')).toBe('search')
    expect(matchReadCommand('/cari kopi')).toBeNull()
  })

  it('still matches every command that already existed', () => {
    expect(matchReadCommand('/ringkasan')).toBe('get_summary')
    expect(matchReadCommand('saldo')).toBe('get_balance')
  })
})
```

Dan ke `src/shared/bot/core.test.ts`:

```ts
describe('handleIncoming — /undo', () => {
  it('deletes the transactions from the last commit and clears the memory', async () => {
    getLastBatch.mockResolvedValue({ transactionIds: ['t1', 't2'], createdAt: {} })
    deleteTransactions.mockResolvedValue(2)

    const reply = await handleIncoming(textMsg({ text: '/undo' }))

    expect(deleteTransactions).toHaveBeenCalledWith('user-1', ['t1', 't2'])
    expect(clearLastBatch).toHaveBeenCalledWith('user-1')
    expect(reply.text).toContain('2 transaksi dibatalkan')
  })

  it('says so plainly when there is nothing to undo', async () => {
    getLastBatch.mockResolvedValue(null)
    const reply = await handleIncoming(textMsg({ text: '/undo' }))
    expect(deleteTransactions).not.toHaveBeenCalled()
    expect(reply.text).toContain('Tidak ada')
  })
})

describe('handleIncoming — /cari', () => {
  it('searches by keyword and lists what it found', async () => {
    searchTransactions.mockResolvedValue([
      { id: 't1', amount: 35000, categoryId: 'cat-food', type: 'expense', description: 'kopi susu', date: { toDate: () => new Date() } },
    ])
    const reply = await handleIncoming(textMsg({ text: '/cari kopi' }))
    expect(searchTransactions).toHaveBeenCalledWith('user-1', 'kopi', expect.any(Number))
    expect(reply.text).toContain('kopi susu')
  })

  it('asks for a keyword when /cari is sent bare', async () => {
    const reply = await handleIncoming(textMsg({ text: '/cari' }))
    expect(searchTransactions).not.toHaveBeenCalled()
    expect(reply.text).toContain('kata kunci')
  })

  it('reports an empty result rather than an empty list', async () => {
    searchTransactions.mockResolvedValue([])
    const reply = await handleIncoming(textMsg({ text: '/cari xyz' }))
    expect(reply.text).toContain('Tidak ada transaksi')
  })
})

describe('handleIncoming — /hariini', () => {
  it('sums only the transactions inside the user local day', async () => {
    getUserTimezone.mockResolvedValue('Asia/Jakarta')
    getTransactionsBetween.mockResolvedValue([
      { id: 't1', amount: 35000, type: 'expense', categoryId: 'cat-food', date: { toDate: () => new Date() } },
    ])
    const reply = await handleIncoming(textMsg({ text: '/hariini' }))
    expect(reply.text).toContain('Rp 35.000')
  })
})
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run src/shared/bot/parse-intent.test.ts src/shared/bot/core.test.ts`
Expected: FAIL — intent baru belum ada.

- [ ] **Step 3: Daftarkan intent baru**

Di `src/shared/bot/types.ts`, tambahkan ke union `BotIntent`: `'today_summary' | 'week_summary' | 'search' | 'undo' | 'stats'`.

Di `src/shared/bot/parse-intent.ts`, tambahkan ke `READ_COMMANDS` (sebelum entri `help`):

```ts
  { pattern: /^\/?(hariini|hari ini|today)$/i, intent: 'today_summary' },
  { pattern: /^\/?(minggu|mingguan|pekan|week)$/i, intent: 'week_summary' },
  { pattern: /^\/?(statistik|stats)$/i, intent: 'stats' },
  { pattern: /^\/?(undo|urungkan)$/i, intent: 'undo' },
  // Bare `/cari` only — with an argument it is handled before matchReadCommand runs.
  { pattern: /^\/?(cari|search)$/i, intent: 'search' },
```

- [ ] **Step 4: Query pendukung di `admin-data.ts`**

```ts
export async function getTransactionsBetween(userId: string, from: Date, to: Date): Promise<Transaction[]> {
  const snap = await getAdminDb()
    .collection(`users/${userId}/transactions`)
    .where('date', '>=', Timestamp.fromDate(from))
    .where('date', '<', Timestamp.fromDate(to))
    .orderBy('date', 'desc')
    .get()
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Transaction)
}

/**
 * Keyword search over descriptions. Firestore has no substring operator, so the recent
 * window is fetched and filtered in memory — bounded by `scanLimit`, which is what
 * keeps this from turning into a full-collection read as the ledger grows.
 */
export async function searchTransactions(
  userId: string,
  keyword: string,
  limit = 10,
  scanLimit = 500,
): Promise<Transaction[]> {
  const needle = keyword.trim().toLowerCase()
  if (!needle) return []

  const snap = await getAdminDb()
    .collection(`users/${userId}/transactions`)
    .orderBy('date', 'desc')
    .limit(scanLimit)
    .get()

  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as Transaction)
    .filter((tx) => (tx.description ?? '').toLowerCase().includes(needle))
    .slice(0, limit)
}
```

- [ ] **Step 5: Balasan untuk perintah baru**

Tambahkan ke `replies.ts`:

```ts
  periodSummary: (
    title: string,
    rows: { name: string; amount: number }[],
    total: number,
    count: number,
  ): BotReply => {
    if (count === 0) return reply(`${title}\n\nBelum ada transaksi tercatat di periode ini.`)
    const width = Math.max(...rows.map((r) => formatIDR(r.amount).length))
    const lines = rows.map((r) => `${escapeHtml(r.name)}  <code>${formatIDR(r.amount).padStart(width, ' ')}</code>`)
    return reply(
      [title, '', ...lines, '────────────────', `<b>Total  ${formatIDR(total)}</b>`, '', `<i>${count} transaksi</i>`].join('\n'),
    )
  },

  searchNeedsKeyword: (): BotReply =>
    reply('🔎 Sertakan kata kuncinya, mis. <code>/cari kopi</code>.'),

  searchEmpty: (keyword: string): BotReply =>
    reply(`🔎 Tidak ada transaksi yang cocok dengan "<b>${escapeHtml(keyword)}</b>".`),

  searchResults: (
    keyword: string,
    rows: { amount: number; categoryName: string; description: string; date: Date }[],
    tz: string,
  ): BotReply =>
    reply(
      [
        `🔎 <b>Hasil untuk "${escapeHtml(keyword)}"</b>`,
        '',
        ...rows.map(
          (r) =>
            `<b>${formatIDR(r.amount)}</b> · ${escapeHtml(r.categoryName)}\n    <i>${escapeHtml(r.description)}</i> · ${formatDateTime(r.date, tz)}`,
        ),
      ].join('\n'),
    ),

  undone: (count: number): BotReply =>
    reply(`↩️ <b>${count} transaksi dibatalkan</b> dan dihapus dari catatanmu.`),

  nothingToUndo: (): BotReply =>
    reply('Tidak ada pencatatan terakhir yang bisa dibatalkan. <code>/undo</code> hanya membatalkan satu pencatatan terakhir dari bot.'),

  stats: (
    monthLabel: string,
    dailyAverage: number,
    projectedMonthEnd: number,
    topCategories: { name: string; amount: number }[],
  ): BotReply =>
    reply(
      [
        `📈 <b>Statistik ${monthLabel}</b>`,
        '',
        `Rata-rata harian    <code>${formatIDR(dailyAverage)}</code>`,
        `Proyeksi akhir bulan <code>${formatIDR(projectedMonthEnd)}</code>`,
        '',
        '<b>Kategori teratas</b>',
        ...topCategories.map((c, i) => `${i + 1}. ${escapeHtml(c.name)} — ${formatIDR(c.amount)}`),
      ].join('\n'),
    ),
```

- [ ] **Step 6: Sambungkan di `handleReadCommand`**

Di `src/shared/bot/core.ts`, tangani `/cari <kata>` **sebelum** `matchReadCommand` (karena membawa argumen), lalu tambahkan cabang intent baru:

```ts
  // `/cari kopi` carries an argument, so it cannot be a bare read-command match.
  const search = trimmed.match(/^\/?(?:cari|search)\s+(.+)$/i)
  if (search) return handleSearch(userId, search[1].trim())
```

dan di `handleReadCommand`:

```ts
  if (intent === 'search') return replies.searchNeedsKeyword()
  if (intent === 'undo') return handleUndo(userId)
  if (intent === 'today_summary') return handlePeriodSummary(userId, 'today')
  if (intent === 'week_summary') return handlePeriodSummary(userId, 'week')
  if (intent === 'stats') return handleStats(userId)
```

dengan handler:

```ts
async function handleUndo(userId: string): Promise<BotReply> {
  const last = await adminData.getLastBatch(userId)
  if (!last) return replies.nothingToUndo()
  const count = await adminData.deleteTransactions(userId, last.transactionIds)
  await adminData.clearLastBatch(userId)
  return replies.undone(count)
}

async function handleSearch(userId: string, keyword: string): Promise<BotReply> {
  const [matches, categories, tz] = await Promise.all([
    adminData.searchTransactions(userId, keyword, 10),
    adminData.findCategories(userId),
    adminData.getUserTimezone(userId),
  ])
  if (matches.length === 0) return replies.searchEmpty(keyword)

  const byId = new Map(categories.map((c) => [c.id, c.name]))
  return replies.searchResults(
    keyword,
    matches.map((tx) => ({
      amount: tx.amount,
      categoryName: byId.get(tx.categoryId) ?? 'Tanpa kategori',
      description: tx.description ?? '—',
      date: tx.date.toDate(),
    })),
    tz,
  )
}

/** Milliseconds `timeZone` is ahead of UTC at `at`. Derived from Intl rather than a
 *  hardcoded +7, so a user in WITA/WIT gets their own midnight. */
function tzOffsetMs(at: Date, timeZone: string): number {
  const asUtc = new Date(at.toLocaleString('en-US', { timeZone: 'UTC' }))
  const asLocal = new Date(at.toLocaleString('en-US', { timeZone }))
  return asLocal.getTime() - asUtc.getTime()
}

/** "Today" and "this week" must be bounded by the USER's midnight, not the server's —
 *  a 23:30 WIB expense belongs to today, and a UTC boundary would file it as tomorrow. */
async function handlePeriodSummary(userId: string, period: 'today' | 'week'): Promise<BotReply> {
  const tz = await adminData.getUserTimezone(userId)
  const now = new Date()
  const [y, m, d] = dayKeyInTz(now, tz).split('-').map(Number)

  // Local midnight as an instant: read the local wall-clock midnight as if it were
  // UTC, then subtract the zone's offset at that moment.
  const from = new Date(Date.UTC(y, m - 1, d) - tzOffsetMs(now, tz))
  if (period === 'week') from.setUTCDate(from.getUTCDate() - 6)
  const to = new Date(from.getTime() + (period === 'week' ? 7 : 1) * 86_400_000)

  const [transactions, categories] = await Promise.all([
    adminData.getTransactionsBetween(userId, from, to),
    adminData.findCategories(userId),
  ])

  const spend = transactions.filter((tx) => tx.type === 'expense')
  const byId = new Map(categories.map((c) => [c.id, c.name]))
  const totals = new Map<string, number>()
  for (const tx of spend) {
    const name = byId.get(tx.categoryId) ?? 'Tanpa kategori'
    totals.set(name, (totals.get(name) ?? 0) + tx.amount)
  }

  const rows = [...totals.entries()]
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount)
  const total = rows.reduce((sum, r) => sum + r.amount, 0)
  const title = period === 'today' ? `📅 <b>Hari Ini</b> — ${formatDayLong(now, tz)}` : '📅 <b>7 Hari Terakhir</b>'

  return replies.periodSummary(title, rows, total, spend.length)
}
```

Tambahkan impor yang dibutuhkan handler di atas ke `core.ts`:

```ts
import { dayKeyInTz, formatDayLong, formatMonthLong } from '@/shared/lib/format'
```

`handleStats` memakai `buildMonthlySummary` yang sudah ada:

```ts
async function handleStats(userId: string): Promise<BotReply> {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const [categories, budget, transactions] = await Promise.all([
    adminData.findCategories(userId),
    adminData.getMonthlyBudget(userId, year, month),
    adminData.getMonthTransactions(userId, year, month),
  ])

  const summary = buildMonthlySummary(categories, transactions, {
    year,
    month,
    totalIncome: budget?.totalIncome ?? 0,
    pillarConfig: budget?.pillarConfig ?? DEFAULT_PILLAR_CONFIG,
    overrides: budget?.categoryOverrides,
  })

  const top = [...summary.categories]
    .sort((a, b) => b.used - a.used)
    .slice(0, 5)
    .map((c) => ({ name: c.category.name, amount: c.used }))

  const projected = summary.categories.reduce((sum, c) => sum + c.projectedMonthEnd, 0)
  return replies.stats(formatMonthLong(year, month), summary.dailyAvgSpend, projected, top)
}
```

- [ ] **Step 7: Perbarui `/help`**

Ganti `replies.help()` supaya memuat perintah baru, dikelompokkan:

```ts
  help: (): BotReply =>
    reply(
      [
        '🤖 <b>FinanceTrack Bot</b>',
        '',
        '<b>💸 Catat transaksi</b>',
        'Ketik apa adanya — <code>makan siang 35rb</code>, atau beberapa sekaligus:',
        '<code>makan 35rb, bensin 50rb, gaji masuk 5jt</code>',
        'Atau kirim <b>foto struk</b> (boleh pakai caption untuk memperjelas item yang buram).',
        'Semua yang lebih dari satu transaksi selalu ditinjau dulu sebelum disimpan.',
        '',
        '<b>📊 Ringkasan</b>',
        '/hariini — pengeluaran hari ini',
        '/minggu — 7 hari terakhir',
        '/ringkasan — anggaran bulan ini',
        '/saldo — sisa anggaran per pilar',
        '/tahunan — ringkasan tahun berjalan',
        '/statistik — rata-rata harian &amp; kategori teratas',
        '',
        '<b>🔎 Riwayat</b>',
        '/riwayat — 5 transaksi terakhir',
        '/cari &lt;kata&gt; — cari transaksi, mis. <code>/cari kopi</code>',
        '/undo — batalkan pencatatan terakhir',
        '',
        '<b>🎯 Target &amp; kekayaan</b>',
        '/target — target tabungan &amp; progres',
        '/setor — setor dana ke target tabungan',
        '/kekayaan — kekayaan bersih terkini',
        '',
        '<b>⚙️ Lainnya</b>',
        '/kategori — daftar kategori aktif',
        '/rutin — transaksi rutin aktif',
        '/wishlist — wishlist &amp; kelayakan beli',
        '/batal — batalkan tinjauan yang tertunda',
        '/putuskan — putuskan tautan akun ini',
      ].join('\n'),
    ),
```

- [ ] **Step 8: Jalankan seluruh test**

Run: `npx vitest run && npx tsc --noEmit && npx next lint --dir src`
Expected: PASS, exit 0.

- [ ] **Step 9: Matikan auto-reply GOWA (R11)**

Di `go-whatsapp-web-multidevice/src/.env`, ganti:

```diff
-WHATSAPP_AUTO_REPLY="Auto reply message"
+# Kosong = tidak ada auto-reply. Setiap balasan datang dari FinanceTrack lewat webhook;
+# auto-reply bawaan GOWA akan mengirim pesan kedua yang tidak nyambung ke setiap chat.
+WHATSAPP_AUTO_REPLY=""
```

Terapkan tanpa rebuild (perubahan env saja):

```bash
cd go-whatsapp-web-multidevice && docker compose up -d
```

Verifikasi: kirim pesan ke nomor bot, pastikan **hanya** balasan FinanceTrack yang datang — tidak ada "Auto reply message".

- [ ] **Step 10: Dokumentasi**

`BOT_SETUP_CHECKLIST.md` — tambahkan bagian:

```markdown
