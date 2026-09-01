import type { DownloadedImage } from './types'

function botToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN belum dikonfigurasi.')
  return token
}

function mimeFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase()
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  return 'image/jpeg'
}

/**
 * Downloads a Telegram photo by `file_id` and returns it as base64. Two calls, as
 * Telegram's Bot API requires: `getFile` resolves a `file_id` to a `file_path`, then
 * the actual bytes live at a separate file-serving endpoint built from that path.
 */
export async function downloadTelegramPhoto(fileId: string): Promise<DownloadedImage> {
  const token = botToken()

  const infoRes = await fetch(
    `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`,
  )
  if (!infoRes.ok) throw new Error('Gagal mengambil info file dari Telegram.')
  const info = (await infoRes.json()) as { ok: boolean; result?: { file_path?: string } }
  if (!info.ok || !info.result?.file_path) throw new Error('Telegram tidak memberi lokasi file.')

  const fileRes = await fetch(`https://api.telegram.org/file/bot${token}/${info.result.file_path}`)
  if (!fileRes.ok) throw new Error('Gagal mengunduh foto dari Telegram.')

  const buffer = Buffer.from(await fileRes.arrayBuffer())
  return { base64: buffer.toString('base64'), mimeType: mimeFromPath(info.result.file_path) }
}
