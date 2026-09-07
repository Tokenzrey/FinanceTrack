## Task 17: Perintah yang Kaya, Berargumen, dan Sadar Preferensi

R14. Kuncinya: analitik yang diminta **sudah ada dan sudah teruji** di `budget-math.ts`, `analytics.ts`, dan `insights.ts` — dipakai dashboard web, tidak pernah muncul di bot. Task ini menyalurkannya, bukan menulis ulang.

**Files:**
- Create: `src/shared/bot/render.ts` (bar progres, panah tren, kolom angka)
- Test: `src/shared/bot/render.test.ts`
- Create: `src/shared/bot/command-args.ts`
- Test: `src/shared/bot/command-args.test.ts`
- Modify: `src/shared/bot/replies.ts` (semua balasan baca diperkaya)
- Modify: `src/shared/bot/core.ts` (routing berargumen)
- Modify: `src/shared/bot/admin-data.ts` (`getCategoryItems` untuk CSV)
- Modify: kedua route (kirim dokumen untuk `/export`)

**Interfaces:**
- Consumes: `buildMonthlySummary`, `buildCategorySummary`, `financialHealthScore`, `daysLeftInMonth` dari `@/shared/lib/budget-math`; `buildInsights` dari `@/shared/lib/insights`; `topMerchants`, `paymentMethodBreakdown`, `moodBreakdown`, `regretTotal`, `loggingConsistency`, `emergencyFundProgress`, `liquidAssets`, `projectSavings`, `requiredContribution` dari `@/shared/lib/analytics`; `transactionsToCsv` dari `@/shared/lib/csv-export`
- Produces: `bar(percent, width?)`, `trendArrow(delta)`, `statusEmoji(status)`, `moneyColumn(rows)`
- Produces: `parseCommandArgs(text): CommandArgs`

- [ ] **Step 1: Test primitif render**

Buat `src/shared/bot/render.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { bar, moneyColumn, statusEmoji, trendArrow } from './render'

describe('bar', () => {
  it('fills proportionally and always has the requested width', () => {
    expect(bar(0, 10)).toBe('░░░░░░░░░░')
    expect(bar(50, 10)).toBe('█████░░░░░')
    expect(bar(100, 10)).toBe('██████████')
  })

  it('clamps out-of-range values instead of overflowing the bar', () => {
    expect(bar(-20, 10)).toBe('░░░░░░░░░░')
    expect(bar(180, 10)).toBe('██████████')
  })
})

describe('trendArrow', () => {
  it('marks direction, and calls a near-zero change flat', () => {
    expect(trendArrow(12)).toBe('▲')
    expect(trendArrow(-12)).toBe('▼')
    expect(trendArrow(0.4)).toBe('▬')
  })
})

describe('statusEmoji', () => {
  it('maps every budget status', () => {
    expect(statusEmoji('safe')).toBe('🟢')
    expect(statusEmoji('warning')).toBe('🟡')
    expect(statusEmoji('danger')).toBe('🟠')
    expect(statusEmoji('exceeded')).toBe('🔴')
  })
})

describe('moneyColumn', () => {
  it('right-aligns every amount to the widest one', () => {
    const lines = moneyColumn([
      { label: 'Pemasukan', amount: 5_000_000 },
      { label: 'Terpakai', amount: 59_000 },
    ])
    const amounts = lines.map((l) => l.slice(l.indexOf('<code>')))
    expect(amounts[0].length).toBe(amounts[1].length)
  })
})
```

- [ ] **Step 2: Implementasi `render.ts`**

