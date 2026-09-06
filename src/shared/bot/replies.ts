import { formatDateTime, formatDay, formatIDR, formatMonthLong } from '@/shared/lib/format'
import { PILLAR_LABELS, type Category, type CategorySummary, type MonthlySummary, type Pillar, type RecurringRule, type Transaction } from '@/shared/types/domain'
import type { Insight } from '@/shared/lib/insights'
import type { YearSummary } from '@/shared/lib/year-summary'
import type { AffordabilityDecision, SmartAffordabilityResult, Wishlist } from '@/shared/types/wishlist.types'
import { batchTotals, collapseToSingle } from './draft'
import { bar, moneyColumn, statusEmoji, trendArrow } from './render'
import { reviewToken } from './review-commands'
import type { BotKeyboardButton, BotPrefs, BotReply, DraftBatch, DraftLine } from './types'

/** Every text the bot ever sends, in one place — kept in Bahasa Indonesia to match the
 *  rest of the app's user-facing copy. All balasan are HTML (`parse_mode: 'HTML'` on
 *  Telegram); WhatsApp's adapter strips the tags to its own lite-markdown instead. */

/** Escapes the 3 characters HTML actually needs escaped. **Must** wrap every dynamic
 *  value inserted into a template below (category names, transaction descriptions,
 *  merchant names from AI receipt reads, wishlist/goal names — any free text a user or
 *  the model produced) — an un-escaped `<`/`&` in, say, a merchant name can otherwise
 *  break the whole message's formatting or be misread as a tag. */
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function reply(text: string, keyboard?: BotKeyboardButton[][]): BotReply {
  return { text, html: true, keyboard }
}

const DECISION_EMOJI: Record<AffordabilityDecision, string> = {
  'Aman Dibeli': '🟢',
  'Gunakan Tabungan': '🟡',
  'Tunda (Risiko Tinggi)': '🔴',
}

/** `formatIDR` (Intl `id-ID`) joins "Rp" to the number with a non-breaking space;
 *  chat clients and the review card's byte-exact tests both want a plain one. */
function idr(value: number): string {
  return formatIDR(value).replace(/ /g, ' ')
}

const TYPE_MARK: Record<DraftLine['type'], string> = {
  expense: '🔻',
  income: '🔺',
  transfer: '🔁',
}

const TYPE_LABEL: Record<DraftLine['type'], string> = {
  expense: 'Pengeluaran',
  income: 'Pemasukan',
  transfer: 'Transfer',
}

/** Right-aligns the digits so the totals block reads as a column — the "Rp" mark stays
 *  flush left and the padding goes between it and the number (§5). Wrapped in <code> by
 *  the caller: WhatsApp and Telegram both render monospace, the only way it survives. */
function padAmount(value: number, width: number): string {
  const s = idr(value)
  const gap = s.indexOf(' ')
  if (gap < 0) return s.padStart(width, ' ')
  const mark = s.slice(0, gap)
  return `${mark} ${s.slice(gap + 1).padStart(width - mark.length - 1, ' ')}`
}

function amountColumnWidth(values: number[]): number {
  return Math.max(...values.map((v) => idr(v).length))
}

function renderLine(line: DraftLine, tz: string, showDate: boolean): string {
  const category = line.categoryName
    ? escapeHtml(line.categoryName)
    : '⚠️ <i>belum ada kategori</i>'
  const head = `<b>${line.n}.</b> ${TYPE_MARK[line.type]} <b>${idr(line.amount)}</b> · ${category}`

  const details: string[] = []
  if (line.description) {
    const qty = line.quantity && line.quantity > 1 ? ` ×${line.quantity}` : ''
    details.push(`<i>${escapeHtml(line.description)}</i>${qty}`)
  }
  if (showDate) details.push(formatDateTime(new Date(line.dateIso), tz))

  return details.length > 0 ? `${head}\n    ${details.join(' · ')}` : head
}

/** True when every line in the batch falls on the same calendar day — then the date is
 *  printed once in the header instead of repeated on every line. */
function sameDay(lines: DraftLine[], tz: string): boolean {
  if (lines.length === 0) return true
  const first = formatDateTime(new Date(lines[0].dateIso), tz)
  return lines.every((l) => formatDateTime(new Date(l.dateIso), tz) === first)
}

