import { formatIDR, formatMonthLong } from '@/shared/lib/format'
import { PILLAR_LABELS, type MonthlySummary } from '@/shared/types/domain'

/** Every text the bot ever sends, in one place — kept in Bahasa Indonesia to match
 *  the rest of the app's user-facing copy. */
export const replies = {
  notLinked: () =>
    'Akun ini belum tertaut ke FinanceTrack. Buka FinanceTrack → Pengaturan → Bot WhatsApp & Telegram → Hubungkan, lalu kirim kode yang muncul ke sini.',

  linkSuccess: () => '✓ Akun tertaut! Sekarang kamu bisa catat transaksi langsung dari sini — coba kirim "makan siang 35rb" atau kirim foto struk.',

  linkCodeInvalid: (error: 'not_found' | 'expired' | 'used') => {
    if (error === 'expired') return 'Kode itu sudah kedaluwarsa (berlaku 15 menit). Buat kode baru dari Pengaturan.'
    if (error === 'used') return 'Kode itu sudah pernah dipakai. Buat kode baru dari Pengaturan kalau perlu menautkan lagi.'
    return 'Kode tidak dikenali. Pastikan kamu menyalin persis dari halaman Pengaturan.'
  },

  help: () =>
    [
      'Perintah yang bisa dipakai:',
      '• Catat transaksi langsung, mis. "makan siang 35rb" atau "gaji masuk 5jt"',
      '• Kirim foto struk untuk dicatat otomatis',
      '• "ringkasan" — ringkasan bulan ini',
      '• "sisa" atau "saldo" — sisa anggaran bulan ini',
      '• "kategori" — daftar kategori aktif',
      '• "bantuan" — pesan ini',
    ].join('\n'),

  amountNotFound: () =>
    'Nominalnya tidak ketemu di pesan itu. Coba tulis ulang dengan angka, mis. "makan siang 35rb".',

  monthClosed: (year: number, month: number) =>
    `${formatMonthLong(year, month)} sudah ditutup di FinanceTrack. Buka kembali dari Pengaturan kalau memang perlu mencatat ke bulan itu.`,

  notAReceipt: () =>
    'Sepertinya itu bukan foto struk, atau gambarnya terlalu tidak jelas untuk dibaca. Coba foto ulang, atau catat manual lewat teks.',

  imageTooLarge: () => 'Foto itu terlalu besar. Coba kirim ulang dengan ukuran yang lebih kecil.',

  categoryConfirmPrompt: (
    amount: number,
    description: string | null,
    options: { name: string }[],
  ) => {
    const label = description ? ` di "${description}"` : ''
    const list = options.map((o, i) => `${i + 1}) ${o.name}`).join('\n')
    return `${formatIDR(amount)}${label} — masuk kategori apa?\n${list}\n(balas angkanya, atau "batal")`
  },

  pendingCancelled: () => 'Dibatalkan. Kirim pesan baru kalau mau catat transaksi lain.',

  pendingExpiredOrMissing: () =>
    'Tidak ada transaksi yang menunggu konfirmasi. Kirim pesan baru untuk mencatat.',

  invalidCategoryChoice: (max: number) => `Balas dengan angka 1-${max}, atau "batal" untuk membatalkan.`,

  transactionRecorded: (amount: number, categoryName: string, receiptStatus: 'saved' | 'none' | 'drive_not_linked') => {
    const note =
      receiptStatus === 'saved'
        ? ' · struk tersimpan ke Drive-mu'
        : receiptStatus === 'drive_not_linked'
          ? ' · struk tidak tersimpan (tautkan Google Drive di Pengaturan supaya foto struk ikut tersimpan)'
          : ''
    return `✓ Tercatat: ${formatIDR(amount)} · ${categoryName} · hari ini${note}`
  },

  summary: (summary: MonthlySummary) =>
    [
      `Ringkasan ${formatMonthLong(summary.year, summary.month)}`,
      `Pemasukan: ${formatIDR(summary.totalIncome)}`,
      `Terpakai: ${formatIDR(summary.totalUsed)}`,
      `Ditabung: ${formatIDR(summary.totalSaved)}`,
      `Arus kas: ${formatIDR(summary.netCashFlow)}`,
      `Rasio tabungan: ${summary.savingsRate.toFixed(1)}%`,
    ].join('\n'),

  balance: (summary: MonthlySummary) => {
    const lines = (['needs', 'wants', 'savings'] as const).map((pillar) => {
      const { budget, used } = summary.pillarSummary[pillar]
      const remaining = budget - used
      return `${PILLAR_LABELS[pillar]}: ${formatIDR(remaining)} tersisa dari ${formatIDR(budget)}`
    })
    return [`Sisa anggaran ${formatMonthLong(summary.year, summary.month)}`, ...lines].join('\n')
  },

  categoryList: (categories: { name: string }[]) =>
    categories.length === 0
      ? 'Belum ada kategori aktif. Tambahkan dulu di Master Data lewat web.'
      : ['Kategori aktif:', ...categories.map((c) => `• ${c.name}`)].join('\n'),

  unknownMessage: () =>
    'Belum paham maksudnya. Ketik "bantuan" untuk lihat daftar perintah.',

  genericError: () => 'Ada masalah di sisi kami — coba lagi sebentar lagi.',
}