```ts
import { formatIDR } from '@/shared/lib/format'
import type { BudgetStatus } from '@/shared/types/domain'

/**
 * Small visual primitives shared by every rich reply. Block characters and monospace
 * are the only "chart" both platforms render identically — Telegram inside <code>,
 * WhatsApp inside backticks, both fixed-width.
 */

const FILLED = '█'
const EMPTY = '░'

export function bar(percent: number, width = 10): string {
  const clamped = Math.max(0, Math.min(100, percent))
  const filled = Math.round((clamped / 100) * width)
  return FILLED.repeat(filled) + EMPTY.repeat(width - filled)
}

/** Below one percent is noise, not a trend — calling it flat avoids a fake signal. */
export function trendArrow(deltaPercent: number): string {
  if (deltaPercent > 1) return '▲'
  if (deltaPercent < -1) return '▼'
  return '▬'
}

export function statusEmoji(status: BudgetStatus): string {
  const map: Record<BudgetStatus, string> = {
    safe: '🟢',
    warning: '🟡',
    danger: '🟠',
    exceeded: '🔴',
  }
  return map[status]
}

/** Amounts right-aligned to a common width so the block reads as a column. */
export function moneyColumn(rows: { label: string; amount: number }[]): string[] {
  const width = Math.max(...rows.map((r) => formatIDR(r.amount).length))
  const labelWidth = Math.max(...rows.map((r) => r.label.length))
  return rows.map((r) => `${r.label.padEnd(labelWidth, ' ')}  <code>${formatIDR(r.amount).padStart(width, ' ')}</code>`)
}
```

- [ ] **Step 3: Test parser argumen**

Buat `src/shared/bot/command-args.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseCommandArgs } from './command-args'

describe('parseCommandArgs', () => {
  it('reads a bare command', () => {
    expect(parseCommandArgs('/ringkasan')).toEqual({ command: 'ringkasan', args: [], raw: '' })
    expect(parseCommandArgs('ringkasan')).toEqual({ command: 'ringkasan', args: [], raw: '' })
  })

  it('splits arguments and keeps the untouched remainder', () => {
    expect(parseCommandArgs('/riwayat 10 makan siang')).toEqual({
      command: 'riwayat',
      args: ['10', 'makan', 'siang'],
      raw: '10 makan siang',
    })
  })

  it('lowercases the command but never the arguments', () => {
    expect(parseCommandArgs('/CARI Kopi Susu').command).toBe('cari')
    expect(parseCommandArgs('/CARI Kopi Susu').raw).toBe('Kopi Susu')
  })

  it('returns null for a message that is not a command', () => {
    expect(parseCommandArgs('makan siang 35rb')).toBeNull()
    expect(parseCommandArgs('')).toBeNull()
  })

  it('does not treat a bare amount as a command', () => {
    expect(parseCommandArgs('35rb')).toBeNull()
  })
})
```

Implementasi `src/shared/bot/command-args.ts`:

```ts
export interface CommandArgs {
  /** Lower-cased, without the leading slash. */
  command: string
  args: string[]
  /** Everything after the command, untouched — descriptions and search terms need
   *  their original casing. */
  raw: string
}

/** Only a word made of letters counts as a command, so "35rb" and "1jt" are never
 *  mistaken for one. */
const COMMAND_RE = /^\/?([a-z][a-z_]*)\b\s*([\s\S]*)$/i

export function parseCommandArgs(text: string): CommandArgs | null {
  const match = text.trim().match(COMMAND_RE)
  if (!match) return null
  const raw = match[2].trim()
  return { command: match[1].toLowerCase(), args: raw ? raw.split(/\s+/) : [], raw }
}
```

- [ ] **Step 4: Perkaya balasan baca**

Ganti `replies.summary` dan `replies.balance`, dan tambahkan yang baru. Semuanya menerima `prefs` supaya `/mode ringkas` benar-benar berpengaruh.

