## Task 7: Balasan Terstruktur & Kartu Tinjauan

R2/R7/R8/R9. Semua copy baru hidup di `replies.ts` — satu tempat, dirender dua kali (HTML untuk Telegram, lite-markdown untuk WhatsApp lewat Task 1).

**Files:**
- Modify: `src/shared/bot/replies.ts`
- Test: `src/shared/bot/replies.test.ts` (tambah blok baru)

**Interfaces:**
- Consumes: `formatDateTime`, `formatIDR` dari `@/shared/lib/format`; `batchTotals`, `collapseToSingle` dari `./draft`; `reviewToken` dari `./review-commands`; `DraftBatch`, `DraftLine` dari `./types`
- Produces (tambahan ke objek `replies`):
  - `batchReview(batch: DraftBatch, tz: string): BotReply`
  - `batchSaved(lines: DraftLine[], mode: DraftBatch['mode'], tz: string, receiptStatus: 'saved' | 'none' | 'drive_not_linked'): BotReply`
  - `batchCancelled(count: number): BotReply`
  - `batchEmpty(): BotReply`
  - `reviewHelp(): BotReply`
  - `reviewUnknownCommand(lineCount: number): BotReply`
  - `reviewLineFocus(line: DraftLine, tz: string): BotReply`
  - `reviewInvalidLine(n: number, max: number): BotReply`
  - `reviewNeedsCategory(numbers: number[]): BotReply`
  - `busyReviewing(lineCount: number): BotReply`
- Diubah: `transactionRecorded(amount, categoryName, receiptStatus, date, tz)` — sekarang wajib membawa stempel waktu (R8)

- [ ] **Step 1: Tulis test yang gagal**

Tambahkan ke `src/shared/bot/replies.test.ts`:

