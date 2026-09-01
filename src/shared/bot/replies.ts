import { formatDay, formatIDR, formatMonthLong } from '@/shared/lib/format'
import { PILLAR_LABELS, type Category, type MonthlySummary, type RecurringRule, type Transaction } from '@/shared/types/domain'
import type { YearSummary } from '@/shared/lib/year-summary'
import type { AffordabilityDecision, SmartAffordabilityResult, Wishlist } from '@/shared/types/wishlist.types'
import type { BotKeyboardButton, BotReply } from './types'

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
        '<b>Catat transaksi</b>',
        'Ketik langsung, mis. <code>makan siang 35rb</code> atau <code>gaji masuk 5jt</code> — atau kirim foto struk.',
        '',
        '<b>Ringkasan &amp; riwayat</b>',
        '/ringkasan — ringkasan bulan ini',
        '/saldo — sisa anggaran per pilar',
        '/riwayat — 5 transaksi terakhir',
        '/tahunan — ringkasan tahun berjalan',
        '',
        '<b>Target &amp; kekayaan</b>',
        '/target — target tabungan &amp; progres',
        '/setor — setor dana ke target tabungan',
        '/kekayaan — kekayaan bersih terkini',
        '',
        '<b>Lainnya</b>',
        '/kategori — daftar kategori aktif',
        '/rutin — transaksi rutin aktif',
        '/wishlist — wishlist &amp; kelayakan beli',
        '/batal — batalkan konfirmasi yang tertunda',
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

  transactionRecorded: (amount: number, categoryName: string, receiptStatus: 'saved' | 'none' | 'drive_not_linked'): BotReply => {
    const note =
      receiptStatus === 'saved'
        ? '\n<i>Struk tersimpan ke Drive-mu</i>'
        : receiptStatus === 'drive_not_linked'
          ? '\n<i>Struk tidak tersimpan — tautkan Google Drive di Pengaturan supaya foto struk ikut tersimpan</i>'
          : ''
    return reply(`✅ <b>Tercatat</b>\n\n<b>${formatIDR(amount)}</b> — ${escapeHtml(categoryName)}\n🗓 Hari ini${note}`)
  },

  summary: (summary: MonthlySummary): BotReply =>
    reply(
      [
        `📊 <b>Ringkasan ${formatMonthLong(summary.year, summary.month)}</b>`,
        '',
        `Pemasukan   <code>${formatIDR(summary.totalIncome)}</code>`,
        `Terpakai    <code>${formatIDR(summary.totalUsed)}</code>`,
        `Ditabung    <code>${formatIDR(summary.totalSaved)}</code>`,
        `Arus kas    <code>${formatIDR(summary.netCashFlow)}</code>`,
        '',
        `💰 Rasio tabungan: <b>${summary.savingsRate.toFixed(1)}%</b>`,
      ].join('\n'),
    ),

  balance: (summary: MonthlySummary): BotReply => {
    const lines = (['needs', 'wants', 'savings'] as const).map((pillar) => {
      const { budget, used } = summary.pillarSummary[pillar]
      const remaining = budget - used
      return `${PILLAR_LABELS[pillar]}: <b>${formatIDR(remaining)}</b> tersisa dari ${formatIDR(budget)}`
    })
    return reply([`📊 <b>Sisa Anggaran ${formatMonthLong(summary.year, summary.month)}</b>`, '', ...lines].join('\n'))
  },

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
}