```ts
  summary: (
    summary: MonthlySummary,
    insights: Insight[],
    health: { total: number },
    prefs: BotPrefs,
  ): BotReply => {
    const spend = summary.categories.filter((c) => c.category.pillar !== 'income')
    const top = [...spend].sort((a, b) => b.used - a.used).slice(0, 3)
    const absorption = summary.totalBudget > 0 ? (summary.totalUsed / summary.totalBudget) * 100 : 0

    const head = [
      `📊 <b>Ringkasan ${formatMonthLong(summary.year, summary.month)}</b>`,
      '',
      ...moneyColumn([
        { label: 'Pemasukan', amount: summary.totalIncome },
        { label: 'Anggaran', amount: summary.totalBudget },
        { label: 'Terpakai', amount: summary.totalUsed },
        { label: 'Ditabung', amount: summary.totalSaved },
        { label: 'Arus kas', amount: summary.netCashFlow },
      ]),
      '',
      `<code>${bar(absorption)}</code> <b>${absorption.toFixed(0)}%</b> anggaran terpakai`,
      `💰 Rasio tabungan <b>${summary.savingsRate.toFixed(1)}%</b> · 🩺 Skor keuangan <b>${health.total.toFixed(0)}/100</b>`,
    ]

    if (prefs.verbosity === 'ringkas') return reply(head.join('\n'))

    const detail = [
      '',
      '<b>Terbesar bulan ini</b>',
      ...top.map(
        (c) =>
          `${statusEmoji(c.status)} ${escapeHtml(c.category.name)} — ${formatIDR(c.used)} / ${formatIDR(c.budget)}\n` +
          `    <code>${bar(c.absorptionRate)}</code> sisa ${formatIDR(c.remaining)} · ${c.daysLeft} hari lagi`,
      ),
    ]

    if (prefs.showInsights && insights.length > 0) {
      const tone = { good: '✅', warn: '⚠️', info: 'ℹ️' } as const
      detail.push('', `${tone[insights[0].tone]} <b>${escapeHtml(insights[0].title)}</b>`, `<i>${escapeHtml(insights[0].body)}</i>`)
    }

    detail.push('', '<i>Rincian per kategori: /saldo · satu kategori: /kategori &lt;nama&gt;</i>')
    return reply([...head, ...detail].join('\n'))
  },

  balance: (summary: MonthlySummary, pillarFilter: Pillar | null, prefs: BotPrefs): BotReply => {
    const pillars = pillarFilter ? [pillarFilter] : (['needs', 'wants', 'savings'] as const)
    const blocks: string[] = []

    for (const pillar of pillars) {
      const { budget, used } = summary.pillarSummary[pillar]
      const percent = budget > 0 ? (used / budget) * 100 : 0
      blocks.push(
        `<b>${PILLAR_LABELS[pillar]}</b> — sisa <b>${formatIDR(budget - used)}</b> dari ${formatIDR(budget)}\n` +
          `<code>${bar(percent)}</code> ${percent.toFixed(0)}%`,
      )

      if (prefs.verbosity === 'detail') {
        const rows = summary.categories
          .filter((c) => c.category.pillar === pillar)
          .sort((a, b) => b.absorptionRate - a.absorptionRate)
        for (const c of rows) {
          blocks.push(
            `  ${statusEmoji(c.status)} ${escapeHtml(c.category.name)} · ${formatIDR(c.remaining)} sisa · ` +
              `${formatIDR(c.dailyAllowanceLeft)}/hari`,
          )
        }
      }
    }

    return reply(
      [
        `📊 <b>Sisa Anggaran ${formatMonthLong(summary.year, summary.month)}</b>`,
        `<blockquote>${summary.categories[0]?.daysLeft ?? 0} hari tersisa di bulan ini</blockquote>`,
        '',
        blocks.join('\n\n'),
      ].join('\n'),
    )
  },

  categoryDetail: (
    c: CategorySummary,
    recent: { amount: number; description: string; date: Date }[],
    tz: string,
  ): BotReply =>
    reply(
      [
        `${statusEmoji(c.status)} <b>${escapeHtml(c.category.name)}</b> · ${PILLAR_LABELS[c.category.pillar]}`,
        '',
        ...moneyColumn([
          { label: 'Anggaran', amount: c.budget },
          { label: 'Terpakai', amount: c.used },
          { label: 'Sisa', amount: c.remaining },
        ]),
        `<code>${bar(c.absorptionRate)}</code> <b>${c.absorptionRate.toFixed(0)}%</b>`,
        '',
        `Laju harian   <code>${formatIDR(c.dailyBurnRate)}</code>`,
        `Jatah/hari    <code>${formatIDR(c.dailyAllowanceLeft)}</code> (${c.daysLeft} hari lagi)`,
        `Proyeksi      <code>${formatIDR(c.projectedMonthEnd)}</code> ${trendArrow(c.vsLastMonth)} ${c.vsLastMonth.toFixed(0)}% vs bulan lalu`,
        '',
        '<b>Transaksi terakhir</b>',
        recent.length === 0
          ? '<i>Belum ada.</i>'
          : recent
              .map((t) => `• <b>${formatIDR(t.amount)}</b> ${escapeHtml(t.description)}\n    <i>${formatDateTime(t.date, tz)}</i>`)
              .join('\n'),
      ].join('\n'),
    ),

  statsRich: (
    monthLabel: string,
    summary: MonthlySummary,
    merchants: { name: string; total: number; count: number }[],
    methods: { method: string; total: number }[],
    consistency: number,
    regret: number,
  ): BotReply =>
    reply(
      [
        `📈 <b>Statistik ${monthLabel}</b>`,
        '',
        ...moneyColumn([
          { label: 'Rata-rata/hari', amount: summary.dailyAvgSpend },
          { label: 'Total terpakai', amount: summary.totalUsed },
          { label: 'Belanja disesali', amount: regret },
        ]),
        `Konsistensi catat <code>${bar(consistency)}</code> ${consistency.toFixed(0)}%`,
        '',
        '<b>Merchant teratas</b>',
        ...merchants.slice(0, 5).map((m, i) => `${i + 1}. ${escapeHtml(m.name)} — ${formatIDR(m.total)} <i>(${m.count}×)</i>`),
        '',
        '<b>Metode bayar</b>',
        ...methods.slice(0, 4).map((m) => `• ${escapeHtml(m.method)} — ${formatIDR(m.total)}`),
      ].join('\n'),
    ),

  exportReady: (monthLabel: string, count: number): BotReply =>
    reply(`📄 <b>Ekspor ${monthLabel}</b> — ${count} transaksi. File CSV-nya menyusul di pesan berikutnya.`),

  exportEmpty: (monthLabel: string): BotReply =>
    reply(`Tidak ada transaksi di ${monthLabel} untuk diekspor.`),
```