```ts
import { batchTotals } from './draft'
import type { DraftBatch, DraftLine } from './types'

const TZ = 'Asia/Jakarta'
const NOW_ISO = new Date(Date.UTC(2026, 8, 6, 7, 32, 0)).toISOString()

function line(over: Partial<DraftLine> = {}): DraftLine {
  return {
    n: 1,
    type: 'expense',
    amount: 35000,
    description: 'Nasi goreng',
    categoryId: 'c-food',
    categoryName: 'Makan & Minum',
    dateIso: NOW_ISO,
    options: [{ categoryId: 'c-food', name: 'Makan & Minum' }],
    ...over,
  }
}

function batch(over: Partial<DraftBatch> = {}): DraftBatch {
  return {
    pendingKind: 'transaction_batch',
    source: 'receipt',
    lines: [line({ n: 1 }), line({ n: 2, amount: 24000, description: 'Teh botol', categoryId: null, categoryName: null, quantity: 2 })],
    mode: 'itemized',
    merchant: 'Indomaret',
    receiptTotal: 59000,
    warnings: ['Gambar kurang jelas — periksa setiap angka sebelum menyimpan.'],
    ...over,
  }
}

describe('replies.batchReview', () => {
  it('numbers every line and shows its amount and category', () => {
    const out = replies.batchReview(batch(), TZ)
    expect(out.text).toContain('<b>1.</b>')
    expect(out.text).toContain('<b>2.</b>')
    expect(out.text).toContain('Rp 35.000')
    expect(out.text).toContain('Makan &amp; Minum')
  })

  it('flags a line that still has no category', () => {
    expect(replies.batchReview(batch(), TZ).text).toContain('belum ada kategori')
  })

  it('carries a full date and time stamp', () => {
    expect(replies.batchReview(batch(), TZ).text).toContain('6 Sep 2026 · 14.32 WIB')
  })

  it('shows the receipt total and whether it matches the line sum', () => {
    const matching = replies.batchReview(batch(), TZ).text
    expect(matching).toContain('Total struk')
    expect(matching).toContain('cocok')

    const mismatched = replies.batchReview(batch({ receiptTotal: 90000 }), TZ).text
    expect(mismatched).toContain('selisih')
  })

  it('lists each extraction warning', () => {
    expect(replies.batchReview(batch(), TZ).text).toContain('Gambar kurang jelas')
  })

  it('escapes a merchant name that contains HTML-significant characters', () => {
    const out = replies.batchReview(batch({ merchant: 'Toko <B&B>' }), TZ)
    expect(out.text).toContain('Toko &lt;B&amp;B&gt;')
    expect(out.text).not.toContain('<B&B>')
  })

  it('offers a Telegram keyboard whose tokens all fit callback_data', () => {
    const out = replies.batchReview(batch(), TZ)
    const values = (out.keyboard ?? []).flat().map((b) => b.value)
    expect(values).toContain('rv:save')
    expect(values).toContain('rv:cancel')
    expect(values.every((v) => Buffer.byteLength(v, 'utf8') <= 64)).toBe(true)
  })

  it('offers WhatsApp the typed equivalents instead of the keyboard', () => {
    const out = replies.batchReview(batch(), TZ)
    expect(out.whatsappHints?.join('\n')).toContain('ok')
    expect(out.whatsappHints?.join('\n')).toContain('kat 2 1')
    expect(out.whatsappHints?.join('\n')).toContain('batal')
  })

  it('shows a merge button for a receipt batch and none for a text batch', () => {
    const receipt = (replies.batchReview(batch(), TZ).keyboard ?? []).flat().map((b) => b.value)
    expect(receipt).toContain('rv:mode:single')

    const text = (replies.batchReview(batch({ source: 'text' }), TZ).keyboard ?? []).flat().map((b) => b.value)
    expect(text).not.toContain('rv:mode:single')
  })

  it('renders the collapsed single line when mode is single', () => {
    const out = replies.batchReview(batch({ mode: 'single' }), TZ)
    expect(out.text).toContain('Rp 59.000')
    expect(out.text).not.toContain('<b>2.</b>')
    expect((out.keyboard ?? []).flat().map((b) => b.value)).toContain('rv:mode:itemized')
  })
})

describe('replies.batchSaved', () => {
  it('confirms every saved line with its own full timestamp', () => {
    const out = replies.batchSaved([line({ n: 1 }), line({ n: 2, type: 'income', amount: 5_000_000 })], 'itemized', TZ, 'saved')
    expect(out.text).toContain('2 transaksi')
    expect(out.text).toContain('6 Sep 2026 · 14.32 WIB')
    expect(out.text).toContain('Struk tersimpan')
  })

  it('tells the user Drive is not linked when the upload could not happen', () => {
    const out = replies.batchSaved([line()], 'itemized', TZ, 'drive_not_linked')
    expect(out.text).toContain('tautkan Google Drive')
  })

  it('mentions /undo so a mistake is one word away', () => {
    expect(replies.batchSaved([line()], 'itemized', TZ, 'none').text).toContain('/undo')
  })
})

describe('replies — review helpers', () => {
  it('reviewHelp lists every edit command with an example', () => {
    const text = replies.reviewHelp().text
    for (const cmd of ['ok', 'batal', 'hapus', 'kat', 'nom', 'ket', 'tgl', 'tipe', 'gabung', 'pisah']) {
      expect(text).toContain(cmd)
    }
  })

  it('reviewNeedsCategory names the exact lines still blocking the save', () => {
    expect(replies.reviewNeedsCategory([2, 4]).text).toContain('2')
    expect(replies.reviewNeedsCategory([2, 4]).text).toContain('4')
  })

  it('reviewInvalidLine states the valid range', () => {
    expect(replies.reviewInvalidLine(9, 3).text).toContain('1-3')
  })

  it('busyReviewing explains what to do instead of silently dropping the draft', () => {
    const text = replies.busyReviewing(2).text
    expect(text).toContain('2')
    expect(text).toContain('batal')
  })
})

describe('replies.transactionRecorded', () => {
  it('now carries a full date and time', () => {
    const out = replies.transactionRecorded(35000, 'Makan & Minum', 'none', new Date(NOW_ISO), TZ)
    expect(out.text).toContain('6 Sep 2026 · 14.32 WIB')
    expect(out.text).not.toContain('Hari ini')
  })
})
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run src/shared/bot/replies.test.ts`
Expected: FAIL — `replies.batchReview is not a function`.

