#!/usr/bin/env node
/**
 * One-shot registration of the Telegram command menu. Run again after adding or
 * renaming a command — Telegram stores the list on its side, not ours.
 *
 *   TELEGRAM_BOT_TOKEN=123:abc node scripts/register-telegram-commands.mjs
 */

const token = process.env.TELEGRAM_BOT_TOKEN
if (!token) {
  console.error('TELEGRAM_BOT_TOKEN is not set.')
  process.exit(1)
}

// Telegram caps descriptions at 256 chars but shows far fewer; keep them under 40.
const commands = [
  { command: 'help', description: 'Semua yang bisa dilakukan bot ini' },
  { command: 'ringkasan', description: 'Ringkasan anggaran bulan ini' },
  { command: 'saldo', description: 'Sisa anggaran per pilar' },
  { command: 'hariini', description: 'Pengeluaran hari ini' },
  { command: 'minggu', description: 'Pengeluaran 7 hari terakhir' },
  { command: 'riwayat', description: '5 transaksi terakhir' },
  { command: 'cari', description: 'Cari transaksi, mis. /cari kopi' },
  { command: 'tahunan', description: 'Ringkasan tahun berjalan' },
  { command: 'statistik', description: 'Rata-rata harian & kategori teratas' },
  { command: 'target', description: 'Target tabungan & progres' },
  { command: 'setor', description: 'Setor dana ke target tabungan' },
  { command: 'kekayaan', description: 'Kekayaan bersih terkini' },
  { command: 'rutin', description: 'Transaksi rutin aktif' },
  { command: 'wishlist', description: 'Wishlist & kelayakan beli' },
  { command: 'kategori', description: 'Daftar kategori aktif' },
  // Produktivitas (tugas / catatan / pengingat)
  { command: 'tugas', description: 'Lihat / tambah tugas' },
  { command: 'selesai', description: 'Tandai tugas selesai, mis. /selesai 3' },
  { command: 'hapus', description: 'Hapus tugas, mis. /hapus 3' },
  { command: 'agenda', description: 'Tugas & pengingat hari ini' },
  { command: 'catat', description: 'Simpan / cari / baca catatan' },
  { command: 'ingatkan', description: 'Setel pengingat, mis. /ingatkan minum obat jam 9' },
  { command: 'tunda', description: 'Tunda pengingat terakhir, mis. /tunda 15' },
  { command: 'undo', description: 'Batalkan pencatatan terakhir' },
  { command: 'batal', description: 'Batalkan konfirmasi yang tertunda' },
  { command: 'putuskan', description: 'Putuskan tautan akun ini' },
]

async function call(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!data.ok) throw new Error(`${method} failed: ${JSON.stringify(data)}`)
  console.log(`${method}: ok`)
}

await call('setMyCommands', { commands })
await call('setChatMenuButton', { menu_button: { type: 'commands' } })
await call('setMyDescription', {
  description:
    'Catat keuanganmu langsung dari chat. Ketik "makan siang 35rb", kirim foto struk, ' +
    'atau pakai /help untuk melihat semua perintah.',
})
await call('setMyShortDescription', { short_description: 'Pencatat keuangan pribadi FinanceTrack.' })