- [ ] **Step 5: Routing berargumen di `core.ts`**

```ts
const MONTH_NAMES = [
  'januari', 'februari', 'maret', 'april', 'mei', 'juni',
  'juli', 'agustus', 'september', 'oktober', 'november', 'desember',
]

/** "/ringkasan 8", "/ringkasan agustus", "/ringkasan" → the month to report on. */
function monthFromArgs(args: string[], now: Date): { year: number; month: number } {
  const token = (args[0] ?? '').toLowerCase()
  if (/^\d{1,2}$/.test(token)) {
    const month = Number(token)
    if (month >= 1 && month <= 12) return { year: now.getFullYear(), month }
  }
  const named = MONTH_NAMES.indexOf(token)
  if (named >= 0) return { year: now.getFullYear(), month: named + 1 }
  return { year: now.getFullYear(), month: now.getMonth() + 1 }
}

const PILLAR_WORDS: Record<string, Pillar> = {
  kebutuhan: 'needs', needs: 'needs',
  keinginan: 'wants', wants: 'wants',
  tabungan: 'savings', savings: 'savings',
}
```

Di `handleIncoming`, setelah cek preferensi dan sebelum `matchReadCommand`:

```ts
  const parsedCommand = parseCommandArgs(trimmed)
  if (parsedCommand && parsedCommand.args.length > 0) {
    const withArgs = await handleCommandWithArgs(userId, parsedCommand)
    if (withArgs) return withArgs
  }
```