- [ ] **Step 3: Implementasi balasan baru**

Di `src/shared/bot/replies.ts`, tambahkan impor:

```ts
import { formatDateTime, formatIDR, formatMonthLong, formatDay } from '@/shared/lib/format'
import { batchTotals, collapseToSingle } from './draft'
import { reviewToken } from './review-commands'
import type { BotKeyboardButton, BotReply, DraftBatch, DraftLine } from './types'
```

Tambahkan helper di atas `export const replies`:

```ts
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

/** Right-aligns amounts so the totals block reads as a column, not a ragged list.
 *  Wrapped in <code> by the caller: WhatsApp and Telegram both render monospace, which
 *  is the only way the padding survives. */
function padAmount(value: number, width: number): string {
  return formatIDR(value).padStart(width, ' ')
}

function amountColumnWidth(values: number[]): number {
  return Math.max(...values.map((v) => formatIDR(v).length))
}

function renderLine(line: DraftLine, tz: string, showDate: boolean): string {
  const category = line.categoryName
    ? escapeHtml(line.categoryName)
    : '⚠️ <i>belum ada kategori</i>'
  const head = `<b>${line.n}.</b> ${TYPE_MARK[line.type]} <b>${formatIDR(line.amount)}</b> · ${category}`

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
```

Tambahkan ke objek `replies`:

```ts
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
        Math.abs(diff) <= 500 ? '✅ cocok' : `⚠️ selisih ${formatIDR(Math.abs(diff))}`
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
          `${TYPE_MARK[l.type]} <b>${formatIDR(l.amount)}</b> · ${escapeHtml(l.categoryName ?? '')}` +
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
        `<b>${formatIDR(line.amount)}</b>${line.description ? ` · <i>${escapeHtml(line.description)}</i>` : ''}`,
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
```

Ganti `transactionRecorded` supaya membawa stempel waktu (R8):

```ts
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
      `✅ <b>Tercatat</b>\n\n<b>${formatIDR(amount)}</b> · ${escapeHtml(categoryName)}\n` +
        `🗓 ${formatDateTime(date, tz)}${note}\n\n` +
        'Salah? Ketik <code>/undo</code>.',
    )
  },
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `npx vitest run src/shared/bot/replies.test.ts`
Expected: PASS. Test lama untuk `transactionRecorded` akan gagal sampai dipanggil dengan dua argumen tambahan (`date`, `tz`) — perbarui pemanggilan di test itu menjadi `replies.transactionRecorded(35000, 'Makan', 'none', new Date(NOW_ISO), TZ)`.

- [ ] **Step 5: Verifikasi render WhatsApp-nya benar-benar rapi**

Buat pemeriksaan sekali jalan (bukan test permanen — hapus setelah dilihat):

```bash
cat > /tmp/preview.mjs <<'PREVIEW'
// dijalankan lewat vitest supaya alias @/ ikut ter-resolve
PREVIEW
npx vitest run src/shared/bot/replies.test.ts -t 'batchReview'
```

Lalu tambahkan sementara `console.log(renderForWhatsApp(replies.batchReview(batch(), TZ)))` di dalam satu test, jalankan, dan bandingkan mata terhadap contoh WhatsApp di §5. Perbaiki jarak/emoji bila meleset, lalu **hapus `console.log`-nya**.

Expected: keluarannya mirip blok WhatsApp di §5 — tanpa tag HTML yang bocor, tanpa `&amp;`.

- [ ] **Step 6: Typecheck & commit**

```bash
npx tsc --noEmit && npx vitest run src/shared/bot
git add src/shared/bot/replies.ts src/shared/bot/replies.test.ts
git commit -m "feat(bot): structured review card and timestamped confirmations

Every reply now has a header, a numbered body, a totals column, and a footer, and
every transaction carries a full localised date and time instead of the word 'today'.

The review card ships two control surfaces from one definition: an inline keyboard
for Telegram and whatsappHints for WhatsApp, which has no buttons at all. Both send
the identical command string, so there is one code path behind them.

The receipt total is printed next to the line sum with a 500-rupiah tolerance, so a
dropped item is visible before anything is written."
```

---