export const replies = {
  notLinked: (): BotReply =>
    reply(
      '⚠️ <b>Belum tertaut</b>\n\n' +
        'Buka FinanceTrack → Pengaturan → Bot WhatsApp &amp; Telegram → Hubungkan, ' +
        'lalu kirim kode yang muncul ke sini.',
    ),

  linkSuccess: (): BotReply =>
    reply(
      '✅ <b>Akun tertaut!</b>\n\n' +
        'Coba kirim <code>makan siang 35rb</code>, kirim foto struk, atau ketik /help ' +
        'untuk lihat semua yang bisa dilakukan bot ini.',
    ),

  linkCodeInvalid: (error: 'not_found' | 'expired' | 'used'): BotReply => {
    if (error === 'expired')
      return reply('❌ Kode itu sudah <b>kedaluwarsa</b> (berlaku 15 menit). Buat kode baru dari Pengaturan.')
    if (error === 'used')
      return reply('❌ Kode itu <b>sudah pernah dipakai</b>. Buat kode baru dari Pengaturan kalau perlu menautkan lagi.')
    return reply('❌ Kode tidak dikenali. Pastikan kamu menyalin persis dari halaman Pengaturan.')
  },

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
        '/ringkasan [bulan] — mis. <code>/ringkasan 8</code> atau <code>/ringkasan agustus</code>',
        '/saldo [pilar] — mis. <code>/saldo kebutuhan</code>',
        '/kategori &lt;nama&gt; — rincian satu kategori: laju, proyeksi, transaksi terakhir',
        '/tahunan — ringkasan tahun berjalan',
        '/export [bulan] — kirim CSV bulan itu',
        '/statistik — merchant teratas, metode bayar, konsistensi',
        '',
        '<b>🔎 Riwayat</b>',
        '/riwayat [jumlah] [kata] — mis. <code>/riwayat 10 kopi</code>',
        '/cari &lt;kata&gt; — cari transaksi, mis. <code>/cari kopi</code>',
        '/undo — batalkan pencatatan terakhir',
        '',
        '<b>🎯 Target &amp; kekayaan</b>',
        '/target — target tabungan &amp; progres',
        '/setor — setor dana ke target tabungan',
        '/kekayaan — kekayaan bersih terkini',
        '',
        '<b>⚙️ Kustomisasi</b>',
        '/mode ringkas — balasan pendek',
        '/mode detail — balasan lengkap',
        '/atur — semua pengaturan bot',
        '',
        '<b>⚙️ Lainnya</b>',
        '/kategori — daftar kategori aktif',
        '/rutin — transaksi rutin aktif',
        '/wishlist — wishlist &amp; kelayakan beli',
        '/batal — batalkan tinjauan yang tertunda',
        '/putuskan — putuskan tautan akun ini',
      ].join('\n'),
    ),

  amountNotFound: (): BotReply =>
    reply('🤔 Nominalnya tidak ketemu di pesan itu. Coba tulis ulang dengan angka, mis. <code>makan siang 35rb</code>.'),

  monthClosed: (year: number, month: number): BotReply =>
    reply(
      `⚠️ <b>${formatMonthLong(year, month)} sudah ditutup</b> di FinanceTrack. ` +
        'Buka kembali dari Pengaturan kalau memang perlu mencatat ke bulan itu.',
    ),

  notAReceipt: (): BotReply =>
    reply('🤔 Sepertinya itu bukan foto struk, atau gambarnya terlalu tidak jelas untuk dibaca. Coba foto ulang, atau catat manual lewat teks.'),

  imageTooLarge: (): BotReply => reply('⚠️ Foto itu terlalu besar. Coba kirim ulang dengan ukuran yang lebih kecil.'),

  /** Sent the instant a photo arrives, then edited in place into the review card once
   *  the read finishes — a photo is never met with silence while Gemini works. */
  receiptReceived: (): BotReply => reply('📸 <b>Struk diterima.</b>\n<i>Sedang dibaca…</i>'),

  /** Gemini returned 429 (kuota/rate limit) or 503 (overload) — distinct from
   *  `genericError` so the user knows to wait rather than that something is broken.
   *  Nothing was recorded (see `handlePhoto`); the user can resend later. */
  aiUnavailable: (): BotReply =>
    reply(
      '⏳ Layanan AI-nya lagi sibuk atau kuota hariannya sudah habis, jadi struk ini belum bisa dibaca. ' +
        'Coba kirim ulang beberapa saat lagi, atau catat manual lewat teks.',
    ),

  categoryConfirmPrompt: (amount: number, description: string | null, options: { name: string }[]): BotReply => {
    const label = description ? ` — <i>${escapeHtml(description)}</i>` : ''
    const keyboard: BotKeyboardButton[][] = [
      ...options.map((o, i) => [{ label: o.name, value: String(i + 1) }]),
      [{ label: '❌ Batal', value: 'batal' }],
    ]
    return reply(`🤔 <b>${formatIDR(amount)}</b>${label}\n\nMasuk kategori apa?`, keyboard)
  },

  pendingCancelled: (): BotReply => reply('Dibatalkan. Kirim pesan baru kalau mau catat transaksi lain.'),

  cancelNothingPending: (): BotReply => reply('Tidak ada yang perlu dibatalkan — tidak ada konfirmasi yang tertunda.'),

  invalidCategoryChoice: (max: number): BotReply => reply(`Balas dengan angka 1-${max}, atau "batal" untuk membatalkan.`),

  transactionRecorded: (
    amount: number,
    categoryName: string,
    receiptStatus: 'saved' | 'none' | 'drive_not_linked',
    date: Date,
    tz: string,
  ): BotReply => {
    const note =
      receiptStatus === 'saved'
        ? '\n<i>Struk tersimpan ke Google Drive-mu.</i>'
        : receiptStatus === 'drive_not_linked'
          ? '\n<i>Struk tidak tersimpan — tautkan Google Drive di Pengaturan agar fotonya ikut tersimpan.</i>'
          : ''
    return reply(
      `✅ <b>Tercatat</b>\n\n<b>${idr(amount)}</b> · ${escapeHtml(categoryName)}\n` +
        `🗓 ${formatDateTime(date, tz)}${note}\n\n` +
        'Salah? Ketik <code>/undo</code>.',
    )
  },

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
      detail.push(
        '',
        `${tone[insights[0].tone]} <b>${escapeHtml(insights[0].title)}</b>`,
        `<i>${escapeHtml(insights[0].body)}</i>`,
      )
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
              .map(
                (t) =>
                  `• <b>${formatIDR(t.amount)}</b> ${escapeHtml(t.description)}\n    <i>${formatDateTime(t.date, tz)}</i>`,
              )
              .join('\n'),
      ].join('\n'),
    ),

  categoryNotFound: (name: string, categories: { name: string }[]): BotReply =>
    reply(
      `🤔 Tidak ada kategori aktif yang cocok dengan "<b>${escapeHtml(name)}</b>".\n\n` +
        `<b>Yang ada:</b>\n${categories
          .slice(0, 12)
          .map((c) => `• ${escapeHtml(c.name)}`)
          .join('\n')}`,
    ),

  exportReady: (monthLabel: string, count: number): BotReply =>
    reply(`📄 <b>Ekspor ${monthLabel}</b> — ${count} transaksi. File CSV-nya menyusul di pesan berikutnya.`),

  exportEmpty: (monthLabel: string): BotReply =>
    reply(`Tidak ada transaksi di ${monthLabel} untuk diekspor.`),

  categoryList: (categories: { name: string }[]): BotReply =>
    categories.length === 0
      ? reply('Belum ada kategori aktif. Tambahkan dulu di Master Data lewat web.')
      : reply(['<b>Kategori aktif</b>', '', ...categories.map((c) => `• ${escapeHtml(c.name)}`)].join('\n')),

  unknownMessage: (): BotReply => reply('Belum paham maksudnya. Ketik /help untuk lihat daftar perintah.'),

  genericError: (): BotReply => reply('⚠️ Ada masalah di sisi kami — coba lagi sebentar lagi.'),

  // ─── /riwayat ───────────────────────────────────────────────────

  recentTransactions: (transactions: Transaction[], categories: Category[]): BotReply => {
    if (transactions.length === 0) return reply('Belum ada transaksi tercatat.')
    const byId = new Map(categories.map((c) => [c.id, c.name]))
    const lines = transactions.map((tx) => {
      const name = byId.get(tx.categoryId) ?? 'Tanpa kategori'
      const sign = tx.type === 'income' ? '+' : '−'
      return `${sign}<b>${formatIDR(tx.amount)}</b> · ${escapeHtml(name)} · <i>${formatDay(tx.date.toDate())}</i>`
    })
    return reply(['<b>Transaksi Terakhir</b>', '', ...lines].join('\n'))
  },

  // ─── /tahunan ───────────────────────────────────────────────────

  yearSummary: (summary: YearSummary): BotReply => {
    const lines = [
      `📅 <b>Ringkasan ${summary.year}</b>`,
      '',
      `Total Pemasukan   <code>${formatIDR(summary.totalIncome)}</code>`,
      `Total Pengeluaran <code>${formatIDR(summary.totalSpending)}</code>`,
      `Total Ditabung    <code>${formatIDR(summary.totalSaved)}</code>`,
      '',
      `💰 Rasio tabungan: <b>${summary.savingsRate.toFixed(1)}%</b>`,
    ]
    if (summary.bestMonth) {
      lines.push(`📈 Bulan terbaik: <b>${formatMonthLong(summary.bestMonth.year, summary.bestMonth.month)}</b>`)
    }
    if (summary.worstMonth) {
      lines.push(`📉 Bulan terberat: <b>${formatMonthLong(summary.worstMonth.year, summary.worstMonth.month)}</b>`)
    }
    return reply(lines.join('\n'))
  },

  // ─── /target & /setor ──────────────────────────────────────────

  noGoals: (): BotReply => reply('Belum ada target tabungan. Buat dulu di halaman Target lewat web.'),

  goalList: (
    rows: { name: string; currentAmount: number; targetAmount: number; percent: number; projectedText: string }[],
  ): BotReply => {
    const blocks = rows.map(
      (g) =>
        `<b>${escapeHtml(g.name)}</b>\n${formatIDR(g.currentAmount)} / ${formatIDR(g.targetAmount)} — <b>${g.percent.toFixed(1)}%</b>\n${g.projectedText}`,
    )
    return reply(['🎯 <b>Target Tabungan</b>', '', blocks.join('\n\n'), '', 'Ketik /setor untuk menambah tabungan ke salah satu target.'].join('\n'))
  },

  goalPickPrompt: (goals: { name: string }[]): BotReply =>
    reply(
      '🎯 Mau setor ke target yang mana?',
      [...goals.map((g, i) => [{ label: g.name, value: String(i + 1) }]), [{ label: '❌ Batal', value: 'batal' }]],
    ),

  goalAmountPrompt: (goalName: string): BotReply =>
    reply(`💰 Setor ke <b>${escapeHtml(goalName)}</b> — berapa nominalnya? (mis. "500rb" atau "500000", atau "batal")`),

  goalContributionInvalidAmount: (): BotReply =>
    reply('🤔 Nominalnya tidak ketemu. Coba lagi, mis. "500rb", atau ketik "batal".'),

  goalContributionRecorded: (amount: number, goalName: string, newAmount: number, targetAmount: number): BotReply =>
    reply(
      `✅ <b>${formatIDR(amount)}</b> disetor ke <b>${escapeHtml(goalName)}</b>\n` +
        `Progres baru: ${formatIDR(newAmount)} / ${formatIDR(targetAmount)} (${((newAmount / targetAmount) * 100).toFixed(1)}%)`,
    ),

  // ─── /kekayaan ─────────────────────────────────────────────────

  netWorth: (totalAssets: number, totalLiabilities: number): BotReply =>
    reply(
      [
        '💎 <b>Kekayaan Bersih</b> (per hari ini)',
        '',
        `Total Aset       <code>${formatIDR(totalAssets)}</code>`,
        `Total Liabilitas <code>${formatIDR(totalLiabilities)}</code>`,
        '─────────────────────',
        `<b>Kekayaan Bersih: ${formatIDR(totalAssets - totalLiabilities)}</b>`,
      ].join('\n'),
    ),

  // ─── /rutin ────────────────────────────────────────────────────

  noRecurring: (): BotReply => reply('Belum ada transaksi rutin aktif. Buat dulu di halaman Transaksi Rutin lewat web.'),

  recurringList: (
    rules: RecurringRule[],
    dueByRule: Map<string, string>,
    categoryName: (categoryId: string) => string,
  ): BotReply => {
    const blocks = rules.map((r) => {
      const freq = r.dayOfMonth ? `Setiap tanggal ${r.dayOfMonth}` : 'Rutin'
      return `<b>${escapeHtml(r.name)}</b> — ${formatIDR(r.amount)}/${escapeHtml(categoryName(r.categoryId))}\n${freq}`
    })
    const keyboard: BotKeyboardButton[][] = [...dueByRule.entries()]
      .map(([ruleId, dk]) => {
        const rule = rules.find((r) => r.id === ruleId)
        return rule ? [{ label: `Lewati "${rule.name}" bulan ini`, value: `skip_recurring:${ruleId}:${dk}` }] : null
      })
      .filter((row): row is BotKeyboardButton[] => row !== null)
    return reply(['🔁 <b>Transaksi Rutin Aktif</b>', '', blocks.join('\n\n')].join('\n'), keyboard.length ? keyboard : undefined)
  },

  recurringSkipped: (name: string): BotReply => reply(`✅ Kejadian bulan ini untuk <b>${escapeHtml(name)}</b> dilewati.`),

  recurringSkipStale: (): BotReply => reply('Sudah lewat / sudah ditangani — tidak ada yang perlu dilewati untuk itu.'),

  // ─── /wishlist ─────────────────────────────────────────────────

  noWishlist: (): BotReply => reply('Wishlist masih kosong. Tambahkan dulu di halaman Wishlist lewat web.'),

  wishlistList: (rows: { item: Wishlist; result: SmartAffordabilityResult }[]): BotReply => {
    const blocks = rows.map(({ item, result }) => {
      const emoji = DECISION_EMOJI[result.decision]
      const reason = result.insights[0] ?? ''
      return `<b>${escapeHtml(item.name)}</b> — ${formatIDR(item.estimatedPrice)}\n${emoji} ${result.decision}${reason ? ` — ${escapeHtml(reason)}` : ''}`
    })
    return reply(['🛍 <b>Wishlist</b>', '', blocks.join('\n\n')].join('\n'))
  },

  // ─── /putuskan ─────────────────────────────────────────────────

  unlinkConfirmPrompt: (): BotReply =>
    reply('⚠️ Putuskan tautan akun ini dari FinanceTrack?', [
      [
        { label: '✅ Ya, putuskan', value: 'unlink:confirm' },
        { label: '❌ Batal', value: 'unlink:cancel' },
      ],
    ]),

  unlinkedFromChat: (): BotReply =>
    reply('✅ Tautan diputus. Kirim kode baru dari Pengaturan kalau mau menautkan lagi.'),

  unlinkCancelled: (): BotReply => reply('Dibatalkan. Tautan akun tidak berubah.'),

  // ─── /mode & /atur ─────────────────────────────────────────────

  prefsCard: (prefs: BotPrefs): BotReply =>
    reply(
      [
        '⚙️ <b>Pengaturan Bot</b>',
        '',
        `Mode balasan       <b>${prefs.verbosity}</b>`,
        `Ambang auto-simpan <b>${prefs.autoAcceptConfidence}</b>`,
        `Selalu tinjau      <b>${prefs.alwaysReview ? 'nyala' : 'mati'}</b>`,
        `Baris insight      <b>${prefs.showInsights ? 'nyala' : 'mati'}</b>`,
        '',
        '<b>Cara mengubah</b>',
        '<code>/mode ringkas</code> — balasan pendek',
        '<code>/mode detail</code> — balasan lengkap (bawaan)',
        '<code>/atur autoaccept 80</code> — makin tinggi, makin sering ditanya dulu',
        '<code>/atur selalutinjau on</code> — semua transaksi lewat kartu tinjauan',
        '<code>/atur insight off</code> — sembunyikan baris analisis',
      ].join('\n'),
    ),

  prefsUpdated: (prefs: BotPrefs): BotReply =>
    reply(
      `✅ <b>Tersimpan.</b> Mode <b>${prefs.verbosity}</b>, ambang <b>${prefs.autoAcceptConfidence}</b>, ` +
        `selalu tinjau <b>${prefs.alwaysReview ? 'nyala' : 'mati'}</b>.`,
    ),

  prefsInvalid: (field: string): BotReply =>
    reply(
      `🤔 Tidak paham "<b>${escapeHtml(field)}</b>". Ketik <code>/atur</code> untuk melihat daftar pengaturan yang tersedia.`,
    ),

  // ─── /hariini, /minggu, /cari, /undo, /statistik ───────────────
  // Amounts go through `idr()` (NBSP stripped) like every other chat reply, not the
  // raw `formatIDR` — chat clients render the plain space and the tests expect it.

  periodSummary: (
    title: string,
    rows: { name: string; amount: number }[],
    total: number,
    count: number,
  ): BotReply => {
    if (count === 0) return reply(`${title}\n\nBelum ada transaksi tercatat di periode ini.`)
    const width = Math.max(...rows.map((r) => idr(r.amount).length))
    const lines = rows.map((r) => `${escapeHtml(r.name)}  <code>${idr(r.amount).padStart(width, ' ')}</code>`)
    return reply(
      [title, '', ...lines, '────────────────', `<b>Total  ${idr(total)}</b>`, '', `<i>${count} transaksi</i>`].join('\n'),
    )
  },

  searchNeedsKeyword: (): BotReply => reply('🔎 Sertakan kata kuncinya, mis. <code>/cari kopi</code>.'),

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
            `<b>${idr(r.amount)}</b> · ${escapeHtml(r.categoryName)}\n    <i>${escapeHtml(r.description)}</i> · ${formatDateTime(r.date, tz)}`,
        ),
      ].join('\n'),
    ),

  undone: (count: number): BotReply =>
    reply(`↩️ <b>${count} transaksi dibatalkan</b> dan dihapus dari catatanmu.`),

  nothingToUndo: (): BotReply =>
    reply(
      'Tidak ada pencatatan terakhir yang bisa dibatalkan. <code>/undo</code> hanya membatalkan satu pencatatan terakhir dari bot.',
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
        ...merchants
          .slice(0, 5)
          .map((m, i) => `${i + 1}. ${escapeHtml(m.name)} — ${formatIDR(m.total)} <i>(${m.count}×)</i>`),
        '',
        '<b>Metode bayar</b>',
        ...methods.slice(0, 4).map((m) => `• ${escapeHtml(m.method)} — ${formatIDR(m.total)}`),
      ].join('\n'),
    ),

  // ─── Kartu tinjauan ────────────────────────────────────────────

  batchReview: (batch: DraftBatch, tz: string): BotReply => {
    const isSingle = batch.mode === 'single' && batch.lines.length > 0
    const shown = isSingle ? [collapseToSingle(batch)] : batch.lines
    const totals = batchTotals(batch)
    const uniformDate = sameDay(shown, tz)

    const title =
      shown.length === 1
        ? '🧾 <b>Tinjau Transaksi</b>'
        : `🧾 <b>Tinjau ${shown.length} Transaksi</b>`
    const header = batch.merchant ? `${title} · <i>${escapeHtml(batch.merchant)}</i>` : title

    const parts: string[] = [header]
    if (uniformDate && shown.length > 0) {
      parts.push(`<blockquote>${formatDateTime(new Date(shown[0].dateIso), tz)}</blockquote>`)
    }
    parts.push('')
    parts.push(shown.map((l) => renderLine(l, tz, !uniformDate)).join('\n\n'))

    // Totals block: only the types actually present, plus the receipt cross-check.
    const totalValues = [totals.expense, totals.income, totals.transfer, batch.receiptTotal ?? 0]
    const width = amountColumnWidth(totalValues.filter((v) => v > 0).concat(0))
    const totalLines: string[] = []
    if (totals.expense > 0) totalLines.push(`Pengeluaran  <code>${padAmount(totals.expense, width)}</code>`)
    if (totals.income > 0) totalLines.push(`Pemasukan    <code>${padAmount(totals.income, width)}</code>`)
    if (totals.transfer > 0) totalLines.push(`Transfer     <code>${padAmount(totals.transfer, width)}</code>`)

    if (batch.receiptTotal !== null) {
      const lineSum = batch.lines.reduce((sum, l) => sum + l.amount, 0)
      const diff = batch.receiptTotal - lineSum
      // 500 rupiah is the same tolerance the web scanner uses for rounding noise.
      const verdict =
        Math.abs(diff) <= 500 ? '✅ cocok' : `⚠️ selisih ${idr(Math.abs(diff))}`
      totalLines.push(`Total struk  <code>${padAmount(batch.receiptTotal, width)}</code> ${verdict}`)
    }

    if (totalLines.length > 0) {
      parts.push('')
      parts.push('────────────────')
      parts.push(totalLines.join('\n'))
    }

    if (batch.warnings.length > 0) {
      parts.push('')
      parts.push(batch.warnings.map((w) => `⚠️ ${escapeHtml(w)}`).join('\n'))
    }

    const keyboard: BotKeyboardButton[][] = [
      [{ label: `✅ Simpan ${shown.length}`, value: reviewToken({ kind: 'save' })! }],
    ]
    if (batch.source === 'receipt' && batch.lines.length > 1) {
      keyboard[0].push(
        isSingle
          ? { label: '🧩 Pisah per item', value: reviewToken({ kind: 'set_mode', mode: 'itemized' })! }
          : { label: '🧩 Gabung jadi 1', value: reviewToken({ kind: 'set_mode', mode: 'single' })! },
      )
    }
    if (!isSingle && batch.lines.length > 1) {
      // One row of pencils, at most 5 per row so the buttons stay tappable.
      for (let i = 0; i < batch.lines.length; i += 5) {
        keyboard.push(
          batch.lines.slice(i, i + 5).map((l) => ({
            label: `✏️ ${l.n}`,
            value: reviewToken({ kind: 'focus', n: l.n })!,
          })),
        )
      }
    }
    keyboard.push([{ label: '❌ Batal', value: reviewToken({ kind: 'cancel' })! }])

    const blockingLine = batch.lines.find((l) => l.categoryId === null)
    const catExample = blockingLine ? `kat ${blockingLine.n} 1` : 'kat 1 1'

    return {
      text: parts.join('\n'),
      html: true,
      keyboard,
      whatsappHints: [
        '<b>Balas untuk mengubah:</b>',
        '<b>ok</b> — simpan semua',
        `<b>${catExample}</b> — set kategori`,
        '<b>nom 1 40rb</b> — ubah nominal',
        '<b>ket 1 kopi susu</b> — ubah keterangan',
        '<b>tgl 1 kemarin</b> — ubah tanggal',
        '<b>hapus 2</b> — buang satu baris',
        ...(batch.source === 'receipt' && batch.lines.length > 1
          ? [isSingle ? '<b>pisah</b> — rinci per item' : '<b>gabung</b> — jadikan 1 transaksi']
          : []),
        '<b>batal</b> — batalkan semua',
      ],
    }
  },

  batchSaved: (
    lines: DraftLine[],
    mode: DraftBatch['mode'],
    tz: string,
    receiptStatus: 'saved' | 'none' | 'drive_not_linked',
  ): BotReply => {
    const title = lines.length === 1 ? '✅ <b>Tercatat</b>' : `✅ <b>${lines.length} transaksi tercatat</b>`
    const body = lines
      .map(
        (l) =>
          `${TYPE_MARK[l.type]} <b>${idr(l.amount)}</b> · ${escapeHtml(l.categoryName ?? '')}` +
          (l.description ? `\n    <i>${escapeHtml(l.description)}</i>` : '') +
          `\n    🗓 ${formatDateTime(new Date(l.dateIso), tz)}`,
      )
      .join('\n\n')

    const footer: string[] = []
    if (receiptStatus === 'saved') footer.push('<i>Struk tersimpan ke Google Drive-mu.</i>')
    if (receiptStatus === 'drive_not_linked')
      footer.push('<i>Struk tidak tersimpan — tautkan Google Drive di Pengaturan agar fotonya ikut tersimpan.</i>')
    if (mode === 'single' && lines.length === 1) footer.push('<i>Digabung jadi satu transaksi.</i>')
    footer.push('Salah? Ketik <code>/undo</code> untuk membatalkan pencatatan ini.')

    return reply([title, '', body, '', footer.join('\n')].join('\n'))
  },

  batchCancelled: (count: number): BotReply =>
    reply(
      `🗑 Dibatalkan — ${count} transaksi <b>tidak</b> disimpan.\n` +
        'Kirim struk atau ketik transaksi baru kapan saja.',
    ),

  batchEmpty: (): BotReply =>
    reply(
      '🤔 Tidak ada baris tersisa untuk disimpan.\n' +
        'Kirim struk atau ketik transaksinya lagi, mis. <code>makan siang 35rb</code>.',
    ),

  reviewHelp: (): BotReply =>
    reply(
      [
        '✏️ <b>Perintah saat meninjau</b>',
        '',
        '<code>ok</code> — simpan semua baris',
        '<code>batal</code> — buang semuanya',
        '<code>hapus 2</code> — buang baris ke-2',
        '<code>kat 2 1</code> — kategori baris 2 → pilihan 1',
        '<code>nom 1 40rb</code> — ubah nominal baris 1',
        '<code>ket 1 kopi susu</code> — ubah keterangan baris 1',
        '<code>tgl 1 kemarin</code> — ubah tanggal (juga <code>3/9</code>, <code>2026-09-03</code>)',
        '<code>tipe 1 transfer</code> — ubah jenis (keluar/masuk/transfer)',
        '<code>gabung</code> — jadikan satu transaksi',
        '<code>pisah</code> — rinci kembali per item',
      ].join('\n'),
    ),

  reviewUnknownCommand: (lineCount: number): BotReply =>
    reply(
      `🤔 Belum paham perintah itu. Masih ada <b>${lineCount}</b> transaksi menunggu konfirmasi.\n\n` +
        'Ketik <code>ok</code> untuk menyimpan, <code>batal</code> untuk membuang, ' +
        'atau <code>bantuedit</code> untuk daftar perintah edit.',
    ),

  reviewLineFocus: (line: DraftLine, tz: string): BotReply => {
    const keyboard: BotKeyboardButton[][] = [
      line.options.map((option, index) => ({
        label: option.name,
        value: reviewToken({ kind: 'set_category', n: line.n, option: index + 1 })!,
      })),
      [
        { label: '🔻 Keluar', value: reviewToken({ kind: 'set_type', n: line.n, type: 'expense' })! },
        { label: '🔺 Masuk', value: reviewToken({ kind: 'set_type', n: line.n, type: 'income' })! },
        { label: '🔁 Transfer', value: reviewToken({ kind: 'set_type', n: line.n, type: 'transfer' })! },
      ],
      [{ label: `🗑 Hapus baris ${line.n}`, value: reviewToken({ kind: 'remove', n: line.n })! }],
    ]

    const options = line.options
      .map((option, index) => `<code>kat ${line.n} ${index + 1}</code> — ${escapeHtml(option.name)}`)
      .join('\n')

    return {
      text: [
        `✏️ <b>Baris ${line.n}</b> — ${TYPE_LABEL[line.type]}`,
        `<b>${idr(line.amount)}</b>${line.description ? ` · <i>${escapeHtml(line.description)}</i>` : ''}`,
        `🗓 ${formatDateTime(new Date(line.dateIso), tz)}`,
        '',
        '<b>Pilihan kategori</b>',
        options || '<i>Belum ada kategori aktif yang cocok.</i>',
      ].join('\n'),
      html: true,
      keyboard,
      whatsappHints: [
        '<b>Balas:</b>',
        options,
        `<b>nom ${line.n} 40rb</b> — ubah nominal`,
        `<b>ket ${line.n} teks baru</b> — ubah keterangan`,
        `<b>hapus ${line.n}</b> — buang baris ini`,
        '<b>ok</b> — simpan semua',
      ],
    }
  },

  reviewInvalidLine: (n: number, max: number): BotReply =>
    reply(`🤔 Baris ${n} tidak ada. Yang tersedia: <b>1-${max}</b>.`),

  reviewNeedsCategory: (numbers: number[]): BotReply =>
    reply(
      `⚠️ Belum bisa disimpan — baris <b>${numbers.join(', ')}</b> belum punya kategori.\n\n` +
        `Set dengan <code>kat ${numbers[0]} 1</code>, atau buang dengan <code>hapus ${numbers[0]}</code>.`,
    ),

  busyReviewing: (lineCount: number): BotReply =>
    reply(
      `📋 Masih ada <b>${lineCount}</b> transaksi menunggu konfirmasi.\n\n` +
        'Selesaikan dulu: <code>ok</code> untuk menyimpan, <code>batal</code> untuk membuang — ' +
        'baru kirim yang berikutnya.',
    ),
}