```ts
/** Commands that take arguments. Returns null when the command is not one of them, so
 *  the caller falls through to the existing bare-command path. */
async function handleCommandWithArgs(userId: string, cmd: CommandArgs): Promise<BotReply | null> {
  const now = new Date()

  switch (cmd.command) {
    case 'cari':
    case 'search':
      return handleSearch(userId, cmd.raw)

    case 'ringkasan':
    case 'summary': {
      const { year, month } = monthFromArgs(cmd.args, now)
      return handleSummary(userId, year, month)
    }

    case 'saldo':
    case 'sisa': {
      const pillar = PILLAR_WORDS[cmd.args[0]?.toLowerCase() ?? ''] ?? null
      return handleBalance(userId, pillar)
    }

    case 'kategori':
    case 'categories':
      return handleCategoryDetail(userId, cmd.raw)

    case 'riwayat':
    case 'history': {
      const limit = /^\d{1,2}$/.test(cmd.args[0] ?? '') ? Math.min(20, Number(cmd.args[0])) : 5
      const keyword = /^\d{1,2}$/.test(cmd.args[0] ?? '') ? cmd.args.slice(1).join(' ') : cmd.raw
      return handleRecent(userId, limit, keyword)
    }

    case 'export':
    case 'ekspor': {
      const { year, month } = monthFromArgs(cmd.args, now)
      return handleExport(userId, year, month)
    }

    case 'target':
    case 'goals':
      return handleGoalDetail(userId, cmd.raw)

    default:
      return null
  }
}
```

`handleCategoryDetail` mencari kategori berdasarkan kecocokan nama, lalu memakai `buildCategorySummary` yang sudah ada:

```ts
async function handleCategoryDetail(userId: string, name: string): Promise<BotReply> {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  const [categories, budget, transactions, tz] = await Promise.all([
    adminData.findCategories(userId),
    adminData.getMonthlyBudget(userId, year, month),
    adminData.getMonthTransactions(userId, year, month),
    adminData.getUserTimezone(userId),
  ])

  const needle = name.trim().toLowerCase()
  const category = categories.find((c) => c.isActive && c.name.toLowerCase().includes(needle))
  if (!category) return replies.categoryNotFound(name, categories.filter((c) => c.isActive))

  const summary = buildMonthlySummary(categories, transactions, {
    year,
    month,
    totalIncome: budget?.totalIncome ?? 0,
    pillarConfig: budget?.pillarConfig ?? DEFAULT_PILLAR_CONFIG,
    overrides: budget?.categoryOverrides,
  })
  const row = summary.categories.find((c) => c.category.id === category.id)
  if (!row) return replies.genericError()

  const recent = transactions
    .filter((t) => t.categoryId === category.id)
    .sort((a, b) => b.date.toMillis() - a.date.toMillis())
    .slice(0, 5)
    .map((t) => ({ amount: t.amount, description: t.description ?? '—', date: t.date.toDate() }))

  return replies.categoryDetail(row, recent, tz)
}
```

Tambahkan balasan pendampingnya:

```ts
  categoryNotFound: (name: string, categories: { name: string }[]): BotReply =>
    reply(
      `🤔 Tidak ada kategori aktif yang cocok dengan "<b>${escapeHtml(name)}</b>".\n\n` +
        `<b>Yang ada:</b>\n${categories.slice(0, 12).map((c) => `• ${escapeHtml(c.name)}`).join('\n')}`,
    ),
```

- [ ] **Step 6: `/export` mengirim file CSV**

`BotReply` mendapat lampiran opsional:

```ts
export interface BotReply {
  text: string
  html?: boolean
  keyboard?: BotKeyboardButton[][]
  whatsappHints?: string[]
  /** A file to send after the text. Both adapters upload it as a document. */
  document?: { filename: string; mimeType: string; base64: string }
}
```

`handleExport` memakai `transactionsToCsv` yang sudah ada:

```ts
async function handleExport(userId: string, year: number, month: number): Promise<BotReply> {
  const [transactions, categories] = await Promise.all([
    adminData.getMonthTransactions(userId, year, month),
    adminData.findCategories(userId),
  ])
  const label = formatMonthLong(year, month)
  if (transactions.length === 0) return replies.exportEmpty(label)

  const sorted = [...transactions].sort((a, b) => a.date.toMillis() - b.date.toMillis())
  // The BOM is what makes Excel read the file as UTF-8 instead of ANSI — without it
  // "Keuangan Rumah" arrives mangled, same reason downloadCsv adds it on the web.
  const csv = `﻿${transactionsToCsv(sorted, categories)}`

  return {
    ...replies.exportReady(label, transactions.length),
    document: {
      filename: `fintrack-${year}-${String(month).padStart(2, '0')}.csv`,
      mimeType: 'text/csv',
      base64: Buffer.from(csv, 'utf8').toString('base64'),
    },
  }
}
```

Di route Telegram, setelah mengirim teks:

```ts
async function sendDocument(chatId: number, doc: NonNullable<BotReply['document']>): Promise<void> {
  const token = botToken()
  if (!token) return
  try {
    const form = new FormData()
    form.append('chat_id', String(chatId))
    form.append('document', new Blob([Buffer.from(doc.base64, 'base64')], { type: doc.mimeType }), doc.filename)
    await fetch(`https://api.telegram.org/bot${token}/sendDocument`, { method: 'POST', body: form })
  } catch (error) {
    console.error('telegram sendDocument error:', error)
  }
}
```

Di route WhatsApp (GOWA `POST /send/file` menerima multipart `phone` + `file`):

```ts
async function sendDocument(chatId: string, doc: NonNullable<BotReply['document']>): Promise<void> {
  const auth = gowaAuth()
  if (!auth) return
  try {
    const form = new FormData()
    form.append('phone', chatId)
    form.append('file', new Blob([Buffer.from(doc.base64, 'base64')], { type: doc.mimeType }), doc.filename)
    // No Content-Type header: fetch must set the multipart boundary itself.
    await fetch(`${auth.baseUrl}/send/file`, { method: 'POST', headers: { Authorization: auth.authHeader }, body: form })
  } catch (error) {
    console.error('whatsapp (gowa) sendDocument error:', error)
  }
}
```

Panggil setelah balasan teks terkirim di kedua route:

```ts
      if (reply.document) await sendDocument(chatId, reply.document)
```

- [ ] **Step 7: Perbarui `/help` dengan bentuk berargumen**

Di blok `<b>📊 Ringkasan</b>` pada `replies.help()`, ganti barisnya:

```ts
        '/ringkasan [bulan] — mis. <code>/ringkasan 8</code> atau <code>/ringkasan agustus</code>',
        '/saldo [pilar] — mis. <code>/saldo kebutuhan</code>',
        '/kategori &lt;nama&gt; — rincian satu kategori: laju, proyeksi, transaksi terakhir',
        '/riwayat [jumlah] [kata] — mis. <code>/riwayat 10 kopi</code>',
        '/export [bulan] — kirim CSV bulan itu',
        '/statistik — merchant teratas, metode bayar, konsistensi',
```

dan tambahkan blok baru:

```ts
        '',
        '<b>⚙️ Kustomisasi</b>',
        '/mode ringkas — balasan pendek',
        '/mode detail — balasan lengkap',
        '/atur — semua pengaturan bot',
```

- [ ] **Step 8: Jalankan semua & commit**

Run: `npx vitest run && npx tsc --noEmit && npx next lint --dir src`
Expected: PASS, exit 0.

```bash
git add src/shared/bot scripts
git commit -m "feat(bot): argument-taking commands and analytics the web app already had

budget-math.ts, analytics.ts and insights.ts were already written and already tested —
buildCategorySummary, financialHealthScore, topMerchants, buildInsights and the rest
have been powering the web dashboard while the bot showed four numbers. This surfaces
them rather than writing anything new.

Commands now take arguments: /ringkasan agustus, /saldo kebutuhan, /riwayat 10 kopi,
/kategori makan, /export 8. /kategori gives burn rate, projection, daily allowance and
the last five transactions; /statistik gives top merchants, payment mix and logging
consistency; /export sends a real CSV as a document on both platforms, BOM included so
Excel reads it as UTF-8.

Every reply reads the user's verbosity preference, so /mode ringkas genuinely shortens
them instead of being decorative."
```

---

